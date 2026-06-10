import { GoogleGenerativeAI } from "@google/generative-ai";
import { transcribeWithSarvam } from "@/lib/sarvam-transcribe";
import { classifierPrompt } from "../prompts/classifier";
import { draftPrompt } from "../prompts/draft";
import { translatePrompt } from "../prompts/translate";
import { grammarPrompt } from "../prompts/grammar";
import { meaningPrompt } from "../prompts/meaning";
import { z } from "zod";

type Intent = "draft" | "translate" | "grammar" | "meaning";

const ClassifierSchema = z.object({
  intent: z.enum(["draft", "translate", "grammar", "meaning"]),
  detectedLanguage: z.string(),
  confidence: z.enum(["high", "low"]),
});

function stripFences(text: string): string {
  return text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}

function extractTag(text: string, tag: string): string {
  const match = text.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
  return match ? match[1].trim() : "";
}

export async function POST(request: Request) {
  const start = Date.now();
  console.log("[v3] ── POST received ──────────────────────────");

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (e) {
    console.error("[v3] ✗ failed to parse formData", e);
    return Response.json({ error: "Could not process audio. Please try again." }, { status: 400 });
  }

  const audio = formData.get("audio");
  if (!audio || !(audio instanceof Blob)) {
    console.error("[v3] ✗ missing audio");
    return Response.json({ error: "No audio received." }, { status: 400 });
  }

  console.log("[v3] audio received —", Math.round(audio.size / 1024), "KB,", audio.type);

  // ── Step 1: STT (Sarvam) ───────────────────────────────────────────────────
  let transcription: string;
  try {
    transcription = await transcribeWithSarvam(audio, "v3");
    if (!transcription) {
      console.warn("[v3] ✗ audio unclear/empty");
      return Response.json({ error: "I couldn't catch that. Please try again." }, { status: 422 });
    }
  } catch (e) {
    console.error("[v3] ✗ STT error:", e);
    return Response.json({ error: "Could not process audio. Please try again." }, { status: 500 });
  }

  // ── Step 2: Classify ───────────────────────────────────────────────────────
  let intent: Intent = "draft";
  let detectedLanguage = "Hindi";

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite" });
    const classifyResult = await model.generateContent(classifierPrompt(transcription));
    const classifyText = stripFences(classifyResult.response.text().trim());
    console.log("[v3] classifier raw:", classifyText);

    const parsed = ClassifierSchema.safeParse(JSON.parse(classifyText));
    if (parsed.success) {
      if (parsed.data.confidence === "low") {
        intent = "draft";
        console.log("[v3] low confidence → defaulting to draft");
      } else {
        intent = parsed.data.intent;
      }
      detectedLanguage = parsed.data.detectedLanguage || "Hindi";
      console.log(`[v3] classified as: ${intent} | language: ${detectedLanguage} | confidence: ${parsed.data.confidence}`);
    } else {
      console.warn("[v3] classifier parse failed, defaulting to draft:", parsed.error.flatten());
    }
  } catch (e) {
    console.error("[v3] ✗ classifier error, defaulting to draft:", e);
  }

  // ── Step 3: LLM ────────────────────────────────────────────────────────────
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite" });

  try {
    if (intent === "draft") {
      const result = await model.generateContent(draftPrompt(transcription));
      const text = stripFences(result.response.text().trim());
      console.log("[v3:draft] LLM responded in", Date.now() - start, "ms");

      const recommendation = extractTag(text, "recommendation") || "semi_formal";
      const casual = extractTag(text, "casual_text");
      const semiFormal = extractTag(text, "semi_formal_text");
      const formal = extractTag(text, "formal_text");

      return Response.json({ feature: "draft", transcription, detectedLanguage, recommendation, casual, semiFormal, formal });

    } else if (intent === "translate") {
      const result = await model.generateContent(translatePrompt(transcription, detectedLanguage));
      const translation = stripFences(result.response.text().trim());
      console.log("[v3:translate] done in", Date.now() - start, "ms");
      return Response.json({ feature: "translate", transcription, detectedLanguage, translation });

    } else if (intent === "grammar") {
      const result = await model.generateContent(grammarPrompt(transcription));
      const text = stripFences(result.response.text().trim());
      console.log("[v3:grammar] done in", Date.now() - start, "ms");

      const grammarData = JSON.parse(text);
      return Response.json({ feature: "grammar", transcription, detectedLanguage, ...grammarData });

    } else if (intent === "meaning") {
      const result = await model.generateContent(meaningPrompt(transcription, detectedLanguage));
      const meaning = stripFences(result.response.text().trim());
      console.log("[v3:meaning] done in", Date.now() - start, "ms");
      return Response.json({ feature: "meaning", transcription, detectedLanguage, meaning });
    }

    return Response.json({ error: "Unknown intent." }, { status: 500 });
  } catch (e) {
    console.error("[v3] ✗ LLM error after", Date.now() - start, "ms:", e);
    return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
