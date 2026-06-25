import { readFileSync } from "node:fs";
import path from "node:path";

export async function POST() {
  if (process.env.NODE_ENV !== "development") {
    return new Response("dev only", { status: 405 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return Response.json({ error: "GEMINI_API_KEY not set" }, { status: 500 });

  const videoPath = path.resolve(process.cwd(), ".context/recordings/superflow-demo-final.mp4");

  let videoData: Buffer;
  try {
    videoData = readFileSync(videoPath);
  } catch {
    return Response.json({ error: "Video file not found. Record and mix first." }, { status: 404 });
  }

  const base64 = videoData.toString("base64");
  const sizeMB = (videoData.byteLength / 1024 / 1024).toFixed(1);

  const QA_PROMPT = `You are a video QA engineer reviewing a 50-second product demo for Superflow (voice keyboard app).

7 scenes: (1) icon grid 0-5s, (2) WhatsApp mockup 5-17s, (3) response card 17-26s, (4) sent message 26-29s, (5) icon spotlight 29-37s, (6) language buttons 37-45s, (7) purple outro 45-50s.

Check ALL of:
1. HAND ALIGNMENT — 👆 tip on SF button (~9.5s), ✓ button (~15.5s), Insert button (~23s)
2. AUDIO OVERLAP — any two VO lines playing at once
3. AUDIO-VIDEO SYNC — each line matches what's on screen
4. VOLUME — consistent, no spikes (demo voice at 12s is intentionally slightly different)
5. ICON SPOTLIGHT — LinkedIn and Gmail highlighted in Scene 5
6. VIDEO CUTOFF — outro holds until last VO finishes
7. SCENE TRANSITIONS — smooth white flashes
8. UI CORRECTNESS — nothing cut off or misaligned
9. CLICK SOUNDS — subtle ticks at tap moments (9.5s, 15.5s, 23s)
10. CAPTIONS — if visible, are they styled correctly and synced?

Report: timestamp, severity (critical/major/minor), description, suggestion.
End with: overall score /10 and 2-sentence summary.`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [
              { inline_data: { mime_type: "video/mp4", data: base64 } },
              { text: QA_PROMPT },
            ],
          }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 8192 },
        }),
      }
    );

    if (!res.ok) {
      const err = await res.text();
      return Response.json({ error: err.slice(0, 500) }, { status: 500 });
    }

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    return Response.json({ report: text, sizeMB, model: "gemini-2.5-pro" });
  } catch (err: unknown) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
