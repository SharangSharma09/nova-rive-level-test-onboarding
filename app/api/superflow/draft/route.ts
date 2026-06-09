import { GoogleGenerativeAI } from "@google/generative-ai";
import { transcribeAudio } from "@/lib/transcribe";
import { draftPrompt } from "../prompts/draft";

const FALLBACK = {
  recommendation: "semi_formal",
  casual: "Could not process audio. Please try again.",
  semiFormal: "Could not process audio. Please try again.",
  formal: "Could not process audio. Please try again.",
};

function stripFences(text: string): string {
  return text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}

function extractTag(text: string, tag: string): string {
  const match = text.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
  return match ? match[1].trim() : "";
}

export async function POST(request: Request) {
  const start = Date.now();
  console.log("[draft] ── POST received ──────────────────────────");

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (e) {
    console.error("[draft] ✗ failed to parse formData", e);
    return Response.json(FALLBACK);
  }

  const audio = formData.get("audio");
  const language = (formData.get("language") as string | null) ?? "Hindi";

  if (!audio || !(audio instanceof Blob)) {
    console.error("[draft] ✗ missing audio");
    return Response.json(FALLBACK);
  }

  const arrayBuffer = await audio.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");
  const mimeType = audio.type || "audio/webm";
  console.log("[draft] audio received —", Math.round(arrayBuffer.byteLength / 1024), "KB,", mimeType, "| language:", language);

  let transcription: string;
  try {
    transcription = await transcribeAudio(base64, mimeType, "draft", language);
    if (transcription === "") {
      console.warn("[draft] ✗ audio unclear");
      return Response.json(FALLBACK);
    }
  } catch (e) {
    console.error("[draft] ✗ STT error:", e);
    return Response.json(FALLBACK);
  }

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite" });

    const result = await model.generateContent(draftPrompt(transcription));

    const text = stripFences(result.response.text().trim());
    console.log("[draft] LLM responded in", Date.now() - start, "ms");
    console.log("[draft] raw response:", text.slice(0, 400));

    const recommendation = extractTag(text, "recommendation") || "semi_formal";
    const casual = extractTag(text, "casual_text");
    const semiFormal = extractTag(text, "semi_formal_text");
    const formal = extractTag(text, "formal_text");

    if (!casual && !semiFormal && !formal) {
      console.error("[draft] ✗ no tone tags found in response");
      return Response.json(FALLBACK);
    }

    console.log("[draft] ✓ recommendation:", recommendation, "| done in", Date.now() - start, "ms");
    return Response.json({ recommendation, casual, semiFormal, formal, transcription });
  } catch (e) {
    console.error("[draft] ✗ LLM error after", Date.now() - start, "ms:", e);
    return Response.json(FALLBACK);
  }
}
