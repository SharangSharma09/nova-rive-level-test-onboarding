// Nano-Banana background/scene step — DIRECT Gemini REST (no MCP).
// Takes an avatar's character.png + avatar.json.backgroundPrompt and produces scene.png: the same
// character composited into a real environment (flat white → scene), character pixels & placement
// preserved, bottom ~25% kept clear for captions. Output normalized to exactly 1080×1920.
//
// Model: gemini-2.5-flash-image ("Nano Banana"). Override with GEMINI_IMAGE_MODEL=gemini-3-pro-image.
// Usage: node scripts/gen-scene.mjs <avatarDir>
//   <avatarDir>/character.png + <avatarDir>/avatar.json  →  <avatarDir>/scene.png
//   backgroundPrompt:"keep"  → just copies character.png (e.g. the driver keeps his car bg)
// Reads GEMINI_API_KEY from env or .env.local.

import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const avatarDir = process.argv[2];
if (!avatarDir) { console.error('Usage: node scripts/gen-scene.mjs <avatarDir>'); process.exit(1); }
const charPng = path.join(avatarDir, 'character.png');
const scenePng = path.join(avatarDir, 'scene.png');
const avatarJsonPath = path.join(avatarDir, 'avatar.json');
for (const f of [charPng, avatarJsonPath]) if (!existsSync(f)) { console.error('[scene] missing', f); process.exit(1); }

const avatar = JSON.parse(readFileSync(avatarJsonPath, 'utf8'));
const bgPrompt = (avatar.backgroundPrompt || 'keep').trim();

function loadKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  const p = path.resolve('.env.local');
  if (existsSync(p)) for (const l of readFileSync(p, 'utf8').split('\n')) {
    const m = l.match(/^\s*GEMINI_API_KEY\s*=\s*(.+?)\s*$/); if (m) return m[1].replace(/^["']|["']$/g, '');
  }
  return null;
}

// "keep" → no scene change (the character image already carries its environment, e.g. driver's car)
if (bgPrompt === 'keep') {
  copyFileSync(charPng, scenePng);
  console.log('[scene] backgroundPrompt="keep" → copied character.png → scene.png');
  process.exit(0);
}

const KEY = loadKey();
if (!KEY) { console.error('[scene] GEMINI_API_KEY not set (env or .env.local)'); process.exit(1); }
const MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image';

const instruction =
  `Replace ONLY the background of this character image. New background: ${bgPrompt}\n\n` +
  `CRITICAL CONSTRAINTS:\n` +
  `- Keep the character EXACTLY as-is: identical face, body, pose, clothing, colors, scale and position. Do not redraw, restyle or move the character.\n` +
  `- Only the flat white area behind and around the character changes to the described scene.\n` +
  `- Keep the bottom ~25% of the frame simple and uncluttered (captions and UI overlay live there).\n` +
  `- Soft, even lighting on the character, consistent with the new scene. Clean and photoreal. No text, no watermark, no extra people.\n` +
  `- Output a 9:16 vertical portrait image.`;

const b64 = readFileSync(charPng).toString('base64');
const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${KEY}`;

async function callGemini(withImageConfig) {
  const body = {
    contents: [{ parts: [{ text: instruction }, { inline_data: { mime_type: 'image/png', data: b64 } }] }],
    generationConfig: { responseModalities: ['IMAGE'], ...(withImageConfig ? { imageConfig: { aspectRatio: '9:16' } } : {}) },
  };
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return res;
}

console.log(`[scene] ${MODEL} ← ${charPng}  (bg: "${bgPrompt.slice(0, 60)}…")`);
let res = await callGemini(true);
if (!res.ok) {
  const errTxt = (await res.text()).slice(0, 300);
  console.error(`[scene] HTTP ${res.status} with imageConfig — retrying without it. (${errTxt})`);
  res = await callGemini(false);                       // some model versions reject imageConfig.aspectRatio
}
if (!res.ok) { console.error(`[scene] Gemini HTTP ${res.status}: ${(await res.text()).slice(0, 500)}`); process.exit(1); }

const json = await res.json();
const parts = json.candidates?.[0]?.content?.parts || [];
const imgPart = parts.find(p => p.inlineData || p.inline_data);
if (!imgPart) { console.error('[scene] no image part in response:', JSON.stringify(json).slice(0, 700)); process.exit(1); }
const data = (imgPart.inlineData || imgPart.inline_data).data;
const rawPng = path.join(avatarDir, '_scene_raw.png');
writeFileSync(rawPng, Buffer.from(data, 'base64'));

// normalize to EXACTLY 1080×1920 (scale-to-fill + center crop; requested 9:16 so loss is negligible)
const ff = spawnSync('ffmpeg', ['-y', '-i', rawPng,
  '-vf', 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920', scenePng], { encoding: 'utf8' });
if (ff.status !== 0) { console.error('[scene] ffmpeg normalize failed:', (ff.stderr || '').slice(-400)); process.exit(1); }
console.log(`[scene] ✓ → ${scenePng} (1080×1920)`);
