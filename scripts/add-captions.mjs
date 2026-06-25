// Burn Hindi-style captions onto the assembled ad: a purple rounded box (#5E30C7, white text),
// centered on the split line (y=640) between the two panels, word-timed from cues.json.
// Renders each caption phrase as a transparent PNG via headless Chromium (correct Tamil shaping),
// then overlays them with ffmpeg. Keeps final_no_subs.mp4 as the clean base (re-runnable).
//
// Usage: node scripts/add-captions.mjs <projectDir>

import { chromium } from 'playwright';
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, copyFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { FFMPEG, FFPROBE } from './_bin.mjs';

const projectDir = process.argv[2];
if (!projectDir) { console.error('Usage: node scripts/add-captions.mjs <projectDir>'); process.exit(1); }

// Hindi-final caption style (from Nawin's pipeline_config)
const BG = '#5E30C7', FG = '#FFFFFF', FONT_PX = 34, PAD_X = 22, PAD_Y = 14, RADIUS = 10;
// width + caption Y are layout-dependent (passed by compose-layouts.mjs); default to the 720×1280 split.
const VIDEO_W = parseInt(process.argv[3]) || 720, SIDE_MARGIN = 20, SPLIT_Y = parseInt(process.argv[4]) || 640;
const GAP_BREAK = 0.40, SYNC_SHIFT = -0.15, TAIL_HOLD = 0.10, MAX_WORDS = 6;
const maxTextW = VIDEO_W - 2 * SIDE_MARGIN - 2 * PAD_X;

const probeDur = (f) => { const r = spawnSync(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nk=1:nw=1', f], { encoding: 'utf8' }); return parseFloat(r.stdout.trim()) || 0; };
const ff = (args) => { const r = spawnSync(FFMPEG, args, { encoding: 'utf8', maxBuffer: 1 << 26 }); if (r.status !== 0) console.error('[ff]', (r.stderr || '').slice(-600)); return r.status === 0; };
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const finalMp4 = path.join(projectDir, 'final.mp4');
const base = path.join(projectDir, 'final_no_subs.mp4');
if (!existsSync(base)) { copyFileSync(finalMp4, base); console.log('[cap] saved clean base → final_no_subs.mp4'); }

// 1. build caption chunks (break on >0.4s gaps or MAX_WORDS) with absolute timings
const cues = JSON.parse(readFileSync(path.join(projectDir, 'cues.json'), 'utf8')).ttsCues;
const chunks = [];
for (const cue of cues) {
  const words = cue.words || [];
  if (!words.length) { chunks.push({ text: cue.text || '', start: cue.ms / 1000 + SYNC_SHIFT, end: (cue.ms + cue.durationMs) / 1000 + TAIL_HOLD }); continue; }
  let cur = [];
  const flush = () => { if (!cur.length) return; chunks.push({ text: cur.map(w => w.word).join(' '), start: (cue.ms + cur[0].startMs) / 1000 + SYNC_SHIFT, end: (cue.ms + cur.at(-1).endMs) / 1000 + TAIL_HOLD }); cur = []; };
  for (let i = 0; i < words.length; i++) {
    cur.push(words[i]);
    const next = words[i + 1];
    const gap = next ? (next.startMs - words[i].endMs) / 1000 : 0;
    const w = words[i].word;
    const endsSentence = /[।?!]$/.test(w) || (/\.$/.test(w) && !/\.\.$/.test(w)); // new sentence → new caption ('…' doesn't break)
    if (!next || cur.length >= MAX_WORDS || gap > GAP_BREAK || endsSentence) flush();
  }
}
// no two captions on screen at once
chunks.sort((a, b) => a.start - b.start);
for (let i = 0; i < chunks.length - 1; i++) if (chunks[i].end > chunks[i + 1].start) chunks[i].end = chunks[i + 1].start - 0.01;
console.log(`[cap] ${chunks.length} caption phrases`);

// 2. render each as a transparent PNG (Chromium → correct Tamil shaping)
const subsDir = path.join(projectDir, 'subs'); rmSync(subsDir, { recursive: true, force: true }); mkdirSync(subsDir, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: VIDEO_W, height: 400 }, deviceScaleFactor: 1 });
for (let i = 0; i < chunks.length; i++) {
  const html = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:transparent">
    <div id="cap" style="display:inline-block;background:${BG};color:${FG};
      font-family:'Noto Sans Tamil','Noto Sans Telugu','Noto Sans Devanagari','Tamil Sangam MN','Telugu Sangam MN','Kohinoor Telugu','Kohinoor Devanagari','Noto Sans',-apple-system,sans-serif;font-weight:600;
      font-size:${FONT_PX}px;line-height:1.3;padding:${PAD_Y}px ${PAD_X}px;border-radius:${RADIUS}px;
      max-width:${maxTextW}px;text-align:center;box-sizing:content-box">${esc(chunks[i].text)}</div></body>`;
  await page.setContent(html);
  const el = await page.$('#cap');
  const png = path.join(subsDir, `chunk_${String(i).padStart(3, '0')}.png`);
  await el.screenshot({ path: png, omitBackground: true });
  chunks[i].png = png;
}
await browser.close();

// 3. burn: chained overlays, centered x, centered on the split line, timed
const inputs = ['-y', '-i', base];
for (const c of chunks) inputs.push('-i', c.png);
const parts = chunks.map((c, i) => {
  const inl = i === 0 ? '[0:v]' : `[v${i - 1}]`;
  return `${inl}[${i + 1}:v]overlay=(W-w)/2:${SPLIT_Y}-h/2:enable='between(t,${Math.max(0, c.start).toFixed(3)},${Math.max(0, c.end).toFixed(3)})'[v${i}]`;
});
const args = [...inputs, '-filter_complex', parts.join(';'), '-map', `[v${chunks.length - 1}]`, '-map', '0:a',
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-c:a', 'copy', '-movflags', '+faststart', finalMp4];
if (!ff(args)) { console.error('[cap] burn failed'); process.exit(1); }
console.log(`[cap] ✓ ${chunks.length} captions burned → ${finalMp4} (${probeDur(finalMp4).toFixed(1)}s)`);
