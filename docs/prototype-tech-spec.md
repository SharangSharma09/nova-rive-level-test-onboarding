# Nova onboarding + level test — prototype tech spec

Inventory of everything this prototype does that a production build would need to
support, split into **model/prompt layer** and **frontend layer**. Written from
the code as it stands, not from intent — anything aspirational is called out in
[Gaps](#8-gaps--not-built-yet).

Surface: `/` and `/nova-rive-level-test-hindi` (Hindi), `/nova-rive-level-test-tamil`
(Tamil). Harness: `components/RiveVariantHarness.tsx`. Screen: `components/NovaRiveLevelTest.tsx`.

---

## 1. Model / prompt layer

Four distinct model jobs. All are **JSON-returning**, all are on the user's
critical path, and all need a fallback that keeps the flow moving.

### 1.1 Correction with inline error spans (V3)

`POST /api/nova-onboarding/correct-and-extract`

The single biggest prompt change vs a plain chat model: the model must return the
user's sentence **twice**, with the differing regions wrapped in tags, so the UI
can highlight at sub-sentence granularity without diffing.

```json
{
  "original":  "I am work in a call center <e>since</e> two year.",
  "corrected": "I <c>have worked</c> in a call center <c>for</c> two years.",
  "goal_theme": "manager se baat karne ke liye",
  "goal_confident": true
}
```

Prompt constraints encoded today:
- Fix all clear grammar errors (tense, articles, prepositions, word order).
- **Selectivity cap** — surface only the clearest 2–3 corrections even on a 2–3
  line answer. A wall of red is discouraging for a beginner.
- **Max 1–2 phrasing upgrades**, never a rewrite; keep it recognisably theirs, at
  their level.
- Meaning must be identical; never add facts; no praise or filler in the output.
- Already-correct input → one small natural upgrade, but **nothing marked as an error**.

### 1.2 Goal extraction + confidence gate (V3)

Same call, second job. Returns a 2–4 word Hinglish phrase naming *why* the user
wants English, plus a boolean.

**The boolean is the load-bearing part.** If the model confidently echoes a goal
the user never stated, the "it understood me" beat inverts into "it wasn't
listening". Both the prompt and the route are hardened for this:

- Prompt rules: restating the question is not a reason; you must be able to point
  to a specific person / situation / outcome in their words; when in doubt, false.
- Route-level gate: `goal_theme` is only passed through when `goal_confident === true`
  **and** the theme is non-empty, so a model returning one without the other can't
  smuggle a guess into the UI.
- Every failure path (network, parse, malformed) resolves to `goal_confident: false`.

Measured behaviour after hardening:

| Input | `goal_confident` |
|---|---|
| "I want to learn english." | false |
| "English is very important for everyone" | false |
| "Yesterday I go to market…" (off-topic) | false |
| "Improve." | false |
| "…my manager talk in english…" | true — `manager se baat karne ke liye` |
| "My daughter she study in english medium…" | true — `beti se baat karne ke liye` |
| "…speak confidently in job interviews." | true — `job interviews ke liye` |

Downstream, this picks one of two hand-written Part B copy branches for Message 3.

### 1.3 Binary speaking grade (V2)

`POST /api/nova-onboarding/grade-speaking` → `{ correct: boolean, corrected: string }`.

Older/simpler shape: returns plain corrected text, and the **client** infers the
highlight spans by word-diffing original vs corrected. `correct` is returned
explicitly rather than inferred from string equality, so trivial punctuation or
whitespace drift isn't misread as a mistake. **Fails open** (`correct: true`) so a
broken call can't strand the card on "Checking…".

### 1.4 Translation scoring (level test)

`POST /api/nova-level-test/evaluate` → `{ correct: boolean }`.

Scores a spoken translation against an expected English sentence. Meaning-equivalence,
not string match; minor grammar imperfections pass. Silent — never shown or spoken
during the test, only aggregated into the results screen. **Fails closed**
(`correct: false`) so an unscored answer can't inflate the level.

### 1.5 Inference configuration — `lib/gemini.ts`

Shared helper; the config matters as much as the prompts:

| Setting | Value | Why |
|---|---|---|
| Model | `gemini-2.5-flash` | |
| `thinkingConfig.thinkingBudget` | **0** | Default thinking cost 3.8–6.2s and 574–976 reasoning tokens for a ~35-token verdict. Off → ~1s, no accuracy loss. |
| `responseMimeType` | `application/json` | Bare JSON, removes markdown-fence stripping |
| Auth | `x-goog-api-key` header | Keeps the key out of URLs/logs |
| Transport | `fetch`, not the SDK | The installed `@google/generative-ai` v0.24.1 has no `thinkingConfig` field |

User-visible effect: the "Checking…" card went from ~5–6.5s to **1.25s** measured
in-app.

### 1.6 Speech-to-text — `lib/sarvam-transcribe.ts`

`saaras:v3`, `mode: codemix`, `language_code: unknown`. Code-mix mode is required:
users answer in English but the surrounding UX is Hinglish, and answers routinely
mix both. Returns `""` on failure; the caller re-arms the mic rather than showing
a dead-end error.

### 1.7 Text-to-speech — `app/api/tts/route.ts`

Cartesia, single fixed voice id. Two script-convention rules that a production
build must honour (see `AGENTS.md`):

- **TTS input** → native script (Devanagari/Tamil for the vernacular words,
  English left as English). Cartesia pronounces this far better than Roman.
- **Display text** → Roman transliteration (Hinglish/Tanglish).

Emoji must be stripped before TTS (`stripEmojisForTts`) — they're display-only.

---

## 2. Structured conversation model

Nova's turns are **not** free-form model output. Every line is a typed object in a
script (`lib/pretest-dialogue.ts`), and the renderer switches on its type. A
production backend would need to emit this shape rather than prose.

### 2.1 Line schema

```ts
type PretestLine =
  | { kind: "auto";         text; preDelayMs? }        // narrates, then auto-advances
  | { kind: "cta";          text; cta }                // waits for one button
  | { kind: "select";       text; options[] }          // MCQ, localised labels
  | { kind: "select-plain"; text; options: string[] }  // MCQ, identical across locales
  | { kind: "final";        text; bullets[]; cta }     // CTA that changes stage
```

### 2.2 Runtime message schema

```ts
interface Msg {
  id; role: "ai" | "user"; text;
  interactive?: MsgInteractive;   // which template to render
  isTappedResponse?: boolean;     // user bubble from a tap, styled differently
  quizSentence?: string;          // native-script sentence, rendered at 20px
  feedback?: { status: "checking" | "correct" | "incorrect" | "tagged"; … };
}
```

### 2.3 Sequencing rules

- **One line at a time.** The next line is only released when the current one's
  **narration finishes** — `onNarrationEnd` is the sole trigger for revealing a
  CTA or MCQ. This prevents the next TTS call cutting off the current one.
  *Consequence: if audio never completes, the flow stalls with no button — see
  [Gaps](#8-gaps--not-built-yet).*
- CTAs and MCQ taps append a **user bubble echoing the label chosen**.
- The progress bar advances on **user-driven turns only** (CTA taps, MCQ
  selections) — `auto` narration lines don't move it.
- One line's copy is resolved at narration time rather than being fixed: V3's
  Message 3 picks its Part B branch from the extracted goal.

### 2.4 Variants

Three intro branches share everything after the intro (calibration MCQs →
transition → level test → results → plan). Only the intro differs:

| | Intro |
|---|---|
| V1 | Greeting → personalise-intro CTA |
| V2 | Greeting → context → "tell me about yourself" (spoken, graded) → capability reveal → personalise-intro |
| V3 | Greeting → "why do you want English" (spoken, graded **+ goal extracted**) → capability reveal + goal echo |

---

## 3. Render templates

What exists today, all inside the same chat-bubble frame:

| Template | Content |
|---|---|
| Plain text | Text, `whitespace-pre-line`, optional emoji |
| Text + CTA button | Bubble with a full-width bottom-border button |
| Text + bullets + CTA | `final` — bullet list above the button |
| MCQ card | Question + 2–4 option buttons in one card; locks on tap |
| Quiz bubble | Instruction (grey, 14px) + native-script sentence (white, **20px**) |
| Feedback card | Two-line diff card + "Feedback" label + "Explain" link |
| Results card | Score header + correct list + wrong/right diff pairs, generated from the live answer log |
| Grammar overview card | 3-dot strength meter per topic + metric rows + legend |
| 30-day plan widget | Week blocks, checkmarks, booster counts, secondary CTA stack |
| Loader beats | Single-line 2s auto-advance (`report-loading`, `grammar-loading`) |
| Sequenced loader | 6 lines revealed on a 14s timeline (`loader`) |
| Voice-reply bubble | Speaker icon only, for spoken level-test answers |

**Image+text and video+text templates do not exist yet** — see Gaps.

---

## 4. Rich text formatting

Formatting is semantic, not decorative — each colour means something:

| Token | Colour | Meaning |
|---|---|---|
| Body | `#f4f4f5` | Default AI text |
| Muted | `#8C94AE` | Secondary text, user echo bubbles, instructions |
| Error span | `#ff9904` | Wrong region in the user's original |
| Fixed span | `#75eabe` | Corrected region |
| Emphasis | `#3CDB9E` | Keyword highlight in copy, correct score, "Strong" |
| Warn | `#F97316` | Needs practice |
| Bad | `#EF4444` | Weak |
| Link | `#40b9f8` | CTA labels, "Explain" |
| Accent | `#75EABE` | Buttons, progress fill |
| Pink / Yellow | `#F472B6` / `#FACC15` | Words-spoken / time-spoken metrics |
| Surfaces | `#12151E`, `#1A1E2D`, `#2B3044`, `#333952` | Page, card, border, pill |

Sizes in play: **44px** (level display), **20px** (quiz sentence), **15px** (CTA),
14px (body), 12px (labels/metrics). Weight 700 for highlighted spans and scores.

Two highlight mechanisms — production should standardise on the first:

1. **Server-tagged spans** (`<e>` / `<c>`) — V3. Precise, model-controlled.
2. **Client word-diff** — V2. Token-level, can over-mark on reordering.

---

## 5. Localisation

- Register per language: `hi` (Hinglish) / `ta` (Tanglish), Roman script for display.
- **Every** copy field is a `{ hi, ta }` pair — line text, CTA labels, bullets, and
  each MCQ option independently.
- Selected by a single `language` prop → `pretestLang`.
- Template variables inside copy (occupation, goal) are interpolated per locale.
- Current debt: **12 `TODO TA` markers** — Tamil is stale where Hindi copy changed,
  and the V2/V3 intros are Hinglish-only (`ta` mirrors `hi`).
- Dual-representation rule from §1.7 applies to every localised line: native script
  to TTS, Roman to screen.

---

## 6. Avatar system

- Two interchangeable Rive rigs: `supernova.riv` (ViewModel-driven, single
  `visemes` number) and `realistic-female.riv` (**no ViewModel** — 16 numbered
  viseme inputs `100`–`118` as 0–100 blend weights, plus an `is_speaking` boolean
  that drives body/idle only and does **not** move the mouth).
- **Lip sync** is amplitude-driven: RMS off an `AnalyserNode` → 3-level hysteresis
  (`levelForAmp`, `MIN_HOLD_MS` 110) → viseme. Two audio paths: an external
  analyser (AudioBufferSource) or an `HTMLMediaElement` fallback. Measured 14 shape
  changes per utterance across closed/mid/open.
- Per-rig framing scale (`1.224` Nova, `0.8625` realistic-female), both anchored
  `center bottom`.
- **Geometry unit:** avatar box `326 × 240` + blur plate `360 × 260` (`#1A1E2D`,
  `blur(24px)`), sharing a top edge and horizontal centre.

### 6.1 Minimise states

| | Full | Minimised (0.4) |
|---|---|---|
| Box | 326 × 240 | 130.4 × 96 (rect) / **96 × 96** (circle) |
| Plate | 360 × 260 | 144 × 104 (rect) / **104 × 104** (circle) |
| Park | flush, top 0 | **16px** from right, **5px** from top |

Implementation constraints worth carrying forward:
- Both layers scale from **one** wrapper transform — scaling them separately lets
  rounding drift them apart.
- Circle mode narrows **layout width**, not the scale — `scale()` is uniform and
  can't change an aspect ratio.
- The canvas is pinned to the full box footprint and centred (not `w-full`), so
  narrowing **crops** instead of making Rive re-fit and shrink the avatar.
- The scale-down control is a **sibling** of the clipped box, not a child —
  otherwise the circular clip eats it, and it's the only way back to full size.
- It is **counter-scaled** to stay 16px on screen instead of collapsing to 9.6px.

### 6.2 Minimise triggers

1. **Manual** — the scale-down button, a persistent choice.
2. **Scroll** — reading back through the thread shrinks Nova out of the way.

Held as two independent flags OR'd together, so neither clobbers the other.
Scroll detection must distinguish **user drags from programmatic auto-scroll** —
`onScroll` alone cannot, and acting on a smooth auto-scroll's intermediate frames
makes the avatar flicker on every message. Solution: arm on real input gestures
(`wheel` / `touchmove` / `pointerdown` / `keydown`); leaving the bottom requires
that arming, arriving at the bottom always clears.

---

## 7. Chat + input mechanics

- Frame `360 × 800`; thread is `absolute inset-0` with `paddingTop: 256` so it
  scrolls **under** the avatar.
- Bottom-anchored via `mt-auto` on the inner wrapper — short threads sit at the
  bottom and grow upward. (`justify-end` would clip the top of an overflowing
  thread and make it unscrollable.)
- Auto-scroll to newest via `scrollIntoView({ behavior: "smooth" })`.
- Bubbles `max-w-[80%]` → **262.4px** at 360px frame; cards add `w-full min-w-[240px]`.
- Voice input: tap-to-record → `MediaRecorder` → STT → grade. Cancel and submit
  affordances; waveform from a live analyser.
- Motion: lightning-bolt sparkle on correct answers, progress shimmer sweep,
  typing dots, 260ms linear avatar scaling.

---

## 8. Gaps / not built yet

Ordered by how much they'd change the architecture.

1. **Image+text and video+text templates.** Only text/card templates exist. The
   `MsgInteractive` union and the script schema would both need a media variant
   (asset ref, aspect ratio, poster, caption, and a TTS rule for whether the
   caption is spoken).
2. **Narration is a single point of failure.** `onNarrationEnd` is the only thing
   that reveals a CTA or MCQ, so if TTS audio never starts (autoplay still locked,
   network failure) the flow stalls with no button and no error. Needs a timeout
   fallback that reveals controls regardless.
3. **Mic permission denial is silent.** `useMicRecorder` sets an error state that
   the screen never reads — a user who declines the prompt gets a dead end.
4. **Hardcoded content presented as personalised.** The grammar overview (topics
   and dot ratings), the speaking-score / words-spoken / time-spoken metrics, and
   the entire 30-day plan are static. Only the results card is generated from real
   answers.
5. **No typed input.** Every answer is spoken; there is no keyboard path, so STT
   errors are indistinguishable from user errors and testing needs a working mic.
6. **TTS model mismatch.** The route sends `sonic-english` while `AGENTS.md`
   mandates `sonic-2`; an English-only model reading Roman Hinglish is the likely
   cause of mispronunciation.
7. **Tamil is stale.** 12 `TODO TA` markers; V2/V3 intros are Hinglish-only.
8. **Two highlight mechanisms** (server spans vs client diff) should converge.
9. **Repeat-play lip sync.** `createMediaElementSource` throws if the element is
   already wired, so a repeat play can silently skip lip sync.
10. **Explain link is inert**, and the minimise icon doesn't swap to an expand
    glyph when minimised.
