// Translate an ad TTS spec into another language, applying shared ad rules + per-language rules.
// Returns dual output per segment: native-script `text` (for Cartesia TTS) + Roman transliteration
// `roman` (for on-screen captions). Schema-validated; retries up to 3x on violation.
//
// Usage: node scripts/translate-ad-spec.mjs <sourceSpec.json> <targetLangId> <outSpec.json>

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const [src, langId, out] = process.argv.slice(2);
if (!src || !langId || !out) { console.error('Usage: node scripts/translate-ad-spec.mjs <sourceSpec.json> <targetLangId> <outSpec.json>'); process.exit(1); }

function loadKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  const p = path.resolve('.env.local');
  if (existsSync(p)) for (const l of readFileSync(p, 'utf8').split('\n')) { const m = l.match(/^\s*GEMINI_API_KEY\s*=\s*(.+?)\s*$/); if (m) return m[1].replace(/^["']|["']$/g, ''); }
  return null;
}
const KEY = loadKey();
if (!KEY) { console.error('GEMINI_API_KEY not set'); process.exit(1); }
const maskedKey = '…' + KEY.slice(-6);

const langs = JSON.parse(readFileSync('video-generation-flow/translation/languages.json', 'utf8')).languages;
const lang = langs.find(l => l.id === langId.toLowerCase());
if (!lang) { console.error('unknown language', langId); process.exit(1); }

const sharedRules = readFileSync('video-generation-flow/translation/_ad-shared-rules.md', 'utf8');
const langRules = readFileSync(path.join('video-generation-flow/translation', lang.rules), 'utf8');
const spec = JSON.parse(readFileSync(src, 'utf8'));
const srcLangId = String(spec.language || '').toLowerCase();
const srcLang = langs.find(l => l.id === srcLangId);
const srcName = srcLang ? srcLang.name : (spec.language || 'the source language');

const PROMPT = `${sharedRules}

---
${lang.name.toUpperCase()} SPECIFIC RULES:
${langRules}

---
SOURCE LANGUAGE: ${srcName}.   TARGET LANGUAGE: ${lang.name}.
TASK: The segments below are written in ${srcName} (code-mixed with English). Rewrite each into ${lang.name}, applying ALL rules above. Per rule G1, wherever a line names the source language "${srcName}" (or its code-mix name), replace it with "${lang.name}".

Output ONLY a JSON object (no markdown fences, no commentary):
{
  "segments": [
    { "id": "...", "text": "<native-script code-mix line>", "roman": "<same line fully Roman-transliterated>" }
  ]
}

- "text" → Indic words in native script, English words in Latin. This goes to Cartesia TTS.
- "roman" → EXACT same content as "text" but ALL words in Roman script (Tanglish/Hinglish/etc). This goes to on-screen captions.
- Preserve SAME segment count and ids as input.
- For source-language segments that are already in ${lang.name}: copy them as-is into both text and roman fields.

SEGMENTS TO TRANSLATE:
${JSON.stringify(spec.segments.map(s => ({ id: s.id, speaker: s.speaker, text: s.text })), null, 2)}`;

const SCHEMA = {
  type: 'object',
  required: ['segments'],
  properties: {
    segments: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'text', 'roman'],
        properties: { id: { type: 'string' }, text: { type: 'string' }, roman: { type: 'string' } }
      }
    }
  }
};

function validateSchema(obj) {
  if (!obj || typeof obj !== 'object') return 'not an object';
  if (!Array.isArray(obj.segments)) return 'segments is not an array';
  for (const s of obj.segments) {
    if (!s.id || !s.text || !s.roman) return `segment missing fields: ${JSON.stringify(s)}`;
  }
  if (obj.segments.length !== spec.segments.length) return `expected ${spec.segments.length} segments, got ${obj.segments.length}`;
  return null;
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let translated = null;
for (let attempt = 1; attempt <= 3; attempt++) {
  console.log(`[gemini] translate→${lang.name} key=${maskedKey} attempt=${attempt}`);
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: PROMPT }] }], generationConfig: { temperature: 0.3 } }),
  });
  if (!res.ok) {
    console.error('Gemini', res.status, (await res.text()).slice(0, 300));
    if (attempt === 3) process.exit(1);
    // Back off before retrying so concurrent languages don't hammer a rate-limited / overloaded API.
    await sleep((res.status === 429 || res.status === 503 ? 4000 : 1200) * attempt);
    continue;
  }
  const raw = ((await res.json()).candidates?.[0]?.content?.parts?.[0]?.text ?? '').replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();
  let parsed;
  try { parsed = JSON.parse(raw); } catch (e) { console.error(`[gemini] JSON parse failed attempt ${attempt}:`, e.message, raw.slice(0, 200)); continue; }
  const err = validateSchema(parsed);
  if (err) { console.error(`[gemini] schema violation attempt ${attempt}: ${err}`); continue; }
  translated = parsed;
  break;
}
if (!translated) { console.error('Translation failed after 3 attempts'); process.exit(1); }

const byId = new Map(translated.segments.map(t => [t.id, t]));
const outSpec = {
  ...spec,
  language: langId,
  segments: spec.segments.map(s => {
    const t = byId.get(s.id);
    return { ...s, text: t?.text ?? s.text, roman: t?.roman ?? s.text };
  })
};
writeFileSync(out, JSON.stringify(outSpec, null, 2) + '\n');
console.log(`✓ translated ${spec.segments.length} segments → ${out}`);
for (const s of outSpec.segments) console.log(`  ${s.id.padEnd(5)} ${s.speaker.padEnd(6)} ${s.text.slice(0, 60)}`);
