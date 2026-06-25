# Build Plan — `/ads-split-screen` local video factory

> **Audience:** an engineering agent with **zero prior context** on this repo.
> **Goal:** a Next.js page that runs **locally** where a user pastes a script in one
> language, picks 2 avatars (+voices), target languages, and target layouts, clicks **Run**,
> and gets **finished captioned MP4s** for every (language × layout) combination.
> The video engine **already exists** as `scripts/*.mjs` — you are mostly **wiring a constrained UI +
> a TypeScript orchestrator** around proven scripts. Do **not** rebuild the engine.

---

## 0. READ THESE FIRST (do not skip)

1. `AGENTS.md` (repo root) — **"This is NOT the Next.js you know."** This repo runs **Next.js 16.2.7**
   with breaking changes vs 14/15. **Before writing any route handler or page, read the relevant guide in
   `node_modules/next/dist/docs/`.** Heed deprecation notices.
2. `docs/ad-recreation-pipeline.md` — the HeyGen + Cartesia API shapes, avatar/voice IDs, and **all the
   hard-won gotchas**. Canonical pipeline reference. **Append new learnings to it as you go.**
3. `video-generation-flow/README.md` — the per-scene record→mux philosophy and TTS conventions.
4. This file.

### THE CORE ARCHITECTURE RULE (do not violate)

> **Exactly ONE LLM call in the whole system: generating the video script in each target language
> (translation/localization). Everything else is deterministic TypeScript + REST API calls.**

- **Script parsing** (labelled lines → conversation turns) = a **deterministic TypeScript parser** (string ops). No LLM.
- **Word-level caption timing** = **Cartesia's own word timestamps**, returned at TTS synthesis time. No LLM, no audio alignment.
- **Translation** (the one allowed LLM call) must return **schema-validated JSON** (reject + retry on violation).
  The LLM never decides layout geometry, timing math, ffmpeg args, file paths, or anything in the render path.
- **Constrained UI:** every control is a fixed, validated widget (script textarea + dropdown/cards/chips). No
  free-form input steers the pipeline; the user cannot inject prompts or pick anything outside the enumerated set.
- **Language:** new orchestration/glue/parse code is **TypeScript** run via `tsx`. The existing proven `.mjs`
  engine scripts are the deterministic API/ffmpeg layer — keep them; port to `.ts` incrementally if desired.

### Other non-negotiables (from `AGENTS.md` + `CLAUDE.md`)
- **100% direct REST APIs in plain `fetch`. No MCP.** No SDK wrappers beyond `@google/generative-ai` (already a dep).
- **Cartesia script convention:** TTS **input** (`transcript`) = **native script** (தமிழ்/हिंदी; English words stay
  English). **Caption/display** text = **Roman transliteration** (Tanglish/Hinglish). Never feed Roman to Cartesia
  or native to the caption renderer. See `AGENTS.md` "Cartesia TTS".
- Mask any API key to its last 6 chars in logs. Keys live in `.env.local` (gitignored). Never echo a full key.

---

## 0.5 Deltas since this plan (ALREADY IMPLEMENTED — these supersede §5.1/§6/§11/§13 where they conflict)

The engine + registry were iterated *after* this plan was written. These are live in the code:

1. **Avatar engine = ALL `avatar_v` (Avatar 5)** — both Nova and learner, **talk AND idle** (supersedes every
   "Nova = avatar_iv / Avatar 4" mention). Nova look `61307002…` + `avatar_v` produced the approved Hindi
   `nova-talk`. **Idle** is generated with `avatar_v` too — a ~30s "I am listening" line, then `make-idle-loop.mjs`
   cuts the phrase out and loops; rendered once per avatar, reused across languages. ⚠️ Avatar V barely moves during
   silence, so an `avatar_v` idle can look static (we saw this on Nova) — keep her gently vocalizing across the
   looped window; the learner's `avatar_v` idle already looks fine.
2. **Layouts (supersede §5.1):** `01/02` zoomed in ~18%; `03` = video pushed down + **bold-purple title** in the
   top white band; **`04b` = active-speaker** (whoever speaks is the full frame, other is a **rounded PIP**);
   **`05b` = active-speaker + circular PIP**; PIPs enlarged; **Meet bar** restyled to the Drop_call design
   (mic·volume·red-end·⋮), **tight pill**, **lifted above the bottom safe area**; `09` grid compacted to clear the bar.
