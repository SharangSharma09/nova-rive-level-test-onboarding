// Compose the conversation into the 8 approved layouts from the 4 Avatar V clips.
// Per turn the speaker talks on their panel while the other shows the looped idle; both characters'
// landscape frames are cover-cropped (full height kept → faces never cut) into each layout's geometry.
// Clean Cartesia per-line audio is used (HeyGen's re-encoded audio is bypassed). Chrome (G-meet bars,
// brand strips, top text) is rendered once via headless Chromium. Captions are burned per layout at
// the right Y by add-captions.mjs.
//
// Usage: node scripts/compose-layouts.mjs <projectDir> [--only 01,03,...]
//   in : <projectDir>/conversation.json, tts/manifest.json, videos/{nova,girl}-{talk,idle[,idle-stable]}.mp4
//   out: <projectDir>/layouts/<NN-name>/final.mp4  (+ final_no_subs.mp4)

import { chromium } from 'playwright';
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, copyFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { FFMPEG, FFPROBE } from './_bin.mjs';

const projectDir = process.argv[2];
if (!projectDir) { console.error('Usage: node scripts/compose-layouts.mjs <projectDir> [--only ids]'); process.exit(1); }
const onlyArg = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1].split(',') : null;

const GAP_MS = 1000;
const probeDur = (f) => { const r = spawnSync(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nk=1:nw=1', f], { encoding: 'utf8' }); return parseFloat(r.stdout.trim()) || 0; };
const ff = (args) => { const r = spawnSync(FFMPEG, args, { encoding: 'utf8', maxBuffer: 1 << 26 }); if (r.status !== 0) console.error('[ff]', (r.stderr || '').slice(-500)); return r.status === 0; };
const cover = (w, h) => `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}`;   // full height kept → face safe
const coverZ = (w, h, z) => `scale=${Math.round(w * z)}:${Math.round(h * z)}:force_original_aspect_ratio=increase,crop=${w}:${h}`; // z>1 = tighter/zoomed-in crop

const conv = JSON.parse(readFileSync(path.join(projectDir, 'conversation.json'), 'utf8'));
const manifest = JSON.parse(readFileSync(path.join(projectDir, 'tts', 'manifest.json'), 'utf8'));
const { top, bottom } = conv.layout;                 // top='nova', bottom='girl' — but layouts address nova/girl directly
const NOVA = top, GIRL = bottom;
const ENDCARD = path.join(projectDir, 'endcard.mp4');   // optional CTA card that replaces the final segment's visual
const hasEndcard = existsSync(ENDCARD);

// per-line offsets inside each speaker's talk track
const lineInfo = {};
for (const sp of [NOVA, GIRL]) {
  const lines = manifest.segments.filter(s => s.speaker === sp && /^[A-Za-z]\d+$/.test(s.id)).sort((a, b) => parseInt(a.id.slice(1)) - parseInt(b.id.slice(1)));
  let acc = 0;
  for (const s of lines) { lineInfo[s.id] = { offsetMs: acc, durMs: s.durationMs, speaker: sp, text: s.text, file: s.file }; acc += s.durationMs + GAP_MS; }
}
const vsrc = (sp, kind) => path.join(projectDir, 'videos', `${sp}-${kind}.mp4`);
const idleSrc = (sp) => { const f = path.join(projectDir, 'videos', `${sp}-idle-stable.mp4`); return existsSync(f) ? f : vsrc(sp, 'idle'); };

// ---- chrome PNGs (rendered once via Chromium) ----
const chromeDir = path.join(projectDir, 'layouts', '_chrome'); mkdirSync(chromeDir, { recursive: true });
const GMEET_BAR = path.join(chromeDir, 'gmeet_bar.png');     // 680×96 dark rounded bar + 5 icons
const BRAND_07 = path.join(chromeDir, 'brand_07.png');       // 720×90 purple bar + text
const PIP_MASK = path.join(chromeDir, 'pip_mask.png');       // 220×280 rounded alpha mask (white-on-black)
const PIP_BORDER = path.join(chromeDir, 'pip_border.png');   // 220×280 rounded white border
const GRID_MASK = path.join(chromeDir, 'grid_mask.png');     // 680×470 rounded alpha mask
const GRID_BORDER = path.join(chromeDir, 'grid_border.png'); // 680×470 rounded white border
const TITLE_03 = path.join(chromeDir, 'title_03.png');       // 680×84 brand pill title (layout 03)
const CIRCLE_MASK = path.join(chromeDir, 'circle_mask.png'); // 240 circular alpha mask (active-speaker PIP)
const CIRCLE_BORDER = path.join(chromeDir, 'circle_border.png'); // 240 circular white border
async function renderChrome() {
  const browser = await chromium.launch();
  const shot = async (html, w, h, out, opaque = false) => { const p = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 }); await p.setContent(html); await p.screenshot({ path: out, omitBackground: !opaque }); await p.close(); };
  const rmask = (w, h, r) => `<body style="margin:0;background:#000"><div style="width:${w}px;height:${h}px;background:#fff;border-radius:${r}px"></div></body>`;
  const rborder = (w, h, r) => `<body style="margin:0"><div style="width:${w}px;height:${h}px;box-sizing:border-box;border:4px solid #fff;border-radius:${r}px"></div></body>`;
  const SVG = {
    mic: `<svg width="28" height="28" viewBox="0 0 24 24" fill="#fff"><path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z"/></svg>`,
    cam: `<svg width="28" height="28" viewBox="0 0 24 24" fill="#fff"><path d="M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11l-4 4z"/></svg>`,
    cc: `<svg width="28" height="28" viewBox="0 0 24 24" fill="#fff"><path d="M19 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zM11 11H9.5v-.5h-2v3h2V13H11v1a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1zm7 0h-1.5v-.5h-2v3h2V13H18v1a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1z"/></svg>`,
    hand: `<svg width="28" height="28" viewBox="0 0 24 24" fill="#fff"><path d="M9.6 11.5V5.5a1.5 1.5 0 0 1 3 0V11h.4V4a1.5 1.5 0 0 1 3 0v7h.4V6.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-1.1a5 5 0 0 1-3.9-1.9l-3.4-4.3a1.5 1.5 0 0 1 2.2-2l1.4 1.5V8.5a1.5 1.5 0 0 1 3 0v3z"/></svg>`,
    end: `<svg width="30" height="30" viewBox="0 0 24 24" fill="#fff"><path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08A.996.996 0 0 1 0 12.37c0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.66c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.1-.7-.28-.79-.73-1.68-1.36-2.66-1.85a1.01 1.01 0 0 1-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z"/></svg>`,
    vol: `<svg width="28" height="28" viewBox="0 0 24 24" fill="#fff"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>`,
    dots: `<svg width="28" height="28" viewBox="0 0 24 24" fill="#fff"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>`,
  };
  const btn = (svg, red) => `<div style="width:${red ? 84 : 56}px;height:56px;border-radius:${red ? 28 : 50}px;background:${red ? '#ea4335' : '#3c4043'};display:flex;align-items:center;justify-content:center">${svg}</div>`;
  await shot(`<body style="margin:0;width:680px;height:96px;display:flex;align-items:center;justify-content:center"><div style="display:inline-flex;align-items:center;gap:28px;background:rgba(32,33,36,.96);border-radius:48px;padding:16px 26px">${btn(SVG.mic)}${btn(SVG.vol)}${btn(SVG.end, true)}${btn(SVG.dots)}</div></body>`, 680, 96, GMEET_BAR);
  await shot(`<body style="margin:0"><div style="width:720px;height:90px;background:#5E30C7;color:#fff;display:flex;align-items:center;padding-left:30px;font-family:'Noto Sans Devanagari','Noto Sans',sans-serif;font-weight:600;font-size:32px">Learn English with Supernova</div></body>`, 720, 90, BRAND_07);
  await shot(rmask(260, 330, 24), 260, 330, PIP_MASK, true);
  await shot(rborder(260, 330, 24), 260, 330, PIP_BORDER);
  await shot(rmask(680, 470, 24), 680, 470, GRID_MASK, true);
  await shot(rborder(680, 470, 24), 680, 470, GRID_BORDER);
  // circular PIP (active-speaker circle variant)
  await shot(`<body style="margin:0;background:#000"><div style="width:290px;height:290px;background:#fff;border-radius:50%"></div></body>`, 290, 290, CIRCLE_MASK, true);
  await shot(`<body style="margin:0"><div style="width:290px;height:290px;box-sizing:border-box;border:4px solid #fff;border-radius:50%"></div></body>`, 290, 290, CIRCLE_BORDER);
  // layout-03 top title (straddles the video's top edge). Localized per language via
  // conversation.json chrome.title03; falls back to the styled Hindi default when absent.
  // Broad Indic font stack (Noto + macOS Kohinoor/Sangam) so every target script renders; font
  // auto-shrinks for longer translations so they fit the box.
  const t03 = (conv.chrome && typeof conv.chrome.title03 === 'string' && conv.chrome.title03.trim()) ? conv.chrome.title03.trim() : null;
  const T03_FONTS = `'Poppins','Noto Sans','Noto Sans Devanagari','Kohinoor Devanagari','Noto Sans Tamil','Tamil Sangam MN','Noto Sans Telugu','Kohinoor Telugu','Noto Sans Bengali','Kohinoor Bangla','Noto Sans Kannada','Kohinoor Kannada','Noto Sans Malayalam','Kohinoor Malayalam','Noto Sans Gujarati','Noto Sans Gurmukhi',sans-serif`;
  const t03size = t03 ? (t03.length > 46 ? 28 : t03.length > 32 ? 33 : 38) : 39;
  const t03inner = t03
    ? `<div style="font-family:${T03_FONTS};font-size:${t03size}px;font-weight:800;color:#5E30C7;text-align:center;line-height:1.2;text-shadow:0 2px 7px rgba(255,255,255,.98),0 0 3px rgba(255,255,255,.95),0 0 12px rgba(255,255,255,.9)">${t03.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</div>`
    : `<div style="font-family:'Poppins','Noto Sans Devanagari','Noto Sans',sans-serif;font-size:39px;font-weight:700;color:#5E30C7;text-align:center;line-height:1.25;text-shadow:0 2px 7px rgba(255,255,255,.98),0 0 3px rgba(255,255,255,.95),0 0 12px rgba(255,255,255,.9)">रोज़ <b style="color:#39198c;font-weight:800">15 min</b>, <b style="color:#39198c;font-weight:800">AI&nbsp;Tutor</b> से <b style="color:#39198c;font-weight:800">English</b> सीखो</div>`;
  await shot(`<body style="margin:0;display:flex;align-items:center;justify-content:center;width:700px;height:140px;padding:0 12px;box-sizing:border-box">${t03inner}</body>`, 700, 140, TITLE_03);
  await browser.close();
}

