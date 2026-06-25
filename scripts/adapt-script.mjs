// Localize a finished ad script from one project into another language, following the stored
// colloquial code-mixing rules. Keeps the English teaching sentences + brand names in English,
// and localizes the "helps you through <language>" reference to the target language.
//
// Usage: node scripts/adapt-script.mjs <source-project> <target-language-id>
//   e.g. node scripts/adapt-script.mjs final-hindi tamil
// Reads the source project's transcript.json and the target language's rules.

import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const source = process.argv[2];
const targetId = process.argv[3];
if (!source || !targetId) { console.error('Usage: node scripts/adapt-script.mjs <source-project> <target-language-id>'); process.exit(1); }

const MODEL = process.env.TRANSLATE_MODEL || 'gemini-2.5-pro';
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

const langs = JSON.parse(readFileSync('video-generation-flow/translation/languages.json', 'utf8')).languages;
const lang = langs.find(l => l.id === targetId.toLowerCase());
if (!lang) { console.error('unknown language', targetId); process.exit(1); }
const rules = readFileSync(path.join('video-generation-flow/translation', lang.rules), 'utf8');

const transcript = JSON.parse(readFileSync(path.join('.context/projects', source, 'transcript.json'), 'utf8'));
const scriptText = transcript.segments.map(s => s.text).join('\n');

const PROMPT = `You are localizing a short video-ad script for an English-learning app.
Rewrite the script below into ${lang.name}, applying the colloquial code-mixing rules provided.

ADAPTATION RULES (in addition to the language rules):
1. The English teaching/example sentences are what the app is teaching — keep them EXACTLY in English,
   never translate them (e.g. "I go to home", "I am going home", "I am in a hurry is the correct way to say that").
2. Keep the brand name "Supernova AI" in English.
3. Localize the medium-language reference: wherever the teacher says she helps the user speak English
   "through <some language>" (e.g. "through Hindi"), change it to "through ${lang.name}".
4. Keep ALL marketing content identical (7x cheaper than normal English classes, 1 crore+ people,
   15-20 minutes daily practice, 30 days improvement, press install, Install now, download the Supernova AI app).
5. Output ONLY the script — one line per segment, in order, no numbering, no commentary.

${lang.name} RULES:
${rules}

SCRIPT TO LOCALIZE:
${scriptText}`;

const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${KEY}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ contents: [{ parts: [{ text: PROMPT }] }], generationConfig: { temperature: 0.4 } }),
});
if (!res.ok) { console.error('Gemini', res.status, (await res.text()).slice(0, 300)); process.exit(1); }
const out = ((await res.json()).candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim();
const outPath = path.join('.context/projects', source, `script-${targetId}.txt`);
writeFileSync(outPath, out + '\n');
console.log(out);
console.error(`\n[adapt] saved → ${outPath}`);
