// Assemble a horizontal-split conversation video from the 4 continuous Avatar V clips.
// Top speaker over bottom speaker; per turn the speaker's talking-line slice plays on their panel
// while the other shows an idle slice. Landscape (1920×1080) sources are cover-cropped into 720×640
// panels → 720×1280 output (matches add-captions' split-line geometry). Emits cues.json (per-line
// audio refs) + scenes.json + final_no_subs.mp4. Keeps the 4 source clips untouched (for sync.so).
//
// Usage: node scripts/assemble-split.mjs <projectDir>
//   needs <projectDir>/conversation.json, tts/manifest.json, videos/{nova,girl}-{talk,idle}.mp4

import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { FFMPEG, FFPROBE } from './_bin.mjs';

const projectDir = process.argv[2];
if (!projectDir) { console.error('Usage: node scripts/assemble-split.mjs <projectDir>'); process.exit(1); }

const GAP_MS = 1000;            // gap that was inserted between same-speaker lines in the talk tracks
const IDLE_START = 1.0;         // begin idle slices after the opening bookend word (silent middle)
const PANEL_W = 720, PANEL_H = 640;
const COVER = `scale=${PANEL_W}:${PANEL_H}:force_original_aspect_ratio=increase,crop=${PANEL_W}:${PANEL_H}`;

const probeDur = (f) => { const r = spawnSync(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nk=1:nw=1', f], { encoding: 'utf8' }); return parseFloat(r.stdout.trim()) || 0; };
const ff = (args) => { const r = spawnSync(FFMPEG, args, { encoding: 'utf8', maxBuffer: 1 << 26 }); if (r.status !== 0) console.error('[ff]', (r.stderr || '').slice(-500)); return r.status === 0; };

const conv = JSON.parse(readFileSync(path.join(projectDir, 'conversation.json'), 'utf8'));
const manifest = JSON.parse(readFileSync(path.join(projectDir, 'tts', 'manifest.json'), 'utf8'));
const { top, bottom } = conv.layout;

const vids = {};
for (const sp of [top, bottom]) for (const kind of ['talk', 'idle']) {
  const f = path.join(projectDir, 'videos', `${sp}-${kind}.mp4`);
  if (!existsSync(f)) { console.error('[split] missing', f); process.exit(1); }
  vids[`${sp}_${kind}`] = f;
}

// per-line offset within each speaker's continuous talk track (cumulative dur + gaps)
const lineInfo = {};   // id → { offsetMs, durMs, speaker, text, file }
for (const sp of [top, bottom]) {
  const lines = manifest.segments
    .filter(s => s.speaker === sp && /^[A-Za-z]\d+$/.test(s.id))    // talk lines N1..N5 / G1..G5 (not idle words NIo…)
    .sort((a, b) => parseInt(a.id.slice(1)) - parseInt(b.id.slice(1)));
  let acc = 0;
  for (const s of lines) { lineInfo[s.id] = { offsetMs: acc, durMs: s.durationMs, speaker: sp, text: s.text, file: s.file }; acc += s.durationMs + GAP_MS; }
}

const stitch = path.join(projectDir, 'stitched'); rmSync(stitch, { recursive: true, force: true }); mkdirSync(stitch, { recursive: true });
const cues = [], segOuts = [];
let cumMs = 0;

conv.turns.forEach((turn, i) => {
  const o = lineInfo[turn.id];
  if (!o) { console.error('[split] no line info for', turn.id); process.exit(1); }
  const durS = (o.durMs / 1000).toFixed(3);
  const speaker = turn.speaker;
  const panelSrc = (panel) => {
    if (panel === speaker) return { src: vids[`${panel}_talk`], ss: (o.offsetMs / 1000).toFixed(3) };
    const stable = path.join(projectDir, 'videos', `${panel}-idle-stable.mp4`);   // looped genuinely-idle window
    if (existsSync(stable)) return { src: stable, ss: '0.000' };
    return { src: vids[`${panel}_idle`], ss: IDLE_START.toFixed(3) };
  };
  const t = panelSrc(top), b = panelSrc(bottom);
  const audioInput = top === speaker ? '0:a' : '1:a';     // map the speaker panel's audio

  const out = path.join(stitch, `seg_${String(i).padStart(2, '0')}_${turn.id}.mp4`);
  // Use the CLEAN Cartesia per-line audio (HeyGen lip-synced the video to it, so timing matches) —
  // bypasses HeyGen's re-encoded/resampled AAC. Falls back to the video's own audio if missing.
  const cleanAudio = path.join(projectDir, 'tts', o.file);
  const useClean = existsSync(cleanAudio);
  const ok = ff(['-y',
    '-ss', t.ss, '-t', durS, '-i', t.src,
    '-ss', b.ss, '-t', durS, '-i', b.src,
    ...(useClean ? ['-i', cleanAudio] : []),
    '-filter_complex', `[0:v]${COVER}[tv];[1:v]${COVER}[bv];[tv][bv]vstack=inputs=2[v]`,
    '-map', '[v]', '-map', useClean ? '2:a' : audioInput,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-r', '25',
    '-c:a', 'aac', '-b:a', '256k', '-ar', '44100', '-ac', '2', '-shortest', out]);
  if (!ok) { console.error('[split] segment failed', turn.id); process.exit(1); }

  const durMs = Math.round(probeDur(out) * 1000);
  cues.push({ file: o.file, ms: cumMs, durationMs: durMs, speaker, text: o.text, words: [] });
  segOuts.push(out); cumMs += durMs;
  console.log(`  ✓ turn ${String(i).padStart(2)} ${turn.id.padEnd(3)} ${speaker.padEnd(4)} ${(durMs / 1000).toFixed(2)}s`);
});

const concatList = path.join(stitch, 'concat.txt');
writeFileSync(concatList, segOuts.map(s => `file '${path.resolve(s)}'`).join('\n') + '\n');
const base = path.join(projectDir, 'final_no_subs.mp4');
if (!ff(['-y', '-f', 'concat', '-safe', '0', '-i', concatList, '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', '25', '-c:a', 'copy', '-movflags', '+faststart', base])) { console.error('[split] concat failed'); process.exit(1); }

writeFileSync(path.join(projectDir, 'cues.json'), JSON.stringify({ ttsCues: cues, clickCues: [], totalDurationMs: cumMs }, null, 2) + '\n');
writeFileSync(path.join(projectDir, 'scenes.json'), JSON.stringify({ scenes: cues.map(c => ({ name: `${c.speaker} · ${c.text.slice(0, 24)}`, durationMs: c.durationMs })), totalDurationMs: cumMs }, null, 2) + '\n');
console.log(`[split] ✓ ${segOuts.length} turns · ${(probeDur(base)).toFixed(1)}s (720×1280) → ${base}`);