// ---- the 8 layouts: filter uses [0:v]=nova, [1:v]=girl, chrome inputs from index `c` ----
const DARK = '0x14161c';
const BARY = 'H-96-210';   // gmeet control bar lifted clear of the bottom safe zone (~16%)
const LAYOUTS = [
  { id: '01', name: '01-horizontal-split', w: 720, h: 1280, capY: 640, chrome: [],   // zoomed in a bit more
    filter: () => `[0:v]${coverZ(720, 640, 1.18)}[t];[1:v]${coverZ(720, 640, 1.18)}[b];[t][b]vstack=inputs=2[v]` },
  { id: '02', name: '02-horizontal-swap', w: 720, h: 1280, capY: 640, chrome: [],     // zoomed in a bit more
    filter: () => `[1:v]${coverZ(720, 640, 1.18)}[t];[0:v]${coverZ(720, 640, 1.18)}[b];[t][b]vstack=inputs=2[v]` },
  { id: '03', name: '03-vertical-split', w: 720, h: 1280, capY: 1180, chrome: [TITLE_03],   // video pushed down; bold purple title straddles the top edge
    filter: (c) => `[0:v]${cover(360, 1000)}[l];[1:v]${cover(360, 1000)}[r];[l][r]hstack=inputs=2[ct];[ct]pad=720:1280:0:210:color=white[bg];[bg][${c}:v]overlay=(W-w)/2:30[v]` },
  { id: '04b', name: '04b-gmeet-active', w: 720, h: 1280, capY: 880, chrome: [PIP_MASK, PIP_BORDER, GMEET_BAR],   // active speaker = main frame, other = rounded PIP
    filter: (c, sp) => { const b = sp === NOVA ? 0 : 1, p = sp === NOVA ? 1 : 0; return `[${p}:v]${cover(260, 330)},format=rgba[pc];[pc][${c}:v]alphamerge[pip];[${b}:v]${cover(720, 1280)}[bg];[bg][pip]overlay=W-w-20:40[a];[a][${c + 1}:v]overlay=W-w-20:40[b];[b][${c + 2}:v]overlay=20:${BARY}[v]`; } },
  { id: '05b', name: '05b-gmeet-active-circle', w: 720, h: 1280, capY: 880, chrome: [CIRCLE_MASK, CIRCLE_BORDER, GMEET_BAR],   // same flip, circular PIP
    filter: (c, sp) => { const b = sp === NOVA ? 0 : 1, p = sp === NOVA ? 1 : 0; return `[${p}:v]${cover(290, 290)},format=rgba[pc];[pc][${c}:v]alphamerge[pip];[${b}:v]${cover(720, 1280)}[bg];[bg][pip]overlay=W-w-20:40[a];[a][${c + 1}:v]overlay=W-w-20:40[b];[b][${c + 2}:v]overlay=20:${BARY}[v]`; } },
  { id: '07', name: '07-square-ig', w: 720, h: 720, capY: 640, chrome: [],
    filter: () => `[0:v]${cover(360, 720)}[l];[1:v]${cover(360, 720)}[r];[l][r]hstack=inputs=2[v]` },
  { id: '09', name: '09-gmeet-grid', w: 720, h: 1280, capY: 490, chrome: [GRID_MASK, GRID_BORDER, GMEET_BAR],
    filter: (c) => `[${c}:v]split=2[gm1][gm2];[${c + 1}:v]split=2[gb1][gb2];color=c=${DARK}:s=720x1280:r=25[bg];[0:v]${cover(680, 470)},format=rgba[n0];[n0][gm1]alphamerge[n];[1:v]${cover(680, 470)},format=rgba[g0];[g0][gm2]alphamerge[g];[bg][n]overlay=20:14[a];[a][gb1]overlay=20:14[a2];[a2][g]overlay=20:498[b];[b][gb2]overlay=20:498[b2];[b2][${c + 2}:v]overlay=20:${BARY}[v]` },
  { id: '11', name: '11-two-panel', w: 720, h: 1280, capY: 640, chrome: [],
    filter: () => `[0:v]${cover(720, 640)}[t];[1:v]${cover(720, 640)}[b];[t][b]vstack=inputs=2[v]` },
];

