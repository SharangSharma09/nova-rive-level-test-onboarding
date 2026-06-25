// Record each scene of /superflow-demo as its own SILENT clip, trimmed to its EXACT
// duration starting at content t=0.
//
// Playwright's recordVideo starts at context creation, so every raw clip begins with a
// variable browser-load "blank" (a frozen near-white frame) before the scene paints. We
// detect where that blank ends with ffmpeg `freezedetect` (the first freeze_end, pixel-based
// and independent of React/Playwright timing), then trim `durationMs` forward from there.
// Result: exact-length clips that concatenate into a 50.000s video whose timeline matches
// the absolute-ms audio cues.
//
// Usage:
//   node scripts/record-scenes.mjs        # all scenes
//   node scripts/record-scenes.mjs 2      # only scene 2
//
// Requires the Next.js dev server running (pnpm dev) on BASE_URL.
// Output: .context/recordings/scenes/scene-N.mp4

import { chromium } from "playwright";
import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const cfg = JSON.parse(
  readFileSync(path.resolve("video-generation-flow/config/scenes.json"), "utf8")
);
const SCENES = cfg.scenes;

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const WIDTH = 540, HEIGHT = 960;          // viewport + recordVideo size; deviceScaleFactor:2 keeps it sharp.
                                          // (Playwright does NOT upscale the page to a larger recordVideo
                                          // size — it pads with gray — so the video size must match the viewport.)
const CAPTURE_TAIL_MS = 2500; // record this much past the scene so trimming has slack
const outDir = path.resolve(".context/recordings/scenes");
const tmpDir = path.resolve(".context/recordings/_tmp_scenes");

function log(...a) { console.log("[record-scenes]", ...a); }

// Find the first CONTENT frame index (0-based) in a constant-30fps clip.
// The leading load-blank is a near-empty frame that PNG-compresses tiny (~3.5KB); any real
// content frame is far larger (≥20KB), even a faint opacity fade-in. We scan the first 2.5s
// of the normalized (CFR 30fps) clip and return the first frame above a size threshold — a
// pixel-based signal robust across all scenes (decisive entrances AND gradual reveals) and
// independent of load timing. Detection and trim happen in the SAME 30fps domain (frame n =
// n/30 s), so there's no VFR/resample drift.
const BLANK_SIZE_THRESHOLD = 8000; // bytes; blank ≈3.5KB, faintest content ≈20KB
const FPS = 30;

function detectContentStartFrame(normMp4) {
  const probeDir = path.join(tmpDir, "_probe");
  rmSync(probeDir, { recursive: true, force: true });
  mkdirSync(probeDir, { recursive: true });
  // Downscale probe frames to a fixed 540×960 so the byte threshold is resolution-independent
  // (a blank frame at full 1080×1920 would compress larger and could exceed the threshold).
  spawnSync("ffmpeg", [
    "-y", "-hide_banner", "-i", normMp4,
    "-t", "2.5", "-vf", `fps=${FPS},scale=540:960`,
    path.join(probeDir, "f_%03d.png"),
  ], { stdio: "pipe" });
  const frames = readdirSync(probeDir).filter((f) => f.endsWith(".png")).sort();
  let startFrame = 0;
  for (let i = 0; i < frames.length; i++) {
    if (statSync(path.join(probeDir, frames[i])).size > BLANK_SIZE_THRESHOLD) { startFrame = i; break; }
  }
  rmSync(probeDir, { recursive: true, force: true });
  return startFrame;
}

async function recordScene(n) {
  const durMs = SCENES[n].durationMs;
  const durSec = durMs / 1000;
  const url = `${BASE_URL}/superflow-demo?scene=${n}`;
  log(`Scene ${n} (${SCENES[n].name}) — ${durSec}s`);

  mkdirSync(tmpDir, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 2,
    recordVideo: { dir: tmpDir, size: { width: WIDTH, height: HEIGHT } },
  });
  const page = await context.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  // Confirm the scene actually mounted (don't rely on its timing — that's freezedetect's job).
  await page.waitForFunction(() => window.__sfReady === true, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(durMs + CAPTURE_TAIL_MS);
  const video = page.video();
  await context.close(); // flushes the webm to disk
  await browser.close();

  const webmPath = await video.path();
  mkdirSync(outDir, { recursive: true });
  const mp4Path = path.join(outDir, `scene-${n}.mp4`);

  // Pass 1: normalize the raw VFR webm to constant 30fps so detection & trim share one domain.
  const normPath = path.join(tmpDir, `norm-${n}.mp4`);
  const norm = spawnSync("ffmpeg", [
    "-y", "-i", webmPath, "-vf", `fps=${FPS},format=yuv420p`, "-an", normPath,
  ], { stdio: "pipe" });
  if (norm.status !== 0) {
    console.error("[record-scenes] normalize failed:", norm.stderr?.toString().slice(-500));
    process.exit(1);
  }

  // Detect content start (frame index) and take exactly durationMs of frames from there.
  const startFrame = detectContentStartFrame(normPath);
  const nFrames = Math.round(durSec * FPS);
  log(`  content starts at frame ${startFrame} (${(startFrame / FPS).toFixed(3)}s) → take ${nFrames} frames`);

  // Pass 2: drop the leading blank by frame number, retime to 0, keep exactly nFrames.
  // Scenes you advance INTO (N≥1) get the between-scene white flash, re-added deterministically
  // as a 0.3s fade-from-white (matches the original TransitionFlash: white overlay 1→0).
  const flash = n >= 1 ? ",fade=t=in:st=0:d=0.3:color=white" : "";
  const ff = spawnSync("ffmpeg", [
    "-y", "-i", normPath,
    "-vf", `select=gte(n\\,${startFrame}),setpts=PTS-STARTPTS,format=yuv420p${flash}`,
    "-frames:v", `${nFrames}`,
    "-an", "-movflags", "+faststart",
    mp4Path,
  ], { stdio: "pipe" });
  if (ff.status !== 0) {
    console.error("[record-scenes] ffmpeg failed:", ff.stderr?.toString().slice(-500));
    process.exit(1);
  }
  rmSync(tmpDir, { recursive: true, force: true });
  log(`✓ scene-${n}.mp4`);
}

async function main() {
  const arg = process.argv[2];
  const list = arg !== undefined ? [Number(arg)] : SCENES.map((_, i) => i);
  for (const n of list) {
    if (Number.isNaN(n) || n < 0 || n >= SCENES.length) {
      console.error(`[record-scenes] bad scene index: ${arg} (have 0..${SCENES.length - 1})`);
      process.exit(1);
    }
    await recordScene(n);
  }
  log("Done ✅  →", outDir);
}

main().catch((e) => { console.error("[record-scenes]", e); process.exit(1); });
