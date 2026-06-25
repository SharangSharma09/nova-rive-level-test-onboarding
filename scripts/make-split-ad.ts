// Main orchestrator: parse → (translate per lang) → TTS → HeyGen → compose layouts.
// Exactly ONE LLM call per non-source language (Gemini translation via translate-ad-spec.mjs).
// Everything else is deterministic REST API calls + ffmpeg.
//
// Usage: tsx scripts/make-split-ad.ts <runDir>
//   <runDir>/run.json holds inputs (see type RunConfig below)

import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { resolve } from 'node:path';

interface RunConfig {
  runId: string;
  sourceLang: string;
  rawScriptPath: string;
  labelMap: Record<string, string>;
  avatars: { teacher: string; learner: string };
  languages: string[];
  layouts: string[];
  engine?: string;
  // Optional per-language scripts the user edited / pasted in the UI. When a language is fully
  // covered here, the pipeline uses it verbatim and SKIPS the Gemini translation for that language.
  editedSpecs?: Record<string, Record<string, { text: string; roman: string }>>;
  // Optional source-language text for layout-03's top title (overlay); localized per language.
  title03?: string;
}

interface Avatar {
  key: string;
  role: string;
  kind: string;
  name: string;
  heygenLookId: string;
  heygenEngine: string;
  expressiveness?: string;
  motionPrompt?: string;
  cartesiaVoiceId: string;
  cartesiaModel: string;
  cartesiaKeyEnv: string;
  idleClip: string;
  thumb: string;
  endcardPhone?: string;
}

function log(msg: string) { console.log(msg); }

