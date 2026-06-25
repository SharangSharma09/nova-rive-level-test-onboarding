# Video QA System Prompt

This document defines the standing QA checklist used when running `scripts/qa-video.mjs`.
Send this as context to Gemini (or any vision model) whenever reviewing a programmatic demo video.

## How to use

```bash
node scripts/qa-video.mjs .context/recordings/superflow-demo-final.mp4
```

The script embeds this checklist automatically. The Gemini model returns a structured report
saved to `.context/qa-report.md`.

---

## Known failure modes (must catch every time)

These are bugs that appeared in real renders and must never regress:

### 1. Hand emoji misalignment
- The 👆 emoji tip must land ON the target button, not above/below/beside it
- SF button: bottom-right area of phone screen, above keyboard
- ✓ button: right side of voice recorder pill
- Insert button: bottom-right of response card
- **Check**: Extract frame at tap timestamp and visually verify tip position
- **Root cause**: Phone inner layout coordinates don't match parent-relative CSS bottom/right values

### 2. Audio overlap between consecutive clips
- No two TTS clips should play simultaneously
- Worst offenders: ta-3/ta-4 boundary (~11.7s), ta-10/ta-11 boundary (~44.2s)
- **Check**: Listen for volume spikes (two voices talking at once)
- **Fix**: Stagger the later clip's ms timestamp to start AFTER the prior clip ends + 200ms buffer
- **How to measure**: Use ffmpeg to get clip duration: `ffprobe -v quiet -show_entries format=duration -i ta-X.mp3`

### 3. Icon spotlight missing target app
- In Scene 5, the spotlight sequence must include both LinkedIn and Gmail
- The grid uses row/index addressing — LinkedIn is at row 1 index 4 AND row 2 index 2
- **Check**: Scan frames 30–37s; spot pulse should visibly move to a LinkedIn icon
- **Root cause**: Using flat index (0-5) instead of {row, idx} pairs silently skips row 1

### 4. Video cuts off before final voiceover ends
- Scene 7 (outro) must hold until the last audio clip finishes
- ta-12.mp3 starts at 45.8s; if its duration is 2.59s it ends at 48.4s
- Total video must be ≥ 48.5s (use 50s for headroom)
- **Check**: Listen to last 5s of video — no abrupt silence or black frame before audio ends
- **Fix**: Extend Scene 7 `SCENE_DURATIONS` entry so total adds up to ≥ final_audio_start + final_audio_duration

### 5. Click sounds not audible
- Playwright headless recording does NOT capture Web Audio API output
- Click sounds must be generated via ffmpeg sine wave and mixed in via `add-audio.mjs`
- **Check**: Listen at tap timestamps (9.5s, 15.5s, 23.1s) for a short "tick" sound
- **Fix**: Use `sine=frequency=1100:duration=0.08` in ffmpeg lavfi source, add to amix

### 6. WhatsApp keyboard + input bar layout
- In the WhatsApp mockup, when keyboard is visible:
  - Keyboard occupies bottom ~246px of phone screen
  - Input bar (emoji + message + mic) appears ABOVE the keyboard, not below it
  - The SF widget button and recorder pill must appear above keyboard level too
- **Check**: Frame at ~9s — keyboard should be at very bottom, input bar just above it

### 7. Volume spike on scene transition
- When applying `volume=0.78` per stream with `amix normalize=0`, the mix should be flat
- Clip boundaries should not produce a noticeable level jump
- **Check**: Listen for any sudden loud/soft jump between ~12s and ~19s

### 8. Scene 7 outro not blank
- The purple outro screen must be fully visible during the final voiceover
- It should NOT flash to black or white before ta-12 finishes
- **Check**: Check frames at 45s, 47s, 49s — all should show solid purple + logo

---

## QA checklist for every render

When submitting to Gemini, ask it to flag ALL of the following:

| # | What to check | Timestamp(s) |
|---|--------------|-------------|
| 1 | Hand 👆 tip lands on SF button | ~9.5s |
| 2 | Hand 👆 tip lands on ✓ button | ~15.5s |
| 3 | Hand 👆 tip lands on Insert button | ~23.1s |
| 4 | No audio overlap at ta-3/ta-4 boundary | 11–12.2s |
| 5 | No audio overlap at ta-10/ta-11 boundary | 44–44.4s |
| 6 | Each voiceover line matches what's on screen | throughout |
| 7 | LinkedIn icon spotlighted in Scene 5 | 29–37s |
| 8 | Gmail icon spotlighted in Scene 5 | 29–37s |
| 9 | Video holds outro until voiceover ends | 45–50s |
| 10 | Click sound audible at each tap | 9.5s, 15.5s, 23.1s |
| 11 | No volume spikes between clips | throughout |
| 12 | UI fits within phone frame, nothing cut off | throughout |
| 13 | No scene transition cuts too early | all transitions |

---

## Scene timing reference

| Scene | Start | End  | Description |
|-------|-------|------|-------------|
| 1     | 0s    | 5s   | App icons grid scroll |
| 2     | 5s    | 17s  | WhatsApp phone mockup |
| 3     | 17s   | 26s  | Processing → response card |
| 4     | 26s   | 29s  | Text inserted + sent |
| 5     | 29s   | 37s  | Icons with spotlight |
| 6     | 37s   | 45s  | Language selector |
| 7     | 45s   | 50s  | Purple outro |

## Audio cue reference

| File     | Start (ms) | Approx end |
|----------|-----------|------------|
| ta-1.mp3 | 1000      | ~3.5s |
| ta-2.mp3 | 5800      | ~8.3s |
| ta-3.mp3 | 9000      | ~11.8s |
| ta-4.mp3 | 12200     | ~18.9s |
| ta-5.mp3 | 19200     | ~22.7s |
| ta-6.mp3 | 23200     | ~27.8s |
| ta-7.mp3 | 30200     | ~33.8s |
| ta-8.mp3 | 34500     | ~38.1s |
| ta-9.mp3 | 38200     | ~41.8s |
| ta-10.mp3| 41800     | ~44.2s |
| ta-11.mp3| 44400     | ~45.7s |
| ta-12.mp3| 45800     | ~48.4s |

Click sounds (ffmpeg sine, 0.08s): 9500ms, 15500ms, 23100ms
