// Transcribe all TTS audio files using Gemini 2.5 Pro → Tanglish output
// Updates video-generation-flow/config/tts-cues.json with a "text" field per cue
//
// Usage: GEMINI_API_KEY=xxx node scripts/transcribe-tts.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT   = path.resolve(__dir, '..');
const API_KEY = process.env.GEMINI_API_KEY;
const MODEL   = 'gemini-2.5-pro';

if (!API_KEY) { console.error('GEMINI_API_KEY not set'); process.exit(1); }

const PROMPT = `Transcribe this Tamil/Tanglish audio voiceover clip exactly as spoken.
Rules:
- Write ALL Tamil words in romanized English (Tanglish) — e.g. "நீங்க" → "neega", "பண்ணலாம்" → "pannalam", "வேணும்னாலும்" → "venumnalum"
- Keep any English words exactly as they are (App, LinkedIn, Insert, steps, etc.)
- Do not translate — just transliterate the sound
- Return only the transcript, no explanation`;

async function transcribe(filePath) {
  const audio = readFileSync(filePath);
  const b64   = audio.toString('base64');
  const fname = path.basename(filePath);

  console.log(`  → sending ${fname} (${(audio.length / 1024).toFixed(0)} KB)…`);

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

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini error for ${fname}: ${res.status} ${err}`);
  }

  const json = await res.json();
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';
  return text;
}

async function main() {
  const cuesPath = path.join(ROOT, 'video-generation-flow/config/tts-cues.json');
  const cues = JSON.parse(readFileSync(cuesPath, 'utf8'));

  console.log(`Transcribing ${cues.ttsCues.length} files with Gemini ${MODEL}…\n`);

  for (const cue of cues.ttsCues) {
    const filePath = path.join(ROOT, 'public/tts/video', cue.file);
    try {
      const text = await transcribe(filePath);
      cue.text = text;
      console.log(`  ✓ ${cue.file}: "${text}"\n`);
    } catch (err) {
      console.error(`  ✗ ${cue.file}: ${err.message}`);
      cue.text = cue.note; // fallback to existing note
    }
  }

  writeFileSync(cuesPath, JSON.stringify(cues, null, 2) + '\n');
  console.log(`\nDone. Updated ${cuesPath}`);
}

main().catch(err => { console.error(err); process.exit(1); });