const cues = conv.turns.map((turn, i) => {
  const o = lineInfo[turn.id]; let ms = 0; for (let k = 0; k < i; k++) ms += lineInfo[conv.turns[k].id].durMs;
  return { file: o.file, ms, durationMs: o.durMs, speaker: turn.speaker, text: o.text, words: [] };
});
// reuse the word timings already computed in the project's cues.json (clip-relative → layout-independent).
// Match by BASENAME: make-split-ad writes file as "tts/<id>-<sp>.wav" but our cues carry the bare
// "<id>-<sp>.wav" (from the manifest). Without normalising, every lookup missed, words stayed empty, and
// captions fell back to showing the whole line at once. Keying on basename makes the timings actually land.
const mainCues = path.join(projectDir, 'cues.json');
if (existsSync(mainCues)) {
  const byFile = new Map(JSON.parse(readFileSync(mainCues, 'utf8')).ttsCues.map(c => [path.basename(c.file), c.words || []]));
  for (const c of cues) c.words = byFile.get(path.basename(c.file)) || [];
  const withWords = cues.filter(c => c.words.length).length;
  console.log(`[compose] word-timed captions: ${withWords}/${cues.length} lines`);
  if (cues.length && withWords === 0) console.warn('[compose] ⚠ no word timings matched cues.json — captions will fall back to full lines');
}

