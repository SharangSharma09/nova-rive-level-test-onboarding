# Nova (v5-tamil) onboarding — design plan

> **Status: planned, not yet built.** This doc captures the design, the demo-video
> transcripts, and the open decisions so the flow can be implemented later. No code
> has been written for it.

## Context

`/v5-tamil` is a voice-first **"Nova"** widget that does two things:

1. **Draft** — speak Tamil → get a polished English message in 3 tones (Casual /
   Semi-formal / Formal) → insert into any app.
2. **Learn / doubt** — ask anything → word meaning, grammar check, translate, or a
   generic answer.

Onboarding today is **three standalone routes** reachable only by typing the URL,
loosely chained, with **no persistence**, **no replay**, and **no guidance** to
actually tap Nova once the user lands:

```
/v5-tamil-onboarding  →  /v5-tamil-onboarding-video  →  /v5-tamil
```

`/v5-tamil-outro` is orphaned (nothing links to it; the video already contains the
same outro card).

**Goal:** a coherent, discoverable onboarding entered by **tapping an icon**, that
walks the user through a short flow, **plays the demo video**, and **lands on the
live widget with first-use guidance** — positioning Nova as a quick way to *draft
English by speaking your mother tongue* and as a *quick learning tool* (words,
grammar, translate, any question).

## Confirmed flow

```
tap entry icon → /v5-tamil-onboarding (hook) → /v5-tamil-onboarding-video (Nova demo) → /v5-tamil (live widget + first-use coach-mark)
```

## Entry icon — OPEN DECISION (deferred)

Pick one when building:

- **(a) Nova bubble on `/v5-tamil-homescreen`** — a first-time tap on the floating
  Nova bubble launches onboarding; after onboarding, tapping it opens the widget
  normally.
- **(b) Separate launcher icon** on `/v5-tamil-homescreen`, distinct from the Nova
  bubble, linking to `/v5-tamil-onboarding`.
- **(c) Reusable launcher-icon component** (demoed on the home screen) meant to drop
  into the real product, linking to `/v5-tamil-onboarding`.

---

## Research: the two demo videos (screenshots + audio transcripts)

Frames were extracted with ffmpeg (contact sheets) and the audio was transcribed via
the project's Gemini key (`gemini-3.1-flash-lite`). To regenerate:

```bash
# Contact sheet of frames (grid)
ffmpeg -y -i <video> -vf "fps=1/2.5,scale=300:-1,tile=4x5" -frames:v 1 sheet.png

# Extract small mono audio, then POST to Gemini generateContent with
# inline_data { mime_type: "audio/mp3", data: <base64> } and a "transcribe verbatim" prompt
ffmpeg -y -i <video> -vn -ac 1 -ar 16000 -b:a 48k audio.mp3
```

### ① CDN "Nova" video — *currently used* by `/v5-tamil-onboarding-video`

- URL: `https://sn-main.b-cdn.net/system-uploads/scenario-data/58cbfc27-8978-43c3-b11f-2223abab3fad-final-copy.mp4`
- 50 s · 390×844 · 2.4 MB · Tamil voiceover · **covers BOTH modes** · ends on the
  card reproduced by `/v5-tamil-outro`.
- Screenshots show: iPhone home screen with the floating Nova bubble → WhatsApp chat
  with a recording pill → tone-card result → home screen → "Thinking…" (doubt mode) →
  outro card.

**Transcript (Tamil VO, translated sense in parentheses):**

> Meet Nova, your personal English tutor. Nova now lives on your home screen. It
> floats on any app. Ready to help you 24/7. Want to send a message or email in
> English? Simple — tap Nova and speak in Tamil. Nova instantly turns it into a
> perfect English message. Copy and send. Use it on WhatsApp, Instagram and 100+
> other apps. Not only that — ask Nova any doubt. Don't know a difficult word's
> meaning? E.g. tap Nova and ask "ironic". It explains simply so you understand. Not
> sure your English is correct? Tap Nova and say your sentence — Nova corrects it.
> The more you use it, the better your English gets. Nova helps your English get
> better every single day. Try this feature right now.

