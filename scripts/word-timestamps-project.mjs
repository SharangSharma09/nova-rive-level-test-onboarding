// Align a project's KNOWN cue text to its audio (Gemini) to get word-level karaoke timestamps.
// Key idea: we PROVIDE the exact spoken words (from the TTS manifest) and ask Gemini only for each
// word's start/end ms — then keep OUR own word strings. So English stays English and Tamil stays
// Tamil (no transliteration, no mishearing). Falls back to proportional timing on a count mismatch.
//
// Usage: node scripts/word-timestamps-project.mjs <projectDir> <refManifest.json> [clipsDir] [onlyFile]
//   refManifest : JSON { segments:[{file,text}] } giving the EXACT authored text per clip.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const [projectDir, refManifest, clipsDirArg, onlyFile] = process.argv.slice(2);
if (!projectDir || !refManifest) { console.error('Usage: node scripts/word-timestamps-project.mjs <projectDir> <refManifest.json> [clipsDir] [onlyFile]'); process.exit(1); }
const clipsDir = clipsDirArg || projectDir;
const MODEL = 'gemini-2.5-pro';

function loadKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  const p = path.resolve('.env.local');
  if (existsSync(p)) for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*GEMINI_API_KEY\s*=\s*(.+?)\s*$/); if (m) return m[1].replace(/^["']|["']$/g, '');
  }
  return null;
}
const KEY = loadKey();
if (!KEY) { console.error('GEMINI_API_KEY not set'); process.exit(1); }

const refByFile = new Map(JSON.parse(readFileSync(refManifest, 'utf8')).segments.map(s => [s.file, s.text]));
const tokenize = (t) => t.trim().split(/\s+/).filter(Boolean);

// even split across the clip, weighted by token character length (fallback only)
function proportional(tokens, dur) {
  const totalChars = tokens.reduce((a, w) => a + Math.max(1, w.length), 0);
  let acc = 0;
  return tokens.map(w => { const d = Math.round(dur * Math.max(1, w.length) / totalChars); const o = { word: w, startMs: acc, endMs: Math.min(acc + d, dur) }; acc = Math.min(acc + d, dur); return o; });
}

async function alignTimes(file, tokens) {
  const b64 = readFileSync(file).toString('base64');
  const PROMPT = `You are given an audio clip and the EXACT words spoken in it, in order.
Words (${tokens.length}, in order): ${JSON.stringify(tokens)}

Return ONLY a JSON array of EXACTLY ${tokens.length} objects, one per word in the SAME order, giving the
millisecond start/end of when that word is heard:
[{"startMs":0,"endMs":410},{"startMs":410,"endMs":710}, ...]

Rules:
- EXACTLY ${tokens.length} entries, same order as the words I gave you. Do NOT add or drop entries.
- Do NOT output the word text — only startMs and endMs.
- Times are ms from the clip start, increasing and non-overlapping; the last endMs ≈ the clip length.`;
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: PROMPT }, { inline_data: { mime_type: 'audio/mp3', data: b64 } }] }], generationConfig: { temperature: 0 } }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 150)}`);
  const raw = (await res.json()).candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';
  return JSON.parse(raw.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim());
}

const cuesPath = path.join(projectDir, 'cues.json');
const cues = JSON.parse(readFileSync(cuesPath, 'utf8'));
const targets = onlyFile ? cues.ttsCues.filter(c => c.file === onlyFile) : cues.ttsCues;
console.log(`[words] aligning ${targets.length} clip(s) via ${MODEL}…`);

for (const cue of targets) {
  const ref = refByFile.get(cue.file);
  if (!ref) { console.error(`  ✗ ${cue.file}: no ref text in manifest`); continue; }
  const tokens = tokenize(ref);
  cue.text = ref; // restore the correct authored display text
  const fp = path.join(clipsDir, cue.file);
  try {
    const times = await alignTimes(fp, tokens);
    if (Array.isArray(times) && times.length === tokens.length) {
      cue.words = tokens.map((w, i) => ({ word: w, startMs: Math.max(0, Math.round(times[i].startMs || 0)), endMs: Math.min(Math.round(times[i].endMs || 0), cue.durationMs) }));
      console.log(`  ✓ ${cue.file.padEnd(15)} ${tokens.length} words`);
    } else {
      cue.words = proportional(tokens, cue.durationMs);
      console.log(`  ! ${cue.file.padEnd(15)} got ${times?.length} for ${tokens.length} — proportional`);
    }
  } catch (e) { cue.words = proportional(tokens, cue.durationMs); console.error(`  ✗ ${cue.file}: ${e.message} — proportional`); }
}

writeFileSync(cuesPath, JSON.stringify(cues, null, 2) + '\n');
console.log(`[words] ✓ updated ${cuesPath}`);
