// Import an external video as a studio project, end to end:
//   copy → final.mp4 · extract audio.mp3 · transcribe (Gemini, code-mixed) · split by visual transitions
//
// Usage: node scripts/import-project.mjs <project-name> <video-path> [sceneThreshold=8]

import { spawnSync } from 'node:child_process';
import { mkdirSync, copyFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const name = process.argv[2];
const video = process.argv[3];
const threshold = process.argv[4] || '8';
if (!name || !video) { console.error('Usage: node scripts/import-project.mjs <name> <video> [threshold]'); process.exit(1); }
if (!existsSync(video)) { console.error('video not found:', video); process.exit(1); }

const projDir = path.resolve('.context/projects', name);
mkdirSync(projDir, { recursive: true });

function run(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: 'inherit' });
  if (r.status !== 0) { console.error(`[import] failed: ${cmd} ${args.join(' ')}`); process.exit(1); }
}

console.log(`[import] ${name} ← ${video}`);
copyFileSync(path.resolve(video), path.join(projDir, 'final.mp4'));
console.log('[import] ✓ final.mp4');

run('ffmpeg', ['-y', '-i', path.join(projDir, 'final.mp4'), '-vn', '-ar', '44100', '-ac', '1', path.join(projDir, 'audio.mp3')]);
console.log('[import] ✓ audio.mp3');

run('node', ['scripts/transcribe-project.mjs', name]);
run('node', ['scripts/split-project.mjs', name, threshold]);
console.log(`[import] done → ${projDir}`);