### ② Local "Superflow" video — `/public/onboarding-tamil.mp4` (unused)

- 47 s · 1080×1920 · 15 MB · Tamil voiceover · **draft mode only** · "Superflow"
  branding · tagline "Think it. Say it. Done."
- Screenshots show: "Works on any App / Tap any text field to start" → WhatsApp draft
  → Casual/Semi-formal/Formal tabs with **Insert** → app-icon grid → language grid
  (Tamil, Hindi, Telugu, Kannada, Bengali, Marathi, Assamese, Malayalam, Punjabi,
  Gujarati) → "Think it. Say it. Done." brand card.

**Transcript:**

> With Superflow you can type in English in any app. Open any app — when the widget
> appears, speak. "Hi, proposal almost ready, just finalizing a few details, we'll
> send it to the client by tomorrow." Superflow translates what you say into perfect
> English in seconds. Then tap Insert to paste the English text. Draft a LinkedIn
> post? Send an email? Use it easily in any app. Superflow helps you speak in any
> language. Just speak once, send. No extra steps. Think it. Say it. Done.

### Video choice (confirmed)

Feature the **Nova** video, **self-hosted** — download it into
`/public/nova-onboarding.mp4` to remove the external-CDN dependency. It is on-brand
(avatar = `nova.png`, the UI says "Nova"), covers both modes, and ends on the
matching outro. (The "Superflow" local video is older branding and draft-only.)

---

## Recommended polish (when implemented later)

- **Landing (`/v5-tamil-onboarding`)** — keep the hook + app-icon row; make **both**
  value props explicit: 🗣️ *draft English by speaking Tamil* · 💡 *word meaning /
  grammar / translate / any doubt*. CTA → video.
- **Video (`/v5-tamil-onboarding-video`)** — swap the CDN `src` for self-hosted
  `/public/nova-onboarding.mp4`; **muted autoplay + visible 🔊 unmute** (the Tamil VO
  is the payload); `playsInline loop`; poster frame; CTA "Try பண்ணுங்க →" →
  `/v5-tamil`.
- **Land (`/v5-tamil`)** — first-use **coach-mark**: dim/spotlight the
  `nova-pulse`-ing Nova button with a callout + animated 👆 ("Nova-வ tap பண்ணி
  தொடங்குங்க"); dismiss on tap. Couple via a `data-nova-button` attribute on the
  button in `FloatingWidgetV5.tsx` (1-line) + `getBoundingClientRect()`. The widget
  initialises at `{ x: 72% vw, y: 28% vh }` (`FloatingWidgetV5.tsx:199`).
- **Persistence** — `localStorage["nova_onboarding_v5_tamil_done"]` so onboarding
  shows once; the entry icon stays for replay. SSR-safe (gate on a `mounted` flag,
  wrap `localStorage` in try/catch), and `prefers-reduced-motion` aware.
- **Reuse, no new deps** — `APP_ICONS` + avatar/badge from
  `app/v5-tamil-onboarding/page.tsx`; `hand-tap` keyframes from
  `app/v5-tamil-outro/page.tsx`; `nova-pulse` from `app/globals.css`; the dark panel
  palette (bg `rgba(14,14,20,0.97)`, border `rgba(124,58,237,0.55)`, primary
  `#6d28d9`, accent `#4ade80`). Stack is React 19 / Next 16 / Tailwind 4 /
  react-icons; **no framer-motion** — animate with CSS keyframes per existing
  convention.

## Verification (for the future build)

1. `pnpm dev` (note the port). Read the relevant guide in
   `node_modules/next/dist/docs/` first — this Next.js has breaking changes.
2. Clear `localStorage` → tap the entry icon → onboarding → video (unmute → Tamil
   VO) → "Try பண்ணுங்க" → `/v5-tamil` → coach-mark spotlights the pulsing Nova
   button → tap opens mode-select.
3. Reload `/v5-tamil` → no re-show; the entry icon replays the flow.
4. Regression-check the widget's **draft** + **doubt** modes after the
   `data-nova-button` edit.
5. Capture proof: `node scripts/record-animation.mjs /v5-tamil <port>` (see
   [`recording-animations.md`](recording-animations.md)).
