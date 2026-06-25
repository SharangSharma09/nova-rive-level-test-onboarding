# Scene Map — superflow-demo

File: `app/superflow-demo/page.tsx`
Viewport: 540×960 | deviceScaleFactor: 2 → output 1080×1920
Total duration: 50s

```
const SCENE_DURATIONS = [5000, 12000, 9000, 3000, 8000, 8000, 5000];
```

| # | Duration | Start | End | Component | Key state | Key animations |
|---|----------|-------|-----|-----------|-----------|----------------|
| 1 | 5s | 0s | 5s | `Scene1` | static | `scroll-left` (icon rows), `fade-up` (text) |
| 2 | 12s | 5s | 17s | `Scene2` | showKeyboard, showSFBtn, showRecorder, tapHand, tapCheck | `slide-up` (keyboard), `pop-in` (SF btn, recorder), `tap` (hands) |
| 3 | 9s | 17s | 26s | `Scene3` | showCard, tapInsert | `pop-in` (generating pill), `slide-up` (response card), `tap` (insert hand) |
| 4 | 3s | 26s | 29s | `Scene4` | showSent | `fade-up` (sent bubble) |
| 5 | 8s | 29s | 37s | `Scene5` | step (interval 1200ms) | icon spotlight cycle (scale + glow) |
| 6 | 8s | 37s | 45s | `Scene6` | static | `btn-enter` staggered (80ms/button) |
| 7 | 5s | 45s | 50s | `Scene7` | static | `pop-in` (logo), `fade-up` (tagline) |

## Scene 2 internals (phone mockup)

Phone frame: 290×580px, border-radius 36px, border 3px #1a1a1a
- Status bar: 20px, #075E54
- Header: 48px, #075E54
- Chat area: flex:1, paddingBottom: showKeyboard ? 252 : 52
- Bottom bar: position absolute, bottom: showKeyboard ? 200 : 0, height 46px
- Keyboard: position absolute, bottom: 0, height 200px (showKeyboard only)

Key positions (from phone bottom, with keyboard visible):
- Keyboard: 0–200px
- Message bar: 200–246px
- SF button: bottom:252 (center at 272px)
- Recorder pill: bottom:252 (center at 272px)
- tapHand: bottom:254 (tip lands at 272px at tap moment)
- tapCheck: bottom:254 (same math)

## Scene 5 spotlight sequence

```js
const SPOTLIGHT_SEQ = [
  { row: 0, idx: 3 }, // gmail
  { row: 1, idx: 4 }, // linkedin
  { row: 2, idx: 5 }, // gmail (row 2)
  { row: 2, idx: 2 }, // linkedin (row 2)
  { row: 0, idx: 3 }, // gmail again
  { row: 1, idx: 4 }, // linkedin again
];
```

Row layout (each row has 6 icons, doubled for seamless scroll):
- Row 0: tumblr, whatsapp, facebook, gmail, messages, github
- Row 1: github, instagram, google, googledocs, linkedin, tumblr
- Row 2: pinterest, messages, linkedin, notes, facebook, gmail
