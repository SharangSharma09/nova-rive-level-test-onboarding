// Mix TTS audio files + click sounds into a silent video at designated timestamps.
//
// Usage:
//   node scripts/add-audio.mjs [videoPath] [outputPath]
//
// Reads public/tts/video/ta-{1..12}.mp3 and generates click sounds via ffmpeg.

import { spawnSync } from "node:child_process";
import path from "node:path";
import { existsSync, mkdirSync, readFileSync } from "node:fs";

const videoPath = path.resolve(process.argv[2] || ".context/recordings/superflow-demo.mp4");
const outputPath = path.resolve(process.argv[3] || ".context/recordings/superflow-demo-final.mp4");
const ttsDir = path.resolve("public/tts/video");
const clickPath = path.resolve(".context/click.mp3");

// Single source of truth — timings live in video-generation-flow/config/tts-cues.json.
const cfg = JSON.parse(
  readFileSync(path.resolve("video-generation-flow/config/tts-cues.json"), "utf8")
);
const DEFAULT_VOLUME = cfg.defaultVolume ?? 0.78;

// TTS cues — staggered so no two clips overlap. `vol` is an absolute volume;
// a cue's `volumeBoost` (e.g. ta-4 demo voice = 2) overrides the default.
const TTS_CUES = cfg.ttsCues.map((c) => ({
  file: c.file,
  ms: c.ms,
  vol: c.volumeBoost ?? DEFAULT_VOLUME,
}));

// Click sound cues (tap moments) — generated via ffmpeg sine wave
const CLICK_CUES = cfg.clickCues.map((c) => ({ ms: c.ms }));

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
    ...TTS_CUES.map(({ file, ms, vol }) => ({ path: path.join(ttsDir, file), ms, vol })),
    ...CLICK_CUES.map(({ ms }) => ({ path: clickPath, ms, vol: DEFAULT_VOLUME })),
  ];

  for (const { path: p } of allCues) inputs.push("-i", p);

  // Build filter_complex: delay + per-cue volume per stream, then amix.
  // Volume comes from tts-cues.json (defaultVolume, or a cue's volumeBoost — e.g. ta-4 demo voice).
  const filterParts = allCues.map(({ ms, vol }, i) =>
    `[${i + 1}:a]adelay=${ms}ms:all=1,volume=${vol}[a${i + 1}]`
  );
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
