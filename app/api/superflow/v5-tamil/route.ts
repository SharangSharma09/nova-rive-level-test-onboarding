import { GoogleGenerativeAI } from "@google/generative-ai";
import { transcribeWithSarvam } from "@/lib/sarvam-transcribe";
import { v5CombinedPrompt } from "../prompts/v5-combined";
import { tamilTranslatePrompt } from "../prompts/v5-tamil-translate";

function stripFences(text: string): string {
  return text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}

function extractTag(text: string, tag: string): string {
  const match = text.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
  return match ? match[1].trim() : "";
}

export async function POST(request: Request) {
  const start = Date.now();
  console.log("[v5-tamil] ── POST received ──────────────────────────");

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (e) {
    console.error("[v5-tamil] ✗ failed to parse formData", e);
    return Response.json({ error: "Could not process audio. Please try again." }, { status: 400 });
  }

  const audio = formData.get("audio");
  const mode = formData.get("mode") as string;

  if (!audio || !(audio instanceof Blob)) {
    console.error("[v5-tamil] ✗ missing audio");
    return Response.json({ error: "No audio received." }, { status: 400 });
  }

  if (mode !== "localize" && mode !== "doubt") {
    console.error("[v5-tamil] ✗ invalid mode:", mode);
    return Response.json({ error: "Invalid mode." }, { status: 400 });
  }

  console.log("[v5-tamil] audio received —", Math.round(audio.size / 1024), "KB, mode:", mode);

  // ── Step 1: STT (Sarvam) ───────────────────────────────────────────────────
  let transcription: string;
  try {
    transcription = await transcribeWithSarvam(audio, "v5-tamil");
    if (!transcription) {
      console.warn("[v5-tamil] ✗ audio unclear/empty");
      return Response.json({ error: "I couldn't catch that. Please try again." }, { status: 422 });
    }
    console.log("[v5-tamil] transcription:", transcription);
  } catch (e) {
    console.error("[v5-tamil] ✗ STT error:", e);
    return Response.json({ error: "Could not process audio. Please try again." }, { status: 500 });
  }

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite" });

  try {
    // ── Localize: same as v5 — produce English draft in 3 tones ───────────────
    if (mode === "localize") {
      const result = await model.generateContent(v5CombinedPrompt(transcription, "localize"));
      const text = result.response.text().trim();
      console.log("[v5-tamil] localize LLM raw (first 200):", text.slice(0, 200));

      const recommendation = extractTag(text, "recommendation") || "semi_formal_text";
      const casual = extractTag(text, "casual_text");
      const semiFormal = extractTag(text, "semi_formal_text");
      const formal = extractTag(text, "formal_text");

      if (!casual && !semiFormal && !formal) {
        console.error("[v5-tamil] ✗ localize: no tone tags found");
        return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
      }

      console.log(`[v5-tamil] localize done | ${Date.now() - start}ms`);
      return Response.json({ mode: "localize", transcription, recommendation, casual, semiFormal, formal });
    }

    // ── Doubt: get English answer, then translate to Tamil ────────────────────
    const doubtResult = await model.generateContent(v5CombinedPrompt(transcription, "doubt"));
    const doubtRaw = stripFences(doubtResult.response.text().trim());
    console.log("[v5-tamil] doubt LLM raw (first 200):", doubtRaw.slice(0, 200));

    let parsed: { question?: string; answer?: string };
    try {
      parsed = JSON.parse(doubtRaw);
    } catch (e) {
      console.error("[v5-tamil] ✗ doubt JSON parse failed:", e);
      return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
    }

    if (!parsed.answer) {
      console.error("[v5-tamil] ✗ doubt: missing answer field");
      return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
    }

    console.log(`[v5-tamil] doubt English answer ready | ${Date.now() - start}ms — translating to Tamil…`);

    // Translate the English answer to Tamil
    const translateResult = await model.generateContent(tamilTranslatePrompt(parsed.answer));
    const rawTranslated = translateResult.response.text().trim();
    const translatedAnswer = extractTag(rawTranslated, "translated_text") || rawTranslated;
    console.log(`[v5-tamil] Tamil answer: ${translatedAnswer.slice(0, 100)} | ${Date.now() - start}ms`);

    return Response.json({
      mode: "doubt",
      transcription,
      question: parsed.question || transcription,
      answer: translatedAnswer,
      answerEnglish: parsed.answer,
    });

  } catch (e) {
    console.error("[v5-tamil] ✗ LLM error after", Date.now() - start, "ms:", e);
    return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
