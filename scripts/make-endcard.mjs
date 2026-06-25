// Build the end-card: lilac bg + SUPERNOVA wordmark + the Nova phone sliding up from the bottom.
// Deterministic JS-driven animation, frame-captured via Chromium, assembled with ffmpeg.
// Usage: node scripts/make-endcard.mjs [outDir]   (expects <outDir>/phone.png)
import { chromium } from 'playwright';
import { readFileSync, mkdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { FFMPEG } from './_bin.mjs';

const W = 720, H = 1280, FPS = 25;
const outDir = process.argv[2] || '.context/_endcard';
const phoneB64 = readFileSync(path.join(outDir, 'phone.png')).toString('base64');
const framesDir = path.join(outDir, 'frames'); rmSync(framesDir, { recursive: true, force: true }); mkdirSync(framesDir, { recursive: true });

const PHONE_W = 540, REST_Y = 110;
const PHONE_X = Math.round((W - PHONE_W) / 2);

const html = `<!doctype html><meta charset="utf-8"><body style="margin:0;width:${W}px;height:${H}px;overflow:hidden;
  background:#e6d7fe;
  font-family:'Poppins','Helvetica Neue',Arial,sans-serif">
  <div id="brand" style="position:absolute;top:50px;left:0;width:100%;text-align:center;font-family:'Poppins','Arial Black','Helvetica Neue',Arial,sans-serif;font-weight:900;font-style:italic;font-size:50px;letter-spacing:1px;color:#141019;opacity:0">SUPERNOVA</div>
  <img id="phone" src="data:image/png;base64,${phoneB64}" style="position:absolute;left:${PHONE_X}px;width:${PHONE_W}px;top:${H}px">
  <script>
    window.render = (t) => {
      const e = 1 - Math.pow(1 - t, 3);              // easeOutCubic
      document.getElementById('phone').style.top = (${H} + (${REST_Y} - ${H}) * e) + 'px';
      document.getElementById('brand').style.opacity = Math.min(1, t * 1.8);
    };
  </script></body>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
await page.setContent(html);

const totalSec = parseFloat(process.argv[3]) || 4;
const slide = Math.round(1.0 * FPS), hold = Math.max(FPS, Math.round((totalSec - 1.0) * FPS));
let f = 0;
const shot = async () => page.screenshot({ path: path.join(framesDir, `f_${String(f++).padStart(3, '0')}.png`) });
for (let i = 0; i < slide; i++) { await page.evaluate(t => window.render(t), i / (slide - 1)); await shot(); }
for (let i = 0; i < hold; i++) { await page.evaluate(() => window.render(1)); await shot(); }
await browser.close();

const out = path.join(outDir, 'endcard.mp4');
const r = spawnSync(FFMPEG, ['-y', '-framerate', String(FPS), '-i', path.join(framesDir, 'f_%03d.png'),
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-movflags', '+faststart', out], { encoding: 'utf8' });
console.log(r.status === 0 ? `✓ endcard → ${out} (${(slide + hold) / FPS}s)` : 'ffmpeg failed: ' + (r.stderr || '').slice(-300));