// Pre-slice each turn's nova+girl raw segments to clean files ONCE (shared across all layouts).
// frame 0 = real content, so the seek-into-the-talk-clip can't drop the first frame inside the
// compositor (that dropout was the empty-PIP / canvas flash at the joins).
const avDir = path.join(projectDir, 'layouts', '_avseg'); rmSync(avDir, { recursive: true, force: true }); mkdirSync(avDir, { recursive: true });
const ENC = ['-an', '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', '25'];
const segPairs = conv.turns.map((turn, i) => {
  const o = lineInfo[turn.id], durS = (o.durMs / 1000).toFixed(3), speaker = turn.speaker;
  const novaIn = speaker === NOVA ? { src: vsrc(NOVA, 'talk'), ss: (o.offsetMs / 1000).toFixed(3) } : { src: idleSrc(NOVA), ss: '0' };
  const girlIn = speaker === GIRL ? { src: vsrc(GIRL, 'talk'), ss: (o.offsetMs / 1000).toFixed(3) } : { src: idleSrc(GIRL), ss: '0' };
  const n = path.join(avDir, `n_${i}.mp4`), g = path.join(avDir, `g_${i}.mp4`);
  ff(['-y', '-ss', novaIn.ss, '-t', durS, '-i', novaIn.src, ...ENC, n]);
  ff(['-y', '-ss', girlIn.ss, '-t', durS, '-i', girlIn.src, ...ENC, g]);
  return { n, g, file: o.file };
});

