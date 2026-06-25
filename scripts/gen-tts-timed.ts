// Generate TTS audio (WAV, lossless pcm_s16le) + Cartesia word timestamps per segment.
// Uses Cartesia /tts/sse with add_timestamps:true for a single API call per line.
// Falls back to /tts/bytes (audio) + /tts/sse (timestamps-only) if SSE audio is empty.
//
// Usage: tsx scripts/gen-tts-timed.ts <spec.json> <outDir> <cartesiaKeyEnvName>
//   spec.json = { model, voices: {nova:"...", girl:"..."}, segments: [{id,speaker,text,roman?}] }
//   Writes: <outDir>/<id>-<speaker>.wav, <outDir>/timestamps/<id>.json, <outDir>/manifest.json

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';

const [specPath, outDir, keyEnvName] = process.argv.slice(2);
if (!specPath || !outDir || !keyEnvName) {
  console.error('Usage: tsx scripts/gen-tts-timed.ts <spec.json> <outDir> <cartesiaKeyEnvName>');
  process.exit(1);
}

function loadKey(envName: string): string {
  if (process.env[envName]) return process.env[envName]!;
  const p = path.resolve('.env.local');
  if (existsSync(p)) {
    for (const l of readFileSync(p, 'utf8').split('\n')) {
      const m = l.match(new RegExp(`^\\s*${envName}\\s*=\\s*(.+?)\\s*$`));
      if (m) return m[1].replace(/^["']|["']$/g, '');
    }
  }
  return '';
}

const API_KEY = loadKey(keyEnvName);
if (!API_KEY) { console.error(`[gen-tts] ${keyEnvName} not set`); process.exit(1); }
const maskedKey = '…' + API_KEY.slice(-6);

const spec = JSON.parse(readFileSync(specPath, 'utf8'));
const { model, voices, segments, language } = spec;

mkdirSync(outDir, { recursive: true });
mkdirSync(path.join(outDir, 'timestamps'), { recursive: true });

function buildWavHeader(dataBytes: number, sampleRate = 44100, channels = 1, bitDepth = 16): Buffer {
  const header = Buffer.alloc(44);
  const byteRate = sampleRate * channels * (bitDepth / 8);
  const blockAlign = channels * (bitDepth / 8);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataBytes, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);           // PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitDepth, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataBytes, 40);
  return header;
}

interface WordTimestamp { word: string; startMs: number; endMs: number; }

async function synthesizeSegment(segment: { id: string; speaker: string; text: string; roman?: string }): Promise<{ file: string; durationMs: number; timestamps: WordTimestamp[] }> {
  const voiceId = voices[segment.speaker];
  if (!voiceId) throw new Error(`No voice for speaker: ${segment.speaker}`);
  const fileName = `${segment.id}-${segment.speaker}.wav`;
  const outFile = path.join(outDir, fileName);
  const tsFile = path.join(outDir, 'timestamps', `${segment.id}.json`);

  console.log(`[tts] ${segment.id} (${segment.speaker}) …`);

  // The /tts/sse endpoint ONLY accepts container:'raw' (streamed PCM) — we assemble the WAV ourselves
  // below via buildWavHeader(). Requesting container:'wav' here returns
  // "400: only 'raw' container is supported for this endpoint".
  const body = {
    model_id: model || 'sonic-3.5',
    transcript: segment.text,
    voice: { mode: 'id', id: voiceId },
    output_format: { container: 'raw', encoding: 'pcm_s16le', sample_rate: 44100 },
    add_timestamps: true,
  };

  const res = await fetch('https://api.cartesia.ai/tts/sse', {
    method: 'POST',
    headers: {
      'X-API-Key': API_KEY,
      'Cartesia-Version': '2024-06-10',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Cartesia SSE ${res.status}: ${txt.slice(0, 300)}`);
  }

  const audioChunks: Buffer[] = [];
  let wordTimestamps: WordTimestamp[] = [];

  // Parse SSE stream: each event is "data: <json>\n\n"
  const text = await res.text();
  const events = text.split(/\n\n+/);
  for (const evt of events) {
    const dataLine = evt.split('\n').find(l => l.startsWith('data: '));
    if (!dataLine) continue;
    const jsonStr = dataLine.slice(6).trim();
    if (!jsonStr || jsonStr === '[DONE]') continue;
    let obj: Record<string, unknown>;
    try { obj = JSON.parse(jsonStr); } catch { continue; }

    if (obj.type === 'chunk' && typeof obj.data === 'string') {
      // base64-encoded PCM audio
      audioChunks.push(Buffer.from(obj.data as string, 'base64'));
    } else if (obj.type === 'timestamps' && obj.word_timestamps) {
      // word_timestamps: { words: [...], start: [...], end: [...] }. Cartesia streams these
      // INCREMENTALLY (often one word per event), so ACCUMULATE — overwriting would keep only the
      // last word. Times are absolute (seconds from the segment start).
      const wt = obj.word_timestamps as { words: string[]; start: number[]; end: number[] };
      if (Array.isArray(wt.words)) {
        for (let i = 0; i < wt.words.length; i++) {
          wordTimestamps.push({
            word: wt.words[i],
            startMs: Math.round((wt.start[i] ?? 0) * 1000),
            endMs: Math.round((wt.end[i] ?? 0) * 1000),
          });
        }
      }
    }
  }

  // If SSE gave us audio chunks, assemble WAV
  if (audioChunks.length > 0) {
    const pcmData = Buffer.concat(audioChunks);
    const wavHeader = buildWavHeader(pcmData.length);
    writeFileSync(outFile, Buffer.concat([wavHeader, pcmData]));
  } else {
    // Fallback: fetch lossless WAV from /tts/bytes
    console.log(`[tts] ${segment.id} SSE had no audio — falling back to /tts/bytes`);
    const bytesRes = await fetch('https://api.cartesia.ai/tts/bytes', {
      method: 'POST',
      headers: { 'X-API-Key': API_KEY, 'Cartesia-Version': '2024-06-10', 'Content-Type': 'application/json' },
      // /tts/bytes DOES support a full WAV container — request it so we can write the file directly.
      body: JSON.stringify({ ...body, output_format: { container: 'wav', encoding: 'pcm_s16le', sample_rate: 44100 }, add_timestamps: undefined }),
    });
    if (!bytesRes.ok) throw new Error(`Cartesia bytes ${bytesRes.status}`);
    const wavBuf = Buffer.from(await bytesRes.arrayBuffer());
    writeFileSync(outFile, wavBuf);
  }

  // Compute duration from WAV file
  const wavData = readFileSync(outFile);
  const pcmSize = wavData.readUInt32LE(40);
  const sampleRate = wavData.readUInt32LE(24);
  const channels = wavData.readUInt16LE(22);
  const bitDepth = wavData.readUInt16LE(34);
  const durationMs = Math.round((pcmSize / (sampleRate * channels * (bitDepth / 8))) * 1000);

  writeFileSync(tsFile, JSON.stringify({ words: wordTimestamps }, null, 2) + '\n');
  console.log(`[tts] ${segment.id} ✓ ${durationMs}ms  ${wordTimestamps.length} words`);

  return { file: fileName, durationMs, timestamps: wordTimestamps };
}

async function main() {
  const manifestSegments: Array<{ id: string; speaker: string; text: string; roman: string; voiceId: string; model: string; file: string; durationMs: number }> = [];
  for (const seg of segments) {
    const { file, durationMs } = await synthesizeSegment(seg);
    manifestSegments.push({
      id: seg.id,
      speaker: seg.speaker,
      text: seg.text,
      roman: seg.roman ?? seg.text,
      voiceId: voices[seg.speaker],
      model: model || 'sonic-3.5',
      file,
      durationMs,
    });
  }

  const manifest = {
    language: language ?? 'unknown',
    model: model || 'sonic-3.5',
    voices,
    segments: manifestSegments,
  };
  writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`[gen-tts] ✓ ${segments.length} segments → ${outDir}/manifest.json  (key ${maskedKey})`);
}

main().catch(e => { console.error('[gen-tts] fatal:', e); process.exit(1); });
