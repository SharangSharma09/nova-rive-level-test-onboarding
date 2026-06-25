// Translate English → an Indian language using the stored colloquial translation rules.
// Assembles video-generation-flow/translation/template.md with the language's rules and the
// text, then calls Gemini. Reusable for video scripts, app copy, etc.
//
// Usage: node scripts/translate.mjs <language-id> "<english text>"
//   e.g. node scripts/translate.mjs tamil "We use present continuous tense to talk about actions happening right now."
// Reads GEMINI_API_KEY from env or .env.local.

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const MODEL = process.env.TRANSLATE_MODEL || 'gemini-2.5-flash';
const TDIR = path.resolve('video-generation-flow/translation');

function loadKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  const p = path.resolve('.env.local');
  if (existsSync(p)) for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*GEMINI_API_KEY\s*=\s*(.+?)\s*$/);
    if (m) return m[1].replace(/^["']|["']$/g, '');
  }
  return null;
}

export function buildPrompt(langId, text) {
  const langs = JSON.parse(readFileSync(path.join(TDIR, 'languages.json'), 'utf8')).languages;
  const lang = langs.find(l => l.id === langId.toLowerCase());
  if (!lang) throw new Error(`unknown language "${langId}". Have: ${langs.map(l => l.id).join(', ')}`);
  const template = readFileSync(path.join(TDIR, 'template.md'), 'utf8');
  const rules = readFileSync(path.join(TDIR, lang.rules), 'utf8');
  return template
    .replace('{{SYSTEM_TRANSLATION_RULES_LONGFORM_V1}}', rules)
    .replace('{{target_language}}', lang.name)
    .replace('{{text_to_translate}}', text);
}

export async function translate(langId, text, apiKey = loadKey()) {
  if (!apiKey) throw new Error('GEMINI_API_KEY not set (env or .env.local)');
  const prompt = buildPrompt(langId, text);
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.3 } }) }
  );
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = await res.json();
  return (json.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim();
}

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const [langId, text] = [process.argv[2], process.argv[3]];
  if (!langId || !text) { console.error('Usage: node scripts/translate.mjs <language-id> "<text>"'); process.exit(1); }
  translate(langId, text).then(t => console.log(t)).catch(e => { console.error(e.message); process.exit(1); });
}
