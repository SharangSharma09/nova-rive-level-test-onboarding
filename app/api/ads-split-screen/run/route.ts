import { writeFileSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { devOnly, spawnSSEcmd } from '../../studio/_lib';

export const dynamic = 'force-dynamic';

const tsx = path.resolve('node_modules/.bin/tsx');

export async function POST(req: Request) {
  const guard = devOnly();
  if (guard) return guard;

  let body: {
    rawScript: string;
    labelMap: Record<string, string>;
    sourceLang: string;
    avatars: { teacher: string; learner: string };
    languages: string[];
    layouts: string[];
    engine?: string;
    editedSpecs?: Record<string, Record<string, { text: string; roman: string }>>;
  };
  try { body = await req.json(); } catch { return new Response('invalid JSON', { status: 400 }); }

  const { rawScript, labelMap, sourceLang, avatars, languages, layouts, engine = 'heygen', editedSpecs = {} } = body;
  if (!rawScript || !labelMap || !sourceLang || !avatars || !Array.isArray(languages) || !Array.isArray(layouts)) {
    return new Response('missing required fields', { status: 400 });
  }
  if (!avatars.teacher || !avatars.learner) return new Response('avatars.teacher and avatars.learner required', { status: 400 });
  if (languages.length === 0) return new Response('select at least one language', { status: 400 });
  if (layouts.length === 0) return new Response('select at least one layout', { status: 400 });

  const runId = randomUUID().slice(0, 8) + '_' + Date.now();
  const runDir = path.resolve(path.join('.context/projects/_runs', runId));
  mkdirSync(runDir, { recursive: true });

  const scriptPath = path.join(runDir, 'script.txt');
  writeFileSync(scriptPath, rawScript);

  const runConfig = { runId, sourceLang, rawScriptPath: scriptPath, labelMap, avatars, languages, layouts, engine, editedSpecs };
  writeFileSync(path.join(runDir, 'run.json'), JSON.stringify(runConfig, null, 2) + '\n');

  return spawnSSEcmd(tsx, ['scripts/make-split-ad.ts', runDir]);
}
