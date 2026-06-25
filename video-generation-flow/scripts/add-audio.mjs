// Mix TTS audio files + click sounds into a silent video at designated timestamps.
//
// Usage:
//   node scripts/add-audio.mjs [videoPath] [outputPath]
//
// Reads public/tts/video/ta-{1..12}.mp3 and generates click sounds via ffmpeg.

import { spawnSync } from "node:child_process";
import path from "node:path";
import { existsSync, mkdirSync } from "node:fs";

const videoPath = path.resolve(process.argv[2] || ".context/recordings/superflow-demo.mp4");
const outputPath = path.resolve(process.argv[3] || ".context/recordings/superflow-demo-final.mp4");
const ttsDir = path.resolve("public/tts/video");
const clickPath = path.resolve(".context/click.mp3");

// TTS cues — staggered so no two clips overlap
const TTS_CUES = [
  { file: "ta-1.mp3",  ms: 1000  },  // Scene 1: icons fully revealed
  { file: "ta-2.mp3",  ms: 5800  },  // Scene 2: phone opened
  { file: "ta-3.mp3",  ms: 9000  },  // Scene 2: SF button visible (2.77s → ends ~11.77s)
  { file: "ta-4.mp3",  ms: 12200 },  // Scene 2: after ta-3 ends, voice recorder demo (6.69s → ends ~18.89s)
  { file: "ta-5.mp3",  ms: 19200 },  // Scene 3: after ta-4 ends, "generating" pill (was 18.2s — fixed overlap)
  { file: "ta-6.mp3",  ms: 23200 },  // Scene 3: response card, "Insert button tap"
  { file: "ta-7.mp3",  ms: 30200 },  // Scene 5: "LinkedIn post?"
  { file: "ta-8.mp3",  ms: 34500 },  // Scene 5: second half
  { file: "ta-9.mp3",  ms: 38200 },  // Scene 6: language buttons
  { file: "ta-10.mp3", ms: 41800 },  // Scene 6: "oru thadavai" (2.43s → ends ~44.23s)
  { file: "ta-11.mp3", ms: 44400 },  // Scene 6: after ta-10 ends (was 43.8s — fixed overlap)
  { file: "ta-12.mp3", ms: 45800 },  // Scene 7: outro
];

// Click sound cues (tap moments) — generated via ffmpeg sine wave
const CLICK_CUES = [
  { ms: 9500  },  // tap SF button
  { ms: 15500 },  // tap ✓ button
  { ms: 23100 },  // tap Insert button
];

function log(...args) { console.log("[add-audio]", ...args); }

function generateClick() {
  if (existsSync(clickPath)) {
    log("Click sound already exists, reusing.");
    return;
  }
  mkdirSync(path.dirname(clickPath), { recursive: true });
  log("Generating click sound...");
  const ff = spawnSync("ffmpeg", [
    "-y",
    "-f", "lavfi",
    "-i", "sine=frequency=1100:duration=0.08",
    "-af", "afade=t=out:st=0.05:d=0.05,volume=0.9",
    clickPath,
  ], { stdio: "pipe" });
  if (ff.status !== 0) {
    console.error("[add-audio] Failed to generate click:", ff.stderr?.toString());
    process.exit(1);
  }
  log("Click sound generated:", clickPath);
}

function main() {
  if (!existsSync(videoPath)) {
    console.error("[add-audio] Video not found:", videoPath);
    process.exit(1);
  }
  for (const { file } of TTS_CUES) {
    const p = path.join(ttsDir, file);
    if (!existsSync(p)) { console.error("[add-audio] Missing:", p); process.exit(1); }
  }

  generateClick();

  log(`Video:  ${videoPath}`);
  log(`Output: ${outputPath}`);
  log(`Mixing ${TTS_CUES.length} TTS + ${CLICK_CUES.length} clicks...`);

  // Build ffmpeg input list
  const inputs = ["-i", videoPath];
  const allCues = [
    ...TTS_CUES.map(({ file, ms }) => ({ path: path.join(ttsDir, file), ms })),
    ...CLICK_CUES.map(({ ms }) => ({ path: clickPath, ms })),
  ];

  for (const { path: p } of allCues) inputs.push("-i", p);

  // ta-4 (demo voice) gets boosted — it's softer by design but still needs to be audible
  const DEMO_VOICE_MS = 12200;
  // Build filter_complex: delay + volume per stream, then amix
  const filterParts = allCues.map(({ ms }, i) => {
    const vol = ms === DEMO_VOICE_MS ? 2.0 : 0.78;
    return `[${i + 1}:a]adelay=${ms}ms:all=1,volume=${vol}[a${i + 1}]`;
  });
  const mixInputs = allCues.map((_, i) => `[a${i + 1}]`).join("");
  const filterComplex =
    filterParts.join(";") +
    `;${mixInputs}amix=inputs=${allCues.length}:normalize=0:dropout_transition=0[aout]`;

  const args = [
    "-y",
    ...inputs,
    "-filter_complex", filterComplex,
    "-map", "0:v",
    "-map", "[aout]",
    "-c:v", "copy",
    "-c:a", "aac",
    "-b:a", "192k",
    "-movflags", "+faststart",
    outputPath,
  ];

  log("Running ffmpeg...");
  const ff = spawnSync("ffmpeg", args, { stdio: "inherit" });
  if (ff.status !== 0) {
    console.error("[add-audio] ffmpeg failed with status", ff.status);
    process.exit(1);
  }

  log("Done ✅  Output:", outputPath);
}

main();
