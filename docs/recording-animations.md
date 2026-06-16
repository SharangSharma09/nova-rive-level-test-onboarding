# Recording screen animations to video (Playwright + ffmpeg)

We can auto-record any page/animation to an MP4 — no manual screen recording. This
is useful for capturing animated screens (e.g. the v5 outro hand-tap) to share,
review, or attach to docs/PRs.

## How it works

Open-source pipeline, fully scripted:

1. **Playwright** launches a headless Chromium, opens the route, and records the
   session to a `.webm` (`recordVideo` context option).
2. **ffmpeg** transcodes the `.webm` to a clean, widely-compatible `.mp4`
   (`fps=30`, `yuv420p`, `+faststart`).

Both are already set up:
- `playwright` is a devDependency.
- `ffmpeg` is expected on `PATH` (installed via Homebrew at `/opt/homebrew/bin/ffmpeg`).
- The recorder lives at [`scripts/record-animation.mjs`](../scripts/record-animation.mjs).

## Usage

The dev server must already be running — the script only drives the browser.

```bash
# 1. Start the app (note the port it prints — 3000, or 3001 if 3000 is taken)
pnpm dev

# 2. Record a route (args: route, seconds, width, height — all optional)
node scripts/record-animation.mjs /v5-tamil-outro 9 390 844

# Convenience script for the outro (assumes port 3000):
pnpm record:outro
```

**Defaults:** route `/v5-tamil-outro`, 9 seconds, viewport `390x844`,
`deviceScaleFactor: 2` (crisp retina output).

**If the dev server is on a non-default port** (e.g. 3001 because 3000 was in use),
point the script at it:

```bash
BASE_URL=http://localhost:3001 node scripts/record-animation.mjs /v5-tamil-outro 9
```

## Output

`.context/recordings/<slug>.mp4` (e.g. `.context/recordings/v5-tamil-outro.mp4`).
`.context/` is gitignored — these are build artifacts, not committed.

## Tips

- **Match the screen's real size.** Our widget screens are fixed `390x844`; pass
  those as width/height so the framing is exact.
- **Duration = enough full loops.** The outro loop is `2.8s`; ~9s captures ~3 loops.
- **Verify a frame** without opening the video:
  ```bash
  ffmpeg -y -i .context/recordings/v5-tamil-outro.mp4 -vf "select=eq(n\,60)" -frames:v 1 /tmp/frame.png
  ```
- **First run after a Playwright upgrade** may need the matching browser:
  `npx playwright install chromium` (one-time, then cached).
- **Want frame-perfect / slow-mo-proof output** (not real-time capture)? Upgrade
  path is [`timecut`](https://github.com/tungs/timecut), which overrides the page
  clock and renders each frame deterministically. Not needed for simple CSS loops.

## Recording a different page

Any route works — just pass it and (ideally) its dimensions:

```bash
node scripts/record-animation.mjs /your-route 12 390 844
```
