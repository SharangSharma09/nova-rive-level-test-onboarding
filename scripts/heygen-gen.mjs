// Generate HeyGen avatar videos (audio-driven, Avatar IV/V) for a batch of jobs:
// upload audio asset → POST /v3/videos → poll → download. Reusable for the test + the full ad batch.
//
// Usage: node scripts/heygen-gen.mjs <jobs.json> <outDir>
//   jobs.json: [{ id, audio, avatar_id, engine?, aspect_ratio?, resolution?, expressiveness? }]
//   engine default avatar_iv · aspect_ratio default 9:16 · resolution default 1080p · expressiveness default low
//   Output: <outDir>/<id>.mp4 + <outDir>/heygen-results.json
// Reads HEYGEN_API_KEY from .env.local.

import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const [jobsPath, outDir] = process.argv.slice(2);
if (!jobsPath || !outDir) { console.error('Usage: node scripts/heygen-gen.mjs <jobs.json> <outDir>'); process.exit(1); }

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
const UP = 'https://upload.heygen.com', API = 'https://api.heygen.com';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const ctOf = (f) => f.endsWith('.wav') ? 'audio/x-wav' : f.endsWith('.m4a') ? 'audio/mp4' : 'audio/mpeg';

async function uploadAudio(file) {
  const res = await fetch(`${UP}/v1/asset`, { method: 'POST', headers: { 'X-Api-Key': KEY, 'Content-Type': ctOf(file) }, body: readFileSync(path.resolve(file)) });
  if (!res.ok) throw new Error(`upload ${res.status}: ${(await res.text()).slice(0, 160)}`);
  return (await res.json()).data.id;
}
async function submit(job, audioAssetId) {
  const engine = job.engine || 'avatar_iv';
  const body = {
    type: 'avatar', avatar_id: job.avatar_id, audio_asset_id: audioAssetId,
    engine: { type: engine }, aspect_ratio: job.aspect_ratio || '9:16',
    resolution: job.resolution || '1080p', output_format: 'mp4', title: job.id,
  };
  if (engine === 'avatar_iv') body.expressiveness = job.expressiveness || 'low';
  if (job.motion_prompt) body.motion_prompt = job.motion_prompt; // body motion + background (e.g. road blurring past)
  const res = await fetch(`${API}/v3/videos`, { method: 'POST', headers: { 'x-api-key': KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`submit ${res.status}: ${(await res.text()).slice(0, 220)}`);
  return (await res.json()).data.video_id;
}
async function poll(videoId) {
  try {
    const res = await fetch(`${API}/v3/videos/${videoId}`, { headers: { 'x-api-key': KEY } });
    if (!res.ok) return { status: 'pending', err: `${res.status}` }; // non-ok → retry next cycle
    return (await res.json()).data ?? {};
  } catch (e) { return { status: 'pending', err: e.message }; }       // network blip → stay pending, don't crash
}
async function download(url, out) {
  const r = await fetch(url); if (!r.ok) throw new Error(`download ${r.status}`);
  writeFileSync(out, Buffer.from(await r.arrayBuffer()));
}

const jobs = JSON.parse(readFileSync(jobsPath, 'utf8'));
mkdirSync(path.resolve(outDir), { recursive: true });

// 1. upload audio (dedup identical files) + submit
const assetCache = new Map();
const st = [];
for (const job of jobs) {
  try {
    let assetId = assetCache.get(job.audio);
    if (!assetId) { assetId = await uploadAudio(job.audio); assetCache.set(job.audio, assetId); }
    const vid = await submit(job, assetId);
    console.log(`[gen] ▶ submitted ${job.id.padEnd(18)} ${job.avatar_id.slice(0, 8)} ${job.engine || 'avatar_iv'} → ${vid}`);
    st.push({ ...job, video_id: vid, status: 'processing' });
  } catch (e) { console.error(`[gen] ✗ submit ${job.id}: ${e.message}`); st.push({ ...job, status: 'error', err: e.message }); }
}

// 2. poll until all terminal (or 9-min deadline)
const deadline = Date.now() + 9 * 60 * 1000;
const pending = () => st.filter(s => s.video_id && !['completed', 'failed', 'error'].includes(s.status));
while (pending().length && Date.now() < deadline) {
  await sleep(10000);
  for (const s of pending()) {
    const d = await poll(s.video_id);
    if (d.status) s.status = d.status;
    if (d.status === 'completed') s.video_url = d.video_url || d.output_url;
    if (d.status === 'failed') s.err = JSON.stringify(d.error || d).slice(0, 200);
  }
  console.log(`[gen] … ${st.filter(s => s.status === 'completed').length}/${st.length} done, ${pending().length} pending`);
}

// 3. download completed
for (const s of st) {
  if (s.status === 'completed' && s.video_url) {
    const out = path.join(outDir, `${s.id}.mp4`);
    try { await download(s.video_url, out); s.file = out; console.log(`[gen] ✓ ${s.id} → ${out}`); }
    catch (e) { console.error(`[gen] ✗ download ${s.id}: ${e.message}`); }
  } else console.error(`[gen] ✗ ${s.id}: status=${s.status} ${s.err || ''}`);
}
writeFileSync(path.join(outDir, 'heygen-results.json'), JSON.stringify(st, null, 2) + '\n');
const ok = st.filter(s => s.file).length;
console.log(`[gen] DONE — ${ok}/${st.length} downloaded → ${outDir}`);
process.exit(ok === st.length ? 0 : 1);