function buildLayout(L) {
  const dir = path.join(projectDir, 'layouts', L.name);
  const stitch = path.join(dir, '_seg'); rmSync(stitch, { recursive: true, force: true }); mkdirSync(stitch, { recursive: true });
  const segOuts = [];
  conv.turns.forEach((turn, i) => {
    const { n, g, file } = segPairs[i];
    const cleanAudio = path.join(projectDir, 'tts', file);
    const out = path.join(stitch, `seg_${String(i).padStart(2, '0')}.mp4`);
    if (hasEndcard && i === conv.turns.length - 1) {   // final segment → end-card visual + this line's clean Nova audio
      const fit = L.w === L.h
        ? `scale=${L.w}:${L.h}:force_original_aspect_ratio=decrease,pad=${L.w}:${L.h}:(ow-iw)/2:(oh-ih)/2:color=0xe6d7fe,setsar=1`
        : `${cover(L.w, L.h)},setsar=1`;
      if (!ff(['-y', '-i', ENDCARD, '-i', cleanAudio, '-filter_complex', `[0:v]${fit}[v]`, '-map', '[v]', '-map', '1:a',
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-r', '25', '-c:a', 'aac', '-b:a', '256k', '-ar', '44100', '-ac', '2', '-shortest', out])) { console.error(`  ✗ ${L.name} endcard`); process.exit(1); }
      segOuts.push(out); return;
    }
    const cBase = 2;                                   // chrome inputs start after nova(0)+girl(1)
    const args = ['-y', '-i', n, '-i', g];             // pre-sliced clean files — no -ss in the compositor
    for (const png of L.chrome) args.push('-i', png);
    const audioIdx = cBase + L.chrome.length;
    args.push('-i', cleanAudio);
    args.push('-filter_complex', L.filter(cBase, turn.speaker), '-map', '[v]', '-map', `${audioIdx}:a`,
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-r', '25', '-c:a', 'aac', '-b:a', '256k', '-ar', '44100', '-ac', '2', '-shortest', out);
    if (!ff(args)) { console.error(`  ✗ ${L.name} turn ${turn.id}`); process.exit(1); }
    segOuts.push(out);
  });
  const list = path.join(stitch, 'concat.txt'); writeFileSync(list, segOuts.map(s => `file '${path.resolve(s)}'`).join('\n') + '\n');
  const base = path.join(dir, 'final_no_subs.mp4');
  ff(['-y', '-f', 'concat', '-safe', '0', '-i', list, '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', '25', '-c:a', 'aac', '-b:a', '256k', '-movflags', '+faststart', base]); // re-encode audio → one continuous stream (no per-segment AAC priming clicks at joins)
  writeFileSync(path.join(dir, 'cues.json'), JSON.stringify({ ttsCues: hasEndcard ? cues.slice(0, -1) : cues, clickCues: [], totalDurationMs: cues.at(-1).ms + cues.at(-1).durationMs }, null, 2) + '\n');
  // captions at this layout's width + Y
  spawnSync('node', ['scripts/add-captions.mjs', dir, String(L.w), String(L.capY)], { encoding: 'utf8', stdio: 'inherit' });
  console.log(`[layout] ✓ ${L.name} (${L.w}×${L.h}) → ${path.join(dir, 'final.mp4')}`);
}

await renderChrome();
const todo = LAYOUTS.filter(L => !onlyArg || onlyArg.includes(L.id));
for (const L of todo) buildLayout(L);
console.log(`\n[compose] ✓ ${todo.length} layouts → ${path.join(projectDir, 'layouts')}/`);
