# Supernova Ad Recreation — Pipeline Knowledge (living doc)

> **Living reference.** Append to this as we learn things from chat, from Nawin's folder, or from
> external grounded research. This is the single place to look before touching the ad-recreation
> work (the `/studio-ads` workstream — distinct from the Superflow-demo `video-generation-flow/`).

**Goal:** recreate the "i_go_to_home" Supernova ad (originally Tamil → Nawin made a Hindi final)
into other Indian languages. Pipeline: localize script → Cartesia TTS per line → word-align for
karaoke → HeyGen audio-driven avatar video per line → assemble (split-screen + captions) → preview
in `/studio-ads`.

---

## 1. Source material — Nawin's folder
`/Users/cyanoprem/Documents/Nawin_s Claude/` (shared with us; read-only reference):

| Subfolder | What |
|---|---|
| `supernova_ad_pipeline/` | **The main pipeline.** `pipeline.py` (HeyGen+Cartesia+ffmpeg), `pipeline_config.py` (locked defaults), `i_go_to_home.json` (the ad script, 11 segments S01–S11). |
| `supernova_ad_pipeline/runs/i_go_to_home_20260619_1814/` | The **Hindi final** run: `state.json` (voices, avatars, layout), `FINAL_i_go_to_home.mp4`, `audio/` (Cartesia per seg), `audio_from_video/`, `heygen_out/`, `driver_speedup/` (driver sped 1.1×), `subs/`, `stitched/`. |
| `cartesia-translate(-supernova)/` | Cartesia translation tooling. |
| `best-ads-voice-library/` | `library/cartesia_voices.json` — large stock voice catalog. |

**Ad segment structure** (`i_go_to_home.json`): speaker **`Top` = Nova (teacher)**, **`Bottom` = driver (learner)**.
S01 Top, S02 Bot, S03 Top, S04 Bot, S05 Top, S06 Bot, S07 Top(long), S08 Bot, S09 Top(long), S10 Bot, S11 Top(CTA).

---

## 2. Cartesia (TTS) — voices, accounts, models

| Voice | ID | Who | Account |
|---|---|---|---|
| MissNova (clone) | `d229d905-1887-42df-8eed-ebfaeea6d26f` | **Nova/teacher** | Nawin's |
| Bottom_i_go_to_home (clone) | `3b4fbe63-d37c-432a-8361-30ff69a9d402` | **driver** | Nawin's |
| Arushi – Hinglish Speaker | `95d51f79-c397-46f9-b49a-23763d3eaa2d` | our project's Tamil/Hinglish voice | **ours** |

- ⚠️ **Cloned voices are account-scoped.** Nova + driver clones live in **Nawin's** account
  (key `…K3mVoQ`); our key (`…6GQSBy`) gets **404 Voice not found** for them. Stored Nawin's key in
  `.env.local` as **`NAWIN_CARTESIA_API_KEY`** (ours stays `CARTESIA_API_KEY`, untouched).
- **Model:** our `95d51f79` works on **`sonic-2`** (no `language` param — auto-detects Tamil).
  Nawin's clones **reject sonic-2** (`400 — language not supported`) → use **`sonic-3.5`**.
  `scripts/gen-ad-tts.mjs` tries the spec model then falls back to sonic-3.5 (sticky).
- **TTS bytes:** `POST https://api.cartesia.ai/tts/bytes`, headers `X-API-Key`, `Cartesia-Version`
  (ours `2024-06-10`; Nawin `2025-04-16`), body `{model_id, transcript, voice:{mode:"id",id}, output_format}`.
- **Clone:** `POST /voices/clone` (multipart: `clip`, `name`, `language`, `mode:"stability"`, `enhance:"true"`) → `id`.
- **Get voice (access check):** `GET /voices/{id}`.

### TTS gotchas
- **Numbers spoken in English** must be written as **English words** in the transcript
  (e.g. `"fifteen to twenty minutes"`, not `"15-20 minutes"`) or Cartesia reads the digits in the
  target language ("15 டு 20"). Tamil-natural numbers (7 மடங்கு, 1 கோடி, 30 நாள்) stay as digits.
- **Native-script in, Roman-out** convention still holds (see global memory): TTS gets தமிழ்/हिंदी,
  the studio display/karaoke is the code-mixed authored text.

---

## 3. HeyGen (avatar video) — API + IDs

