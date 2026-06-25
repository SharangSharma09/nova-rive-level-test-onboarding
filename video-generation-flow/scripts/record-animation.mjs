// Auto-record a screen's animation to MP4 using Playwright + ffmpeg.
//
// Usage:
//   node scripts/record-animation.mjs [route] [seconds] [width] [height]
//   e.g. node scripts/record-animation.mjs /v5-tamil-outro 9 390 844
//
// Requires the Next.js dev server to be running (pnpm dev) on BASE_URL.
// Playwright records WebM; ffmpeg transcodes to a widely-compatible MP4.

import { chromium } from "playwright";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";

const route = process.argv[2] || "/v5-tamil-outro";
const seconds = Number(process.argv[3] || 9);
const width = Number(process.argv[4] || 390);
const height = Number(process.argv[5] || 844);

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const url = `${BASE_URL}${route.startsWith("/") ? route : `/${route}`}`;

const slug = route.replace(/^\//, "").replace(/[^a-z0-9]+/gi, "-") || "screen";
const outDir = path.resolve(".context/recordings");
const tmpDir = path.join(outDir, "_tmp");
const mp4Path = path.join(outDir, `${slug}.mp4`);

function log(...args) {
  console.log("[record]", ...args);
}

async function main() {
  log(`Recording ${url}`);
  log(`Viewport ${width}x${height} (deviceScaleFactor 2), duration ${seconds}s`);

  mkdirSync(tmpDir, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 2,
    recordVideo: { dir: tmpDir, size: { width, height } },
  });
  const page = await context.newPage();

  log("Navigating...");
  await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });

  // Best-effort: wait for any images (e.g. /nova.png) to finish loading.
  await page
    .waitForFunction(
      () => Array.from(document.images).every((img) => img.complete),
      { timeout: 5000 }
    )
    .catch(() => log("(image wait skipped/timed out — continuing)"));

  log(`Recording for ${seconds}s...`);
  await page.waitForTimeout(seconds * 1000);

  const video = page.video();
  await context.close(); // flushes the .webm to disk
  await browser.close();

  const webmPath = await video.path();
  log("WebM written:", webmPath);

  mkdirSync(outDir, { recursive: true });
  log("Transcoding to MP4 with ffmpeg...");
  const ff = spawnSync(
    "ffmpeg",
    [
      "-y",
      "-i", webmPath,
      "-vf", "fps=30,format=yuv420p",
      "-movflags", "+faststart",
      mp4Path,
    ],
    { stdio: "inherit" }
  );

  if (ff.status !== 0) {
    console.error("[record] ffmpeg failed with status", ff.status);
    process.exit(1);
  }

  // Clean up the intermediate WebM(s).
  if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });

  log("Done ✅  MP4:", mp4Path);
}

main().catch((err) => {
  console.error("[record] Error:", err);
  process.exit(1);
});
