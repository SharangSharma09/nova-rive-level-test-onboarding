// Make per-segment audio playable in the studio as a placeholder "video": concatenate the clips
// (with gaps) and bake them over a static placeholder card → final.mp4, plus cues.json/scenes.json
// so the SCRIPT panel + timeline highlight each line in sync. Swap final.mp4 for the real render
// (e.g. the HeyGen avatar video) later — cues stay valid.
//
// Usage:
//   node scripts/audio-preview-video.mjs <outProjectDir> <manifest.json> <clipsDir> [gapMs] [title]
//     outProjectDir : .context/projects/<name>  (final.mp4 + cues.json + scenes.json written here)
//     manifest.json : { segments:[{id,speaker,file,text}] } — clip ORDER + display text
//     clipsDir      : where the per-segment .mp3 clips live (read-only; left untouched)
//     gapMs         : silence between clips (default 350)
//     title         : placeholder card title (default "AUDIO PREVIEW")

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const [outDir, manifestPath, clipsDir, gapArg, titleArg] = process.argv.slice(2);
if (!outDir || !manifestPath || !clipsDir) {
  console.error('Usage: node scripts/audio-preview-video.mjs <outProjectDir> <manifest.json> <clipsDir> [gapMs] [title]');
  process.exit(1);
}
const GAP = Number(gapArg || 350);
const TITLE = titleArg || 'AUDIO PREVIEW';
mkdirSync(path.resolve(outDir), { recursive: true });

function ff(args) { const r = spawnSync('ffmpeg', args, { encoding: 'utf8' }); if (r.status !== 0) console.error('[ffmpeg]', (r.stderr || '').slice(-500)); return r.status === 0; }
function probeMs(file) { const r = spawnSync('ffprobe', ['-v', 'quiet', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', file], { encoding: 'utf8' }); return Math.round((parseFloat(r.stdout.trim()) || 0) * 1000); }

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const segs = manifest.segments.filter(s => s.file && existsSync(path.join(clipsDir, s.file)));
if (!segs.length) { console.error('[preview] no clips found in', clipsDir); process.exit(1); }

// 1. cue offsets (with gaps) + per-segment scene blocks
let acc = 0;
const cues = [], scenes = [];
segs.forEach((s, i) => {
  const dur = probeMs(path.join(clipsDir, s.file));
  cues.push({ file: s.file, ms: acc, durationMs: dur, scene: i, speaker: s.speaker || '', text: s.text || s.id || s.file, words: [] });
  const slot = dur + (i < segs.length - 1 ? GAP : 0);
  scenes.push({ name: `${s.id || 'seg' + i}${s.speaker ? ' · ' + s.speaker : ''}`, durationMs: slot });
  acc += slot;
});
const total = acc;
writeFileSync(path.join(outDir, 'cues.json'), JSON.stringify({ ttsCues: cues, clickCues: [], defaultVolume: 0.85, totalDurationMs: total }, null, 2) + '\n');
writeFileSync(path.join(outDir, 'scenes.json'), JSON.stringify({ scenes, totalDurationMs: total }, null, 2) + '\n');

// 2. concatenated audio (clips + gaps) → temp
const aArgs = ['-y']; const filt = []; const labels = []; let idx = 0;
segs.forEach((s, i) => {
  aArgs.push('-i', path.join(clipsDir, s.file));
  const a = idx++; filt.push(`[${a}:a]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo[a${i}]`); labels.push(`[a${i}]`);
  if (i < segs.length - 1 && GAP > 0) { aArgs.push('-f', 'lavfi', '-t', (GAP / 1000).toString(), '-i', 'anullsrc=r=44100:cl=stereo'); const g = idx++; filt.push(`[${g}:a]aformat=sample_fmts=fltp:channel_layouts=stereo[g${i}]`); labels.push(`[g${i}]`); }
});
filt.push(`${labels.join('')}concat=n=${labels.length}:v=0:a=1[out]`);
const tmpAudio = path.join(outDir, '_audio_tmp.mp3');
aArgs.push('-filter_complex', filt.join(';'), '-map', '[out]', '-c:a', 'libmp3lame', '-q:a', '4', tmpAudio);
if (!ff(aArgs)) { console.error('[preview] audio concat failed'); process.exit(1); }

// 3. placeholder card (720x1280 portrait) — drawtext if a font is found, else plain dark frame
const FONTS = ['/System/Library/Fonts/Helvetica.ttc', '/System/Library/Fonts/HelveticaNeue.ttc', '/System/Library/Fonts/Supplemental/Arial.ttf', '/Library/Fonts/Arial.ttf', '/System/Library/Fonts/Geneva.ttf'];
const font = FONTS.find(existsSync);
const tmpImg = path.join(outDir, '_placeholder.png');
const esc = (t) => t.replace(/'/g, "");
let madeImg = false;
if (font) {
  const vf = `drawtext=fontfile=${font}:text='${esc(TITLE)}':fontcolor=white:fontsize=60:x=(w-text_w)/2:y=556,` +
             `drawtext=fontfile=${font}:text='video pending · HeyGen':fontcolor=0x7A7AA0:fontsize=28:x=(w-text_w)/2:y=648`;
  madeImg = ff(['-y', '-f', 'lavfi', '-i', 'color=c=0x14141E:s=720x1280', '-vf', vf, '-frames:v', '1', tmpImg]);
}
if (!madeImg) ff(['-y', '-f', 'lavfi', '-i', 'color=c=0x14141E:s=720x1280', '-frames:v', '1', tmpImg]);

// 4. mux looped placeholder + audio → final.mp4
const finalMp4 = path.join(outDir, 'final.mp4');
const ok = ff(['-y', '-loop', '1', '-i', tmpImg, '-i', tmpAudio, '-c:v', 'libx264', '-tune', 'stillimage', '-pix_fmt', 'yuv420p', '-r', '25', '-c:a', 'aac', '-b:a', '192k', '-t', (total / 1000).toString(), '-movflags', '+faststart', finalMp4]);
spawnSync('rm', ['-f', tmpAudio, tmpImg]);
if (!ok) { console.error('[preview] mux failed'); process.exit(1); }

const dur = probeMs(finalMp4);
console.log(`[preview] ✓ ${segs.length} clips · gap ${GAP}ms · total ${(total / 1000).toFixed(1)}s${font ? '' : ' (no font — plain card)'}`);
console.log(`[preview] ✓ final.mp4 (${(dur / 1000).toFixed(1)}s) + cues.json + scenes.json → ${outDir}`);
