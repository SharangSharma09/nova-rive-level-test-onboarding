# Skill: Regenerate a Specific TTS Clip

When the user says "re-record ta-5" or "generate new audio for line 5":

## Step 1 — Generate the MP3

Use `scripts/gen-tts.mjs` (Cartesia **sonic-2**, native-script aware, reads CARTESIA_API_KEY from
.env.local). Send the transcript in NATIVE script — see "Script convention" below.

```bash
# back up first (public/tts/video is currently untracked — git has no copy)
cp public/tts/video/ta-5.mp3 public/tts/video/ta-5.mp3.bak
node scripts/gen-tts.mjs public/tts/video/ta-5.mp3 \
  "Superflow நீங்க பேசுறத just சில seconds-ல perfect English-ஆ translate பண்ணிடும்"
```

⚠️ Do NOT use the `/api/tts` route for this — it's wired to `sonic-english` and mangles Tamil.

## Step 2 — Check duration & re-sync word timestamps

The `words[]` array (drives studio karaoke) is tied to the OLD audio's timing — regenerate it
against the new clip via Gemini (single-file mode):

```bash
ffprobe -v quiet -show_entries format=duration -i public/tts/video/ta-5.mp3
node scripts/word-timestamps.mjs ta-5.mp3   # rewrites just this cue's words[] in tts-cues.json
```

## Step 3 — Update cues if duration changed significantly (>200ms delta)

In `video-generation-flow/config/tts-cues.json`:
1. Update `durationMs` for the changed clip
2. Verify the NEXT clip's `ms` still leaves enough gap
3. If overlap: push next clip's `ms` forward

In `app/superflow-demo/page.tsx`:
- Update the matching `AUDIO_CUES` entry (ms must match tts-cues.json)

## Step 4 — Re-mix audio

```bash
node video-generation-flow/scripts/add-audio.mjs
```

## Rules
- ALWAYS use `sonic-2` model
- NEVER pass `language` param to Cartesia
- Voice ID: `95d51f79-c397-46f9-b49a-23763d3eaa2d`
- Check: no overlap with adjacent clips before re-mixing

## Script convention (TTS vs transcript)
- **Send to Cartesia in NATIVE script** — Tamil words in தமிழ், Hindi in हिंदी, English left as
  English (the authentic code-mixed form). Cartesia pronounces this far better than Roman.
  e.g. `Superflow நீங்க பேசுறத just சில seconds-ல perfect English-ஆ translate பண்ணிடும்`
- **Keep the `text` field in tts-cues.json transliterated (Roman / Tanglish)** — that field
  drives the studio script panel + word-level karaoke display. e.g.
  `Superflow neenga pesuradha just sila seconds la perfect English ah translate pannidum`
- One line, two forms: native script in → readable transliteration shown. Don't conflate them.
