import { chromium } from 'playwright';
const w = Number(process.argv[2] || 1400), h = Number(process.argv[3] || 900);
const clickText = process.argv[4] || null; // optional: project label to click
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
const p = await ctx.newPage();
await p.goto(process.env.SHOT_URL || 'http://localhost:3000/studio', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(2000);
if (clickText) {
  await p.click(`text=${clickText}`);
  await p.waitForTimeout(2500);
}
const seekSec = process.argv[5] ? Number(process.argv[5]) : null;
if (seekSec != null) {
  await p.evaluate((s) => { const v = document.querySelector('video'); v.currentTime = s; }, seekSec);
  await p.waitForTimeout(800);
}
const info = await p.evaluate(() => {
  const v = document.querySelector('video');
  return { src: v?.currentSrc?.split('/api/')[1] || null, videoBox: v ? { w: v.videoWidth, h: v.videoHeight } : null };
});
console.log(JSON.stringify(info));
await p.screenshot({ path: '.context/studio-shot.png' });
await b.close();
