import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function POST(request: Request) {
  console.log("[level-test/evaluate] POST received");

  let body: { sentence: string; language: string; userTranslation: string; expectedTranslation: string };
  try {
    body = await request.json();
  } catch (e) {
    console.error("[level-test/evaluate] ✗ invalid JSON", e);
    return Response.json({ error: "Bad request" }, { status: 400 });
  }

  const { sentence, language, userTranslation, expectedTranslation } = body;
  if (!sentence || !userTranslation) {
    return Response.json({ error: "Missing fields" }, { status: 400 });
  }

  const prompt = `You are an English language teacher evaluating a student's translation exercise.

The student was shown this sentence in ${language}:
"${sentence}"

The expected English translation is: "${expectedTranslation}"

The student said: "${userTranslation}"

Evaluate if the student's translation conveys the same meaning as the expected translation. Minor grammar imperfections are acceptable as long as the meaning is correct.

Reply ONLY with valid JSON in this exact format (no markdown, no extra text):
{"correct":true,"feedback":"Great job! That's exactly right.","hint":"Try focusing on the verb tense."}

If correct is true, write an encouraging feedback message. If correct is false, write a gentle hint that helps them without giving away the answer. Keep feedback and hint under 20 words each.`;

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const result = await model.generateContent(prompt);
    const raw = result.response.text().trim();
    console.log("[level-test/evaluate] Gemini raw:", raw.slice(0, 200));

    const cleaned = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const parsed = JSON.parse(cleaned) as { correct: boolean; feedback: string; hint: string };
    return Response.json(parsed);
  } catch (e) {
    console.error("[level-test/evaluate] ✗ Gemini error or JSON parse failed", e);
    return Response.json({
      correct: false,
      feedback: "Hmm, not quite. Give it another try.",
      hint: "Think about the time when the action happens.",
    });
  }
}
