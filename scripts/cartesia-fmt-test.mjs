// Diagnostic: generate the SAME line from Cartesia as mp3 vs lossless WAV (same clone voice/model),
// to tell whether the "noise at each word" comes from Cartesia's mp3 encoding (pre-echo/quantization
// at transients) or the cloned voice itself. Reads NAWIN_CARTESIA_API_KEY from .env.local.
//
// Usage: node scripts/cartesia-fmt-test.mjs ["<line>"] [voiceId]

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const text = process.argv[2] || 'Supernova AI try करो। रोज़ मेरे साथ ten to fifteen minutes practice करो।';
const voiceId = process.argv[3] || 'd229d905-1887-42df-8eed-ebfaeea6d26f';

function loadKey(name) {
  for (const l of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = l.match(new RegExp('^\\s*' + name + '\\s*=\\s*(.+?)\\s*$'));
    if (m) return m[1].replace(/^["']|["']$/g, '');
  }
  return null;
}
const KEY = loadKey('NAWIN_CARTESIA_API_KEY');
if (!KEY) { console.error('NAWIN_CARTESIA_API_KEY not found'); process.exit(1); }

const dir = '.context/projects/hindi-landscape/_fmt-test';
mkdirSync(dir, { recursive: true });

async function gen(fmt, out) {
  const res = await fetch('https://api.cartesia.ai/tts/bytes', {
    method: 'POST',
    headers: { 'Cartesia-Version': '2024-06-10', 'X-API-Key': KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model_id: 'sonic-3.5', transcript: text, voice: { mode: 'id', id: voiceId }, output_format: fmt }),
  });
  if (!res.ok) { console.error('✗', fmt.container, res.status, (await res.text()).slice(0, 200)); return; }
  writeFileSync(out, Buffer.from(await res.arrayBuffer()));
  console.log('✓', out, fmt.container, fmt.encoding);
}

await gen({ container: 'mp3', encoding: 'mp3', sample_rate: 44100 }, `${dir}/clone_mp3.mp3`);
await gen({ container: 'wav', encoding: 'pcm_s16le', sample_rate: 44100 }, `${dir}/clone_wav.wav`);
await gen({ container: 'wav', encoding: 'pcm_f32le', sample_rate: 44100 }, `${dir}/clone_wav_f32.wav`);
console.log('done →', dir);
