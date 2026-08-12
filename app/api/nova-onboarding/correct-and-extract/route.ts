import { generateJsonWithGemini } from "@/lib/gemini";

export interface CorrectAndExtract {
  /** user's sentence(s) with error spans wrapped in <e>...</e> */
  original: string;
  /** corrected sentence(s) with fixed spans wrapped in <c>...</c> */
  corrected: string;
  /** short Hinglish phrase naming why they want to improve English */
  goal_theme: string;
  /** true only when a reason was clearly stated and is safe to echo back */
  goal_confident: boolean;
}

function buildPrompt(answer: string): string {
  return `You are Nova, a warm English tutor for Indian beginners. The user has just answered a question in English during onboarding, explaining why they want to improve their English. Do two jobs: (1) correct their English, and (2) extract their reason.

Correction rules:
- Fix all clear grammar errors (tense, articles, prepositions, word order).
- The answer may be 2-3 lines. Correct errors across all sentences, but keep the feedback selective — surface only the clearest 2-3 corrections. Do not highlight every tiny error; a wall of corrections is discouraging for a beginner.
- Upgrade phrasing to sound slightly more polished, but only one or two upgrades maximum. Never rewrite it into something the user wouldn't recognise as their own. Keep it at their level — no advanced vocabulary or long clauses.
- Keep the meaning identical. Never add facts they didn't say. No praise or filler inside the output.
- If the answer is already correct, offer one small natural upgrade but mark nothing as an error.

Goal extraction rules:
- goal_theme: a short 2-4 word Hinglish phrase naming WHY they want to improve English, drawn only from what they actually said (e.g. "apne kaam ke liye", "naukri ke liye", "bacchon ke saath baat karne ke liye", "confidence ke liye"). Render their intent in clean Hinglish — do NOT parrot back their broken words, and do NOT invent a reason they didn't state.
- goal_confident: boolean. true only if they clearly stated a reason you can safely echo back. false if the answer is too short, off-topic, unclear, or contains no real reason.
- Restating the question is NOT a reason. "I want to learn English", "I want to improve my English", "English is important" and similar contain no reason — set goal_confident false and goal_theme "" for these.
- Before setting goal_confident true, check you can point to specific words in their answer naming a purpose: a person (boss, daughter), a place or situation (office, interview, travel), or an outcome (confidence, promotion). If you cannot, set it false.
- When in doubt, set it false. Echoing back a goal the user did not state is far worse than not naming one.

The user said: "${answer}"

Return ONLY valid JSON, no other text, no markdown fences, in this exact shape:
{"original":"user's sentence(s) with error spans wrapped in <e>...</e>","corrected":"corrected sentence(s) with fixed spans wrapped in <c>...</c>","goal_theme":"short hinglish phrase","goal_confident":true}`;
}

/**
 * Fallback used whenever the model call or the parse fails. It echoes the
 * user's own words back untagged and reports no goal, so the flow always
 * continues but never shows corrections the user didn't get, and never lets
 * Message 3 name a reason nobody verified.
 */
function fallbackFor(answer: string): CorrectAndExtract {
  return { original: answer, corrected: answer, goal_theme: "", goal_confident: false };
}

export async function POST(request: Request) {
  console.log("[onboarding/correct-and-extract] POST received");

  let body: { answer?: string };
  try {
    body = await request.json();
  } catch (e) {
    console.error("[onboarding/correct-and-extract] ✗ invalid JSON", e);
    return Response.json({ error: "Bad request" }, { status: 400 });
  }

  const answer = (body.answer ?? "").trim();
  if (!answer) {
    return Response.json({ error: "Missing answer" }, { status: 400 });
  }

  const parsed = await generateJsonWithGemini<Partial<CorrectAndExtract>>(
    buildPrompt(answer),
    "onboarding/correct-and-extract"
  );

  if (!parsed || typeof parsed.original !== "string" || typeof parsed.corrected !== "string") {
    return Response.json(fallbackFor(answer));
  }

  // goal_theme is only honoured alongside an explicit goal_confident === true,
  // so a model that returns one without the other can't smuggle in a guess.
  const confident = parsed.goal_confident === true && Boolean(parsed.goal_theme?.trim());

  return Response.json({
    original: parsed.original,
    corrected: parsed.corrected,
    goal_theme: confident ? parsed.goal_theme!.trim() : "",
    goal_confident: confident,
  } satisfies CorrectAndExtract);
}
