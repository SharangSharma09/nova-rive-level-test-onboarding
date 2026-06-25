// Decompose a project's video by VISUAL TRANSITIONS (ffmpeg scene detection — not silence),
// then cut the video + audio into parts and map the Gemini transcript onto each part.
//
// Produces, under .context/projects/<name>/:
//   parts/part-N.mp4   — silent video bit of that part
//   parts/part-N.mp3   — audio bit of that part
//   cues.json          — studio cues: [{file, ms, durationMs, text, words}] (words relative to part)
//   scenes.json        — parts as timeline scene-blocks
//
// Usage: node scripts/split-project.mjs <project> [sceneThreshold]   (default supernova-widget, 8)

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';

const project = process.argv[2] || 'supernova-widget';
const THRESHOLD = Number(process.argv[3] || 8);
const projDir = path.resolve('.context/projects', project);
const video = path.join(projDir, 'final.mp4');
const partsDir = path.join(projDir, 'parts');

function log(...a) { console.log('[split]', ...a); }
function ff(args) { const r = spawnSync('ffmpeg', args, { encoding: 'utf8' }); return (r.stderr || '') + (r.stdout || ''); }

function probeDuration(file) {
  const r = spawnSync('ffprobe', ['-v', 'quiet', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', file], { encoding: 'utf8' });
  return parseFloat(r.stdout.trim());
}

// Visual transition timestamps (seconds) via scene detection.
function detectTransitions(file, threshold) {
  const out = ff(['-hide_banner', '-i', file, '-vf', `scdet=threshold=${threshold}`, '-an', '-f', 'null', '-']);
  return [...out.matchAll(/lavfi\.scd\.time:\s*([0-9.]+)/g)].map(m => parseFloat(m[1])).sort((a, b) => a - b);
}

function main() {
  if (!existsSync(video)) { console.error('missing', video); process.exit(1); }
  const transcript = existsSync(path.join(projDir, 'transcript.json'))
    ? JSON.parse(readFileSync(path.join(projDir, 'transcript.json'), 'utf8')) : { segments: [] };
  const allWords = (transcript.segments || []).flatMap(s => s.words || []);

  const dur = probeDuration(video);
  let cuts = detectTransitions(video, THRESHOLD).filter(t => t > 0.5 && t < dur - 0.5);
  // Fallback: a video with no visual cuts (one continuous scene) → split at the transcript's
  // natural segment boundaries instead, so it isn't one giant part.
  if (cuts.length === 0 && (transcript.segments?.length ?? 0) > 1) {
    cuts = transcript.segments.slice(1).map(s => s.startMs / 1000).filter(t => t > 0.5 && t < dur - 0.5);
    log('no visual transitions — falling back to transcript segment boundaries');
  }
  const bounds = [0, ...cuts, dur];
  log(`duration ${dur.toFixed(2)}s · ${cuts.length} cuts → ${bounds.length - 1} parts`);

  rmSync(partsDir, { recursive: true, force: true });
  mkdirSync(partsDir, { recursive: true });

  const cues = [];
  const scenes = [];
  for (let i = 0; i < bounds.length - 1; i++) {
    const startSec = bounds[i], endSec = bounds[i + 1];
    const startMs = Math.round(startSec * 1000), durMs = Math.round((endSec - startSec) * 1000);
    const vOut = path.join(partsDir, `part-${i}.mp4`);
    const aOut = path.join(partsDir, `part-${i}.mp3`);

    // silent video bit + audio bit (output-seek + re-encode = accurate cut)
    ff(['-y', '-i', video, '-ss', `${startSec}`, '-to', `${endSec}`, '-an', '-vf', 'format=yuv420p', '-movflags', '+faststart', vOut]);
    ff(['-y', '-i', video, '-ss', `${startSec}`, '-to', `${endSec}`, '-vn', '-ar', '44100', aOut]);

    // words whose start falls in this part, shifted relative to the part start
    const words = allWords
      .filter(w => w.startMs >= startMs && w.startMs < startMs + durMs)
      .map(w => ({ word: w.word, startMs: w.startMs - startMs, endMs: Math.min(w.endMs - startMs, durMs) }));
    const text = words.map(w => w.word).join(' ');

    cues.push({ file: `part-${i}.mp3`, ms: startMs, durationMs: durMs, scene: i, text, words });
    scenes.push({ name: `Part ${i}`, durationMs: durMs });
    log(`  part-${i}: [${startSec.toFixed(1)}–${endSec.toFixed(1)}s] ${words.length} words`);
  }

  writeFileSync(path.join(projDir, 'cues.json'),
    JSON.stringify({ ttsCues: cues, clickCues: [], defaultVolume: 0.78, totalDurationMs: Math.round(dur * 1000) }, null, 2) + '\n');
  writeFileSync(path.join(projDir, 'scenes.json'),
    JSON.stringify({ scenes, totalDurationMs: Math.round(dur * 1000) }, null, 2) + '\n');
  log(`✓ wrote cues.json (${cues.length} cues) + scenes.json + parts/ → ${projDir}`);
}

main();