function loadKey(envName: string): string {
  if (process.env[envName]) return process.env[envName]!;
  const p = path.resolve('.env.local');
  if (existsSync(p)) {
    for (const l of readFileSync(p, 'utf8').split('\n')) {
      const m = l.match(new RegExp(`^\\s*${envName}\\s*=\\s*(.+?)\\s*$`));
      if (m) return m[1].replace(/^["']|["']$/g, '');
    }
  }
  return '';
}

function masked(key: string) { return key ? '…' + key.slice(-6) : '(missing)'; }

function run(cmd: string, args: string[], label: string): void {
  log(`[run] ${label}`);
  const r = spawnSync(cmd, args, { stdio: 'inherit', encoding: 'utf8', cwd: resolve('.') });
  if (r.status !== 0) {
    console.error(`[make-split-ad] ✗ ${label} failed (exit ${r.status})`);
    process.exit(1);
  }
}

const tsx = resolve('node_modules/.bin/tsx');
const node = process.execPath;

const runDir = process.argv[2];
if (!runDir) { console.error('Usage: tsx scripts/make-split-ad.ts <runDir>'); process.exit(1); }

const config: RunConfig = JSON.parse(readFileSync(path.join(runDir, 'run.json'), 'utf8'));
const { runId, sourceLang, rawScriptPath, labelMap, avatars, languages, layouts, editedSpecs } = config;

log(`\n=== make-split-ad run=${runId} ===`);
log(`languages: ${languages.join(', ')}  layouts: ${layouts.join(', ')}`);

// ── Step 0: Preflight ───────────────────────────────────────────────────────
log('\n[step:0] Preflight checks');

const avatarRegistry: Avatar[] = JSON.parse(readFileSync('data/ads-avatars.json', 'utf8'));
const teacher = avatarRegistry.find(a => a.key === avatars.teacher);
const learner = avatarRegistry.find(a => a.key === avatars.learner);
if (!teacher) { console.error(`Teacher avatar not found: ${avatars.teacher}`); process.exit(1); }
if (!learner) { console.error(`Learner avatar not found: ${avatars.learner}`); process.exit(1); }

const cartesiaKey = loadKey(teacher.cartesiaKeyEnv);
const heygenKey = loadKey('HEYGEN_API_KEY');
const geminiKey = loadKey('GEMINI_API_KEY');

log(`  teacher: ${teacher.name} (${teacher.heygenEngine})  voice key=${masked(cartesiaKey)}`);
log(`  learner: ${learner.name} (${learner.heygenEngine})`);
log(`  HeyGen key=${masked(heygenKey)}  Gemini key=${masked(geminiKey)}`);

if (!cartesiaKey) { console.error(`Missing ${teacher.cartesiaKeyEnv}`); process.exit(1); }
if (!heygenKey) { console.error('Missing HEYGEN_API_KEY'); process.exit(1); }
const needsGemini = languages.some(l => l !== sourceLang);
if (needsGemini && !geminiKey) { console.error('Missing GEMINI_API_KEY (needed for translation)'); process.exit(1); }

if (!existsSync(teacher.idleClip)) { console.error(`Teacher idle clip not found: ${teacher.idleClip}`); process.exit(1); }
if (!existsSync(learner.idleClip)) { console.error(`Learner idle clip not found: ${learner.idleClip}`); process.exit(1); }

// ── Step 1: Parse script once (no LLM) ────────────────────────────────────
log('\n[step:1] Parse source script');
const sourceSpecPath = path.join(runDir, 'source.spec.json');
const labelMapPath = path.join(runDir, 'label-map.json');
writeFileSync(labelMapPath, JSON.stringify(labelMap) + '\n');
run(tsx, ['scripts/parse-script.ts', rawScriptPath, sourceSpecPath, labelMapPath], 'parse-script');

// Inject voices + model into source spec
const sourceSpec = JSON.parse(readFileSync(sourceSpecPath, 'utf8'));
sourceSpec.model = teacher.cartesiaModel;
sourceSpec.voices = { [teacher.key]: teacher.cartesiaVoiceId, [learner.key]: learner.cartesiaVoiceId };
sourceSpec.language = sourceLang;
writeFileSync(sourceSpecPath, JSON.stringify(sourceSpec, null, 2) + '\n');

// ── End-card: build ONCE (shared across languages) if the teacher avatar has a phone asset ──
// compose-layouts swaps the final segment's visual for <projectDir>/endcard.mp4 (keeping that line's audio).
let endcardMp4 = '';
if (teacher.endcardPhone && existsSync(teacher.endcardPhone)) {
  log('\n[endcard] building CTA end-card');
  const ecDir = path.join(runDir, '_endcard');
  mkdirSync(ecDir, { recursive: true });
  copyFileSync(teacher.endcardPhone, path.join(ecDir, 'phone.png'));
  run(node, ['scripts/make-endcard.mjs', ecDir, '8'], 'make-endcard');   // 8s ≥ any final line; compose -shortest trims
  endcardMp4 = path.join(ecDir, 'endcard.mp4');
}

// Layout-03 top title — pre-generated/cached per language (committed config) so renders read it
// instantly, identically every run, and you can hand-edit any language. Live-translate fallback only
// for a language not yet in the cache (then it's cached back). Run scripts/gen-layout03-titles.mjs to
// (re)build the cache.
const needTitle03 = layouts.includes('03');
const TITLES_CACHE_PATH = 'video-generation-flow/config/layout03-titles.json';
const loadTitleCache = (): { source: string; byLang: Record<string, string> } => {
  try { const c = JSON.parse(readFileSync(TITLES_CACHE_PATH, 'utf8')); return { source: c.source ?? '', byLang: c.byLang ?? {} }; }
  catch { return { source: '', byLang: {} }; }
};
const titleCache = needTitle03 ? loadTitleCache() : { source: '', byLang: {} };
const TITLE03_SOURCE = (config.title03 && config.title03.trim()) || titleCache.source || 'रोज़ 15 min, AI Tutor से English सीखो';

const outputs: Array<{ lang: string; layout: string; file: string }> = [];

// ── Step 2: Per-language pipeline (sequential → max 2 HeyGen in-flight) ───
for (const lang of languages) {
  log(`\n[lang:${lang}] ─────────────────────────────────`);
  const projectDir = path.join(runDir, lang);
  mkdirSync(path.join(projectDir, 'tts', 'timestamps'), { recursive: true });
  mkdirSync(path.join(projectDir, 'videos'), { recursive: true });

  // 2.1 Spec — user-supplied/edited script wins (no LLM); else source-copy; else THE ONE Gemini call.
  // Edits/pastes are overlaid onto the deterministically-parsed sourceSpec (ids/speakers/turns come
  // from parse-script, never the LLM). `text` → TTS/lip-sync; `roman` → captions (blank → native text).
  const specPath = path.join(projectDir, 'spec.json');
  const overlay = editedSpecs?.[lang];
  if (lang === sourceLang) {
    // Source language: start from the parsed source, apply any per-line edits the user made.
    const merged = {
      ...sourceSpec,
      language: lang,
      segments: sourceSpec.segments.map((s: { id: string; speaker: string; text: string; roman?: string }) => {
        const o = overlay?.[s.id];
        const text = (o?.text && o.text.trim()) ? o.text.trim() : s.text;
        const roman = (o?.roman && o.roman.trim()) ? o.roman.trim() : ((o?.text && o.text.trim()) ? o.text.trim() : (s.roman ?? s.text));
        return { ...s, text, roman };
      }),
    };
    writeFileSync(specPath, JSON.stringify(merged, null, 2) + '\n');
    log(`[lang:${lang}] spec: source language${overlay ? ' + your edits' : ''} — no Gemini call`);
  } else {
    const overlayComplete = !!overlay && sourceSpec.segments.every((s: { id: string }) => overlay[s.id]?.text?.trim());
    if (overlayComplete) {
      const merged = {
        ...sourceSpec,
        language: lang,
        segments: sourceSpec.segments.map((s: { id: string; speaker: string; text: string }) => {
          const o = overlay![s.id];
          const roman = (o.roman && o.roman.trim()) ? o.roman.trim() : o.text.trim();
          return { ...s, text: o.text.trim(), roman };
        }),
      };
      writeFileSync(specPath, JSON.stringify(merged, null, 2) + '\n');
      log(`[lang:${lang}] spec: using your supplied/edited script — no Gemini call`);
    } else {
      log(`[lang:${lang}] spec: translating via Gemini`);
      run(node, ['scripts/translate-ad-spec.mjs', sourceSpecPath, lang, specPath], `translate→${lang}`);
    }
  }

  // Update spec with language field + inject voices/model if not already present
  const spec = JSON.parse(readFileSync(specPath, 'utf8'));
  spec.language = lang;
  spec.model = spec.model || teacher.cartesiaModel;
  spec.voices = spec.voices || { [teacher.key]: teacher.cartesiaVoiceId, [learner.key]: learner.cartesiaVoiceId };
  writeFileSync(specPath, JSON.stringify(spec, null, 2) + '\n');

  // 2.2 TTS + timestamps (deterministic)
  log(`[lang:${lang}] tts: generating WAV + timestamps`);
  run(tsx, ['scripts/gen-tts-timed.ts', specPath, path.join(projectDir, 'tts'), teacher.cartesiaKeyEnv], `tts:${lang}`);

  // 2.3 conversation.json (+ localized layout-03 title)
  const manifest = JSON.parse(readFileSync(path.join(projectDir, 'tts', 'manifest.json'), 'utf8'));
  let title03 = '';
  if (needTitle03) {
    if (titleCache.source === TITLE03_SOURCE && titleCache.byLang[lang]) {
      title03 = titleCache.byLang[lang];                        // cached for THIS language (source OR target) → instant + consistent + correct script
      log(`[lang:${lang}] title03 (cached): ${title03}`);
    } else if (lang === sourceLang) {
      title03 = TITLE03_SOURCE;                                 // source language not in cache → use the source string as-is
      log(`[lang:${lang}] title03 (source): ${title03}`);
    } else {
      const tr = spawnSync(node, ['scripts/translate-title.mjs', TITLE03_SOURCE, lang], { encoding: 'utf8', cwd: resolve('.') });
      if (tr.status === 0 && tr.stdout.trim()) {
        title03 = tr.stdout.trim();
        // Cache it back ONLY when it matches the committed cache's source (so a one-off custom title
        // never clobbers the shared default cache).
        try {
          const fresh = loadTitleCache();
          if (fresh.source === TITLE03_SOURCE) { fresh.byLang[lang] = title03; writeFileSync(TITLES_CACHE_PATH, JSON.stringify(fresh, null, 2) + '\n'); log(`[lang:${lang}] title03 (translated + cached): ${title03}`); }
          else log(`[lang:${lang}] title03 (translated, custom source — not cached): ${title03}`);
        } catch { log(`[lang:${lang}] title03 (translated): ${title03}`); }
      } else {
        title03 = TITLE03_SOURCE;
        log(`[lang:${lang}] title03 translate failed — using source title`);
      }
    }
  }

  const conversation = {
    layout: { top: teacher.key, bottom: learner.key },
    turns: spec.turns ?? sourceSpec.turns,
    ...(title03 ? { chrome: { title03 } } : {}),
  };
  writeFileSync(path.join(projectDir, 'conversation.json'), JSON.stringify(conversation, null, 2) + '\n');
  log(`[lang:${lang}] conversation.json ✓ (${conversation.turns.length} turns)`);

  // 2.4 Concatenate per-speaker audio (WAV, lossless for HeyGen)
  log(`[lang:${lang}] audio: concatenating per-speaker WAVs`);
  const ttsDir = path.join(projectDir, 'tts');
  const turns: Array<{ speaker: string; id: string }> = conversation.turns;

  for (const sp of [teacher.key, learner.key]) {
    const spTurns = turns.filter(t => t.speaker === sp).map(t => t.id);
    const clips = spTurns.map(id => {
      const seg = manifest.segments.find((s: { id: string }) => s.id === id);
      return path.join(ttsDir, seg.file);
    });
    const outWav = path.join(projectDir, `_${sp}_talk.wav`);
    // 1s gaps between a speaker's own lines — MUST match compose-layouts GAP_MS (1000ms) or the per-segment slicing drifts
    run(node, ['scripts/build-gap-track.mjs', outWav, '1', ...clips], `concat-wav:${sp}`);
  }

  // 2.5 HeyGen talking videos (2 jobs per language)
  log(`[lang:${lang}] heygen: submitting 2 talking jobs`);
  const heygenJobs = [
    {
      id: `${teacher.key}-talk`,
      audio: path.resolve(path.join(projectDir, `_${teacher.key}_talk.wav`)),
      avatar_id: teacher.heygenLookId,
      engine: teacher.heygenEngine,
      aspect_ratio: '16:9',
      resolution: '1080p',
      expressiveness: teacher.expressiveness,
      motion_prompt: teacher.motionPrompt,
    },
    {
      id: `${learner.key}-talk`,
      audio: path.resolve(path.join(projectDir, `_${learner.key}_talk.wav`)),
      avatar_id: learner.heygenLookId,
      engine: learner.heygenEngine,
      aspect_ratio: '16:9',
      resolution: '1080p',
      motion_prompt: learner.motionPrompt,
    },
  ];
  const jobsPath = path.join(projectDir, 'heygen-jobs.json');
  writeFileSync(jobsPath, JSON.stringify(heygenJobs, null, 2) + '\n');
  const videosDir = path.join(projectDir, 'videos');
  run(node, ['scripts/heygen-gen.mjs', jobsPath, videosDir], `heygen:${lang}`);

  // rename outputs to match compose-layouts.mjs expectations
  const heygenResults = JSON.parse(readFileSync(path.join(videosDir, 'heygen-results.json'), 'utf8'));
  for (const result of heygenResults) {
    if (!result.file) continue;
    const src = result.file;
    const isTeacher = result.id?.startsWith(teacher.key);
    const dest = path.join(videosDir, `${isTeacher ? teacher.key : learner.key}-talk.mp4`);
    if (src !== dest && existsSync(src)) copyFileSync(src, dest);
  }
  log(`[lang:${lang}] heygen: ✓`);

  // 2.6 Idle clips (copy, never regenerate)
  log(`[lang:${lang}] idle: copying stable idle clips`);
  copyFileSync(teacher.idleClip, path.join(videosDir, `${teacher.key}-idle-stable.mp4`));
  copyFileSync(learner.idleClip, path.join(videosDir, `${learner.key}-idle-stable.mp4`));

  // 2.7 cues.json (deterministic from manifest + timestamps)
  log(`[lang:${lang}] cues: building word-level caption timing`);
  const ttsCues = [];
  let cumMs = 0;
  for (const turn of conversation.turns) {
    const seg = manifest.segments.find((s: { id: string }) => s.id === turn.id);
    if (!seg) { console.error(`[cues] segment not found: ${turn.id}`); process.exit(1); }
    const tsFile = path.join(ttsDir, 'timestamps', `${turn.id}.json`);
    const wordData: { words: Array<{ word: string; startMs: number; endMs: number }> } =
      existsSync(tsFile) ? JSON.parse(readFileSync(tsFile, 'utf8')) : { words: [] };
    ttsCues.push({
      file: `tts/${seg.file}`,
      ms: cumMs,
      durationMs: seg.durationMs,
      speaker: turn.speaker,
      text: seg.roman ?? seg.text,
      words: wordData.words,
    });
    cumMs += seg.durationMs;
  }
  const totalDurationMs = cumMs;
  writeFileSync(path.join(projectDir, 'cues.json'), JSON.stringify({ ttsCues, clickCues: [], totalDurationMs }, null, 2) + '\n');
  log(`[lang:${lang}] cues.json ✓ (${ttsCues.length} cues, ${totalDurationMs}ms)`);

  // 2.75 End-card (optional) — present → compose-layouts replaces the final segment's visual with it
  if (endcardMp4 && existsSync(endcardMp4)) {
    copyFileSync(endcardMp4, path.join(projectDir, 'endcard.mp4'));
    log(`[lang:${lang}] endcard ✓`);
  }

  // 2.8 Compose layouts
  log(`[lang:${lang}] compose: layouts ${layouts.join(',')}`);
  run(node, ['scripts/compose-layouts.mjs', projectDir, '--only', layouts.join(',')], `compose:${lang}`);

  // Collect output paths
  const layoutsDir = path.join(projectDir, 'layouts');
  for (const layout of layouts) {
    try {
      const dirs = readdirSync(layoutsDir);
      const found = dirs.find(d => d.startsWith(layout));
      if (found) {
        const finalPath = path.join(lang, 'layouts', found, 'final.mp4');
        outputs.push({ lang, layout, file: finalPath });
      }
    } catch { /* layout dir may not exist yet */ }
  }

  log(`[lang:${lang}] done ✓`);
}

// ── Step 3: Collect finals into a clean flat folder + write result.json ──────
// Mirror the existing auto-gen-split-<name>/ convention so the videos are easy to browse and zip.
const autoDir = path.join(runDir, 'auto-gen-split');
mkdirSync(autoDir, { recursive: true });
for (const o of outputs) {
  const src = path.join(runDir, o.file);
  if (existsSync(src)) copyFileSync(src, path.join(autoDir, `${o.lang}-${o.layout}.mp4`));
}
log(`[output] ${outputs.length} finals copied → ${autoDir}`);

const result = { runId, status: 'done', outputs };
writeFileSync(path.join(runDir, 'result.json'), JSON.stringify(result, null, 2) + '\n');
log(`\n=== make-split-ad done: ${outputs.length} videos ===`);
for (const o of outputs) log(`  ${o.lang} / ${o.layout} → ${o.file}`);
