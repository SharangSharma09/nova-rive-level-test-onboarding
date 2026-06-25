// Concatenate an ad's per-segment TTS clips (in manifest order) into one preview mp3, with a small
// silence gap between segments so you can QA the full dialogue end-to-end.
//
// Usage: node scripts/concat-ad-preview.mjs <dir-with-manifest.json> [gapMs]   (default gap 350ms)
// Output: <dir>/_preview.mp3

import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const dir = process.argv[2];
const gapMs = Number(process.argv[3] || 350);
if (!dir) { console.error('Usage: node scripts/concat-ad-preview.mjs <dir> [gapMs]'); process.exit(1); }

const manifestPath = path.join(dir, 'manifest.json');
if (!existsSync(manifestPath)) { console.error('no manifest.json in', dir); process.exit(1); }
const segs = JSON.parse(readFileSync(manifestPath, 'utf8')).segments.filter(s => !s.error && s.file);

const args = ['-y'];
const filter = [];
const labels = [];
let inIdx = 0;
segs.forEach((s, i) => {
  args.push('-i', path.join(dir, s.file));
  const a = inIdx++;
  filter.push(`[${a}:a]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo[a${i}]`);
  labels.push(`[a${i}]`);
  if (i < segs.length - 1 && gapMs > 0) {
    args.push('-f', 'lavfi', '-t', (gapMs / 1000).toString(), '-i', 'anullsrc=r=44100:cl=stereo');
    const sg = inIdx++;
    filter.push(`[${sg}:a]aformat=sample_fmts=fltp:channel_layouts=stereo[g${i}]`);
    labels.push(`[g${i}]`);
  }
});
filter.push(`${labels.join('')}concat=n=${labels.length}:v=0:a=1[out]`);
const out = path.join(dir, '_preview.mp3');
args.push('-filter_complex', filter.join(';'), '-map', '[out]', '-c:a', 'libmp3lame', '-q:a', '4', out);

const r = spawnSync('ffmpeg', args, { encoding: 'utf8' });
if (r.status !== 0) { console.error('[concat] ffmpeg failed:\n', (r.stderr || '').slice(-600)); process.exit(1); }
console.log(`[concat] ✓ ${segs.length} clips + ${gapMs}ms gaps → ${out}`);
