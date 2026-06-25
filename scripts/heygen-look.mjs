// Download a single HeyGen avatar look's details + preview image (to inspect / show).
// Usage: node scripts/heygen-look.mjs <look_id>
// Reads HEYGEN_API_KEY from .env.local. Saves → .context/heygen/looks/<id>.json + <id>.<ext>

import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const id = process.argv[2];
if (!id) { console.error('Usage: node scripts/heygen-look.mjs <look_id>'); process.exit(1); }

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

const outDir = path.resolve('.context/heygen/looks');
mkdirSync(outDir, { recursive: true });

const res = await fetch(`https://api.heygen.com/v3/avatars/looks/${id}`, { headers: { 'x-api-key': KEY } });
if (!res.ok) { console.error(`GET look ${id} → ${res.status}: ${(await res.text()).slice(0, 200)}`); process.exit(1); }
const look = (await res.json()).data ?? {};
writeFileSync(path.join(outDir, `${id}.json`), JSON.stringify(look, null, 2) + '\n');
console.log(`name: ${look.name} | type: ${look.avatar_type} | engines: ${(look.supported_api_engines || []).join(',')} | ${look.image_width}x${look.image_height}`);

const url = look.preview_image_url || look.image_url || look.preview_url;
if (!url) { console.error('no preview_image_url in look'); process.exit(0); }
const r = await fetch(url);
if (!r.ok) { console.error('preview fetch', r.status); process.exit(0); }
const ct = (r.headers.get('content-type') || '').toLowerCase();
const ext = ct.includes('webp') ? 'webp' : ct.includes('jpeg') || ct.includes('jpg') ? 'jpg' : ct.includes('png') ? 'png'
  : (url.split('?')[0].match(/\.([a-z0-9]{2,5})$/i)?.[1] || 'png').toLowerCase();
const f = path.join(outDir, `${id}.${ext}`);
writeFileSync(f, Buffer.from(await r.arrayBuffer()));
console.log(`preview → ${f}`);