### Avatar look IDs
| Role | Look / talking_photo ID | Engine | Aspect | Notes |
|---|---|---|---|---|
| **Driver** photo avatar | `12cb94435cb44f3dbdcb86514fc2f21f` | `avatar_iv` | 9:16 | car driver; use directly (no re-upload). |
| Driver (Hindi run used) | `bc106df756664bd5bac4dd21a374af50` | `avatar_iv` | 9:16 | uploaded talking_photo from `driver_canon.png`. |
| **Nova** identity/group | `732fc7f178e64230b67c42fe8835cb28` | avatar_v/iv | — | group has 5 looks (`17a65769…`, `ec900737…`, `c8fde1f5…`, `a08a37c3…`, `732fc7f1…`). |
| **Nova** (Hindi final used) | `557978274faa48f58b12a601dd1285fe` | `avatar_v` | 1:1 | the actual Top look in Nawin's Hindi final (not in the 732fc7f group list). |

### API (base `https://api.heygen.com`, upload `https://upload.heygen.com`; header `x-api-key`)
- **Upload audio asset:** `POST {upload}/v1/asset` (Content-Type = audio mime, body = bytes) → `data.id`, `data.url`.
- **Upload talking photo:** `POST {upload}/v1/talking_photo` (image/png bytes) → `data.talking_photo_id`.
- **Generate (audio-driven):** `POST {base}/v3/videos`
  ```json
  { "type":"avatar", "avatar_id":"<look|talking_photo>", "audio_asset_id":"…",
    "engine":{"type":"avatar_iv"|"avatar_v"}, "aspect_ratio":"9:16"|"1:1",
    "resolution":"720p", "output_format":"mp4",
    "motion_prompt":"…", "expressiveness":"low" }   // expressiveness: avatar_iv only
  ```
  → `data.video_id`. **Output mp4 has the audio baked in** (no separate mux).
- **Poll:** `GET {base}/v3/videos/{video_id}` → `data.status`, `data.video_url`.
- **Look engines:** `GET {base}/v3/avatars/looks/{id}` → `data.supported_api_engines`.
- **List looks:** `GET {base}/v3/avatars/looks?group_id=…&limit=50` (paginate `token`/`has_more`/`next_token`).
  Legacy v2 `GET /v2/avatar_group/{id}/avatars` works until **2026-10-31**.
- **Key:** `HEYGEN_API_KEY` in `.env.local` (gitignored). Cost ceiling ~$20; `avatar_v` ≈ $0.20/s, `avatar_iv` ≈ $0.15/s.

### Verified request schema (HeyGen docs — `developers.heygen.com/reference/create-video`)
`POST /v3/videos` is a discriminated union on `type`. For `type:"avatar"`: **required** `avatar_id`;
optional `audio_asset_id`/`audio_url` (**mutually exclusive** with `script`+`voice_id`),
`engine:{type:"avatar_iv"(default)|"avatar_v"}`, `motion_prompt`, `expressiveness:"high|medium|low"`
(photo avatars only, default low). Shared fields: `resolution:"720p"|"1080p"|"4k"`,
`aspect_ratio:"16:9|9:16|4:5|5:4|1:1|auto"` (default 16:9), `fit:"contain|cover"`,
`output_format:"mp4"(default)|"webm"`, `title`, `background`, `caption`, `voice_settings`.
**No width/height fields** — resolution + aspect_ratio determine output size. (Nawin's payload uses a
valid subset; only addition is `resolution` can be `1080p`/`4k`.)

### Resolution & multi-format strategy
- ✅ **Resolution downscales locally for free → generate at `1080p`.** Nova `557978…` is natively
  **1080×1920**; driver `12cb944…` photo source is 720×640 (1080p upscales it — modest, but keeps one
  res for clean compositing). `4k` just upscales — skip.
- ⚠️ **Aspect ratio is baked at generation** (avatar is framed for it) — NOT a free crop. Generate at
  the aspect(s) you need; keep the **per-segment avatar clips** as a reusable source library and do all
  assembly / reframe / downscale **locally (ffmpeg)**. Re-hit HeyGen only for a genuinely different framing.
- Nova look `557978274faa48f58b12a601dd1285fe` = stylized orange-suit Supernova teacher (3D render),
  1080×1920; **accessible on our HeyGen key.** Preview saved at `.context/heygen/looks/557978….webp`
  (fetch any look: `node scripts/heygen-look.mjs <id>`).

