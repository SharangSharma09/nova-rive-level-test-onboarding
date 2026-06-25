# Design Decisions

## Phone mockup dimensions
- **290×580px** — chosen to fit in 540×960 viewport with room for background
- Not a screenshot — pure HTML/CSS so Playwright can record it headlessly
- deviceScaleFactor: 2 → renders at 1080×1920 (Instagram Reels / TikTok format)

## Recording approach (Playwright vs Remotion)
- **Playwright** — records the actual browser running the animation
- No Remotion for the main pipeline (proven, working, QA-passing)
- Remotion considered for caption preview only (frame-accurate scrubbing)
- Playwright captures CSS animations, JS timers, all visual state correctly

## Audio mixing (ffmpeg, not in-browser)
- Web Audio API clicks don't get captured by Playwright headless
- Solution: generate click.mp3 via ffmpeg sine wave, mix externally
- `amix normalize=0` + `volume=0.78` prevents clipping on overlap
- Demo voice (ta-4) gets `volume=2.0` multiplier to match narrator level

## Cartesia TTS
- Model: `sonic-2` — NEVER pass `language` param (auto-detects Tamil/Tanglish)
- Voice: `95d51f79-c397-46f9-b49a-23763d3eaa2d` (Tamil female)
- All 12 clips pre-generated, stored in `public/tts/video/ta-{1..12}.mp3`
- New TTS calls: use `/api/tts` route (wraps Cartesia, returns MP3 blob)

## Scene transition (white flash)
- `TransitionFlash` component: white overlay, `flash-out` keyframe 300ms
- Triggers on each scene change
- Simple and clean — matches the reference video style

## Caption design
- Bottom-center overlay, `zIndex: 50`
- 3–6 words per chunk (one chunk per TTS line)
- Important words: `#B399FF` (soft purple), `scale(1.15)`, glow shadow
- Regular words: white, normal size
- Word stagger: 180ms per word
- Toggle: `?captions=1` URL param

## Gemini QA model
- Default: `gemini-2.5-flash` (fast, cheap, good for routine checks)
- Studio button: `gemini-2.5-pro` (deeper analysis, slower)
- Inline video via base64 (video <20MB fits in API inline_data)
