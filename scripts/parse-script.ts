// Deterministic labelled-script parser — no LLM.
// Splits "Label: text" lines into turns + segments, maps labels to avatar slots via labelMap.
//
// Usage: tsx scripts/parse-script.ts <rawScript.txt> <out.spec.json> <labelMap.json>
//   labelMap.json = {"Nova":"nova","Girl":"girl"}

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

const [rawPath, outPath, labelMapPath] = process.argv.slice(2);
if (!rawPath || !outPath || !labelMapPath) {
  console.error('Usage: tsx scripts/parse-script.ts <rawScript.txt> <out.spec.json> <labelMap.json>');
  process.exit(1);
}

const rawScript = readFileSync(rawPath, 'utf8');
const labelMap: Record<string, string> = JSON.parse(readFileSync(labelMapPath, 'utf8'));
const knownLabels = new Set(Object.keys(labelMap));

const STAGE_DIRECTION = /^\s*[\[\(]/;
const LABELLED_LINE = /^([A-Za-z][A-Za-z0-9 _-]*?):\s*(.+)$/;

const turns: Array<{ speaker: string; id: string }> = [];
const segments: Array<{ id: string; speaker: string; text: string }> = [];
const counters: Record<string, number> = {};

const lines = rawScript.split('\n');
for (let lineNum = 1; lineNum <= lines.length; lineNum++) {
  const raw = lines[lineNum - 1];
  const trimmed = raw.trim();
  if (!trimmed) continue;
  if (STAGE_DIRECTION.test(trimmed)) continue;

  const match = LABELLED_LINE.exec(trimmed);
  if (!match) {
    // Soft-wrapped continuation of the previous labelled line (common when pasting from chats/docs
    // where a turn wraps across physical lines) — append it to that line instead of failing.
    if (segments.length > 0) {
      segments[segments.length - 1].text += ' ' + trimmed;
      continue;
    }
    console.error(`[parse-script] Line ${lineNum}: unrecognised format (expected "Label: text"): ${trimmed}`);
    process.exit(1);
  }
  const [, label, text] = match;
  if (!knownLabels.has(label)) {
    console.error(`[parse-script] Line ${lineNum}: unknown label "${label}". Known labels: ${[...knownLabels].join(', ')}`);
    process.exit(1);
  }
  const speaker = labelMap[label];
  const prefix = speaker[0].toUpperCase();
  counters[speaker] = (counters[speaker] ?? 0) + 1;
  const id = `${prefix}${counters[speaker]}`;

  turns.push({ speaker, id });
  segments.push({ id, speaker, text: text.trim() });
}

const TurnsSchema = z.array(z.object({ speaker: z.string(), id: z.string().regex(/^[A-Za-z]\d+$/) })).min(1);
const SegSchema = z.array(z.object({ id: z.string(), speaker: z.string(), text: z.string().min(1) })).min(1);
const tRes = TurnsSchema.safeParse(turns);
if (!tRes.success) { console.error('[parse-script] Validation failed (turns):', tRes.error.message); process.exit(1); }
const sRes = SegSchema.safeParse(segments);
if (!sRes.success) { console.error('[parse-script] Validation failed (segments):', sRes.error.message); process.exit(1); }

const spec = { turns, segments };
mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
writeFileSync(outPath, JSON.stringify(spec, null, 2) + '\n');
console.log(`[parse-script] ✓ ${turns.length} turns, ${segments.length} segments → ${outPath}`);
for (const t of turns) console.log(`  ${t.id.padEnd(4)} ${t.speaker}`);
