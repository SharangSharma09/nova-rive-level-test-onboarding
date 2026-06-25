# Known Issues & Fixes Applied

## Fixed (do not regress)

### Hand emoji alignment
- **Problem**: 👆 tip was 21px above button center — `bottom: 265` put tip at 293px, button center at 272px
- **Fix**: `bottom: 254` — at tap (-10px animation), tip exactly at 272px
- **Math**: `bottom = button_center_from_bottom - fontSize + 10 = 272 - 28 + 10 = 254`
- **Files**: `app/superflow-demo/page.tsx` — tapHand and tapCheck both use `showKeyboard ? 254 : 54/64`

### Audio overlap (recurring problem — check after every timing change)
- **Root cause**: `ms` values in tts-cues.json are set manually and drift out of sync when durations change. Two consecutive cues overlap when `cue[N].ms + cue[N].durationMs > cue[N+1].ms`.
- **How to detect**: Run `node -e "const c=require('./video-generation-flow/config/tts-cues.json'); c.ttsCues.forEach((cue,i)=>{const next=c.ttsCues[i+1]; if(next&&cue.ms+cue.durationMs>next.ms) console.log(cue.file,'overlaps',next.file,'by',cue.ms+cue.durationMs-next.ms,'ms');})"` from project root.
- **Fix rule**: When an overlap is found, move the later cue to `prevCue.ms + prevCue.durationMs`.
- **Single source of truth (no more 3-file sync)**: edit `tts-cues.json` only. `scripts/add-audio.mjs` and `app/superflow-demo/page.tsx` (`AUDIO_CUES`) both DERIVE from it now. Scene durations live only in `video-generation-flow/config/scenes.json` (the page's `SCENE_DURATIONS` and the record/assemble scripts read it).

Known overlaps fixed:
- ta-4 moved 12000→12200ms (ta-3 ends 11770ms)
- ta-6 moved 23200→23880ms (ta-5 ends 23880ms)
- ta-11 moved 43800→44400ms (ta-10 ends 44230ms)
- ta-12 moved 45800→46280ms (ta-11 ends 46280ms)

### Click sounds not captured by Playwright
- **Problem**: Web Audio API `playClick()` generates in-browser but headless Playwright doesn't capture it
- **Fix**: Generate click.mp3 via `ffmpeg sine=frequency=1100:duration=0.08` and add to ffmpeg audio mix at tap timestamps
- **Click cues**: 9500ms (SF btn), 15500ms (✓ btn), 23100ms (Insert btn)

### Video ended before final voiceover
- **Problem**: Scene 7 was 2000ms; ta-12 starts at 45800ms, lasts 2590ms → ends at 48390ms
- **Fix**: Scene 7 extended to 5000ms → total 50s

### Message bar below keyboard (wrong order)
- **Problem**: Keyboard was `position:absolute, bottom:46` — appeared above the message bar which was in normal flow at bottom
- **Fix**: Message bar made `position:absolute, bottom: showKeyboard ? 200 : 0` — floats above keyboard. Keyboard at `bottom:0`

### WhatsApp spotlight missing LinkedIn
- **Problem**: SPOTLIGHT used flat index [3,4,1,5] on row 0 only — LinkedIn is row 1 idx 4
- **Fix**: Rewrote to `SPOTLIGHT_SEQ = [{row,idx}...]` pairs

### Scene 1 text too close to bottom
- **Problem**: "Works on any App" text at bottom:80 appeared cramped
- **Fix**: Moved to bottom:110

### Demo voice volume too low
- **Problem**: ta-4 (demo voice clip) was ~50% quieter than main narrator
- **Fix**: `volumeBoost: 2.0` on ta-4. NOTE: this was silently broken for a while — `add-audio.mjs`
  compared `ms === 12200` but ta-4 had moved to `12240`, so no boost applied. Now driven by the
  cue's `volumeBoost` field in tts-cues.json (`vol = volumeBoost ?? defaultVolume`), so it can't drift.

## Architecture — decoupled per-scene pipeline (current)

The studio no longer drives a live animation iframe (that caused all the pause/blank/scrub/sync
bugs: two clocks — CSS keyframes + JS timers — that can't be frozen/seeked deterministically).
Now it's a **film post-production model**: three decoupled truths, assembled in post.

- **Picture** = silent per-scene clips. `app/superflow-demo/page.tsx?scene=N` renders ONE scene in
  isolation (no advance, no audio). `scripts/record-scenes.mjs` records each, detects content-start
  (first frame whose PNG size > ~8KB — robust vs the variable browser load-blank), trims to EXACTLY
  `scenes.json[N].durationMs` frames, and re-adds the between-scene white flash via ffmpeg
  `fade=in:color=white` for N≥1. Output: `.context/recordings/scenes/scene-N.mp4`.
- **Sound** = `public/tts/video/ta-*.mp3`, muxed at absolute ms by `scripts/add-audio.mjs`.
- **Script** = `tts-cues.json` `words[]` (native-script TTS in, Roman transliteration shown).

`scripts/assemble-video.mjs` concatenates the 7 clips → silent `superflow-demo.mp4` (exactly 50.000s)
→ muxes audio → `superflow-demo-final.mp4`. The studio previews that final `<video>` with
`video.currentTime` as the single master clock (karaoke + playhead slaved to it) — native seeking,
frame-accurate, audio baked in, zero desync possible.

**Studio flow**: `/api/studio/*` routes — `record-scenes` (all) / `record-scene` ({n}) / `assemble`
/ `mix` / `qa`, plus `video` (range-served final) and `status` (mtime-based staleness: a scene clip
is stale if page source is newer; final is stale if any clip or mp3 is newer). Re-record one scene,
re-assemble — never re-record all 50s unless every scene changed.

**Alignment linchpin**: each clip is trimmed to its exact frame count from content t=0, so the concat
is exactly 50.000s and audio-at-absolute-ms lands on the right visual. Verified: 9.5s frame shows the
SF-button tap aligned with the 9500ms click cue + ta-3.

### ta-1 started during icon blur animation
- **Problem**: Icons have 0.6s blur-reveal — starting VO at 200ms = mid-blur
- **Fix**: ta-1 moved to 1000ms

## QA Score History

| Build | Score | Notes |
|-------|-------|-------|
| Initial | ~5/10 | All 5 original issues present |
| After hand/audio fixes | 8/10 | Gemini Flash |
| After message bar fix + caption toggle | 10/10 | Gemini Flash |
| After hand position math fix | Verified visually | Frame extraction at 14.5s |
