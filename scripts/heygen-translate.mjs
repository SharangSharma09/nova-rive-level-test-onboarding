// HeyGen Video Translate with CUSTOM AUDIO (bring-your-own-voice): upload video + our audio →
// POST /v3/video-translations → poll → download. Tests multi-face lip-sync on our split-screen.
//
// Usage: node scripts/heygen-translate.mjs <video.mp4> <audio.mp3> <outFile> ["Language (Region)"] [speakerNum]

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const [video, audio, outFile, language = 'Telugu (India)', speakerNum = '2'] = process.argv.slice(2);
if (!video || !audio || !outFile) { console.error('Usage: node scripts/heygen-translate.mjs <video.mp4> <audio.mp3> <outFile> [language] [speakerNum]'); process.exit(1); }

function loadKey() {
  if (process.env.HEYGEN_API_KEY) return process.env.HEYGEN_API_KEY;
  const p = path.resolve('.env.local');
  if (existsSync(p)) for (const l of readFileSync(p, 'utf8').split('\n')) { const m = l.match(/^\s*HEYGEN_API_KEY\s*=\s*(.+?)\s*$/); if (m) return m[1].replace(/^["']|["']$/g, ''); }
  return null;
}
const KEY = loadKey();
if (!KEY) { console.error('HEYGEN_API_KEY not set'); process.exit(1); }
const UP = 'https://upload.heygen.com', API = 'https://api.heygen.com';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function upload(file, ct) {
  const r = await fetch(`${UP}/v1/asset`, { method: 'POST', headers: { 'X-Api-Key': KEY, 'Content-Type': ct }, body: readFileSync(path.resolve(file)) });
  if (!r.ok) throw new Error(`upload ${file} ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return (await r.json()).data.id;
}
async function createTranslation(videoId, audioId) {
  const body = { video: { type: 'asset_id', asset_id: videoId }, output_languages: [language], audio: { type: 'asset_id', asset_id: audioId }, speaker_num: Number(speakerNum), enable_caption: false, title: 'telugu-custom-audio-test' };
  console.log('[translate] POST body:', JSON.stringify(body));
  const r = await fetch(`${API}/v3/video-translations`, { method: 'POST', headers: { 'x-api-key': KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const txt = await r.text();
  if (!r.ok) throw new Error(`create ${r.status}: ${txt.slice(0, 400)}`);
  const d = JSON.parse(txt).data;
  console.log('[translate] create response data:', JSON.stringify(d));
  return d.video_translation_ids?.[0] || d.video_translation_id || d.id;
}
async function poll(id) {
  for (const url of [`${API}/v3/video-translations/${id}`, `${API}/v1/video_translate/${id}`, `${API}/v2/video_translate/${id}`]) {
    try { const r = await fetch(url, { headers: { 'x-api-key': KEY } }); if (r.ok) return { ...((await r.json()).data ?? {}), _url: url }; } catch { /* try next */ }
  }
  return null;
}

const videoId = await upload(video, 'video/mp4'); console.log('[translate] ✓ video asset', videoId);
const audioId = await upload(audio, audio.endsWith('.wav') ? 'audio/wav' : 'audio/mpeg'); console.log('[translate] ✓ audio asset', audioId);
const tid = await createTranslation(videoId, audioId);
if (!tid) { console.error('[translate] no translation id in response'); process.exit(1); }
console.log('[translate] translation id', tid);

const deadline = Date.now() + 13 * 60 * 1000;
let result = null, logged = false;
while (Date.now() < deadline) {
  await sleep(12000);
  const d = await poll(tid);
  if (!d) { console.log('[translate] … no status endpoint matched yet'); continue; }
  if (!logged) { console.log('[translate] status shape:', JSON.stringify(d).slice(0, 300)); logged = true; }
  const status = (d.status || d.state || '').toLowerCase();
  console.log(`[translate] status=${status}  via ${d._url.replace(API, '')}`);
  if (['success', 'completed', 'done'].includes(status)) { result = d; break; }
  if (['failed', 'error'].includes(status)) { console.error('[translate] FAILED:', JSON.stringify(d).slice(0, 400)); process.exit(1); }
}
if (!result) { console.error('[translate] timed out (re-run to keep polling id ' + tid + ')'); process.exit(1); }

const url = result.url || result.video_url || result.output_url || result.translated_video_url;
if (!url) { console.error('[translate] no output url in', JSON.stringify(result).slice(0, 300)); process.exit(1); }
const r = await fetch(url); if (!r.ok) { console.error('download', r.status); process.exit(1); }
writeFileSync(path.resolve(outFile), Buffer.from(await r.arrayBuffer()));
console.log(`[translate] ✓ downloaded → ${outFile}`);
