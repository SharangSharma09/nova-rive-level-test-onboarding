import { GoogleGenerativeAI } from "@google/generative-ai";
import { transcribeWithSarvam } from "@/lib/sarvam-transcribe";
import { combinedPrompt } from "../prompts/combined";

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

  // Optional localized-answer language (Tamil/Hindi) for the /v3-* and /v4-* routes.
  // Absent for the English /v3 and /v4 widgets → behaves exactly as before.
  const langRaw = formData.get("lang");
  const lang = langRaw === "Tamil" || langRaw === "Hindi" ? langRaw : undefined;

  console.log("[v3] audio received —", Math.round(audio.size / 1024), "KB,", audio.type, lang ? `| lang: ${lang}` : "");

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

  // ── Step 2: Classify + respond in one LLM call ────────────────────────────
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite" });

  try {
    const result = await model.generateContent(combinedPrompt(transcription, lang));
    const text = stripFences(result.response.text().trim());
    console.log("[v3] LLM raw (first 200 chars):", text.slice(0, 200));

    const intent = extractTag(text, "intent") || "draft";
    const detectedLanguage = extractTag(text, "language") || "Hindi";
    console.log(`[v3] intent: ${intent} | language: ${detectedLanguage} | elapsed: ${Date.now() - start}ms`);

    if (intent === "draft") {
      const recommendation = extractTag(text, "recommendation") || "semi_formal";
      const casual = extractTag(text, "casual_text");
      const semiFormal = extractTag(text, "semi_formal_text");
      const formal = extractTag(text, "formal_text");
      return Response.json({ feature: "draft", transcription, detectedLanguage, recommendation, casual, semiFormal, formal });

    } else if (intent === "translate") {
      const sourceText = extractTag(text, "sourceText") || transcription;
      const translation = extractTag(text, "translation");
      return Response.json({ feature: "translate", transcription, detectedLanguage, sourceText, translation });

    } else if (intent === "grammar") {
      const grammarRaw = extractTag(text, "grammar");
      const grammarData = grammarRaw ? JSON.parse(grammarRaw) : {};
      return Response.json({ feature: "grammar", transcription, detectedLanguage, ...grammarData });

    } else if (intent === "meaning") {
      const phrase = extractTag(text, "phrase") || transcription;
      const meaning = extractTag(text, "meaning");
      const example = extractTag(text, "example");
      return Response.json({ feature: "meaning", transcription, detectedLanguage, phrase, meaning, example });

    } else if (intent === "qa") {
      const question = extractTag(text, "question") || transcription;
      const answer = extractTag(text, "answer");
      const answerEnglish = extractTag(text, "answer_english");
      return Response.json({ feature: "qa", transcription, detectedLanguage, question, answer, ...(answerEnglish ? { answerEnglish } : {}) });
    }

    // Graceful fallback — never error out on an unrecognized intent; treat it as Q&A.
    console.warn(`[v3] unrecognized intent "${intent}" — falling back to qa`);
    const question = extractTag(text, "question") || transcription;
    const answer = extractTag(text, "answer");
    const answerEnglish = extractTag(text, "answer_english");
    return Response.json({ feature: "qa", transcription, detectedLanguage, question, answer, ...(answerEnglish ? { answerEnglish } : {}) });
  } catch (e) {
    console.error("[v3] ✗ LLM error after", Date.now() - start, "ms:", e);
    return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
