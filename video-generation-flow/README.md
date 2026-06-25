# Video Generation Flow

This folder is the single source of truth for the Superflow demo video pipeline.
Reference it at the start of every session.

## What's in here

| Folder | Purpose |
|--------|---------|
| `config/` | JSON source of truth — TTS timestamps, caption chunks |
| `scripts/` | Pipeline scripts (record, mix audio, QA) |
| `prompts/` | LLM prompts for QA, screenshot-to-HTML, captions |
| `context/` | Persistent knowledge: scene map, audio cues, known issues, design decisions |
| `skills/` | Task recipes: how to add scenes, regenerate TTS, adjust timing, etc. |

## Quick start

```bash
pnpm dev                              # start dev server on :3000
open http://localhost:3000/studio     # open the studio UI
```

## Pipeline (per-scene — current)

The video is assembled from **per-scene silent clips + muxed audio** (film post-production model),
not a single live 50s recording. Re-record one scene, re-assemble — never re-record all 50s unless
every scene changed. Canonical scripts live in `scripts/` (root).

```bash
# 1. Record per-scene silent clips → .context/recordings/scenes/scene-N.mp4
node scripts/record-scenes.mjs            # all scenes
node scripts/record-scenes.mjs 1          # just scene 1 (WhatsApp)

# 2. Assemble: concat clips → silent superflow-demo.mp4 (50.000s) → mux audio → final
node scripts/assemble-video.mjs

# 3. QA with Gemini
GEMINI_API_KEY=$(grep GEMINI .env.local | cut -d= -f2) \
  node scripts/qa-video.mjs .context/recordings/superflow-demo-final.mp4
```

Or just click the buttons in `/studio` (Rec All · per-scene `rec` · Assemble · Mix · QA). The studio
previews the final `<video>` with `currentTime` as the master clock — reliable scrub/pause/karaoke.
See `context/known-issues.md` → "Architecture — decoupled per-scene pipeline" for how it fits together.

> Legacy: `node scripts/record-animation.mjs /superflow-demo 50 540 960` still does a one-shot
> full-page record, but the per-scene flow above is preferred (frame-exact alignment, fast re-records).

## Current video state

- **File**: `.context/recordings/superflow-demo-final.mp4` (50s, ~2.1MB)
- **Scenes**: 7 scenes — see `context/scene-map.md`
- **Audio**: 12 TTS cues + 3 click sounds — see `config/tts-cues.json`
- **Captions**: 12 caption chunks — see `config/caption-chunks.json`
- **Last QA**: `.context/qa-report.md`

## Animation page

`app/superflow-demo/page.tsx` — the 7-scene animation

- `?scene=N` — render ONLY scene N in isolation (no auto-advance, no audio). Used by
  `record-scenes.mjs` for per-scene capture. Scenes run their own internal timers from t=0.
- Scene durations come from `config/scenes.json`; `AUDIO_CUES` derives from `config/tts-cues.json`.
- (`?captions=1` is parsed but a captions overlay was never built — no effect.)

## Key rules (never break)

- Cartesia TTS: use `sonic-2`, NO `language` param, voice `95d51f79-c397-46f9-b49a-23763d3eaa2d`
- TTS timestamps in `config/tts-cues.json` are the single source of truth — update there first
- Phone mockup: 290×580px inside 540×960 viewport, deviceScaleFactor 2 → 1080×1920 output
- Hand emoji tip math: `bottom = button_center_from_bottom - fontSize + 10` (10px for tap animation)
