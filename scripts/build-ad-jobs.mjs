// Build a HeyGen jobs file for the ad's 15 TALKING clips from the TTS manifest.
// Per-speaker avatar/engine/aspect/motion are locked to match the reused idle clips.
//
// Usage: node scripts/build-ad-jobs.mjs <manifest.json> <clipsDir> <out.json> [resolution]
//   default resolution 720p (matches Nawin's reused idle clips)

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const [manifestPath, clipsDir, outPath, resolution = '720p'] = process.argv.slice(2);
if (!manifestPath || !clipsDir || !outPath) { console.error('Usage: node scripts/build-ad-jobs.mjs <manifest.json> <clipsDir> <out.json> [resolution]'); process.exit(1); }

// Locked per Nawin's Hindi final + our reused idles:
const AV = {
  nova: {
    avatar_id: '557978274faa48f58b12a601dd1285fe', engine: 'avatar_v', aspect_ratio: '1:1',
    motion_prompt: 'Soft palm-up gesture, encouraging nod, warm sincere smile, hands relaxed.',
  },
  driver: {
    avatar_id: '12cb94435cb44f3dbdcb86514fc2f21f', engine: 'avatar_iv', aspect_ratio: '9:16', expressiveness: 'low',
    motion_prompt: 'Both hands on the steering wheel with tiny adjustments, background trees and road blur past in soft motion, calm focused expression.',
  },
};

const segs = JSON.parse(readFileSync(manifestPath, 'utf8')).segments;
const jobs = segs.map(s => {
  const a = AV[s.speaker];
  if (!a) throw new Error(`no avatar for speaker "${s.speaker}" (${s.id})`);
  return { id: s.id, audio: path.join(clipsDir, s.file), resolution, ...a };
});
writeFileSync(outPath, JSON.stringify(jobs, null, 2) + '\n');
console.log(`built ${jobs.length} talking jobs (${resolution}) → ${outPath}`);
for (const j of jobs) console.log(`  ${j.id.padEnd(5)} ${j.engine.padEnd(9)} ${j.aspect_ratio.padEnd(4)} ${path.basename(j.audio)}`);
