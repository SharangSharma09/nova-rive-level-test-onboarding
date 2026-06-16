import { GoogleGenerativeAI } from "@google/generative-ai";

// Accepts an image or PDF (+ an optional typed question) and returns a plain-English
// explanation. Used by the third option on /v5-with-pdf-photo-upload.
// This route is isolated — it does NOT touch the audio /api/superflow/v5 flow.

const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15 MB — Gemini inline-data ceiling is ~20 MB.

const ACCEPTED_MIME = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
];

function buildPrompt(question: string, isPdf: boolean): string {
  const kind = isPdf ? "PDF document" : "photo";
  const ask = question
    ? `The user asked this specific question about the ${kind}:\n"${question}"\n\nAnswer that question directly using what you see in the ${kind}.`
    : `The user did not ask a specific question. Explain what this ${kind} is and what it means, as if to a curious friend who wants to understand it quickly.`;

  return `You are Nova, a friendly assistant that explains things people upload.

A user has uploaded a ${kind}. ${ask}

Rules for your answer:
- Be clear, warm, and easy to understand. No jargon unless you also explain it.
- Lead with the single most important takeaway, then add useful detail.
- If the ${kind} has text (a bill, form, letter, screenshot, notes, homework), read it and explain what it says and what the user should know or do.
- If it is a picture of an object, scene, or diagram, describe what it shows and explain anything noteworthy.
- Use short paragraphs or simple bullet points. Keep it tight — a few sentences to a short list, not an essay.
- If something is unclear or unreadable, say so plainly instead of guessing.

Respond with ONLY the explanation text. No preamble like "Sure" or "Here is". No markdown headers.`;
}

export async function POST(request: Request) {
  const start = Date.now();
  console.log("[v5-upload] ── POST received ──────────────────────────");

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (e) {
    console.error("[v5-upload] ✗ failed to parse formData", e);
    return Response.json({ error: "Could not read your file. Please try again." }, { status: 400 });
  }

  const file = formData.get("file");
  const question = ((formData.get("question") as string) || "").trim();

  if (!file || !(file instanceof Blob)) {
    console.error("[v5-upload] ✗ missing file");
    return Response.json({ error: "No file received." }, { status: 400 });
  }

  const mimeType = file.type || "application/octet-stream";
  if (!ACCEPTED_MIME.includes(mimeType)) {
    console.error("[v5-upload] ✗ unsupported type:", mimeType);
    return Response.json({ error: "Please upload a photo (JPG/PNG) or a PDF." }, { status: 415 });
  }

  if (file.size > MAX_FILE_BYTES) {
    console.error("[v5-upload] ✗ file too large:", file.size);
    return Response.json({ error: "That file is too big. Please keep it under 15 MB." }, { status: 413 });
  }

  const isPdf = mimeType === "application/pdf";
  console.log(`[v5-upload] file — ${Math.round(file.size / 1024)} KB, type: ${mimeType}, question: ${question ? `"${question}"` : "(none)"}`);

  // ── Convert to base64 inline data for Gemini ──────────────────────────────
  let base64: string;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    base64 = buffer.toString("base64");
  } catch (e) {
    console.error("[v5-upload] ✗ failed to read file bytes", e);
    return Response.json({ error: "Could not read your file. Please try again." }, { status: 400 });
  }

  // ── Gemini multimodal call ────────────────────────────────────────────────
  if (!process.env.GEMINI_API_KEY) {
    console.error("[v5-upload] ✗ GEMINI_API_KEY not set");
    return Response.json({ error: "Service not configured." }, { status: 500 });
  }

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite" });

  try {
    const result = await model.generateContent([
      { inlineData: { data: base64, mimeType } },
      { text: buildPrompt(question, isPdf) },
    ]);
    const answer = result.response.text().trim();

    if (!answer) {
      console.error("[v5-upload] ✗ empty answer from model");
      return Response.json({ error: "I couldn't read that one. Please try another file." }, { status: 502 });
    }

    console.log(`[v5-upload] ✓ done | ${answer.length} chars | elapsed: ${Date.now() - start}ms`);
    return Response.json({
      mode: "upload",
      question: question || "Explain this",
      answer,
    });
  } catch (e) {
    console.error("[v5-upload] ✗ LLM error after", Date.now() - start, "ms:", e);
    return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
