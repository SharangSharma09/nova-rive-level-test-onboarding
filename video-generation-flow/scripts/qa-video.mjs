// QA a demo video using Gemini 2.5 Flash (video understanding).
//
// Usage:
//   node scripts/qa-video.mjs [videoPath]
//   e.g. node scripts/qa-video.mjs .context/recordings/superflow-demo-final.mp4
//
// Requires: GEMINI_API_KEY env var

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const VIDEO_PATH = process.argv[2] || ".context/recordings/superflow-demo-final.mp4";
const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = "gemini-2.5-flash";

if (!API_KEY) { console.error("GEMINI_API_KEY not set"); process.exit(1); }

const QA_PROMPT = `You are a video QA engineer reviewing a short product demo video for a voice keyboard app called Superflow. The video is ~50 seconds and shows:

Scene 1 (0-5s): App icons grid scrolling, "Works on any App" text
Scene 2 (5-17s): WhatsApp phone mockup, keyboard opens, Superflow button appears, hand taps it, voice recorder pill shows with waveform, hand taps checkmark
Scene 3 (17-26s): "Generating your response" pill, then response card slides up with tone pills (Casual/Semi formal/Formal) and "Insert ↵" button, hand taps Insert
Scene 4 (26-29s): Generated text appears as a sent WhatsApp bubble
Scene 5 (29-37s): App icons grid with individual icon spotlight (LinkedIn and Gmail should be highlighted)
Scene 6 (37-45s): Language selector buttons (Tamil, Hindi, Telugu, etc.) blur in with staggered animation
Scene 7 (45-50s): Purple brand outro — Superflow logo + "Think it. Say it. Done."

VOICEOVER SCRIPT (Tamil/Tanglish):
- 1s: "Superflow மூலமா நீங்க எந்த App-ல வேணாலும் English-ல type பண்ணலாம்"
- 5.8s: "எந்த App-னாலும் open பண்ணுங்க"
- 9s: "Screen-ல widget தெரிஞ்சதும் அதுல பேசுங்க"
- 12.2s: (demo voice) "ஹாய் proposal almost ready..."
- 19.2s: "Superflow நீங்க பேசுறத just சில seconds-ல perfect English-ஆ translate பண்ணிடும்"
- 23.2s: "அப்புறம் Insert button-ல tap பண்ணுங்க"
- 30.2s: "LinkedIn-ல post draft பண்ணனுமா?"
- 34.5s: "நீங்க இதை எந்த App-ல வேணும்னாலும் use பண்ணிக்கலாம்"
- 38.2s: "Superflow உங்களுக்கு எந்த language-ல வேணும்னாலும் help பண்ணும்"
- 41.8s: "Just ஒரு தடவை பேசுங்க"
- 44.4s: "எந்த extra steps-உம் இல்ல"
- 45.8s: "யோசிங்க, சொல்லுங்க, வேலை done"

Please review the video and flag ALL of the following issues:

1. HAND EMOJI ALIGNMENT: Is the pointing hand (👆) tip landing on the correct button (SF button, ✓ button, Insert button)? Or is it clicking empty space?
2. AUDIO OVERLAP: Do any two voiceover lines overlap each other? Identify the timestamps.
3. AUDIO-VIDEO SYNC: Does each voiceover line match what is visually happening on screen at that moment?
4. VOLUME CONSISTENCY: Does the volume stay consistent, or are there sudden spikes/drops?
5. ICON SPOTLIGHT: In Scene 5, does the spotlight pulse correctly highlight LinkedIn and Gmail icons specifically?
6. VIDEO CUTOFF: Does Scene 7 (the purple outro) play fully until the voiceover finishes, or does it cut off early?
7. SCENE TRANSITIONS: Are scene transitions (white flash) smooth and correctly timed?
8. UI CORRECTNESS: Are any UI elements cut off, misaligned, or overlapping incorrectly?
9. CLICK SOUNDS: Are there subtle click sounds when the hand taps each button?
10. OTHER: Any other visual or audio quality issues?

For each issue found, report:
- TIMESTAMP: when it occurs (in seconds)
- SEVERITY: critical / major / minor
- DESCRIPTION: exactly what is wrong
- SUGGESTION: how to fix it

Also give an overall quality score from 1-10 and a short summary.`;

async function main() {
  console.log("[qa-video] Loading video:", VIDEO_PATH);
  const videoData = readFileSync(VIDEO_PATH);
  const base64 = videoData.toString("base64");
  const fileSizeMB = (videoData.byteLength / 1024 / 1024).toFixed(1);
  console.log(`[qa-video] Video size: ${fileSizeMB}MB — sending to Gemini ${MODEL}...`);

  const body = {
    contents: [{
      parts: [
        {
          inline_data: {
            mime_type: "video/mp4",
            data: base64,
          },
        },
        { text: QA_PROMPT },
      ],
    }],
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 8192,
    },
  };

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    console.error("[qa-video] Gemini API error:", res.status, err.slice(0, 500));
    process.exit(1);
  }

  const data = await res.json();

  if (data.error) {
    console.error("[qa-video] API error:", JSON.stringify(data.error));
    process.exit(1);
  }

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    console.error("[qa-video] No text in response:", JSON.stringify(data).slice(0, 300));
    process.exit(1);
  }

  console.log("\n" + "=".repeat(60));
  console.log("GEMINI VIDEO QA REPORT");
  console.log("=".repeat(60));
  console.log(text);
  console.log("=".repeat(60));

  // Save report to file
  const reportPath = path.resolve(".context/qa-report.md");
  const report = `# Video QA Report\n\nVideo: ${VIDEO_PATH}\nModel: ${MODEL}\n\n${text}`;
  writeFileSync(reportPath, report);
  console.log(`\n[qa-video] Report saved to ${reportPath}`);
}

main().catch(err => {
  console.error("[qa-video] Error:", err);
  process.exit(1);
});
