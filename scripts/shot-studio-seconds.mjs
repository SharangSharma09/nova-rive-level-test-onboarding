// Open /studio-ads, select a project, and screenshot the FULL studio page at every second of
// its video (seeking the <video>, so the script-panel karaoke + playhead update with each frame).
//
// Usage: node scripts/shot-studio-seconds.mjs "<project label>" [out-slug]
//   e.g. node scripts/shot-studio-seconds.mjs "Original Tamil" original-tamil
// Output: .context/studio-shots/<slug>/sec-NN.png

import { chromium } from 'playwright';
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';

const label = process.argv[2];
if (!label) { console.error('Usage: node scripts/shot-studio-seconds.mjs "<project label>" [slug]'); process.exit(1); }
const slug = process.argv[3] || label.toLowerCase().replace(/\s+/g, '-');
const route = process.env.STUDIO_ROUTE || '/studio-ads';
const outDir = path.resolve('.context/studio-shots', slug);
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1 });
const p = await ctx.newPage();
await p.goto(`http://localhost:3000${route}`, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(1500);

await p.click(`text=${label}`);                       // select project in the sidebar
await p.waitForFunction(() => {
  const v = document.querySelector('video');
  return v && v.readyState >= 1 && v.duration > 0 && isFinite(v.duration);
}, { timeout: 20000 });
const dur = await p.evaluate(() => document.querySelector('video').duration);
const total = Math.floor(dur);
console.log(`[shots] ${label}: ${dur.toFixed(1)}s → ${total + 1} screenshots`);

for (let s = 0; s <= total; s++) {
  await p.evaluate((t) => { const v = document.querySelector('video'); v.pause(); v.currentTime = t; }, s);
  await p.waitForTimeout(500);                          // let the seek + karaoke render
  await p.screenshot({ path: path.join(outDir, `sec-${String(s).padStart(2, '0')}.png`) });
}
console.log(`[shots] ✓ ${total + 1} frames → ${outDir}`);
await b.close();
