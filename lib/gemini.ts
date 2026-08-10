// Requires GEMINI_API_KEY in .env.local
//
// Calls the Gemini REST API directly rather than through @google/generative-ai.
// The installed SDK (v0.24.1, Google's deprecated legacy package) has no
// `thinkingConfig` field on GenerationConfig, and gemini-2.5-flash *thinks by
// default* — measured at 3.8-6.2s and 574-976 reasoning tokens to produce a
// ~35-token JSON verdict. Both callers are short grading prompts sitting on the
// user's critical path (the "Checking..." card waits on them), so thinking is
// disabled outright, which takes these calls to ~1s with no accuracy loss.

const MODEL = "gemini-2.5-flash";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

/**
 * Sends `prompt` to Gemini and parses the reply as JSON. Returns null if the
 * request or the parse fails — callers decide their own fallback, since the
 * two graders fail in opposite directions (one fails open, one fails closed).
 */
export async function generateJsonWithGemini<T>(
  prompt: string,
  label: string
): Promise<T | null> {
  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "x-goog-api-key": process.env.GEMINI_API_KEY!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          thinkingConfig: { thinkingBudget: 0 },
          // Makes Gemini emit bare JSON, so no ```json fences to strip.
          responseMimeType: "application/json",
        },
      }),
    });
  } catch (e) {
    console.error(`[${label}] ✗ Gemini request failed`, e);
    return null;
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    console.error(`[${label}] ✗ Gemini error ${res.status}:`, detail.slice(0, 200));
    return null;
  }

  try {
    const json = await res.json();
    const raw: string = json.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    console.log(`[${label}] Gemini raw:`, raw.slice(0, 200));
    return JSON.parse(raw.trim()) as T;
  } catch (e) {
    console.error(`[${label}] ✗ Gemini JSON parse failed`, e);
    return null;
  }
}