### Split-screen layout (Nawin's Hindi final)
720×1280; Nova top (1:1, scale 0.85, pad `#FFFFFF`), driver bottom (9:16); non-speaker plays an
**idle clip** (idle motion prompts in `pipeline_config.py`); purple caption bar `#5E30C7`.

---

## 4. Studio projects (`.context/projects/<name>/`, gitignored)
A project = a folder; studio shows it if present. `final.mp4` → preview; `cues.json`+`scenes.json` → script panel + timeline.

| Project | Contents | Purpose |
|---|---|---|
| `tamil-final` | 15 audio clips only (`S01-nova.mp3` … `S11c-nova.mp3`) | **audio reference** for HeyGen (kept clean). |
| `tamil-final-videos` | `cues.json` (word-timed) + `scenes.json` + `script-tamil.txt`; HeyGen `final.mp4` TBD | the **rendered ad** (in progress). |
| `final-hindi` | `final.mp4`, `transcript.json`, `parts/`, `ad-tamil.json`, `tts-tamil-manifest.json`, scripts | imported Hindi final + Tamil script/spec/manifest. |
| `original-tamil` | `final.mp4`, `parts/`, transcript | imported original Tamil ad. |

`cues.json` shape: `{ ttsCues:[{file, ms, durationMs, scene, text, words:[{word,startMs,endMs}]}], clickCues, defaultVolume, totalDurationMs }`.
`parts/` (in imported projects) come from `split-project.mjs` — splits `final.mp4` by **visual transitions**
(ffmpeg `scdet`), falling back to **transcript segment boundaries**; each part = `part-N.mp4` (silent) + `part-N.mp3`.

---

## 5. Word-level karaoke — the key gotcha
The studio highlights the spoken word from `cue.words[]` (timestamps relative to clip start).
- ❌ **Don't let Gemini transcribe for the text** — it transliterates English→native script
  ("Supernova"→"சூப்பர்நோவா"), mishears ("home"→"work"), and turns "fifteen to twenty"→"15 டு 20".
- ✅ **Give Gemini the known authored words, ask ONLY for per-word start/end ms, keep our word strings.**
  `scripts/word-timestamps-project.mjs <projectDir> <refManifest.json>` does this (proportional fallback on count mismatch).
- The user's idea of running the **language rules** on a transcription is the right tool when there's
  **no source text** (e.g. transcribing the original videos) — not for our authored lines.

---

## 6. Scripts (in `scripts/`)
| Script | Does |
|---|---|
| `heygen-looks.mjs <group_id>` | list a HeyGen group's looks → `.context/heygen/<group>/looks.json` + previews. |
| `gen-ad-tts.mjs <spec.json> <outDir> [keyEnvFile]` | per-segment Cartesia TTS from a spec; `ONLY_SEGMENTS=S07b` for one; reads key from any `.env`. |
| `word-timestamps-project.mjs <projDir> <refManifest> [clipsDir] [onlyFile]` | align known words → karaoke timings (Gemini). |
| `audio-preview-video.mjs <outProj> <manifest> <clipsDir> [gapMs] [title]` | placeholder card + concatenated audio → `final.mp4` + cues, so audio-only projects play in the studio. |
| `concat-ad-preview.mjs <dir> [gapMs]` | stitch a project's clips into one `_preview.mp3`. |
| `adapt-script.mjs <sourceProject> <lang>` | localize a finished ad script into another language (keeps English teaching lines + "Supernova AI"). |

**Ad TTS spec** = `.context/projects/final-hindi/ad-tamil.json` (`{language, model, voices:{nova,driver}, segments:[{id,speaker,text}]}`).

---

## 7. Status / next
**Locked plan:** split-screen (B) · Avatar IV (`avatar_iv`) · `1080p` · `9:16` · captions later.
Avatars: Nova `557978274faa48f58b12a601dd1285fe` + driver `12cb94435cb44f3dbdcb86514fc2f21f`,
audio-driven, `expressiveness:"low"`.

**Idle reuse:** generate ONE idle per person — drive it with ~12s of **very low brown-noise**
(`anoisesrc=color=brown:amplitude=0.0005`) so Avatar IV idles naturally instead of freezing — then
**ping-pong loop** it under each listening stretch (driver listens up to ~11s continuously → make idle ≥12s).
Build two full-length tracks (talk clips + idle fill), stack Nova-over-driver → 1080×1920.

