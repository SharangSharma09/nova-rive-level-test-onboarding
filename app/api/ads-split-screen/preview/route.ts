import { writeFileSync, readFileSync, mkdirSync, rmSync } from 'node:fs';
import { spawnSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { devOnly } from '../../studio/_lib';

export const dynamic = 'force-dynamic';

const tsx = path.resolve('node_modules/.bin/tsx');
const node = process.execPath;

// Async spawn → lets us run several translate calls concurrently (spawnSync would block them serially).
function runAsync(cmd: string, args: string[]): Promise<{ status: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { cwd: path.resolve('.') });
    let stdout = '', stderr = '';
    p.stdout.on('data', d => { stdout += String(d); });
    p.stderr.on('data', d => { stderr += String(d); });
    p.on('close', code => resolve({ status: code ?? 1, stdout, stderr }));
    p.on('error', err => resolve({ status: 1, stdout, stderr: stderr + String(err) }));
  });
}

export async function POST(req: Request) {
  const guard = devOnly();
  if (guard) return guard;

  let body: { rawScript: string; labelMap: Record<string, string>; sourceLang: string; languages: string[] };
  try { body = await req.json(); } catch { return new Response('invalid JSON', { status: 400 }); }
  const { rawScript, labelMap, sourceLang, languages } = body;
  if (!rawScript || !labelMap || !sourceLang || !Array.isArray(languages)) {
    return new Response('missing fields', { status: 400 });
  }

  const tmpDir = path.join('.context/projects/_runs/_preview_' + randomUUID().slice(0, 8));
  try {
    mkdirSync(tmpDir, { recursive: true });
    writeFileSync(path.join(tmpDir, 'script.txt'), rawScript);
    // Preview must work BEFORE avatars are picked (to sanity-check the script/translations) —
    // auto-map any detected label that isn't already mapped to itself, so parse-script never fails on it.
    const fullLabelMap: Record<string, string> = { ...labelMap };
    for (const line of rawScript.split('\n')) {
      const m = line.trim().match(/^([A-Za-z][A-Za-z0-9 _-]*?):\s*.+$/);
      if (m && !fullLabelMap[m[1]]) fullLabelMap[m[1]] = m[1];
    }
    writeFileSync(path.join(tmpDir, 'label-map.json'), JSON.stringify(fullLabelMap));

    // Parse
    const specPath = path.join(tmpDir, 'source.spec.json');
    const parseR = spawnSync(tsx, ['scripts/parse-script.ts', path.join(tmpDir, 'script.txt'), specPath, path.join(tmpDir, 'label-map.json')], { encoding: 'utf8', cwd: path.resolve('.') });
    if (parseR.status !== 0) {
      const err = (parseR.stderr || parseR.stdout || 'parse failed').slice(0, 400);
      return new Response(JSON.stringify({ error: err }), { status: 422, headers: { 'Content-Type': 'application/json' } });
    }
    const sourceSpec = JSON.parse(readFileSync(specPath, 'utf8'));

    // Translate each target language CONCURRENTLY (bounded pool). Each language is one slow
    // gemini-2.5-pro call; running them sequentially made a 6-language preview take 2-3 minutes.
    // The pool keeps it fast without firing all calls at once (Gemini rate limits).
    const perLang: Record<string, { segments: Array<{ id: string; speaker: string; text: string; roman?: string }> }> = {};
    const targets: string[] = [];
    for (const lang of languages) {
      if (lang === sourceLang) perLang[lang] = { segments: sourceSpec.segments };
      else targets.push(lang);
    }

    let firstError: string | null = null;
    const queue = [...targets];
    const worker = async () => {
      while (queue.length && !firstError) {
        const lang = queue.shift()!;
        const outPath = path.join(tmpDir, `${lang}.spec.json`);
        const r = await runAsync(node, ['scripts/translate-ad-spec.mjs', specPath, lang, outPath]);
        if (firstError) break;
        if (r.status !== 0) {
          firstError ??= `translate ${lang}: ${(r.stderr || r.stdout || 'translate failed').slice(0, 400)}`;
          break;
        }
        try {
          const spec = JSON.parse(readFileSync(outPath, 'utf8'));
          perLang[lang] = { segments: spec.segments };
        } catch (e) {
          firstError ??= `translate ${lang}: bad output (${String(e).slice(0, 120)})`;
        }
      }
    };
    const CONCURRENCY = 4;
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, targets.length) }, worker));
    if (firstError) {
      return new Response(JSON.stringify({ error: firstError }), { status: 422, headers: { 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ turns: sourceSpec.turns, perLang }), { headers: { 'Content-Type': 'application/json' } });
  } finally {
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}
