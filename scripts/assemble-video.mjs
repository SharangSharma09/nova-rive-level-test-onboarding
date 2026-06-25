// Assemble the per-scene silent clips into the full video.
//
//   1. Concatenate .context/recordings/scenes/scene-{0..N}.mp4
//        → .context/recordings/superflow-demo.mp4   (silent, exactly 50.000s)
//   2. Run scripts/add-audio.mjs (muxes the tts-cues.json audio at absolute ms)
//        → .context/recordings/superflow-demo-final.mp4
//
// Usage: node scripts/assemble-video.mjs

import { spawnSync } from "node:child_process";
import { existsSync, writeFileSync, readFileSync } from "node:fs";
import path from "node:path";

const cfg = JSON.parse(
  readFileSync(path.resolve("video-generation-flow/config/scenes.json"), "utf8")
);
const SCENES = cfg.scenes;
const scenesDir = path.resolve(".context/recordings/scenes");
const silentOut = path.resolve(".context/recordings/superflow-demo.mp4");
const concatList = path.resolve(".context/recordings/_concat.txt");

function log(...a) { console.log("[assemble]", ...a); }

function main() {
  const clips = SCENES.map((_, i) => path.join(scenesDir, `scene-${i}.mp4`));
  for (const c of clips) {
    if (!existsSync(c)) {
      console.error(`[assemble] missing clip: ${c}\n  → run: node scripts/record-scenes.mjs`);
      process.exit(1);
    }
  }

  // 1. Concatenate. Re-encode for clean joins (all clips are 30fps yuv420p, same resolution).
  writeFileSync(concatList, clips.map((c) => `file '${c}'`).join("\n") + "\n");
  log(`Concatenating ${clips.length} scene clips → ${silentOut}`);
  const concat = spawnSync("ffmpeg", [
    "-y", "-f", "concat", "-safe", "0", "-i", concatList,
    "-vf", "format=yuv420p", "-r", "30",
    "-c:v", "libx264", "-pix_fmt", "yuv420p",
    "-an", "-movflags", "+faststart",
    silentOut,
  ], { stdio: "inherit" });
  if (concat.status !== 0) { console.error("[assemble] concat failed"); process.exit(1); }

  // 2. Mux audio (add-audio.mjs reads timings from tts-cues.json, writes superflow-demo-final.mp4).
  log("Muxing audio via add-audio.mjs...");
  const mix = spawnSync("node", [path.resolve("scripts/add-audio.mjs")], { stdio: "inherit" });
  if (mix.status !== 0) { console.error("[assemble] mix failed"); process.exit(1); }

  log("Done ✅  → .context/recordings/superflow-demo-final.mp4");
}

main();
