import { GoogleGenerativeAI } from "@google/generative-ai";
import { transcribeWithSarvam } from "@/lib/sarvam-transcribe";
import { v5CombinedPrompt } from "../prompts/v5-combined";

function stripFences(text: string): string {
  return text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}

function extractTag(text: string, tag: string): string {
  const match = text.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
  return match ? match[1].trim() : "";
}

export async function POST(request: Request) {
  const start = Date.now();
  console.log("[v5-hindi] ── POST received ──────────────────────────");

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (e) {
    console.error("[v5-hindi] ✗ failed to parse formData", e);
    return Response.json({ error: "Could not process audio. Please try again." }, { status: 400 });
  }

  const audio = formData.get("audio");
  const mode = formData.get("mode") as string;

  if (!audio || !(audio instanceof Blob)) {
    console.error("[v5-hindi] ✗ missing audio");
    return Response.json({ error: "No audio received." }, { status: 400 });
  }

  if (mode !== "localize" && mode !== "doubt") {
    console.error("[v5-hindi] ✗ invalid mode:", mode);
    return Response.json({ error: "Invalid mode." }, { status: 400 });
  }

  console.log("[v5-hindi] audio received —", Math.round(audio.size / 1024), "KB, mode:", mode);

  // ── Step 1: STT (Sarvam) ───────────────────────────────────────────────────
  let transcription: string;
  try {
    transcription = await transcribeWithSarvam(audio, "v5-hindi");
    if (!transcription) {
      console.warn("[v5-hindi] ✗ audio unclear/empty");
      return Response.json({ error: "I couldn't catch that. Please try again." }, { status: 422 });
    }
    console.log("[v5-hindi] transcription:", transcription);
  } catch (e) {
    console.error("[v5-hindi] ✗ STT error:", e);
    return Response.json({ error: "Could not process audio. Please try again." }, { status: 500 });
  }

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite" });

  try {
    // ── Localize: same as v5 — produce English draft in 3 tones ───────────────
    if (mode === "localize") {
      const result = await model.generateContent(v5CombinedPrompt(transcription, "localize"));
      const text = result.response.text().trim();
      console.log("[v5-hindi] localize LLM raw (first 200):", text.slice(0, 200));

      const recommendation = extractTag(text, "recommendation") || "semi_formal_text";
      const casual = extractTag(text, "casual_text");
      const semiFormal = extractTag(text, "semi_formal_text");
      const formal = extractTag(text, "formal_text");

      if (!casual && !semiFormal && !formal) {
        console.error("[v5-hindi] ✗ localize: no tone tags found");
        return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
      }

      console.log(`[v5-hindi] localize done | ${Date.now() - start}ms`);
      return Response.json({ mode: "localize", transcription, recommendation, casual, semiFormal, formal });
    }

    // ── Doubt: one LLM call classifies the question and produces the response ──
    // For generic doubt it returns a Hindi answer + an English answer in the same call.
    const doubtResult = await model.generateContent(v5CombinedPrompt(transcription, "doubt", "Hindi"));
    const text = stripFences(doubtResult.response.text().trim());
    console.log("[v5-hindi] doubt LLM raw (first 200):", text.slice(0, 200));

    const intent = extractTag(text, "intent") || "doubt";
    const detectedLanguage = extractTag(text, "language") || "Hindi";
    console.log(`[v5-hindi] doubt intent: ${intent} | language: ${detectedLanguage} | elapsed: ${Date.now() - start}ms`);

    if (intent === "translate") {
      const sourceText = extractTag(text, "sourceText") || transcription;
      const translation = extractTag(text, "translation");
      return Response.json({ mode: "doubt", intent: "translate", transcription, detectedLanguage, sourceText, translation });
    }

    if (intent === "grammar") {
      const grammarRaw = extractTag(text, "grammar");
      let grammarData: Record<string, unknown> = {};
      try {
        grammarData = grammarRaw ? JSON.parse(grammarRaw) : {};
      } catch (e) {
        console.error("[v5-hindi] ✗ grammar JSON parse failed:", e, "raw:", grammarRaw.slice(0, 300));
      }
      return Response.json({ mode: "doubt", intent: "grammar", transcription, detectedLanguage, ...grammarData });
    }

    if (intent === "meaning") {
      const phrase = extractTag(text, "phrase") || transcription;
      const meaning = extractTag(text, "meaning");
      const example = extractTag(text, "example");
      return Response.json({ mode: "doubt", intent: "meaning", transcription, detectedLanguage, phrase, meaning, example });
    }

    // Generic doubt — Hindi answer + English answer (local/English toggle) from the single call.
    const answer = extractTag(text, "answer");
    if (!answer) {
      console.error("[v5-hindi] ✗ doubt: missing answer field");
      return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
    }
    const question = extractTag(text, "question") || transcription;
    const answerEnglish = extractTag(text, "answer_english");
    console.log(`[v5-hindi] doubt done | ${Date.now() - start}ms`);
    return Response.json({
      mode: "doubt",
      intent: "doubt",
      transcription,
      question,
      answer,
      ...(answerEnglish ? { answerEnglish } : {}),
    });

  } catch (e) {
    console.error("[v5-hindi] ✗ LLM error after", Date.now() - start, "ms:", e);
    return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
