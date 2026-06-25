// Get word-level timestamps for each TTS file using Gemini 2.5 Pro
// Adds a "words" field to each cue in tts-cues.json:
//   words: [{ word: string, startMs: number, endMs: number }]
// Timestamps are relative to the clip start (0-based).
//
// Usage:
//   node scripts/word-timestamps.mjs            # all 12 cues
//   node scripts/word-timestamps.mjs ta-3.mp3   # just one cue (re-sync after regenerating that clip)
// Reads GEMINI_API_KEY from the environment or .env.local.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT     = path.resolve(__dir, '..');
const MODEL    = 'gemini-2.5-pro';
const ONLY     = process.argv[2] || null; // optional single-file filter, e.g. "ta-3.mp3"

function loadApiKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  const envPath = path.join(ROOT, '.env.local');
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
      const m = line.match(/^\s*GEMINI_API_KEY\s*=\s*(.+?)\s*$/);
      if (m) return m[1].replace(/^["']|["']$/g, '');
    }
  }
  return null;
}

const API_KEY = loadApiKey();
if (!API_KEY) { console.error('GEMINI_API_KEY not set (env or .env.local)'); process.exit(1); }

const PROMPT = `Transcribe this audio clip with precise word-level timestamps.
Return ONLY a JSON array, no markdown, no explanation:
[{"word":"Superflow","startMs":0,"endMs":420},{"word":"moolama","startMs":450,"endMs":750},...]

Rules:
- startMs / endMs are milliseconds from the very start of this audio clip
- Transliterate Tamil words into Tanglish Roman script (e.g. "neenga", "pannalam", "sollunga")
- Keep English words exactly as spoken
- Be precise — the timestamps will be used for word-level karaoke highlighting`;

async function getWordTimestamps(filePath) {
  const audio = readFileSync(filePath);
  const b64   = audio.toString('base64');

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: PROMPT },
            { inline_data: { mime_type: 'audio/mp3', data: b64 } },
          ],
        }],
        generationConfig: { temperature: 0 },
      }),
    }
  );

  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);

  const json = await res.json();
  const raw  = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';

  // Strip markdown code fences if present
  const cleaned = raw.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();
  return JSON.parse(cleaned);
}

async function main() {
  const cuesPath = path.join(ROOT, 'video-generation-flow/config/tts-cues.json');
  const cues = JSON.parse(readFileSync(cuesPath, 'utf8'));

  const targets = ONLY ? cues.ttsCues.filter(c => c.file === ONLY) : cues.ttsCues;
  if (ONLY && targets.length === 0) { console.error(`No cue with file "${ONLY}"`); process.exit(1); }
  console.log(`Getting word timestamps for ${targets.length} file(s)…\n`);

  for (const cue of targets) {
    const filePath = path.join(ROOT, 'public/tts/video', cue.file);
    process.stdout.write(`  → ${cue.file}… `);
    try {
      const words = await getWordTimestamps(filePath);
      cue.words = words;
      console.log(`${words.length} words`);
      words.forEach(w => process.stdout.write(`    [${w.startMs}-${w.endMs}] ${w.word}\n`));
      console.log();
    } catch (err) {
      console.error(`FAILED: ${err.message}`);
      cue.words = [];
    }
  }

  writeFileSync(cuesPath, JSON.stringify(cues, null, 2) + '\n');
  console.log(`\nDone. Updated ${cuesPath}`);
}

main().catch(err => { console.error(err); process.exit(1); });
