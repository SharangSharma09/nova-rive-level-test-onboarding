// Build a seamless, muted "idle" clip by looping ONLY the genuinely-idle window of an idle source.
// Avatar V adds stray gestures during long silence; this lets us keep just the stable stretch (hands
// + head still) and ping-pong loop it (forward+reverse → no seam jump) to any length.
//
// Usage: node scripts/make-idle-loop.mjs <srcIdle.mp4> <startSec> <endSec> <outFile> [targetSec=8]

import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FFMPEG } from './_bin.mjs';

const [src, startS, endS, out, targetArg] = process.argv.slice(2);
if (!src || startS === undefined || endS === undefined || !out) {
  console.error('Usage: node scripts/make-idle-loop.mjs <src> <startSec> <endSec> <out> [targetSec]'); process.exit(1);
}
const start = parseFloat(startS), winDur = (parseFloat(endS) - start).toFixed(3), target = parseFloat(targetArg || '8');
const ff = (args) => { const r = spawnSync(FFMPEG, args, { encoding: 'utf8' }); if (r.status !== 0) { console.error('[idle-loop]', (r.stderr || '').slice(-400)); process.exit(1); } };

mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
const tmp = mkdtempSync(path.join(os.tmpdir(), 'idle-'));
const win = path.join(tmp, 'win.mp4'), pp = path.join(tmp, 'pp.mp4');
const enc = ['-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', '25'];

// 1. cut the stable window (muted, re-encoded for a frame-accurate cut)
ff(['-y', '-ss', String(start), '-t', winDur, '-i', src, '-an', ...enc, win]);
// 2. ping-pong (forward + reverse) → a loop unit that ends where it began (seamless)
ff(['-y', '-i', win, '-filter_complex', '[0:v]split[a][b];[b]reverse[r];[a][r]concat=n=2:v=1[v]', '-map', '[v]', '-an', ...enc, pp]);
// 3. loop the ping-pong to the target length
ff(['-y', '-stream_loop', '99', '-i', pp, '-t', String(target), '-an', ...enc, out]);
rmSync(tmp, { recursive: true, force: true });
console.log(`[idle-loop] ✓ ${out}  (${winDur}s idle window ↺ ping-pong → ${target}s, muted)`);
