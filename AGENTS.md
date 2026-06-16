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

# Onboarding flow (planned, not yet built)

Design plan + demo-video transcripts for the Nova / v5-tamil onboarding live in
[`docs/onboarding-plan.md`](docs/onboarding-plan.md). Intended flow:
`entry icon → /v5-tamil-onboarding → video → /v5-tamil`. Not implemented yet —
read the doc before building it.
