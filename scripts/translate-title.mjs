// Translate a single short on-screen overlay/title string into another language, applying the shared
// ad brand rules (keep English brand/product words like "AI Tutor", "English", "Supernova AI", "min").
// Decoupled from the script translation so it works for BOTH Gemini-translated and user-pasted
// languages (layout 03's top title).
//
// Usage: node scripts/translate-title.mjs "<source title>" <targetLangId>
//   Prints ONLY the translated title (native script) to stdout.

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const [srcText, langId] = process.argv.slice(2);
if (!srcText || !langId) { console.error('Usage: node scripts/translate-title.mjs "<text>" <targetLangId>'); process.exit(1); }

function loadKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  const p = path.resolve('.env.local');
  if (existsSync(p)) for (const l of readFileSync(p, 'utf8').split('\n')) { const m = l.match(/^\s*GEMINI_API_KEY\s*=\s*(.+?)\s*$/); if (m) return m[1].replace(/^["']|["']$/g, ''); }
  return null;
}
const KEY = loadKey();
if (!KEY) { console.error('GEMINI_API_KEY not set'); process.exit(1); }

const langs = JSON.parse(readFileSync('video-generation-flow/translation/languages.json', 'utf8')).languages;
const lang = langs.find(l => l.id === langId.toLowerCase());
if (!lang) { console.error('unknown language', langId); process.exit(1); }
const sharedRules = readFileSync('video-generation-flow/translation/_ad-shared-rules.md', 'utf8');

const PROMPT = `${sharedRules}

---
TASK: Translate this short on-screen marketing TITLE into ${lang.name}, applying the brand rules above.
Keep English brand/product words in Latin exactly ("AI Tutor", "English", "Supernova AI", "min", any
digits). Code-mix naturally, keep it punchy and roughly the same length/meaning — it must fit one line
of an ad overlay.

TITLE: ${srcText}

Output ONLY a JSON object (no markdown fences):
{ "title": "<translated title in ${lang.name}, native script with English words kept in Latin>" }`;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let out = null;
for (let attempt = 1; attempt <= 3; attempt++) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: PROMPT }] }], generationConfig: { temperature: 0.3 } }),
  });
  if (!res.ok) {
    console.error('Gemini', res.status, (await res.text()).slice(0, 200));
    if (attempt === 3) process.exit(1);
    await sleep((res.status === 429 || res.status === 503 ? 4000 : 1200) * attempt);
    continue;
  }
  const raw = ((await res.json()).candidates?.[0]?.content?.parts?.[0]?.text ?? '').replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();
  try { const parsed = JSON.parse(raw); if (parsed && typeof parsed.title === 'string' && parsed.title.trim()) { out = parsed.title.trim(); break; } } catch { /* retry */ }
}
if (!out) { console.error('title translation failed'); process.exit(1); }
process.stdout.write(out);
