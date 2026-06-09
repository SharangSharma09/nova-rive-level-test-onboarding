import { GoogleGenerativeAI } from "@google/generative-ai";
import { transcribeAudio } from "@/lib/transcribe";
import { meaningPrompt } from "../prompts/meaning";

function stripFences(text: string): string {
  return text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}

export async function POST(request: Request) {
  const start = Date.now();
  console.log("[meaning] ── POST received ──────────────────────────");

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (e) {
    console.error("[meaning] ✗ failed to parse formData", e);
    return Response.json({ meaning: "Could not process audio. Please try again." });
  }

  const audio = formData.get("audio");
  const language = (formData.get("language") as string | null) ?? "Hindi";

  if (!audio || !(audio instanceof Blob)) {
    console.error("[meaning] ✗ missing audio");
    return Response.json({ meaning: "Could not process audio. Please try again." });
  }

  const arrayBuffer = await audio.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");
  const mimeType = audio.type || "audio/webm";
  console.log("[meaning] audio received —", Math.round(arrayBuffer.byteLength / 1024), "KB | language:", language);

  let transcription: string;
  try {
    transcription = await transcribeAudio(base64, mimeType, "meaning", language);
    if (transcription === "") {
      return Response.json({ meaning: "Audio unclear. Please try again." });
    }
  } catch (e) {
    console.error("[meaning] ✗ STT error:", e);
    return Response.json({ meaning: "Could not process audio. Please try again." });
  }

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite" });

    const result = await model.generateContent(meaningPrompt(transcription, language));
    const meaning = stripFences(result.response.text().trim());
    console.log("[meaning] ✓ done in", Date.now() - start, "ms | meaning:", meaning.slice(0, 100));
    return Response.json({ meaning, transcription });
  } catch (e) {
    console.error("[meaning] ✗ LLM error after", Date.now() - start, "ms:", e);
    return Response.json({ meaning: "Could not process audio. Please try again." });
  }
}
