// List HeyGen avatar looks for an avatar group (v3 API) and save them locally.
//
// Usage: node scripts/heygen-looks.mjs <group_id>
//   e.g. node scripts/heygen-looks.mjs 732fc7f178e64230b67c42fe8835cb28
// Reads HEYGEN_API_KEY from the environment or .env.local.
//
// Saves to .context/heygen/<group_id>/:
//   looks.json            — full metadata for every look
//   previews/<look_id>.*  — each look's preview image (downloaded; HeyGen URLs expire)

import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const groupId = process.argv[2];
if (!groupId) { console.error('Usage: node scripts/heygen-looks.mjs <group_id>'); process.exit(1); }

function loadKey() {
  if (process.env.HEYGEN_API_KEY) return process.env.HEYGEN_API_KEY;
  const p = path.resolve('.env.local');
  if (existsSync(p)) for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*HEYGEN_API_KEY\s*=\s*(.+?)\s*$/);
    if (m) return m[1].replace(/^["']|["']$/g, '');
  }
  return null;
}
const KEY = loadKey();
if (!KEY) { console.error('HEYGEN_API_KEY not set (env or .env.local)'); process.exit(1); }

async function fetchAllLooks(id) {
  const looks = [];
  let token = null;
  do {
    const url = new URL('https://api.heygen.com/v3/avatars/looks');
    url.searchParams.set('group_id', id);
    url.searchParams.set('limit', '50');
    if (token) url.searchParams.set('token', token);
    const res = await fetch(url, { headers: { 'x-api-key': KEY } });
    if (!res.ok) throw new Error(`HeyGen ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const json = await res.json();
    if (json.error) throw new Error(JSON.stringify(json.error));
    looks.push(...(json.data || []));
    token = json.has_more ? json.next_token : null;
  } while (token);
  return looks;
}

async function main() {
  const outDir = path.resolve('.context/heygen', groupId);
  const prevDir = path.join(outDir, 'previews');
  mkdirSync(prevDir, { recursive: true });

  console.log(`[heygen] group ${groupId} — fetching looks…`);
  const looks = await fetchAllLooks(groupId);
  console.log(`[heygen] ${looks.length} looks:`);
  for (const l of looks) console.log(`  • ${l.name}  (${l.id})  ${l.avatar_type || ''}  voice=${l.default_voice_id || '-'}`);

  writeFileSync(path.join(outDir, 'looks.json'), JSON.stringify(looks, null, 2) + '\n');

  let saved = 0;
  for (const l of looks) {
    if (!l.preview_image_url) continue;
    try {
      const r = await fetch(l.preview_image_url);
      if (!r.ok) continue;
      // HeyGen URLs can end in odd suffixes like ".image/png"; derive a clean ext from the
      // content-type, falling back to a trailing .ext on the path, then to png.
      const ct = (r.headers.get('content-type') || '').toLowerCase();
      const ext = ct.includes('webp') ? 'webp' : ct.includes('jpeg') || ct.includes('jpg') ? 'jpg'
        : ct.includes('png') ? 'png'
        : (l.preview_image_url.split('?')[0].match(/\.([a-z0-9]{2,5})$/i)?.[1] || 'png').toLowerCase();
      writeFileSync(path.join(prevDir, `${l.id}.${ext}`), Buffer.from(await r.arrayBuffer()));
      saved++;
    } catch { /* skip a failed preview */ }
  }
  console.log(`[heygen] ✓ saved looks.json + ${saved} previews → ${outDir}`);
}
main().catch((e) => { console.error('[heygen]', e.message); process.exit(1); });
