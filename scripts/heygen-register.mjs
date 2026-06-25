// HeyGen Avatar V (Photo Avatar) registration — DIRECT REST (no MCP).
// Registers an avatar's scene.png as a HeyGen avatar; stores the avatarId in avatar.json.
// Two modes (the avatar render later uses engine avatar_v via /v3/videos):
//   --mode v3       (default)  upload image → POST /v3/avatars {type:"photo"} → avatar_id   (instant, no train)
//   --mode v2-train            upload → /v2/photo_avatar/avatar_group/create → /train → poll → /look/generate → poll
//
// Usage: node scripts/heygen-register.mjs <avatarDir> [--mode v3|v2-train] [--force]
//   <avatarDir>/scene.png + avatar.json  →  writes avatar.json { avatarId, avatarMode, imageKey }
// Reads HEYGEN_API_KEY from env or .env.local. Idempotent unless --force.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const avatarDir = args[0];
const mode = args.includes('--mode') ? args[args.indexOf('--mode') + 1] : 'v3';
const force = args.includes('--force');
if (!avatarDir || !['v3', 'v2-train'].includes(mode)) {
  console.error('Usage: node scripts/heygen-register.mjs <avatarDir> [--mode v3|v2-train] [--force]'); process.exit(1);
}
const scenePng = path.join(avatarDir, 'scene.png');
const avatarJsonPath = path.join(avatarDir, 'avatar.json');
for (const f of [scenePng, avatarJsonPath]) if (!existsSync(f)) { console.error('[reg] missing', f, '— run gen-scene.mjs first'); process.exit(1); }
const avatar = JSON.parse(readFileSync(avatarJsonPath, 'utf8'));

