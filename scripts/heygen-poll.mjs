// Resume a HeyGen batch: poll the still-pending video_ids from a prior run's heygen-results.json
// and download them as they complete. Use when a slow engine (avatar_v) outlasts the first poll.
//
// Usage: node scripts/heygen-poll.mjs <outDir> [maxMinutes]   (reads/writes <outDir>/heygen-results.json)

import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const outDir = process.argv[2];
const MAX_MIN = Number(process.argv[3] || 28);
if (!outDir) { console.error('Usage: node scripts/heygen-poll.mjs <outDir> [maxMinutes]'); process.exit(1); }

function loadKey() {
  if (process.env.HEYGEN_API_KEY) return process.env.HEYGEN_API_KEY;
  const p = path.resolve('.env.local');
  if (existsSync(p)) for (const l of readFileSync(p, 'utf8').split('\n')) {
    const m = l.match(/^\s*HEYGEN_API_KEY\s*=\s*(.+?)\s*$/); if (m) return m[1].replace(/^["']|["']$/g, '');
  }
  return null;
}
const KEY = loadKey();
if (!KEY) { console.error('HEYGEN_API_KEY not set'); process.exit(1); }
const API = 'https://api.heygen.com';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const resultsPath = path.join(outDir, 'heygen-results.json');
const st = JSON.parse(readFileSync(resultsPath, 'utf8'));

async function poll(id) {
  try {
    const r = await fetch(`${API}/v3/videos/${id}`, { headers: { 'x-api-key': KEY } });
    if (!r.ok) return { status: 'pending', err: `${r.status}` };  // non-ok → retry next cycle, don't fail the clip
    return (await r.json()).data ?? {};
  } catch (e) { return { status: 'pending', err: e.message }; }    // network blip → stay pending, never crash the loop
}
async function download(url, out) {
  const r = await fetch(url); if (!r.ok) throw new Error(`download ${r.status}`);
  writeFileSync(out, Buffer.from(await r.arrayBuffer()));
}
const pending = () => st.filter(s => s.video_id && !s.file && !['failed', 'error'].includes(s.status));

const deadline = Date.now() + MAX_MIN * 60 * 1000;
console.log(`[poll] resuming — ${pending().length}/${st.length} still pending (up to ${MAX_MIN} min)`);
while (pending().length && Date.now() < deadline) {
  await sleep(12000);
  for (const s of pending()) {
    const d = await poll(s.video_id);
    if (d.status) s.status = d.status;
    if (d.status === 'completed') {
      s.video_url = d.video_url || d.output_url;
      try { const out = path.join(outDir, `${s.id}.mp4`); await download(s.video_url, out); s.file = out; console.log(`[poll] ✓ ${s.id}`); }
      catch (e) { console.error(`[poll] ✗ download ${s.id}: ${e.message}`); }
    } else if (d.status === 'failed') { s.err = JSON.stringify(d.error || d).slice(0, 160); console.error(`[poll] ✗ ${s.id} FAILED: ${s.err}`); }
    writeFileSync(resultsPath, JSON.stringify(st, null, 2) + '\n');
  }
  console.log(`[poll] ${st.filter(s => s.file).length}/${st.length} done, ${pending().length} pending`);
}
const done = st.filter(s => s.file).length;
console.log(`[poll] FINISHED — ${done}/${st.length} downloaded${pending().length ? ` (${pending().length} still pending — re-run to continue)` : ''}`);
