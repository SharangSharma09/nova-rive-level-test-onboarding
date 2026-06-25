// Assemble the split-screen ad from per-segment talking clips + the reused idle clips, matching
// Nawin's vstack geometry: top (Nova) scaled 0.85, white-padded to 720×640 bottom-anchored; bottom
// (driver) scaled to 720×1280 then center-cropped to 720×640; vstack → 720×1280. The non-speaker
// panel shows a dur-length slice of its idle clip (varied start). Segments concat back-to-back.
// Captions are deferred. Rebuilds cues.json/scenes.json to the assembled (no-gap) timeline so the
// studio's word karaoke stays aligned (per-word timings are clip-relative → unchanged).
//
// Usage: node scripts/assemble-ad.mjs <projectDir>
//   needs <projectDir>/talk/<SID>.mp4, <projectDir>/idle/idle_top.mp4 + idle_bot.mp4, <projectDir>/cues.json

import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { FFMPEG, FFPROBE } from './_bin.mjs';

const projectDir = process.argv[2];
if (!projectDir) { console.error('Usage: node scripts/assemble-ad.mjs <projectDir>'); process.exit(1); }
const talkDir = path.join(projectDir, 'talk');
const idleTop = path.join(projectDir, 'idle', 'idle_top.mp4');
const idleBot = path.join(projectDir, 'idle', 'idle_bot.mp4');
const stitchDir = path.join(projectDir, 'stitched');
for (const f of [idleTop, idleBot]) if (!existsSync(f)) { console.error('missing idle clip', f); process.exit(1); }
rmSync(stitchDir, { recursive: true, force: true }); mkdirSync(stitchDir, { recursive: true });

const SCALE = 0.85, PAD = '#FFFFFF';
const probeDur = (f) => { const r = spawnSync(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nk=1:nw=1', f], { encoding: 'utf8' }); return parseFloat(r.stdout.trim()) || 0; };
const ff = (args) => { const r = spawnSync(FFMPEG, args, { encoding: 'utf8' }); if (r.status !== 0) console.error('[ff]', (r.stderr || '').slice(-500)); return r.status === 0; };

const idleTopDur = probeDur(idleTop), idleBotDur = probeDur(idleBot);
const cuesObj = JSON.parse(readFileSync(path.join(projectDir, 'cues.json'), 'utf8'));
const segs = cuesObj.ttsCues;

// Nawin's exact composite filter
const FILTER =
  `[0:v]scale=iw*${SCALE}:ih*${SCALE},pad=720:640:(720-iw)/2:640-ih:color=${PAD}[tv];` +
  `[1:v]scale=720:1280:force_original_aspect_ratio=increase,crop=720:640[bv];` +
  `[tv][bv]vstack=inputs=2[v]`;

const segOuts = [];
let cumMs = 0;
segs.forEach((cue, i) => {
  const SID = cue.file.replace(/-(nova|driver)\.mp3$/, '');
  const speaker = (cue.file.match(/-(nova|driver)\.mp3$/)?.[1]) || cue.speaker;
  const isNova = speaker === 'nova';
  const talk = path.join(talkDir, `${SID}.mp4`);
  if (!existsSync(talk)) { console.error('missing talk clip', talk); process.exit(1); }
  const dur = probeDur(talk);
  const idleDur = isNova ? idleBotDur : idleTopDur;
  const maxStart = Math.max(0.001, idleDur - dur - 0.3);
  const start = +(((i * 2.7) % maxStart)).toFixed(2);          // varied idle start so it doesn't always begin at frame 0

  const args = ['-y'];
  let amap;
  if (isNova) { args.push('-i', talk, '-ss', `${start}`, '-t', dur.toFixed(3), '-i', idleBot); amap = '0:a'; }
  else { args.push('-ss', `${start}`, '-t', dur.toFixed(3), '-i', idleTop, '-i', talk); amap = '1:a'; }
  const out = path.join(stitchDir, `seg_${SID}.mp4`);
  args.push('-filter_complex', FILTER, '-map', '[v]', '-map', amap,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-c:a', 'aac', '-b:a', '192k', '-r', '25', '-shortest', out);
  if (!ff(args)) { console.error('vstack failed', SID); process.exit(1); }

  const durMs = Math.round(probeDur(out) * 1000);
  segOuts.push({ out, SID, startMs: cumMs, durMs, speaker });
  console.log(`  ✓ seg ${SID.padEnd(4)} ${(isNova ? 'Nova' : 'driver').padEnd(6)} ${(durMs / 1000).toFixed(2)}s  idle@${start}s`);
  cumMs += durMs;
});

// concat back-to-back
const concatList = path.join(stitchDir, 'concat.txt');
writeFileSync(concatList, segOuts.map(s => `file '${path.resolve(s.out)}'`).join('\n') + '\n');
const finalMp4 = path.join(projectDir, 'final.mp4');
// re-encode the join (not -c copy) so there are no corrupt/glitch frames at segment boundaries
if (!ff(['-y', '-f', 'concat', '-safe', '0', '-i', concatList, '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', '25', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', finalMp4])) { console.error('concat failed'); process.exit(1); }

// rebuild cues.json + scenes.json to the assembled (no-gap) timeline; keep per-word (clip-relative) timings
const total = segOuts.reduce((a, s) => a + s.durMs, 0);
const newCues = segs.map((cue, i) => ({ ...cue, ms: segOuts[i].startMs, durationMs: segOuts[i].durMs }));
writeFileSync(path.join(projectDir, 'cues.json'), JSON.stringify({ ...cuesObj, ttsCues: newCues, totalDurationMs: total }, null, 2) + '\n');
writeFileSync(path.join(projectDir, 'scenes.json'), JSON.stringify({ scenes: segOuts.map(s => ({ name: `${s.SID} · ${s.speaker}`, durationMs: s.durMs })), totalDurationMs: total }, null, 2) + '\n');

console.log(`[assemble] ✓ ${segOuts.length} segs · final ${(probeDur(finalMp4)).toFixed(1)}s (720×1280) → ${finalMp4}`);
