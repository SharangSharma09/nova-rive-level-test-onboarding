import { generateJsonWithGemini } from "@/lib/gemini";

export async function POST(request: Request) {
  console.log("[onboarding/grade-speaking] POST received");

  let body: { transcript: string };
  try {
    body = await request.json();
  } catch (e) {
    console.error("[onboarding/grade-speaking] ✗ invalid JSON", e);
    return Response.json({ error: "Bad request" }, { status: 400 });
  }

  const { transcript } = body;
  if (!transcript) {
    return Response.json({ error: "Missing transcript" }, { status: 400 });
  }

  // V2 onboarding demo: grade the user's spoken English in real time. Only
  // grammar gets fixed — their own words/phrasing/vocabulary stay intact so
  // the diff highlights read as a minimal correction, not a rewrite.
  // "correct" is returned explicitly (not inferred by string-diffing on the
  // client) so a trivial whitespace/punctuation difference from the model
  // doesn't get misread as a real mistake.
  const prompt = `You are a warm, encouraging English tutor correcting a beginner's spoken English grammar in real time.

The student said: "${transcript}"

Fix ONLY grammar mistakes (verb tense, prepositions, articles, subject-verb agreement, etc.). Keep their own words, vocabulary, and sentence structure otherwise unchanged — this should read as a light correction, not a rewrite.

Set "correct" to true if the sentence has no grammar mistakes (ignore minor punctuation/capitalization) — in that case "corrected" should just repeat the original sentence. Set "correct" to false if you made any grammar fix.

Reply ONLY with valid JSON in this exact format (no markdown, no extra text):
{"correct":true,"corrected":"..."}`;

  const parsed = await generateJsonWithGemini<{ correct: boolean; corrected: string }>(
    prompt,
    "onboarding/grade-speaking"
  );

  if (!parsed) {
    // Fail open — treat as correct rather than block the flow on a broken
    // API call (the client also has its own fallback for a network error).
    return Response.json({ correct: true, corrected: transcript });
  }

  return Response.json(parsed);
}
