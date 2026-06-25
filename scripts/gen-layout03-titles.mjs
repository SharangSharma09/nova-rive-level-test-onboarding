// Pre-generate the layout-03 top-title translations for ALL languages into a committed cache, so each
// render reads them instantly (no live Gemini call), they're identical every run, and they're editable.
// Re-run this whenever the source title changes. make-split-ad.ts reads the cache and only falls back to
// a live translation for a language that isn't present yet.
//
// Usage: node scripts/gen-layout03-titles.mjs ["<source title>"]

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const SOURCE = process.argv[2] || 'रोज़ 15 min, AI Tutor से English सीखो';
const OUT = 'video-generation-flow/config/layout03-titles.json';
const langs = JSON.parse(readFileSync('video-generation-flow/translation/languages.json', 'utf8')).languages;

const byLang = {};
for (const { id, name } of langs) {
  if (id === 'hindi') { byLang[id] = SOURCE; console.log(`hindi (source): ${SOURCE}`); continue; }   // source title is Hindi
  const r = spawnSync(process.execPath, ['scripts/translate-title.mjs', SOURCE, id], { encoding: 'utf8' });
  if (r.status === 0 && r.stdout.trim()) { byLang[id] = r.stdout.trim(); console.log(`${name}: ${byLang[id]}`); }
  else { console.error(`✗ ${name}: ${(r.stderr || 'failed').slice(0, 160)}`); }
}

writeFileSync(OUT, JSON.stringify({ source: SOURCE, byLang }, null, 2) + '\n');
console.log(`\n✓ wrote ${Object.keys(byLang).length} titles → ${OUT}`);
