// Split the continuous per-speaker sync.so outputs back into per-segment talk clips (+ audio), using
// the Tamil per-segment durations as boundaries (the synced video kept Tamil timing). Builds a cues
// skeleton with the target-language text. Output: <outDir>/talk/<SID>.mp4, <outDir>/audio/<file>, cues.json
//
// Usage: node scripts/split-synced.mjs <novaSync.mp4> <driverSync.mp4> <tamilCues.json> <langManifest.json> <outDir>

import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const [novaMp4, driverMp4, tamilCuesPath, manifestPath, outDir] = process.argv.slice(2);
if (!outDir) { console.error('Usage: node scripts/split-synced.mjs <novaSync.mp4> <driverSync.mp4> <tamilCues.json> <langManifest.json> <outDir>'); process.exit(1); }
for (const f of [novaMp4, driverMp4, tamilCuesPath, manifestPath]) if (!existsSync(path.resolve(f))) { console.error('[split] ✗ missing input:', f); process.exit(1); }

const tamilCues = JSON.parse(readFileSync(tamilCuesPath, 'utf8')).ttsCues;
const text = new Map(JSON.parse(readFileSync(manifestPath, 'utf8')).segments.map(s => [s.file, s.text]));
const talkDir = path.join(outDir, 'talk'), audioDir = path.join(outDir, 'audio');
for (const d of [talkDir, audioDir]) { rmSync(d, { recursive: true, force: true }); mkdirSync(d, { recursive: true }); }
const ff = (a) => { const r = spawnSync('ffmpeg', a, { encoding: 'utf8' }); if (r.status !== 0) console.error('[ff]', (r.stderr || '').slice(-300)); return r.status === 0; };

let novaT = 0, driverT = 0;
const ttsCues = [];
tamilCues.forEach((cue, i) => {
  const SID = cue.file.replace(/-(nova|driver)\.mp3$/, '');
  const speaker = cue.file.match(/-(nova|driver)\.mp3$/)[1];
  const dur = cue.durationMs / 1000;
  const src = speaker === 'nova' ? novaMp4 : driverMp4;
  const start = speaker === 'nova' ? novaT : driverT;
  // accurate output-seek cut (re-encode)
  ff(['-y', '-i', src, '-ss', start.toFixed(3), '-t', dur.toFixed(3), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-c:a', 'aac', path.join(talkDir, `${SID}.mp4`)]);
  ff(['-y', '-i', src, '-ss', start.toFixed(3), '-t', dur.toFixed(3), '-vn', '-c:a', 'libmp3lame', '-q:a', '4', path.join(audioDir, cue.file)]);
  if (speaker === 'nova') novaT += dur; else driverT += dur;
  ttsCues.push({ file: cue.file, ms: 0, durationMs: cue.durationMs, scene: i, speaker, text: text.get(cue.file) || '', words: [] });
  console.log(`  ✓ ${SID.padEnd(4)} ${speaker.padEnd(6)} ${dur.toFixed(2)}s @${start.toFixed(2)}s`);
});
writeFileSync(path.join(outDir, 'cues.json'), JSON.stringify({ ttsCues, clickCues: [], defaultVolume: 0.85, totalDurationMs: 0 }, null, 2) + '\n');
console.log(`[split] ✓ ${ttsCues.length} segments → ${outDir}`);
