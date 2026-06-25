// Sync.so lipsync via DIRECT FILE UPLOAD: multipart POST /v2/generate (video + audio + model) →
// poll GET /v2/generate/{id} → download outputUrl. Files must be < 20MB.
//
// Usage: node scripts/syncso-lipsync.mjs <video> <audio> <out.mp4> [model] [sync_mode] [keyEnvFile]
//   model default lipsync-2-pro · sync_mode default bounce · keyEnvFile reads SYNCSO_API_KEY

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const [video, audio, outFile, model = 'lipsync-2-pro', syncMode = 'bounce', keyEnvFile] = process.argv.slice(2);
if (!video || !audio || !outFile) { console.error('Usage: node scripts/syncso-lipsync.mjs <video> <audio> <out.mp4> [model] [sync_mode] [keyEnvFile]'); process.exit(1); }

function loadKey(file) {
  const p = path.resolve(file || '.env.local');
  if (existsSync(p)) for (const l of readFileSync(p, 'utf8').split('\n')) {
    const m = l.match(/^\s*SYNCSO_API_KEY\s*=\s*(.+?)\s*$/); if (m) return m[1].replace(/^["']|["']$/g, '').trim();
  }
  return process.env.SYNCSO_API_KEY || null;
}
const KEY = loadKey(keyEnvFile);
if (!KEY) { console.error('[sync] SYNCSO_API_KEY not found in', keyEnvFile || '.env.local'); process.exit(1); }
console.log(`[sync] key …${KEY.slice(-6)} (len ${KEY.length}) from ${keyEnvFile || '.env.local'}`);
const API = 'https://api.sync.so';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const fd = new FormData();
fd.append('video', new Blob([readFileSync(path.resolve(video))], { type: 'video/mp4' }), path.basename(video));
fd.append('audio', new Blob([readFileSync(path.resolve(audio))], { type: audio.endsWith('.wav') ? 'audio/wav' : 'audio/mpeg' }), path.basename(audio));
fd.append('model', model);
fd.append('options', JSON.stringify({ sync_mode: syncMode }));
fd.append('outputFileName', path.basename(outFile).replace(/\.mp4$/, ''));

console.log(`[sync] uploading ${path.basename(video)} + ${path.basename(audio)} · model ${model} · sync_mode ${syncMode}…`);
const res = await fetch(`${API}/v2/generate`, { method: 'POST', headers: { 'x-api-key': KEY }, body: fd });
const txt = await res.text();
if (!res.ok) { console.error('[sync] create', res.status, txt.slice(0, 500)); process.exit(1); }
const j = JSON.parse(txt);
const id = j.id;
console.log('[sync] generation id', id, '· status', j.status);

const deadline = Date.now() + 13 * 60 * 1000;
let result = null, logged = false;
while (Date.now() < deadline) {
  await sleep(10000);
  let d;
  try { const r = await fetch(`${API}/v2/generate/${id}`, { headers: { 'x-api-key': KEY } }); if (!r.ok) { console.log('[sync] poll', r.status); continue; } d = await r.json(); }
  catch (e) { console.log('[sync] poll err', e.message); continue; }
  if (!logged) { console.log('[sync] shape:', JSON.stringify(d).slice(0, 220)); logged = true; }
  console.log('[sync] status', d.status);
  if (d.status === 'COMPLETED') { result = d; break; }
  if (['FAILED', 'REJECTED'].includes(d.status)) { console.error('[sync] FAILED:', JSON.stringify(d).slice(0, 400)); process.exit(1); }
}
if (!result) { console.error('[sync] timed out (id ' + id + ')'); process.exit(1); }
const url = result.outputUrl;
if (!url) { console.error('[sync] no outputUrl in', JSON.stringify(result).slice(0, 300)); process.exit(1); }
const r = await fetch(url); if (!r.ok) { console.error('[sync] download', r.status); process.exit(1); }
writeFileSync(path.resolve(outFile), Buffer.from(await r.arrayBuffer()));
console.log('[sync] ✓ downloaded →', outFile, `(${(result.outputDuration ?? '?')}s)`);