function loadKey() {
  if (process.env.HEYGEN_API_KEY) return process.env.HEYGEN_API_KEY;
  const p = path.resolve('.env.local');
  if (existsSync(p)) for (const l of readFileSync(p, 'utf8').split('\n')) {
    const m = l.match(/^\s*HEYGEN_API_KEY\s*=\s*(.+?)\s*$/); if (m) return m[1].replace(/^["']|["']$/g, '');
  }
  return null;
}
const KEY = loadKey();
if (!KEY) { console.error('[reg] HEYGEN_API_KEY not set'); process.exit(1); }
const UP = 'https://upload.heygen.com', API = 'https://api.heygen.com';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const save = () => writeFileSync(avatarJsonPath, JSON.stringify(avatar, null, 2) + '\n');

avatar.avatarIds = avatar.avatarIds || {};
if (avatar.avatarId && avatar.avatarMode && !avatar.avatarIds[avatar.avatarMode]) avatar.avatarIds[avatar.avatarMode] = avatar.avatarId; // backfill
if (avatar.avatarIds[mode] && !force) {
  console.log(`[reg] avatar.json already has ${mode} avatarId=${avatar.avatarIds[mode]} — skip (--force to redo)`); process.exit(0);
}

async function jpost(url, body) {
  const res = await fetch(url, { method: 'POST', headers: { 'x-api-key': KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const txt = await res.text(); let j; try { j = JSON.parse(txt); } catch { j = { raw: txt }; }
  return { ok: res.ok, status: res.status, j };
}
async function jget(url) {
  const res = await fetch(url, { headers: { 'x-api-key': KEY } });
  const txt = await res.text(); let j; try { j = JSON.parse(txt); } catch { j = { raw: txt }; }
  return { ok: res.ok, status: res.status, j };
}

async function uploadImage(file) {
  const res = await fetch(`${UP}/v1/asset`, { method: 'POST', headers: { 'X-Api-Key': KEY, 'Content-Type': 'image/png' }, body: readFileSync(file) });
  const txt = await res.text();
  if (!res.ok) throw new Error(`upload ${res.status}: ${txt.slice(0, 200)}`);
  const d = JSON.parse(txt).data;
  console.log(`[reg] uploaded image → id=${d.id} image_key=${d.image_key || '-'} url=${(d.url || '').slice(0, 60)}`);
  return d; // { id, url, image_key, ... }
}

async function registerV3(asset) {
  const file = asset.url ? { type: 'url', url: asset.url } : { type: 'asset_id', asset_id: asset.id };
  const r = await jpost(`${API}/v3/avatars`, { type: 'photo', name: `${avatar.name || path.basename(avatarDir)}-photo`, file });
  console.log(`[reg] /v3/avatars ${r.status} →`, JSON.stringify(r.j.data || r.j).slice(0, 400));
  if (!r.ok) throw new Error(`/v3/avatars ${r.status}: ${JSON.stringify(r.j).slice(0, 300)}`);
  const id = r.j.data?.avatar_item?.id || r.j.data?.id || r.j.data?.avatar_id;
  if (!id) throw new Error('no avatar id in /v3/avatars response');
  return id;
}

async function registerV2Train(asset) {
  if (!asset.image_key) throw new Error('v2-train needs image_key from upload');
  let r = await jpost(`${API}/v2/photo_avatar/avatar_group/create`, { name: `${avatar.name || 'avatar'}-grp`, image_key: asset.image_key });
  console.log(`[reg] avatar_group/create ${r.status} →`, JSON.stringify(r.j.data || r.j).slice(0, 300));
  if (!r.ok) throw new Error(`avatar_group/create ${r.status}: ${JSON.stringify(r.j).slice(0, 250)}`);
  const groupId = r.j.data?.id || r.j.data?.group_id;
  avatar.groupId = groupId; save();

  r = await jpost(`${API}/v2/photo_avatar/train`, { group_id: groupId });
  console.log(`[reg] train ${r.status} →`, JSON.stringify(r.j.data || r.j).slice(0, 200));
  if (!r.ok) throw new Error(`train ${r.status}: ${JSON.stringify(r.j).slice(0, 250)}`);

  // poll training status
  const deadline = Date.now() + 15 * 60 * 1000;
  while (Date.now() < deadline) {
    await sleep(15000);
    const s = await jget(`${API}/v2/photo_avatar/train/status/${groupId}`);
    const status = s.j.data?.status || s.j.status;
    console.log(`[reg] train status: ${status}`);
    if (['ready', 'completed', 'success'].includes((status || '').toLowerCase())) break;
    if (['failed', 'error'].includes((status || '').toLowerCase())) throw new Error(`training failed: ${JSON.stringify(s.j).slice(0, 200)}`);
  }

  // generate a front-facing look
  r = await jpost(`${API}/v2/photo_avatar/look/generate`, { group_id: groupId, prompt: `${avatar.name} front-facing, friendly, looking at camera`, orientation: 'vertical', pose: 'half_body', style: 'Realistic' });
  console.log(`[reg] look/generate ${r.status} →`, JSON.stringify(r.j.data || r.j).slice(0, 250));
  if (!r.ok) throw new Error(`look/generate ${r.status}: ${JSON.stringify(r.j).slice(0, 250)}`);
  const genId = r.j.data?.generation_id || r.j.data?.id;
  // poll look generation
  let lookId;
  const d2 = Date.now() + 10 * 60 * 1000;
  while (Date.now() < d2) {
    await sleep(12000);
    const s = await jget(`${API}/v2/photo_avatar/generation/${genId}`);
    const status = s.j.data?.status || s.j.status;
    console.log(`[reg] look status: ${status}`);
    if (['ready', 'completed', 'success'].includes((status || '').toLowerCase())) {
      lookId = s.j.data?.image_list?.[0]?.id || s.j.data?.id; break;
    }
    if (['failed', 'error'].includes((status || '').toLowerCase())) throw new Error(`look gen failed`);
  }
  if (!lookId) throw new Error('look generation timed out');
  return lookId;
}

(async () => {
  const asset = await uploadImage(scenePng);
  if (asset.image_key) { avatar.imageKey = asset.image_key; save(); }
  const id = mode === 'v3' ? await registerV3(asset) : await registerV2Train(asset);
  avatar.avatarIds[mode] = id; avatar.avatarId = id; avatar.avatarMode = mode; save();
  console.log(`[reg] ✓ ${mode} avatarId=${id} → ${avatarJsonPath}`);
})().catch(e => { console.error('[reg] ✗', e.message); process.exit(1); });
