// Concatenate audio clips with a fixed silence gap between them → one track.
// Output format is inferred from the output file extension: .wav → pcm_s16le lossless (for HeyGen);
// .mp3 → libmp3lame q:2 (for previews). Re-encodes so joins are click-free.
//
// Usage: node scripts/build-gap-track.mjs <out.wav|out.mp3> <gapSec> <clip1> [clip2 ...]

import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { FFMPEG } from './_bin.mjs';

const [out, gapStr, ...clips] = process.argv.slice(2);
if (!out || gapStr === undefined || clips.length === 0) {
  console.error('Usage: node scripts/build-gap-track.mjs <out.mp3> <gapSec> <clip...>'); process.exit(1);
}
const gap = parseFloat(gapStr);
// Skip silence insertion when gap === 0 to avoid anullsrc infinite-stream edge case
const useGaps = gap > 0 && clips.length > 1;
const nGaps = useGaps ? clips.length - 1 : 0;
mkdirSync(path.dirname(path.resolve(out)), { recursive: true });

const args = ['-y'];
for (const c of clips) args.push('-i', c);
if (useGaps) args.push('-f', 'lavfi', '-t', String(gap), '-i', 'anullsrc=r=44100:cl=stereo');

const fc = [];
clips.forEach((_, i) => fc.push(`[${i}:a]aformat=sample_rates=44100:channel_layouts=stereo[a${i}]`));
let seq;
if (useGaps) {
  const labels = Array.from({ length: nGaps }, (_, i) => `[s${i}]`).join('');
  fc.push(`[${clips.length}:a]aformat=sample_rates=44100:channel_layouts=stereo,asplit=${nGaps}${labels}`);
  const parts = [];
  clips.forEach((_, i) => { parts.push(`[a${i}]`); if (i < nGaps) parts.push(`[s${i}]`); });
  seq = parts.join('');
} else {
  seq = clips.map((_, i) => `[a${i}]`).join('');
}
const total = clips.length + nGaps;
fc.push(`${seq}concat=n=${total}:v=0:a=1[out]`);
const isWav = out.endsWith('.wav');
if (isWav) {
  args.push('-filter_complex', fc.join(';'), '-map', '[out]', '-c:a', 'pcm_s16le', '-ar', '44100', out);
} else {
  args.push('-filter_complex', fc.join(';'), '-map', '[out]', '-c:a', 'libmp3lame', '-q:a', '2', out);
}

const r = spawnSync(FFMPEG, args, { encoding: 'utf8' });
if (r.status !== 0) { console.error('[build-gap-track] ✗', (r.stderr || '').slice(-500)); process.exit(1); }
console.log(`[build-gap-track] ✓ ${out}  (${clips.length} clips · ${gap}s gaps)`);
