<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Recording screen animations to video

To capture any page/animation as an MP4 (Playwright + ffmpeg, fully scripted):

```bash
pnpm dev                                              # start dev server (note the port)
node scripts/record-animation.mjs /v5-tamil-outro 9   # record any route
```

Output lands in `.context/recordings/<route>.mp4`. Full guide:
[`docs/recording-animations.md`](docs/recording-animations.md).

# Cartesia TTS

Use `sonic-2` model. Do NOT pass a `language` param — it auto-detects Tamil/Tanglish correctly without it.

## Script convention (IMPORTANT)

Two different representations of the same code-mixed line, never mix them up:

- **TTS input** (the `transcript` sent to Cartesia) → **native script**. Tamil words in Tamil
  (தமிழ்), Hindi words in Devanagari (हिंदी), English words left as English. This is the
  authentic code-mixed form and Cartesia pronounces it far more accurately than Roman
  transliteration. e.g. `Superflow நீங்க பேசுறத just சில seconds-ல perfect English-ஆ translate பண்ணிடும்`
- **Transcript / display** (the `text` field shown in the studio script panel, captions,
  word-level karaoke) → **transliterated Roman** (Tanglish / Hinglish). e.g.
  `Superflow neenga pesuradha just sila seconds la perfect English ah translate pannidum`

So when the user asks to regenerate TTS for a line, send the native-script version to Cartesia,
but keep the Roman transliteration in `tts-cues.json` `text` / caption data for the on-screen
transcript.

```js
{
  model_id: "sonic-2",
  transcript: text,
  voice: { mode: "id", id: "95d51f79-c397-46f9-b49a-23763d3eaa2d" },
  output_format: { container: "mp3", encoding: "mp3", sample_rate: 44100 }
}
```

API key: `CARTESIA_API_KEY` env var. Endpoint: `POST https://api.cartesia.ai/tts/bytes` with header `Cartesia-Version: 2024-06-10`.

Pre-generated video TTS lines live in `public/tts/video/ta-{1..12}.mp3`.

# Video Generation Flow

All pipeline knowledge lives in [`video-generation-flow/README.md`](video-generation-flow/README.md).
Read it at the start of every session that touches the video pipeline:
- scene timing, TTS cues, audio mix config → `video-generation-flow/config/tts-cues.json`
- caption word data → `video-generation-flow/config/caption-chunks.json`
- known issues & design decisions → `video-generation-flow/context/`
- task recipes (add scene, regen TTS, adjust timing) → `video-generation-flow/skills/`
- pipeline commands: `pnpm dev` → record → mix → qa (see README quick-start)

The `/studio` local frontend (`localhost:3000/studio`) is the visual workspace for iterating on the video.
It streams record/mix/QA from the browser and accepts screenshot uploads for Claude to read.

# Supernova ad recreation (HeyGen + Cartesia)

The `/studio-ads` workstream recreates the "i_go_to_home" Supernova ad into Indian languages
(localize script → Cartesia TTS → word-align → HeyGen audio-driven avatar video → assemble → preview).
**All knowledge lives in [`docs/ad-recreation-pipeline.md`](docs/ad-recreation-pipeline.md)** — the
HeyGen/Cartesia API shapes, avatar & voice IDs, the cross-account key situation, gotchas, and the
`scripts/*.mjs` inventory. Read it before touching ad work, and **append new learnings to it as you go**
(from chat, from `/Users/cyanoprem/Documents/Nawin_s Claude/`, or from external research).

# Onboarding flow (planned, not yet built)

Design plan + demo-video transcripts for the Nova / v5-tamil onboarding live in
[`docs/onboarding-plan.md`](docs/onboarding-plan.md). Intended flow:
`entry icon → /v5-tamil-onboarding → video → /v5-tamil`. Not implemented yet —
read the doc before building it.