3. **End-card:** `compose-layouts.mjs` replaces the **final segment's visual** with `<projectDir>/endcard.mp4`
   (if present), keeping that line's clean audio and dropping its caption. Built by **`scripts/make-endcard.mjs
   <outDir> [totalSec]`** from the teacher avatar's **`endcardPhone`** PNG (lilac *SUPERNOVA* bg + phone slides up).
   The orchestrator builds it once and copies it into each `<projectDir>` before compose.
4. **TTS rule T8** (`_ad-shared-rules.md`): yes/no questions need the native question particle (Hindi क्या …) — not
   "?" alone; calm affirmations use "." not "!".
5. **`scripts/_bin.mjs`** now prefers a **working system** ffmpeg/ffprobe (bundled static binaries were wrong-arch /
   dropped audio on Apple-silicon), falling back to static.
6. **Orchestrator gap fix:** per-speaker audio concatenated with **1s gaps** (`build-gap-track … 1 …`) to match
   `compose-layouts` `GAP_MS=1000` — else per-segment slicing drifts.

---

## 1. What the user does (the UX contract)

Page route: **`/ads-split-screen`** (new). Single page, all client-side state, talks to local API routes.

Flow:
1. **Paste script** in a textarea. The UI enforces a **labelled format** (one turn per line: `Label: text`) so it
   parses deterministically. Pick the script's **source language** from a dropdown.
2. Click **"Get translations"** (optional preview) → a deterministic parser splits the script into turns, then
   **the single Gemini call** translates them into the other selected languages (the **only** LLM step). User can
   eyeball/edit before running.
3. **Pick 2 avatars** from cards: one **teacher** (Nova / robot — the AI) and one **learner** (human). Each card
   already carries its HeyGen look id + Cartesia voice id (baked in — user types no IDs and labels each speaker).
4. **Pick target languages** (multi-select chips).
5. **Pick target layouts** (multi-select cards — the 8 layouts).
6. Click **Run** → a **live progress log** (SSE) streams per-language / per-layout progress.
7. As each `(lang × layout)` MP4 finishes, it appears in a **results grid** with an inline player + download.

No auth, no cloud. Everything runs on the user's machine via `pnpm dev`. ffmpeg + Chromium are installed by
`pnpm install` (§3). Heavy work runs as Node/`tsx` child processes spawned by API routes (Next.js dev server has
no function timeout locally, so long renders are fine).

---

## 2. Stack & repo facts (verified)

| Fact | Value |
|---|---|
| Framework | **Next.js 16.2.7**, App Router |
| React | **19.2.4** |
| Package manager | **pnpm** (`pnpm-lock.yaml` present) |
| Dev command / port | `pnpm dev` → **http://localhost:3000** |
| Existing relevant pages | `app/studio/page.tsx`, `app/studio-ads/page.tsx` (mirror these patterns) |
| Existing API helper | `app/api/studio/_lib.ts` — **`devOnly()`** + **`spawnSSE(scriptRel, args)`** |
| LLM dep | `@google/generative-ai` (but existing scripts call Gemini via raw `fetch` — match that) |
| Browser automation | `playwright` (devDep `^1.61.0`) — used by compose/captions to render PNG chrome |
| Validation | `zod` `^4.4.3` (already a dep — use for the parser + translation schema) |

**The existing API streaming pattern you will copy** (`app/api/studio/_lib.ts`):
```ts
export function devOnly(): Response | null {
  return process.env.NODE_ENV !== 'development' ? new Response('dev only', { status: 405 }) : null;
}
export function spawnSSE(scriptRel: string, args: string[] = []): Response {
  // spawns `node <scriptRel> ...args` at repo root, streams stdout/stderr as SSE `data: <line>\n\n`
}
```
> You need a **`tsx` variant** of `spawnSSE` (the orchestrator is TypeScript). Either generalize `spawnSSE` to
> take a command (`'node'` | `node_modules/.bin/tsx`) + args, or add `spawnSSEcmd(cmd, args)`. Keep the SSE wire
> format identical.

Existing routes that use it: `app/api/studio/{record-scene,record-scenes,assemble,mix}/route.ts`.
Client consumption pattern (copy from `app/studio/page.tsx`, fn `runSSE`):
```ts
const res = await fetch(`/api/.../run`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
const reader = res.body.getReader(); const dec = new TextDecoder();
for (;;) { const {done,value} = await reader.read(); if (done) break;
  dec.decode(value).split('\n').forEach(l => { if (l.startsWith('data: ')) appendLog(l.slice(6)); }); }
```
Video serving with HTTP Range (for scrubbing) already exists: `app/api/studio/video/route.ts` — copy its Range
logic for the results player.

---

## 3. Install / one-command setup (MUST be turnkey on a fresh clone)

The whole thing must come up with:
```bash
pnpm install      # installs node deps AND ffmpeg AND Chromium
pnpm dev          # → http://localhost:3000/ads-split-screen
```

### 3.1 Add bundled binaries + tsx
Add to `package.json` `dependencies` (static cross-platform binaries — no Homebrew/apt needed):
```json
"ffmpeg-static": "^5.2.0",
"ffprobe-static": "^3.1.0"
```
Add to `devDependencies`:
```json
"tsx": "^4.19.0"
```
> `tsx` runs the new TypeScript orchestration/parse scripts (`tsx scripts/<name>.ts`). Proven `.mjs` engine
> scripts keep running via `node`.

Add a **postinstall** so `pnpm install` also fetches Chromium:
```json
"scripts": { "postinstall": "playwright install chromium" }
```
> Linux caveat (note in RUNBOOK): bare Linux may need `playwright install --with-deps chromium`. macOS: plain is enough.

### 3.2 Create `scripts/_bin.mjs` (single source of truth for binary paths)
```js
import ffmpegPath from 'ffmpeg-static';
import ffprobe from 'ffprobe-static';
export const FFMPEG  = process.env.FFMPEG_PATH  || ffmpegPath    || 'ffmpeg';
export const FFPROBE = process.env.FFPROBE_PATH || ffprobe?.path || 'ffprobe';
```

### 3.3 Route every ffmpeg/ffprobe call through `_bin.mjs`
`grep -rn "'ffmpeg'\|\"ffmpeg\"\|'ffprobe'\|\"ffprobe\"" scripts/` and replace the bare command in each
`spawn`/`spawnSync`/`execFile` with the imported `FFMPEG` / `FFPROBE`. Scripts the orchestrator uses that shell
to ffmpeg: **`compose-layouts.mjs`, `add-captions.mjs`, `build-gap-track.mjs`, `make-idle-loop.mjs`,
`assemble-split.mjs`, `assemble-ad.mjs`** (+ any using `ffprobe` for durations). Add
`import { FFMPEG, FFPROBE } from './_bin.mjs';` to each.
> Fallback: if `ffmpeg-static` lacks a binary on some platform, `_bin.mjs` falls back to PATH `ffmpeg`; document
> `brew install ffmpeg` as the manual fallback in the RUNBOOK.

### 3.4 Acceptance
Clean clone + filled `.env.local`: `pnpm install && pnpm dev`, open `/ads-split-screen`, and a dry ffmpeg script
(e.g. `node scripts/build-gap-track.mjs /tmp/x.mp3 0.3 <some.mp3>`) succeeds with **no system ffmpeg installed**.

---

## 4. Environment variables (`.env.local`, gitignored)

Key **names** the scripts read (values supplied separately; never commit):
```
GEMINI_API_KEY        # Gemini — used ONLY for the translation call. Model: gemini-2.5-pro
CARTESIA_API_KEY      # Cartesia TTS (our key)
NAWIN_CARTESIA_API_KEY# Cartesia (Nawin's account — the cloned Nova/learner voices live here, sonic-3.5)
HEYGEN_API_KEY        # HeyGen avatar generation (our recharged key)
SYNCSO_API_KEY        # sync.so lipsync (fallback engine only)
# optional: GEMINI_IMAGE_MODEL, TRANSLATE_MODEL, BASE_URL
```
Update `.env.example` with all of the above (empty values). A **preflight** check (orchestrator §9.2 step 0) must
fail fast naming any missing key **before** spending API credits.

---

## 5. The engine that already exists — REUSE, do not rebuild

All under `/Users/cyanoprem/conductor/workspaces/supernova-widget/athens/scripts/`. Standalone Node ESM scripts,
read keys from `.env.local`, call REST APIs with `fetch`. **Exact CLI contracts:**

| Script | Invocation | Reads | Writes | LLM? |
|---|---|---|---|---|
| **parse-script.ts** *(NEW §9.1, TS)* | `tsx scripts/parse-script.ts <raw.txt> <out.spec.json> <labelMap.json>` | labelled script | `{turns,segments}` | **NO — deterministic parser** |
| **translate-ad-spec.mjs** | `node scripts/translate-ad-spec.mjs <sourceSpec.json> <targetLangId> <outSpec.json>` | spec + `video-generation-flow/translation/{languages.json,rules/<lang>.md}` | translated spec.json | **YES — the one allowed LLM call** (Gemini 2.5-pro) |
| **gen-tts-timed.ts** *(NEW §9.2, TS)* | `tsx scripts/gen-tts-timed.ts <spec.json> <outDir> <cartesiaKeyEnvName>` | spec `{model,voices,segments}` | `<id>-<speaker>.mp3` + `manifest.json` + **`timestamps/<id>.json` (Cartesia word ms)** | NO (Cartesia `/tts/sse`, `add_timestamps:true`) |
| **build-gap-track.mjs** | `node scripts/build-gap-track.mjs <out.mp3> <gapSec> <clip…>` | mp3 clips | one concatenated mp3 | NO (ffmpeg) |
| **heygen-gen.mjs** | `node scripts/heygen-gen.mjs <jobs.json> <outDir>` | jobs `[{id,audio,avatar_id,engine?,aspect_ratio?,resolution?,expressiveness?,motion_prompt?}]` | `<outDir>/<id>.mp4` + `heygen-results.json` | NO (HeyGen upload + `/v3/videos` + poll) |
| **heygen-poll.mjs** | `node scripts/heygen-poll.mjs <outDir> [maxMinutes]` | `heygen-results.json` | resumes downloads | NO |
| **syncso-lipsync.mjs** | `node scripts/syncso-lipsync.mjs <video> <audio> <out.mp4> [model] [sync_mode] [keyEnvFile]` | video+audio | lipsynced mp4 | NO (sync.so) — fallback only |
| **compose-layouts.mjs** | `node scripts/compose-layouts.mjs <projectDir> [--only 01,03,…]` | §7 contract | `<projectDir>/layouts/<NN-name>/final.mp4` (+ `final_no_subs.mp4`, `cues.json`) | NO (ffmpeg + Playwright) |
| **add-captions.mjs** | `node scripts/add-captions.mjs <projectDir> [VIDEO_W=720] [SPLIT_Y=640]` | `final_no_subs.mp4` + `cues.json` | `final.mp4` | NO (ffmpeg + Playwright) |
| **make-idle-loop.mjs** | `node scripts/make-idle-loop.mjs <src> <startSec> <endSec> <out> [targetSec]` | idle source mp4 | muted ping-pong idle loop | NO (ffmpeg) |
| **gen-scene.mjs** | `node scripts/gen-scene.mjs <avatarDir>` | `character.png` + `avatar.json` | `scene.png` | (avatar onboarding only — out of run scope) |
| **heygen-register.mjs** | `node scripts/heygen-register.mjs <avatarDir> [--mode v3\|v2-train]` | `scene.png` + `avatar.json` | updates `avatar.json` | (avatar onboarding only) |
| ~~word-timestamps-project.mjs~~ | — | — | — | **Gemini — DO NOT USE here.** Replaced by Cartesia timestamps (§9.2.2). |
| ~~gen-ad-tts.mjs~~ (bytes-only) | — | — | — | superseded by `gen-tts-timed.ts` (need timestamps) |

> **`compose-layouts.mjs` is the heart.** It already produces all **8 layouts** and calls `add-captions.mjs`
> internally. You feed it a `<projectDir>` shaped like the working example (§7–§8); you do **not** modify its
> filtergraphs.

### 5.1 The 8 layouts (hard-coded in `compose-layouts.mjs`, `LAYOUTS` array)
| id | name | canvas | composition | captionY |
|---|---|---|---|---|
| `01` | horizontal-split | 720×1280 | top/bottom vstack 720×640 each | 640 |
| `02` | horizontal-swap | 720×1280 | 01 with speakers swapped | 640 |
| `03` | vertical-split | 720×1280 | left/right hstack 360×1000, padded white | 1210 |
| `04b` | gmeet-nova-focus | 720×1280 | Nova full bg + learner rounded PIP top-right + Meet bar | 1010 |
| `05b` | gmeet-girl-focus | 720×1280 | learner full bg + Nova rounded PIP top-left + Meet bar | 1010 |
| `07` | square-ig | 720×720 | left/right hstack 360×720 (1:1 IG feed) | 640 |
| `09` | gmeet-grid | 720×1280 | dark bg + two rounded 680×470 tiles + Meet bar | 558 |
| `11` | two-panel | 720×1280 | same as 01 | 640 |

The UI layout-picker offers exactly these 8 ids/names.

---

## 6. Translation, video-script & TTS rules — FINAL (merged: our rules + Nawin's)

This is the **single LLM call** in the system, and its quality decides everything downstream (Cartesia
pronunciation, caption accuracy, ad tone). The final ruleset is a **merge** of two sources:

- **Ours** — `video-generation-flow/translation/rules/<lang>.md` (9 langs: tamil, hindi, telugu, gujarati,
  bengali, marathi, kannada, malayalam, punjabi) + `template.md` + `languages.json`. Strong, example-rich,
  per-language colloquial rules (e.g. Tamil connector-words attach **without dashes**). **KEEP these as the
  per-language base.**
- **Nawin's** — `/Users/cyanoprem/Documents/Nawin_s Claude/cartesia-translate-supernova/config/translation_prompt.txt`
  (whole-script, brand-heavy) and `…/translation_prompt_emotion.txt` (per-segment, emotion-aware). Has what ours
  lacks: **G1 language-flip, brand-preservation B1–B10, code-mix C1–C3, TTS-safety T1–T7, per-language R5 polite
  tonality, Tamil R6 register, emotion mechanics.** **ADOPT these.**

### 6.0 What to build (rules side)
1. Create **`video-generation-flow/translation/_ad-shared-rules.md`** = the SHARED preamble in §6.2 (global +
   brand + code-mix + TTS-safety). Language-agnostic; prepended to **every** translation call.
2. **Upgrade each `rules/<lang>.md`** by appending the **R5 polite-tonality table** (§6.3) — and for Tamil, the
   **R6 Chennai register block** (port verbatim from Nawin's `translation_prompt.txt`, lines ~310–362).
3. **`translate-ad-spec.mjs` assembles the prompt as:** `_ad-shared-rules.md` + `rules/<lang>.md` + the segments,
   and must return the **dual-output JSON** in §6.1. (It already loads `languages.json` + per-language rules; add
   the shared preamble and switch the output to the dual schema.)

### 6.1 OUTPUT CONTRACT (dual: native for TTS, Roman for captions)
The translate call returns, **per segment, schema-validated JSON** (retry on violation):
```json
{ "segments": [ { "id":"N1",
    "text":  "<native-script code-mix — Indic words in Indic script, English words in Latin>",
    "roman": "<same line fully Roman-transliterated (Tanglish/Hinglish) — for on-screen captions>" } ] }
```
- `text` → Cartesia `transcript` (per `AGENTS.md`: native script pronounces far better).
- `roman` → caption text in `cues.json`. Identical wording to `text`, just transliterated.
- Producing both in **one** call keeps the "exactly one LLM call" rule intact (transliteration is not a second call).

### 6.2 SHARED preamble — `_ad-shared-rules.md` (drop in verbatim)
```
You are the Supernova AI scriptwriter for the target language — NOT a literal translator. Rewrite each line so a
native speaker scrolling a Reel thinks "a friend said that," never "that's dubbed/textbook." Output ONLY the
required JSON.

GLOBAL
G1  Language-flip: whenever the SOURCE language name appears ("Hindi"/"हिंदी"/"Tamil"…), replace it with the
    TARGET language name — in dialogue, and in mix-names (Hinglish→Tanglish→Kanglish… per target).
G2  Spoken-conversational: simple everyday words; fragments and one-word lines are fine; natural fillers
    ("just","actually","yaar","thaan","appo","aiyo"); contractions. NEVER literary/Sanskritized/over-formal.
    Shorter beats longer.
G3  Natural beats correct: if a strict grammatical form sounds stiff aloud, use the colloquial form.
G4  Dual output: always emit both `text` (native script) and `roman` (transliteration), identical wording.
G5  Preserve emotion with TEXT MECHANICS (TTS reads emotion from text): keep repetitions verbatim and the SAME
    count ("क्या लिखूं? क्या लिखूं?" stays twice); keep every filler; use "!" for upbeat/surprised, "..." for
    hesitation, short fragments for decisive. Never invent emotion the source lacks.

BRAND / VIDEO-SCRIPT
B5  Brand lexicon ALWAYS English/Latin, never translated/transliterated: Supernova AI, Superflow, AI Teacher,
    Nova, Miss Nova, Robot, level test, practice plan, English (the language), spoken English, pronunciation,
    download, app, level test; all proper nouns & people names.
B6  HOOK FIDELITY: if a line is a deliberate English grammar mistake used as the hook (e.g. "I am adding oil",
    "I sleeped at 10 last night"), keep it VERBATIM in English — never translate, never correct, never paraphrase.
B7  English source-dialogue lines (a character demonstrating English fluency) stay in English in every language.
B8  "I'll explain in your language" beat: preserve it, flip the language name (per G1).
B10 Don't invent prices/CTAs/"cancel anytime"/names the source lacks; don't drop ones it has.

CODE-MIX
C1  Anything already English in the source stays English (Latin script).
C2  Keep in English: daily words (phone, office, app, video, call, online, ready, late, holiday…), pleasantries
    (Hi, Sorry, Thank you, Perfect, OK, Wow), grammar/technical terms, and anything in "quotes".
C3  NEVER pure-native, NEVER pure-English — every line is a natural code-mix.

TTS-SAFETY (Cartesia Sonic) — these eliminate observed mispronunciations:
T1  No hyphenated native+English compounds: "phone-pe"→"phone pe", "app-ko"→"app ko" (single space), or rephrase.
T2  Native words in NATIVE SCRIPT always. NEVER fuse a Latin word and a native suffix with no space
    ("englishಗೆ"→"english ಗೆ" or fully native "ಪುಸ್ತಕಕ್ಕೆ"). English code-mix tokens stay Latin.
T3  Spell numbers in target-language words: "15 minutes"→"पंद्रह minute"/"பதினைந்து நிமிஷம்"; "2024"→spelled out;
    never leave a bare digit. For long prices, rephrase ("under five thousand").
T4  Minimal punctuation — every comma is a Cartesia pause. Use only where you want a beat; no textbook commas.
T5  (Optional) Cartesia SSML inline, only when the register clearly calls for it; default NONE:
    <emotion value="excited|curious|hesitant|proud|grateful|confident|…"/> immediately before the clause;
    <break time="500ms"/> for deliberate pauses (e.g. between the 3 CTA asks).
T6  Expand abbreviations/symbols: "Dr."→"Doctor", "&"→"and", "%"→"percent". Keep letter-acronyms (OTP, UPI, AI) Latin.
T7  Post-strip cleanliness: stage directions [..]/(..) are removed before TTS — the spoken line must read cleanly
    on its own; don't write a line that only makes sense with the bracketed cue.
```

### 6.3 Per-language R5 polite-tonality (append to each `rules/<lang>.md`)
Consumer ads must be **friendly-respectful** → always polite-plural, never the singular-informal command. ✓ keep / ✗ avoid:

| Lang | Pronoun | ✓ correct | ✗ rude |
|---|---|---|---|
| Hindi | आप (not तू) | download कीजिए / करो · देखिए / देखो | कर · देख |
| Tamil | நீங்க (not நீ) | பண்ணுங்க · சொல்லுங்க · பாருங்க | பண்ணு · சொல்லு · பாரு |
| Telugu | మీరు (not నువ్వు) | చేయండి · చూడండి | చేయి · చూడు |
| Kannada | ನೀವು (not ನೀನು) | ಮಾಡಿ · ನೋಡಿ | ಮಾಡು · ನೋಡು |
| Malayalam | നിങ്ങൾ (not നീ) | ചെയ്യൂ / ചെയ്യുക · നോക്കൂ | ചെയ്യ് · നോക്ക് |
| Marathi | तुम्ही (not तू) | करा · बघा | कर · बघ |
| Bengali | আপনি (not তুই/তুমি) | করুন · দেখুন | কর · দেখ |
| Gujarati | તમે (not તું) | કરો · જુઓ | કર · જો |
| Punjabi | ਤੁਸੀਂ (not ਤੂੰ) | ਕਰੋ · ਵੇਖੋ | ਕਰ · ਵੇਖ |

**Tamil R6 (port verbatim from Nawin):** the Chennai-Madras register block — spoken contraction table
(வேண்டாம்→வேணாம், செய்கிறேன்→பண்றேன், இருக்கிறது→இருக்கு…), formal-✗/native-✓ swaps, ad particles (thaan/appo/oru),
red-flags, and the mandatory read-aloud tone check. Source: `…/cartesia-translate-supernova/config/translation_prompt.txt`.

---

## 7. Data contracts (exact shapes — the orchestrator must produce these)

Mirror the **working example** `.context/projects/hindi-landscape/`. Per run, per language, build a `projectDir`
with this shape, then call `compose-layouts.mjs <projectDir>`.

**`<projectDir>/conversation.json`**
```json
{ "layout": { "top": "nova", "bottom": "girl" },
  "turns": [ {"speaker":"girl","id":"G1"}, {"speaker":"nova","id":"N1"}, … ] }
```
- `layout.top`/`layout.bottom` = the two **speaker keys**; `compose-layouts` reads `videos/<key>-talk.mp4` and
  `videos/<key>-idle-stable.mp4`. Keep **teacher=`nova`, learner=`girl`** to maximize reuse of the working example.
- `id` must match `^[A-Za-z]\d+$`; order within a speaker by its number.

**spec.json** (input to `gen-tts-timed.ts`)
```json
{ "model": "sonic-3.5",
  "voices": { "nova": "<cartesiaVoiceId>", "girl": "<cartesiaVoiceId>" },
  "segments": [ { "id":"G1", "speaker":"girl",
                  "text":"<native-script transcript>", "roman":"<roman transliteration for captions>" }, … ] }
```

**`<projectDir>/tts/manifest.json`** (produced by `gen-tts-timed.ts`)
```json
{ "language":"hindi", "model":"sonic-3.5", "voices":{"nova":"…","girl":"…"},
  "segments":[ {"id":"G1","speaker":"girl","text":"…","roman":"…","file":"G1-girl.mp3","durationMs":1730}, … ] }
```
TTS file naming = **`<id>-<speaker>.wav`** (lossless pcm_s16le — see §13).

**`<projectDir>/tts/timestamps/<id>.json`** (produced by `gen-tts-timed.ts`) — Cartesia word timestamps, 0-based
within the line: `{ "words":[{"word":"…","startMs":0,"endMs":420}, …] }`.

**`<projectDir>/cues.json`** — built **deterministically** (§9.2.7) from the manifest + per-line timestamps.
Each cue: `{ file, ms (line start in timeline), durationMs, text (Roman), words:[{word,startMs,endMs}] }`. **No LLM.**

**`<projectDir>/videos/`** — the 4 base clips `compose-layouts` consumes:
- `nova-talk.mp4` — all Nova lines concatenated in turn order (one continuous clip).
- `girl-talk.mp4` — all learner lines concatenated in turn order.
- `nova-idle-stable.mp4`, `girl-idle-stable.mp4` — **muted idle loops** (language-independent; reused for every
  language — generated once per avatar, §14).

**Avatar registry — `data/ads-avatars.json`** (NEW, committed; §12/§14). **Engine: ALL `avatar_v` (Avatar 5) — both
Nova and learner (per §0.5; the earlier "Nova = avatar_iv" is superseded).**
```json
[ { "key":"nova", "role":"teacher", "kind":"nova", "name":"Nova",
    "heygenLookId":"61307002de704024a9cb2ea7299c6c3b", "heygenEngine":"avatar_v",
    "motionPrompt":"warm, gently animated teacher; natural small gestures while speaking",
    "endcardPhone":"video-generation-flow/endcard/nova-phone.png",
    "cartesiaVoiceId":"d229d905-1887-42df-8eed-ebfaeea6d26f", "cartesiaModel":"sonic-3.5",
    "cartesiaKeyEnv":"NAWIN_CARTESIA_API_KEY",
    "idleClip":".context/projects/hindi-landscape/videos/nova-idle-stable.mp4",
    "thumb":"/ads-avatars/nova.png" },
  { "key":"girl", "role":"learner", "kind":"human", "name":"Learner (female)",
    "heygenLookId":"<verify from working files>", "heygenEngine":"avatar_v",
    "motionPrompt":"natural conversational delivery, relaxed",
    "cartesiaVoiceId":"56e35e2d-6eb6-4226-ab8b-9776515a7094", "cartesiaModel":"sonic-3.5",
    "cartesiaKeyEnv":"NAWIN_CARTESIA_API_KEY",
    "idleClip":".context/projects/hindi-landscape/videos/girl-idle-stable.mp4",
    "thumb":"/ads-avatars/girl.png" } ]
```
> Avatar IV (Nova) takes `expressiveness` + `motion_prompt`; Avatar V (human) takes `motion_prompt` only.

---

## 8. The working example to mirror — `.context/projects/hindi-landscape/`

Already produced all 8 layouts for Hindi. Use as (a) structural template and (b) the **Phase-1 smoke test**
(regenerate from the UI, diff against existing `layouts/*/final.mp4`).
```
.context/projects/hindi-landscape/
├── conversation.json        # {layout:{top:nova,bottom:girl}, turns:[G1,N1,…,G5,N5]} (10 turns)
├── cues.json                # word-level caption timing
├── tts/ (manifest.json, G1-girl.mp3…N5-nova.mp3, idle cues)
├── videos/ (nova-talk.mp4, girl-talk.mp4, *-idle-stable.mp4, heygen-results.json ← VERIFY avatar IDs §14)
└── layouts/{01-…,02-…,03-…,04b-…,05b-…,07-…,09-…,11-…}/final.mp4 (+ final_no_subs.mp4, cues.json)
```

---

## 9. What to BUILD

### 9.1 `scripts/parse-script.ts` (NEW, TypeScript) — labelled script → spec, **deterministic, no LLM**
The UI constrains the script to a **labelled format** (`Label: text`, one turn per non-empty line), so parsing is
pure string work.
- Input: raw script; a `labelMap.json` from the UI mapping each label to a slot (`nova`|`girl`) — the user already
  said which avatar is teacher vs learner, so there is **no inference**, just a table lookup.
- Deterministic rules: trim; skip blank lines and stage directions (`[...]`/`(...)`, per `AGENTS.md` brand rules);
  match `^(<label>):\s*(.*)$`; map label→slot; assign ids per slot in encounter order (`nova`→`N1,N2…`,
  `girl`→`G1,G2…`).
- Validate with `zod`: ≥1 turn; every non-skipped line matched a known label. On an unmatched line, **fail with a
  precise error naming the line** (UI surfaces it; user fixes the script). **Never guess.**
- Output `<out.spec.json>`: `{ turns:[{speaker,id}], segments:[{id,speaker,text}] }` (`text` = source language,
  native script for Cartesia).

### 9.2 `scripts/make-split-ad.ts` (NEW, TypeScript) — the orchestrator (one run → all videos)
**Invocation:** `tsx scripts/make-split-ad.ts <runDir>`; `<runDir>/run.json` holds inputs:
```json
{ "runId":"…", "sourceLang":"hindi", "rawScriptPath":"<runDir>/script.txt",
  "labelMap": { "Nova":"nova", "Girl":"girl" },
  "avatars": { "teacher":"nova", "learner":"girl" },
  "languages": ["hindi","tamil","telugu"], "layouts": ["01","03","04b"], "engine": "heygen" }
```
Emit plain progress lines to stdout (streamed via the `tsx` SSE helper). Prefix `[lang:tamil] tts 6/10`. Exit
non-zero on fatal error.

**Algorithm (deterministic; per language independent — sequential first, parallelize later):**

0. **Preflight:** assert required env keys (per `engine` + Cartesia + Gemini); resolve the two avatars from
   `data/ads-avatars.json`; print a credit note. Fail fast on any missing key/avatar.
1. **Parse once (no LLM):** `tsx scripts/parse-script.ts <rawScriptPath> <runDir>/source.spec.json <labelMap>` →
   source-language spec. Inject `voices` (from the two avatars) + `model:"sonic-3.5"`.
2. **For each `lang`:** `projectDir = <runDir>/<lang>/`:
   1. **Spec for lang — THE ONLY LLM CALL:** if `lang===sourceLang` copy `source.spec.json`; else
      `node scripts/translate-ad-spec.mjs <runDir>/source.spec.json <lang> <projectDir>/spec.json` (Gemini, rules
      from `video-generation-flow/translation/`). Schema-validate the output (retry on violation). Output carries
      **native script** (`text`) + **Roman** (`roman`) per segment.
   2. **TTS + timestamps (deterministic):** `tsx scripts/gen-tts-timed.ts <projectDir>/spec.json <projectDir>/tts
      <cartesiaKeyEnvName>` → per-line **`<id>-<speaker>.wav`** (lossless pcm_s16le — §13), `tts/manifest.json`
      (durations), and `tts/timestamps/<id>.json` (**Cartesia word timestamps**, 0-based). Uses Cartesia
      `/tts/sse` with `add_timestamps:true`. **Word timing comes from here — no Gemini.**
   3. **conversation.json:** write `{layout:{top:"nova",bottom:"girl"}, turns:[…]}` from the parsed turns.
   4. **Concatenate per-speaker audio → ONE WAV per speaker (for HeyGen):** `build-gap-track.mjs
      <projectDir>/_nova_talk.wav 0 <N1-nova.wav N2-nova.wav …>` (turn order); same for `_girl_talk.wav`. WAV =
      lossless (§13). This yields the single talking audio per speaker that drives one HeyGen clip each.
   5. **Base talking videos — ONE clip per speaker, HeyGen, per-avatar engine:**
      - Write a **2-job** file and run `heygen-gen.mjs`. **Engine from the registry: robot/Nova = `avatar_iv`
        (Avatar 4), human = `avatar_v` (Avatar 5).** Use the **approved aspect 16:9 / 1080p** (the Hindi run was
        landscape; layouts crop locally). Avatar IV adds `expressiveness`+`motion_prompt`; Avatar V uses
        `motion_prompt` only (see verbatim JSON in §11.1):
        ```json
        [ {"id":"nova-talk","audio":"<projectDir>/_nova_talk.wav","avatar_id":"<teacher.heygenLookId>","engine":"avatar_iv","aspect_ratio":"16:9","resolution":"1080p","expressiveness":"medium","motion_prompt":"<teacher.motionPrompt>"},
          {"id":"girl-talk","audio":"<projectDir>/_girl_talk.wav","avatar_id":"<learner.heygenLookId>","engine":"avatar_v","aspect_ratio":"16:9","resolution":"1080p","motion_prompt":"<learner.motionPrompt>"} ]
        ```
        → `heygen-gen.mjs <jobs.json> <projectDir>/videos` → **one** `nova-talk.mp4` + **one** `girl-talk.mp4`.
        **Respect the concurrency cap (§14)** — do not submit more than N=2 talking jobs in flight across languages.
      - **engine=syncso (fallback only, not used for now):** slice the source-language base talk per segment +
        `syncso-lipsync.mjs` each with the lang audio. Implement only if explicitly requested.
   6. **Idle clips:** copy each avatar's `idleClip` → `<projectDir>/videos/{nova,girl}-idle-stable.mp4` (muted,
      language-independent — never regenerated per language).
   7. **Caption timing (deterministic, no LLM):** build `<projectDir>/cues.json` with a TS helper — for each turn
      in order: `ms` = cumulative sum of prior turns' `durationMs` (timeline offset); `text` = the segment's
      `roman`; `words` = `tts/timestamps/<id>.json` (already per-word start/end ms within the line).
   8. **Compose layouts:** `compose-layouts.mjs <projectDir> --only <layouts.join(',')>` → captioned
      `<projectDir>/layouts/<NN-name>/final.mp4` per selected layout.
   9. Print `[lang:<lang>] done`.
3. **Manifest:** write `<runDir>/result.json` mapping `(lang,layout) → relative mp4 path`, status, durations.

### 9.3 API routes (NEW) under `app/api/ads-split-screen/`
Reuse `devOnly()` from `app/api/studio/_lib.ts`. Use the `tsx` SSE helper (§2) for `/run`. Read Next 16 route
docs first (§0). Web `Response` returns only.

| File | Method | Body / query | Does |
|---|---|---|---|
| `avatars/route.ts` | GET | — | returns `data/ads-avatars.json` |
| `layouts/route.ts` | GET | — | returns the 8 `{id,name}` (from §5.1 or `data/ads-layouts.json`) |
| `languages/route.ts` | GET | — | returns `video-generation-flow/translation/languages.json` |
| `preview/route.ts` | POST | `{rawScript, labelMap, sourceLang, languages}` | runs `parse-script.ts` (deterministic) + `translate-ad-spec.mjs` per lang; returns `{turns, perLang}` for review. Plain JSON (not SSE). |
| `run/route.ts` | POST | `{rawScript, labelMap, sourceLang, avatars, languages, layouts, engine?}` | writes `<runDir>/run.json` + `script.txt`, then spawns `tsx scripts/make-split-ad.ts <runDir>` and streams SSE |
| `result/route.ts` | GET | `?run=<id>` | returns `<runDir>/result.json` |
| `video/route.ts` | GET | `?run=<id>&lang=<l>&layout=<NN>` | serves `<runDir>/<lang>/layouts/<NN-name>/final.mp4` with **HTTP Range** (copy `app/api/studio/video/route.ts`) |

Guard all with `devOnly()`.

### 9.4 The page (NEW) `app/ads-split-screen/page.tsx` (+ optional `ui.tsx` client component)
**Constrained UI principle:** every control is a fixed, validated widget — no free-form input drives the pipeline
except the script text (parsed deterministically). The user picks from enumerated avatars/languages/layouts and
cannot inject prompts or steer the engine. Validate all selections client-side before enabling **Run**.
- `'use client'`. Mirror `app/studio/page.tsx`.
- State: `rawScript`, `sourceLang`, `labelMap`, `selectedAvatars{teacher,learner}`, `selectedLangs[]`,
  `selectedLayouts[]`, `logs[]`, `running`, `results`.
- Sections: (1) script textarea + source-lang `<select>` + a tiny "format: `Label: line`" hint;
  (2) **Get translations** → `/preview`, render per-language turns (read-only/editable); (3) avatar cards
  (GET `/avatars`) — pick 1 teacher + 1 learner (this also sets `labelMap`); (4) language chips (GET `/languages`);
  (5) layout cards (GET `/layouts`); (6) **Run** → `runSSE('/api/ads-split-screen/run', payload)` (copy `runSSE`);
  (7) live log panel; (8) results grid polling `/result?run=` →
  `<video src="/api/ads-split-screen/video?run=…&lang=…&layout=…">` + download per cell.
- **Run** disabled unless: script non-empty, both avatars chosen, ≥1 language, ≥1 layout.

### 9.5 Avatar thumbnails
`public/ads-avatars/<key>.png` for the picker. Grab a frame from each idle clip with ffmpeg.

---

## 10. Per-run directory layout
```
.context/projects/_runs/<runId>/
├── run.json, script.txt, source.spec.json, result.json
└── <lang>/
    ├── spec.json, conversation.json, cues.json, _nova_talk.mp3, _girl_talk.mp3
    ├── tts/ (per-line mp3 + manifest.json + timestamps/<id>.json)
    ├── videos/ (nova-talk.mp4, girl-talk.mp4, *-idle-stable.mp4, heygen-results.json)
    └── layouts/<NN-name>/final.mp4   ← served to the UI
```

---

## 11. External API shapes (verified; the scripts implement these)

**Cartesia TTS — use WAV (lossless), not mp3** (§13). `POST https://api.cartesia.ai/tts/bytes` · Headers
`X-API-Key`, `Cartesia-Version: 2024-06-10`, `Content-Type: application/json` · Body `{ "model_id":"sonic-3.5",
"transcript":"<native>", "voice":{"mode":"id","id":"<voiceId>"},
"output_format":{"container":"wav","encoding":"pcm_s16le","sample_rate":44100} }`.

**Cartesia TTS with word timestamps (use this in `gen-tts-timed.ts`)** — the **SSE** endpoint
`POST https://api.cartesia.ai/tts/sse` (same headers/body, **WAV** output) **plus** `"add_timestamps": true`. The
stream returns audio chunks **and** word-timestamp events (`word_timestamps` with parallel `words`/`start`/`end`
arrays — start/end in **seconds**, convert to ms). Collect audio → **WAV** (`pcm_s16le`), timestamps →
`timestamps/<id>.json`.
> ⚠️ Verify the exact SSE event/field names against current Cartesia docs before coding (the timestamp feature
> exists; field naming may differ by `Cartesia-Version`). If the SSE path only streams raw PCM, wrap it into a WAV
> container — or fetch audio via `/tts/bytes` (WAV) and timestamps via `/tts/sse` separately (both are API calls,
> still **no LLM** — fully deterministic).

**HeyGen audio upload** — `POST https://upload.heygen.com/v1/asset` · `x-api-key`, **`Content-Type: audio/x-wav`**
(for our WAV; `audio/mpeg` for mp3) · raw bytes → `{data:{id}}`.
**HeyGen generate** — `POST https://api.heygen.com/v3/videos` · body `{ "type":"avatar","avatar_id":"<lookId>",
"audio_asset_id":"…","engine":{"type":"avatar_iv"|"avatar_v"},"aspect_ratio":"16:9","resolution":"1080p",
"output_format":"mp4", …(avatar_iv adds "expressiveness","motion_prompt"; avatar_v adds "motion_prompt") }`.
**Poll** `GET https://api.heygen.com/v3/videos/<id>` → `{data:{status,video_url}}`.
**HeyGen quota** (budget monitor) — `GET https://api.heygen.com/v2/user/remaining_quota` (watch `plan_credit`).

### 11.1 Approved HeyGen job JSON (verbatim — write to `jobs.json`; `heygen-gen.mjs` maps `engine` → `{type}`)
> These are the **shapes we generated and approved**. The flat `"engine":"avatar_iv"` form is what you put in
> `jobs.json`; `heygen-gen.mjs` converts it to the `/v3/videos` `engine:{type}` body. If `heygen-gen.mjs` does not
> already forward `motion_prompt`/`expressiveness`, add it (the approved idle below used both and worked).

**Idle — APPROVED (Nova, `avatar_iv`). Render ONCE, reuse across all languages** (then cut the spoken phrase out +
loop with `make-idle-loop.mjs` → `nova-idle-stable.mp4`):
```json
{ "id": "nova-idle-iv-30",
  "audio": "<...>/nova-listen-30.wav",
  "avatar_id": "61307002de704024a9cb2ea7299c6c3b",
  "engine": "avatar_iv",
  "aspect_ratio": "16:9",
  "resolution": "1080p",
  "expressiveness": "medium",
  "motion_prompt": "She is attentively listening with subtle gentle nods, calm and relaxed with a steady natural gaze and soft eyes. Mouth relaxed and closed. No hand gestures, no large head movements or sways. Natural and lifelike." }
```

**Talking — one job per speaker, per language** (robot `avatar_iv` / human `avatar_v`):
```json
[ { "id": "nova-talk", "audio": "<projectDir>/_nova_talk.wav", "avatar_id": "<robot look id>",
    "engine": "avatar_iv", "aspect_ratio": "16:9", "resolution": "1080p", "expressiveness": "medium",
    "motion_prompt": "warm, gently animated teacher; natural small gestures while speaking" },
  { "id": "girl-talk", "audio": "<projectDir>/_girl_talk.wav", "avatar_id": "<human look id>",
    "engine": "avatar_v", "aspect_ratio": "16:9", "resolution": "1080p",
    "motion_prompt": "natural conversational delivery, relaxed" } ]
```
> Confirm the exact `avatar_id`s + that `16:9` matches the approved Hindi clips by reading
> `.context/projects/hindi-landscape/videos/heygen-results.json` and `.context/projects/hindi-landscape/idle-test/jobs_*.json`.

**Gemini (translation only)** —
`POST https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=<key>`.

---

## 12. Avatar & voice IDs — VERIFY before trusting

Source of truth = the actual job that produced `hindi-landscape/videos/{nova,girl}-talk.mp4`. Before filling
`data/ads-avatars.json`: read `.context/projects/hindi-landscape/videos/heygen-results.json` (+ any `*jobs*.json`)
for the exact `avatar_id` + `engine`. Cross-check `docs/ad-recreation-pipeline.md` (candidates: Nova `avatar_v`
`557978274faa48f58b12a601dd1285fe`; Nova `avatar_iv` idle look `61307002de704024a9cb2ea7299c6c3b`; learner look
`92701f68b13d423b908825cd6d35a2cc`). **Confirm, don't trust** — O/0 + cross-account issues have bitten this project.

**Verified Cartesia voice IDs** (`hindi-landscape/tts/manifest.json`): Nova `d229d905-1887-42df-8eed-ebfaeea6d26f`,
learner `56e35e2d-6eb6-4226-ab8b-9776515a7094` — both `sonic-3.5`, **Nawin's account** (`NAWIN_CARTESIA_API_KEY`).

**Idle clips** already exist at `hindi-landscape/videos/{nova,girl}-idle-stable.mp4` — reuse directly. For a **new**
avatar: `gen-scene.mjs` → `heygen-register.mjs`, then a one-time idle (HeyGen **`avatar_v`**, ~30s "I am listening"
audio, `motion_prompt:"subtle gentle nods, steady natural gaze and soft eyes, mouth relaxed and closed, no large
head movements"`) → `make-idle-loop.mjs` to cut the spoken phrase + loop. Recipe in `docs/ad-recreation-pipeline.md`.

---

## 13. Gotchas (each previously caused user-visible breakage — honor them)

1. **Native script in, Roman out.** Cartesia `transcript` = native; captions/`cues.json` text = Roman. Never cross them.
2. **Numbers as target-language words**, never bare digits (`"fifteen to twenty minutes"`, not `"15-20"`), or Cartesia mis-reads.
3. **Word timing = Cartesia timestamps, not an LLM.** Use the `/tts/sse` `add_timestamps` output verbatim. The old
   Gemini aligner `word-timestamps-project.mjs` is **not used here**.
4. **sync.so (fallback only): per-segment, never concat-then-split** (truncates/bleeds). **Never `atempo`-stretch**
   a short clip into sync.so (glitches half-frame white). **Re-encode** concatenations `-c:v libx264` (never `-c copy`).
5. **HeyGen aspect is baked at generation** — generate `9:16` 1080p; all reframing/cropping into the 8 layouts is
   done locally by ffmpeg in `compose-layouts.mjs`.
6. **Engines: ALL `avatar_v` (Avatar 5)** — talk AND idle, both avatars. Avatar V can look **static during pure
   silence**, so the **idle** is generated from a continuous ~30s "I am listening" delivery (then `make-idle-loop.mjs`
   cuts the phrase + loops), **not** bare silence. Idle rendered once per avatar, reused — never per run. Avatar V
   takes `motion_prompt` only (no `expressiveness`).
7. **HeyGen Video Translate** is unreliable on profile/side faces — do **not** use it; we **generate** per language.
8. **compose-layouts pre-slices** talk clips per segment and maps clean Cartesia per-line audio; concat re-encoded
   to AAC to avoid join clicks. Don't "fix" this.
9. **WAV, not mp3, for any TTS that feeds HeyGen + the final mix.** Cartesia WAV (`pcm_s16le`) is lossless (−∞ dB
   floor); mp3 has a ~−60 dB floor that audibly adds noise after re-encoding (this was a real bug we chased).
   HeyGen audio upload then needs `Content-Type: audio/x-wav` (heygen-gen.mjs maps `.wav`→`audio/x-wav`). mp3 only
   for throwaway previews.

---

## 14. Engine, concurrency & cost (decided)

**HeyGen for ALL languages, for now** — `engine:"heygen"` always; **sync.so is a coded fallback only, not used.**
Approved engines: **robot/Nova → Avatar IV (`avatar_iv`), human → Avatar V (`avatar_v`)**.

**One clip per speaker, per language:**
- **Talking:** exactly **one** HeyGen job per speaker per language (all that speaker's lines concatenated into one
  WAV → one clip). A run = **2 talking gens × #languages**.
- **Idle:** **never generated per run** — each avatar's idle loop is rendered **once** (`avatar_iv`, for natural
  silence motion; §11.1 + §12) and **reused** for every language. Zero idle gens at run time.

**Concurrency (must handle — HeyGen rate-limits parallel generations):** cap **in-flight HeyGen jobs to N (start
N=2)**. Simplest reliable approach: process **languages sequentially** (each language submits its 2 talking jobs,
waits for both via `heygen-gen.mjs`'s poll, then moves on) — that naturally bounds concurrency to 2. If you
parallelize languages later, use a semaphore of size N around the 2-job batches. On transient failure resume with
`heygen-poll.mjs <outDir>`. Log every submit/poll to the SSE stream; never exceed the cap.

**Cost/budget:** HeyGen list is per-minute by engine ($1 std / ~$3 Avatar V / $4 Avatar IV), but this account draws
a **pre-paid plan-credit bucket** (`plan_credit` ≈ thousands) → each short clip costs cents; a full multi-language
run is trivial against it. sync.so would be ~$0.0033/frame (~$5/min, ~100× more). Monitor
`GET https://api.heygen.com/v2/user/remaining_quota` (`plan_credit`), not dollars.

---

## 15. Build order & acceptance tests

1. **Install turnkey (§3).** Fresh clone → `pnpm install` brings ffmpeg + Chromium + tsx; an ffmpeg script runs without system ffmpeg.
2. **`parse-script.ts` (§9.1).** Paste the Hindi `hindi-landscape` script → spec `turns` match
   `hindi-landscape/conversation.json` (10 turns, correct speakers/ids). Deterministic; an unknown label fails loudly.
3. **`gen-tts-timed.ts` (§9.2.2).** One line → mp3 + `timestamps/<id>.json` with sane per-word ms. No Gemini.
4. **Orchestrator single lang/layout.** `{languages:["hindi"],layouts:["01"],engine:"heygen"}` →
   `<runDir>/hindi/layouts/01-horizontal-split/final.mp4` visually matches the working example.
5. **Fan out:** all 8 layouts, then add `tamil`. 8 MP4s/lang, non-zero, correct duration, video+AAC, captions placed right.
6. **API routes (§9.3).** GETs return expected JSON; `/run` streams SSE; `/video` is seekable (206 on Range).
7. **Page (§9.4).** Browser: paste → 2 avatars + 2 langs + 3 layouts → Run → 6 videos play + download. **Confirm
   exactly one LLM call happened** (log every Gemini request in `translate-ad-spec.mjs`; assert count == #non-source langs).
8. **Fresh-clone test:** wipe `node_modules` + `_runs`, `pnpm install`, fill `.env.local`, repeat step 7.

---

## 16. Out of scope (do not build now)
Cloud deploy (Vercel/Railway/R2/Neon/Inngest) — local-first only; same scripts lift later. Auth/multi-user/DB. New
avatars beyond Nova + the existing learner. Animated backgrounds, 4K upscale.

---

## 17. Git / delivery workflow
- **Build on the existing branch `cyanoprem/video-creation-edit-render`** (the current working branch). Do **not**
  create a new branch unless asked.
- Commit incrementally per phase (§15) with clear messages.
- **Do not push or open a PR until the user has tested locally.** After the user confirms, **push to this branch
  and open a PR** (base `main`).
- Keep `.env.local`, `out/`, and `.context/projects/_runs/` gitignored — never commit keys or generated videos.
  Commit only source: the new scripts, routes, page, `data/ads-avatars.json`, `_ad-shared-rules.md` + upgraded
  `rules/*.md`, and `package.json`/`.env.example` changes.

---

### Quick file-path index (build targets)
- NEW (TypeScript): `scripts/parse-script.ts`, `scripts/gen-tts-timed.ts`, `scripts/make-split-ad.ts`
- NEW: `scripts/_bin.mjs`
- NEW: `app/ads-split-screen/page.tsx` (+ client component)
- NEW: `app/api/ads-split-screen/{avatars,layouts,languages,preview,run,result,video}/route.ts`
- NEW: `data/ads-avatars.json`, optional `data/ads-layouts.json`, `public/ads-avatars/*.png`
- EDIT: `package.json` (deps + tsx + postinstall), `.env.example`, ffmpeg-using `.mjs` scripts (route via `_bin.mjs`),
  `app/api/studio/_lib.ts` (add a `tsx` SSE variant)
- REUSE unchanged: `scripts/{translate-ad-spec,build-gap-track,heygen-gen,heygen-poll,syncso-lipsync,compose-layouts,add-captions,make-idle-loop}.mjs`,
  `app/api/studio/video/route.ts` (pattern), `video-generation-flow/translation/*`
- DO NOT USE in the run path: `scripts/word-timestamps-project.mjs` (Gemini), `scripts/gen-ad-tts.mjs` (no timestamps)