**Test (PASSED ✅):** `scripts/heygen-gen.mjs <jobs.json> <outDir>` uploaded audio → `/v3/videos` →
polled → downloaded **3 clips in ~30s**, all **1080×1920**; lip-sync (mouth open on talk) + idle
(mouth closed, natural) both correct. Jobs format: `[{id,audio,avatar_id,engine,aspect_ratio,resolution,expressiveness}]`.
Out: `.context/heygen/test-out/`. **Visual note:** Nova is a **stylized 3D** avatar, driver is
**photoreal** (same mix as the Hindi final).

**Idles = REUSED from Nawin's run (free, no generation):** his standalone pre-composite idle clips
`runs/i_go_to_home_20260619_1814/heygen_out/final/idle_top.mp4` (Nova, 720×720 1:1, 12s) +
`idle_bot.mp4` (driver, 720×1280 9:16, 12s, **moving car** — road blur baked in). No speech →
language-agnostic, fully reusable. Copied to `tamil-final-videos/idle/`. This also fixes the
static-car problem (don't self-generate idles) and locks engines/aspects to match them.

**Locked engines/aspects (to match the reused idles):** Nova → **Avatar V (`avatar_v`)** @ 1:1;
driver → **Avatar IV (`avatar_iv`)** @ 9:16 + road-blur `motion_prompt`. Idles are **720p** → either
match at 720p (final 720×1280, = Nawin) or generate talking at 1080p + upscale idles 1.5× to 1080p.

**DONE ✅ (captions pending):** `scripts/assemble-ad.mjs <projectDir>` replicates Nawin's `phase8`
per-segment vstack — speaker's talk clip + a `dur`-length slice of the OTHER's reused idle (audio →
speaker); top scaled 0.85, white-padded to 720×640 bottom-anchored; bottom scaled 720×1280 then
center-cropped to 720×640; `vstack`; concat **back-to-back** (no inter-segment gaps, like Nawin).
→ **`tamil-final-videos/final.mp4` (720×1280, ~41s)**, plays in studio-ads with word karaoke.
Rebuilds cues/scenes to the no-gap timeline (per-word timings are clip-relative → unchanged).
Pipeline: `gen-ad-tts` → `word-timestamps-project` → `build-ad-jobs` → `heygen-gen`(+`heygen-poll`) → `assemble-ad` → `add-captions`.

**Captions DONE ✅:** `scripts/add-captions.mjs <projectDir>` — Hindi-style purple box (`#5E30C7`, white,
font 34, radius 10, pad 22×14) centered on the split line (y=640), word-timed phrases (break on >0.4s
gap or 6 words). Each phrase rendered as a **transparent PNG via headless Chromium** (correct Tamil
shaping — drawtext can't shape Tamil conjuncts) then ffmpeg-overlaid onto **`final_no_subs.mp4`** (the
clean base, kept for re-runs) → captioned **`final.mp4`**. 30 phrases.
**Remaining:** pacing (no breathing gaps yet); phrase-split tuning (break on punctuation, not just 6 words); QA; other languages.

## 8. Sync.so (lip-sync alternative — noted, NOT used by Nawin)
Nawin's `cartesia-translate(-supernova)/WORKFLOW.md` lists **"Workflow B (lip-sync)"** as a *future
hook*: **Sync.so** for "direct audio-driven re-animation (keeps our voice + audio mix)" — re-lip-syncs
a **source video** to **new audio**, preserving the original visuals/music. A real **`SYNCSO_API_KEY`**
(`…zwSfit`, 58 chars) is in his `.env` files (his account). **It was never implemented** —
`translate_ad.py --mode lipsync` exits "not built yet"; no Sync.so code exists; the Hindi final used HeyGen.
**NOW BUILT + TESTED ✅:** `scripts/syncso-lipsync.mjs <video> <audio> <out> [model] [sync_mode] [keyEnvFile]`
— direct multipart upload to `POST https://api.sync.so/v2/generate` (`video`/`audio` file fields + `model`
+ `options` JSON; files **<20MB**), model `lipsync-2-pro`, → poll `GET /v2/generate/{id}` (PENDING→PROCESSING
→COMPLETED) → download `outputUrl`. Key stored in `.env.local` as **`SYNCSO_API_KEY`** (Nawin's account
`…zwSfit`). Ran on the isolated profile driver (~1 min). **QA verdict: sync.so WON** — good lip-sync on the side-facing
driver (translate/avatar-translate couldn't). **Cost:** `lipsync-2-pro` = **$0.067–0.083/sec** ($4–5/min); the
8.24s driver clip ≈ **$0.60**. API doesn't return per-gen cost (only `outputDuration`); exact figure is in the
sync.so billing dashboard. lipsync-2-pro API needs a **Scale plan ($249/mo)** — currently on **Nawin's account**.
**PRODUCTION RECIPE (v5) — sync.so PER SEGMENT, both speakers** ✅: for EACH line, sync.so the speaker's
clip + that line's Telugu audio **individually** (`syncso-lipsync.mjs`), then `assemble-ad.mjs` (reuse idles,
vstack, **re-encode** the concat) → `add-captions.mjs`. ~$3/language; clean lip-sync incl. the **profile driver**.
Output `.context/projects/telugu-syncso/final.mp4` (= v5).

**Gotchas learned the hard way (all caused user-visible breakage):**
- **Per-segment, NOT concat-then-split.** Concatenating a speaker's 10 lines → one sync.so → cutting at the
  Tamil boundaries **truncated** lines (Telugu runs longer than the Tamil slice) AND **bled** the tail into the
  next segment (S07b's last word "అయిపోతారు" literally played in S09). Sync.so each line on its own → neither.
- **Don't `atempo`-stretch short clips.** Slowing a short line ("really?" 0.76s → forced 1.0s) made
  `lipsync-2-pro` **glitch the back half to solid WHITE**. Use the NATURAL audio length and match the video to it
  (trim it, or slice the 12s idle clip) — never stretch the audio to a target duration.
- **Re-encode the concat** in `assemble-ad` (`-c:v libx264`, NOT `-c copy`) — copy leaves corrupt frames at joins.
- **Verify with studio-ads shots** (`shot-studio-seconds.mjs "<label>"` → `.context/studio-shots/<slug>/sec-NN.png`):
  each shows the **timestamp + exact caption/word spoken** — the reliable way to catch truncation/bleed/glitch.
  A single extracted frame can't (and can't show lip-sync motion at all — that needs human playback).
**Opportunity for us:** re-sync the finished Hindi final (or HeyGen clips) → Tamil audio instead of
regenerating avatars (esp. the slow Avatar V Nova). Caveats: split-screen = 2 faces (confirm multi-face
support or re-sync per panel); burned-in captions are Hindi (redo in Tamil — already planned).

## 9. HeyGen Video Translate — TESTED ✅ (custom audio + split-screen both work)
`scripts/heygen-translate.mjs <video> <audio> <out> ["Lang (Region)"] [speaker_num]` — upload video +
our audio (`POST upload.heygen.com/v1/asset`) → `POST https://api.heygen.com/v3/video-translations`
with `{video:{type:asset_id}, output_languages:["Telugu (India)"], audio:{type:asset_id}, speaker_num:2}`
→ poll `GET /v3/video-translations/{id}` → download.
**Test:** Tamil split-screen slice + our **Cartesia Telugu** audio → output **kept the 720×1280
split-screen and re-animated BOTH faces** to the Telugu audio in ~60s. Bring-your-own-voice + multi-face WORK.
**Rules learned:** (1) Telugu (India)/Tamil/Hindi supported (190 langs via `GET /v3/video-translations/languages`);
(2) supply your voice via the **`audio`** asset — there is **no `voice_id`** field; (3) **HARD CONSTRAINT:
audio must be within **15%** of the video duration** (else `failed: "durations too different"`) — Telugu is
wordier, so `atempo` the full track to fit; (4) status: `GET /v3/video-translations/{id}` → `{status:
running|completed|failed, url}`; render ~60s for a 4s clip. **Cost ≈ $2/min of source video** (speed mode; precision 2×) — full 40.9s Telugu
≈ $1.36, 8.2s driver ≈ $0.27. (API returns only `duration`, not cost; pay-as-you-go USD wallet.) **vs
sync.so** lipsync-2-pro (~$4–5/min, ~$0.60 for the 8.2s driver): translate is ~half price but FAILS the
profile driver, so **sync.so wins the driver despite ~2× cost.**
**Implication — fastest multi-language lane:** one base video (`final_no_subs.mp4`) + each language's
Cartesia audio (retimed ≤15%) → translate → ~1-2 min/language, **no avatar regen, no re-assembly**; add our
captions after. Trade-off vs Avatar-IV regen: less control (HeyGen's lip-sync, the 15% rule) but far less work per language.
**Open:** confirm lip-sync accuracy + speaker→face mapping by playing the output.

### FULL Telugu DONE via 1 generation ✅
Full Tamil split-screen `final_no_subs.mp4` (40.9s) + full Telugu Cartesia audio (43.5s = **6.2%**, within
15% → no atempo) → **ONE** translate job (~3 min) → 720×1280 Telugu split-screen; then back-to-back cues +
`word-timestamps-project` (Telugu) + `add-captions` (font stack now multi-script: Tamil/Telugu/Devanagari) →
`.context/projects/telugu-final-videos/final.mp4`. **This is the concurrency fix in action:** the avatar path
needed **15** HeyGen gens (queue-limited, Avatar V slow); translate needs **1** gen for the whole split-screen.

### Per-language recipe (≈5–8 min/language, 1 HeyGen gen)
1. `translate-ad-spec ad-tamil.json <lang> ad-<lang>.json` (Gemini)
2. `gen-ad-tts ad-<lang>.json <dir> <cartesia-env>` → 15 clips
3. `concat-ad-preview <dir> 0` → one back-to-back audio; check ≤15% of 40.9s (atempo if over)
4. `heygen-translate final_no_subs.mp4 <dir>/_preview.mp3 out.mp4 "Lang (Region)" 2` → **1 gen**
5. project: copy out→`final_no_subs.mp4`, build back-to-back cues, `word-timestamps-project`, `add-captions`

> ⚠️ **CAVEAT (found in QA — translate REJECTED for this ad):** HeyGen Translate *re-lip-syncs the existing
> mouth*, which is **unreliable on a PROFILE / side-facing face.** Our **driver** (side view at the wheel)
> came out badly synced; front-facing Nova was fine. **So translate does NOT work for this split-screen.**
> Use the **Avatar IV generation path (§7)** — Avatar IV *generates* the mouth from the photo and handles
> profile faces (the Tamil driver clips synced fine). **Concurrency is a non-issue if you use Avatar IV for
> BOTH speakers:** all 15 clips render fast (~2-3 min); the only slow engine was Avatar V (Nova). So the
> per-language path is: `translate-ad-spec → gen-ad-tts → build-ad-jobs (Avatar IV for both) → heygen-gen
> (+poll) → assemble-ad → add-captions`. Reuses idles; 15 fast gens beat 1 broken translate.

## 10. Character template & the 8 approved layouts (Nawin — multi-format system)
Framework so ONE 1080×1920 character image (per character) works across **every** ad layout with **no re-rendering**.
**`supernova_ad_pipeline/character_template/`** (in our shared copy):
- `master_template_1080x1920.png` — placement guide (drop @20% opacity, fit the character to the zones)
- `character_spec.json` — machine-readable zones + the **8 `layout_crops`** (source rectangle per layout)
- `layout_crops_map.png` — which rectangle each layout extracts · `_quick_reference.png` — combined overview
- `CHARACTER_DESIGN_GUIDELINE.md` — the hard rules

**Placement rules (1080×1920, 9:16, pure-white `#FFFFFF` flat bg):** eye line **y=580 ±30** (head centered) ·
head+shoulders y=400–900, torso to ≥1300 · hands **inner 60% width (x 216–864) + y=1100–1500** ·
**bottom 420px (y≥1500) EMPTY** for captions/brand/G-meet UI · safe margins x=216 / x=864. No upscaling.

**The 8 layouts** (= the `layout_crops`): ① horiz-split top (720×640 ×0.85) ② horiz-split bottom (720×640 tight)
③ vertical-split side-by-side (640×720, **eye-line-matched**) ④ G-meet focus full (720×1280) ⑤ G-meet widget
tile (220×280 corner) ⑥ square-IG half (360×720) ⑦ G-meet grid (680×470 stacked) ⑧ brand-strip (720×580).

**"All approved layouts" image** = `fit_previews/nova_v_driver_test/_contactsheet.png` — the 8 layouts rendered
with the ACTUAL Nova + driver, plus `_checklist.md` (approval gate: aspect / ≥1080×1920 / flat-white auto-checks
+ manual eye-line, hand-zone, per-layout framing review). Rendered ad examples in
`runs/i_go_to_home_20260619_1814/layout_mockups/` (13 mockups + `_contactsheet.png`).

**For us:** our Tamil/Telugu ad is only layout **#01 (horiz split)**. To output the same content in the other 7
formats, avatar frames must be **1080×1920 per this template** then cropped per `character_spec.json`. (Our current
clips are panel-sized 720×720 / 720×1280 — not the 1080×1920 master — so multi-format would need re-render at master size.)
