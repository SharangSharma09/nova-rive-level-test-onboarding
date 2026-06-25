// Generate a single TTS clip via Cartesia sonic-2 (native-script aware, no language param).
//
// Usage:
//   node scripts/gen-tts.mjs <outFile> "<transcript>"
// Example (native script in, per AGENTS.md TTS convention):
//   node scripts/gen-tts.mjs public/tts/video/ta-3.mp3 "Screen-ல widget தெரிஞ்சதும் அத click பண்ணி பேசுங்க"
//
// Reads CARTESIA_API_KEY from .env.local (or the environment).

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

const VOICE_ID = "95d51f79-c397-46f9-b49a-23763d3eaa2d";
const API_VERSION = "2024-06-10";
const MODEL = "sonic-2"; // AGENTS.md: ALWAYS sonic-2 — handles Tamil/Tanglish. sonic-english mangles native script.

function log(...a) { console.log("[gen-tts]", ...a); }

function loadApiKey() {
  if (process.env.CARTESIA_API_KEY) return process.env.CARTESIA_API_KEY;
  const envPath = path.resolve(".env.local");
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, "utf8").split("\n")) {
      const m = line.match(/^\s*CARTESIA_API_KEY\s*=\s*(.+?)\s*$/);
      if (m) return m[1].replace(/^["']|["']$/g, "");
    }
  }
  console.error("[gen-tts] ✗ CARTESIA_API_KEY not found in env or .env.local");
  process.exit(1);
}

async function main() {
  const outFile = process.argv[2];
  const text = process.argv[3];
  if (!outFile || !text) {
    console.error('[gen-tts] Usage: node scripts/gen-tts.mjs <outFile> "<transcript>"');
    process.exit(1);
  }

  const apiKey = loadApiKey();
  log(`model=${MODEL}  voice=${VOICE_ID}`);
  log(`transcript: "${text}"`);
  log(`→ ${outFile}`);

  const start = Date.now();
  const res = await fetch("https://api.cartesia.ai/tts/bytes", {
    method: "POST",
    headers: {
      "Cartesia-Version": API_VERSION,
      "X-API-Key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model_id: MODEL,
      transcript: text, // native script — do NOT pass a language param (auto-detects)
      voice: { mode: "id", id: VOICE_ID },
      output_format: { container: "mp3", encoding: "mp3", sample_rate: 44100 },
    }),
  });

  if (!res.ok) {
    console.error(`[gen-tts] ✗ Cartesia ${res.status}:`, (await res.text()).slice(0, 300));
    process.exit(1);
  }

  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(path.resolve(outFile), buf);
  log(`✓ done in ${Date.now() - start}ms — ${Math.round(buf.byteLength / 1024)}KB written`);
}

main().catch((e) => { console.error("[gen-tts] ✗", e); process.exit(1); });
