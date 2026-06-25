// Generate per-segment TTS for a multi-speaker ad script via Cartesia — one clip per dialogue line.
// Voices + segments come from a JSON spec; the API key is read from a chosen .env file, so we can
// use a different Cartesia account's key (e.g. cloned voices that live in another account) without
// hardcoding it. TTS text is sent in native script (per AGENTS.md); no language param (auto-detect).
//
// Usage:
//   node scripts/gen-ad-tts.mjs <spec.json> <outDir> [keyEnvFile]
//     keyEnvFile defaults to .env.local. Pass a path to read CARTESIA_API_KEY from another account.
//
// spec.json: { model?, voices: {<speaker>: <voiceId>}, segments: [{id, speaker, text}] }
// Output: <outDir>/<id>-<speaker>.mp3 for each segment + manifest.json (durations, model used).

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const specPath = process.argv[2];
const outDir = process.argv[3];
const keyEnvFile = process.argv[4];
if (!specPath || !outDir) { console.error('Usage: node scripts/gen-ad-tts.mjs <spec.json> <outDir> [keyEnvFile]'); process.exit(1); }

function loadKey(file) {
  // If an explicit key file was given, read from it (don't fall back to the ambient env key).
  if (!file && process.env.CARTESIA_API_KEY) return process.env.CARTESIA_API_KEY;
  const p = path.resolve(file || '.env.local');
  if (existsSync(p)) for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*CARTESIA_API_KEY\s*=\s*(.+?)\s*$/);
    if (m) return m[1].replace(/^["']|["']$/g, '').trim();
  }
  return null;
}
const KEY = loadKey(keyEnvFile);
if (!KEY) { console.error('[gen-ad-tts] ✗ CARTESIA_API_KEY not found in', keyEnvFile || '.env.local'); process.exit(1); }
console.log(`[gen-ad-tts] using key …${KEY.slice(-6)} (len ${KEY.length}) from ${keyEnvFile || '.env.local'}`);

const spec = JSON.parse(readFileSync(specPath, 'utf8'));
const PREF = spec.model || 'sonic-2';
const FALLBACK = 'sonic-3.5';
mkdirSync(path.resolve(outDir), { recursive: true });
const ONLY = (process.env.ONLY_SEGMENTS || '').split(',').map(s => s.trim()).filter(Boolean);
if (ONLY.length) console.log(`[gen-ad-tts] single-segment mode: ${ONLY.join(', ')} (manifest not rewritten)`);

function probeDurMs(file) {
  const r = spawnSync('ffprobe', ['-v', 'quiet', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', file], { encoding: 'utf8' });
  return Math.round((parseFloat(r.stdout.trim()) || 0) * 1000);
}

async function tts(model, voiceId, text) {
  const res = await fetch('https://api.cartesia.ai/tts/bytes', {
    method: 'POST',
    headers: { 'Cartesia-Version': '2024-06-10', 'X-API-Key': KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model_id: model,
      transcript: text,                                   // native script — no language param
      voice: { mode: 'id', id: voiceId },
      output_format: { container: 'mp3', encoding: 'mp3', sample_rate: 44100 },
    }),
  });
  if (!res.ok) return { ok: false, status: res.status, err: (await res.text()).slice(0, 200) };
  return { ok: true, buf: Buffer.from(await res.arrayBuffer()) };
}

const manifest = [];
let primary = PREF;                                       // sticky: if PREF fails but fallback works, switch
let idx = 0;
for (const seg of spec.segments) {
  if (ONLY.length && !ONLY.includes(seg.id)) continue;
  idx++;
  const voiceId = spec.voices[seg.speaker];
  if (!voiceId) { console.error(`[gen-ad-tts] ✗ no voice mapped for speaker "${seg.speaker}" (${seg.id})`); process.exit(1); }
  const out = path.join(outDir, `${seg.id}-${seg.speaker}.mp3`);

  let used = primary;
  let r = await tts(primary, voiceId, seg.text);
  if (!r.ok && primary !== FALLBACK) {
    console.error(`[gen-ad-tts] ${seg.id} ${primary} → ${r.status} ${r.err}; retrying ${FALLBACK}`);
    used = FALLBACK;
    r = await tts(FALLBACK, voiceId, seg.text);
    if (r.ok) primary = FALLBACK;                         // stick to the model that works
  }
  if (!r.ok) {
    console.error(`[gen-ad-tts] ✗ ${seg.id} failed: ${r.status} ${r.err}`);
    if (idx === 1) { console.error('[gen-ad-tts] first clip failed — aborting (check key/voice).'); process.exit(1); }
    manifest.push({ id: seg.id, speaker: seg.speaker, text: seg.text, error: `${r.status} ${r.err}` });
    continue;
  }
  writeFileSync(out, r.buf);
  const ms = probeDurMs(out);
  manifest.push({ id: seg.id, speaker: seg.speaker, voiceId, model: used, text: seg.text, file: path.basename(out), durationMs: ms, bytes: r.buf.byteLength });
  console.log(`[gen-ad-tts] ✓ ${seg.id.padEnd(4)} ${seg.speaker.padEnd(6)} ${used.padEnd(9)} ${String(ms).padStart(5)}ms  ${String(Math.round(r.buf.byteLength / 1024)).padStart(3)}KB  ${path.basename(out)}`);
}

if (!ONLY.length) writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify({ language: spec.language, model: primary, voices: spec.voices, segments: manifest }, null, 2) + '\n');
const okCount = manifest.filter(s => !s.error).length;
const totalMs = manifest.reduce((a, s) => a + (s.durationMs || 0), 0);
console.log(`[gen-ad-tts] ✓ ${okCount}/${spec.segments.length} clips · total ${(totalMs / 1000).toFixed(1)}s → ${outDir}`);
