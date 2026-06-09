import { GoogleGenerativeAI } from "@google/generative-ai";
import { transcribeAudio } from "@/lib/transcribe";
import { grammarPrompt } from "../prompts/grammar";
import { z } from "zod";

const ResponseSchema = z.object({
  isCorrect: z.boolean(),
  original: z.string(),
  corrected: z.string(),
  tip: z.string(),
});

type GrammarResult = z.infer<typeof ResponseSchema>;

const FALLBACK: GrammarResult = {
  isCorrect: false,
  original: "",
  corrected: "",
  tip: "Could not process audio. Please try again.",
};

function stripFences(text: string): string {
  return text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}

export async function POST(request: Request) {
  const start = Date.now();
  console.log("[grammar] ── POST received ──────────────────────────");

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (e) {
    console.error("[grammar] ✗ failed to parse formData", e);
    return Response.json(FALLBACK);
  }

  const audio = formData.get("audio");
  if (!audio || !(audio instanceof Blob)) {
    console.error("[grammar] ✗ missing audio");
    return Response.json(FALLBACK);
  }

  const arrayBuffer = await audio.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");
  const mimeType = audio.type || "audio/webm";
  console.log("[grammar] audio received —", Math.round(arrayBuffer.byteLength / 1024), "KB,", mimeType);

  let transcription: string;
  try {
    transcription = await transcribeAudio(base64, mimeType, "grammar");
    if (transcription === "") {
      return Response.json({ ...FALLBACK, tip: "I couldn't catch that clearly. Please try again." });
    }
  } catch (e) {
    console.error("[grammar] ✗ STT error:", e);
    return Response.json(FALLBACK);
  }

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite" });

    const result = await model.generateContent(grammarPrompt(transcription));
    const text = stripFences(result.response.text().trim());
    console.log("[grammar] LLM responded in", Date.now() - start, "ms");
    console.log("[grammar] raw response:", text.slice(0, 300));

    const parsed = ResponseSchema.safeParse(JSON.parse(text));
    if (!parsed.success) {
      console.error("[grammar] ✗ schema parse failed:", parsed.error.flatten());
      return Response.json(FALLBACK);
    }

    console.log("[grammar] ✓ isCorrect:", parsed.data.isCorrect, "| done in", Date.now() - start, "ms");
    return Response.json({ ...parsed.data, transcription });
  } catch (e) {
    console.error("[grammar] ✗ LLM error after", Date.now() - start, "ms:", e);
    return Response.json(FALLBACK);
  }
}
