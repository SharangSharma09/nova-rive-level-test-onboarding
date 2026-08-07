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

  // The level test asks questions one after another with no feedback shown or
  // spoken to the user — this endpoint only scores correctness silently for
  // the results screen, so the prompt asks for nothing beyond that.
  const prompt = `You are evaluating a student's translation exercise for scoring purposes only. This score is not shown to the student.

The student was shown this sentence in ${language}:
"${sentence}"

The expected English translation is: "${expectedTranslation}"

The student said: "${userTranslation}"

Evaluate if the student's translation conveys the same meaning as the expected translation. Minor grammar imperfections are acceptable as long as the meaning is correct.

Reply ONLY with valid JSON in this exact format (no markdown, no extra text):
{"correct":true}`;

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const result = await model.generateContent(prompt);
    const raw = result.response.text().trim();
    console.log("[level-test/evaluate] Gemini raw:", raw.slice(0, 200));

    const cleaned = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const parsed = JSON.parse(cleaned) as { correct: boolean };
    return Response.json(parsed);
  } catch (e) {
    console.error("[level-test/evaluate] ✗ Gemini error or JSON parse failed", e);
    return Response.json({ correct: false });
  }
}
