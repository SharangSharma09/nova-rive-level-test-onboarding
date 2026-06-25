// Transcribe a project's audio into sentence-level segments (with word timestamps) using
// Gemini 2.5 Pro. Writes .context/projects/<name>/transcript.json — the logical decomposition
// that split-project.mjs then uses to cut the video + audio into parts.
//
// Usage: node scripts/transcribe-project.mjs <project>   (default: supernova-widget)
// Reads GEMINI_API_KEY from env or .env.local. Expects .context/projects/<name>/audio.mp3.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const MODEL = 'gemini-2.5-pro';
const project = process.argv[2] || 'supernova-widget';
const projDir = path.resolve('.context/projects', project);
const audioPath = path.join(projDir, 'audio.mp3');

function loadKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  const p = path.resolve('.env.local');
  if (existsSync(p)) for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*GEMINI_API_KEY\s*=\s*(.+?)\s*$/);
    if (m) return m[1].replace(/^["']|["']$/g, '');
  }
  return null;
}
const API_KEY = loadKey();
if (!API_KEY) { console.error('GEMINI_API_KEY not set (env or .env.local)'); process.exit(1); }
if (!existsSync(audioPath)) { console.error('missing audio:', audioPath); process.exit(1); }

const PROMPT = `You are transcribing the narration of a short product-demo video.
Return ONLY a JSON array of segments (no markdown). Split the narration into natural
sentences / clear phrases — a new segment at each sentence boundary. Aim for 6–14 segments.

For each segment:
{
  "text": "exact words of this sentence",
  "startMs": <int, ms from the very start of the audio>,
  "endMs": <int, ms from the very start of the audio>,
  "words": [{"word":"...","startMs":<int>,"endMs":<int>}]  // word times also from clip start
}

Rules:
- Transcribe in the language actually spoken, exactly as heard.
- CODE-MIXING: if the speech mixes a native language with English (e.g. Tamil/Hindi + English),
  write the English words in plain English / Roman script and the native words in their native
  script — the authentic way people actually write it. Do NOT transliterate English words into the
  native script. This applies to EVERY English word, including short/common ones (meet, ready,
  simple, copy, send, help, doubt, example), brand/product names (e.g. Nova, not நோவா), and
  numbers said in English like "24/7" (not "24 bar 7"). e.g. write "personal English tutor" not
  "பர்சனல் இங்கிலீஷ் டியூட்டர்"; "home screen" not "ஹோம் ஸ்கிரீன்"; "meet" not "மீட்"; "copy" not "காப்பி".
  Attach native grammatical suffixes directly (message-ஆ, sentence-ஐ, app-ல) — keep the English stem in Roman.
- Timestamps in milliseconds from the start of the clip; be precise — they cut the video.
- Segments must be in order and non-overlapping.`;

async function main() {
  const b64 = readFileSync(audioPath).toString('base64');
  console.log(`[transcribe] ${project} → Gemini ${MODEL}…`);
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: PROMPT }, { inline_data: { mime_type: 'audio/mp3', data: b64 } }] }],
        generationConfig: { temperature: 0, responseMimeType: 'application/json' },
      }),
    }
  );
  if (!res.ok) { console.error('Gemini HTTP', res.status, (await res.text()).slice(0, 400)); process.exit(1); }
  const json = await res.json();
  const raw = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';
  const cleaned = raw.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();
  let segments;
  try { segments = JSON.parse(cleaned); } catch (e) { console.error('parse failed:', cleaned.slice(0, 500)); process.exit(1); }

  const outPath = path.join(projDir, 'transcript.json');
  writeFileSync(outPath, JSON.stringify({ segments }, null, 2) + '\n');
  console.log(`[transcribe] ${segments.length} segments → ${outPath}\n`);
  segments.forEach((s, i) => console.log(`  ${i}. [${(s.startMs / 1000).toFixed(1)}–${(s.endMs / 1000).toFixed(1)}s] ${s.text}`));
}

main().catch(e => { console.error(e); process.exit(1); });
