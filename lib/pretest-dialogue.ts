// Hardcoded pre-level-test dialogue script.
// Every line here is fixed copy — do not paraphrase or regenerate at runtime.
// Registers: "hi" = Hinglish (maps to the "hindi" language prop), "ta" = Tanglish (maps to "tamil").
//
// EMOJI RULE: emojis in these strings are VISUAL ONLY — they render in the chat
// bubble but must never reach text-to-speech. Callers must strip emoji from the
// string (see stripEmojisForTts below) before sending it to the TTS engine.

export type PretestRegister = "hi" | "ta";

export interface PretestOptionCopy {
  hi: string;
  ta: string;
}

type PretestLineBase = {
  id: string;
  text: { hi: string; ta: string };
};

export type PretestLine =
  | (PretestLineBase & {
      kind: "auto";
      preDelayMs?: number; // wait before showing the typing indicator
    })
  | (PretestLineBase & {
      kind: "cta";
      cta: { hi: string; ta: string };
    })
  | (PretestLineBase & {
      kind: "select";
      options: PretestOptionCopy[];
    })
  | (PretestLineBase & {
      kind: "select-plain";
      // identical option labels across languages
      options: string[];
    })
  | (PretestLineBase & {
      kind: "final";
      bullets: { hi: string; ta: string }[];
      cta: { hi: string; ta: string };
    });

// Strips emoji (including variation-selector/ZWJ sequences) before a string is
// sent to TTS. Display text (chat bubbles) should keep emoji intact — only the
// TTS input needs this applied.
const ZERO_WIDTH_JOINER = String.fromCodePoint(0x200d);
const VARIATION_SELECTOR_16 = String.fromCodePoint(0xfe0f);
const EMOJI_SEQUENCE_RE = new RegExp(
  `\\p{Extended_Pictographic}(${ZERO_WIDTH_JOINER}\\p{Extended_Pictographic})*${VARIATION_SELECTOR_16}?`,
  "gu",
);

export function stripEmojisForTts(text: string): string {
  return text
    .replace(EMOJI_SEQUENCE_RE, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// The 3 MCQ calibration questions (speaking/grammar/time), each followed by
// a short reaction line. Shared between V1's script and V2's — both scripts'
// personalise-intro line explicitly promises "kuch sawaal poochungi" before
// the level test, so these need to run in V2 too, not just in V1.
function buildCalibrationQuestions(): PretestLine[] {
  return [
    // Q1: Speaking
    {
      id: "q1-speaking",
      kind: "select",
      text: {
        hi: "🗣️ Chaliye pehla sawaal — kya aap aasaani se English mein 1-minute tak baat kar sakte hain?",
        // TODO TA: needs updated Tanglish to match the new HI phrasing ("Chaliye pehla sawaal —" prefix).
        ta: "🗣️ Neenga easy-a English la 1-minute conversation hold panna mudiyuma?",
      },
      options: [
        { hi: "👍 Haan, kabhi kabhi", ta: "👍 Aamaam, chila velaila" },
        {
          hi: "😅 Dheere aur ruk-ruk ke",
          // TODO TA: HI shortened — this Tanglish still carries the old, longer
          // wording ("romba slow-a, niraya pause vechundu pesuven").
          ta: "😅 Naan pesuven, aana romba slow-a, niraya pause vechundu pesuven.",
        },
        {
          hi: "🙈 Nahi, atak jaata hoon",
          // TODO TA: HI shortened — Tanglish still has the "mind blank" clause
          // the HI line no longer carries.
          ta: "🙈 Illa, naan stuck aayiduven, mind blank-um aayiduchu.",
        },
      ],
    },
    // Q2: Grammar
    {
      id: "q2-grammar",
      kind: "select",
      text: {
        hi: "✍️ Doosra sawaal — English mein sentence banane mein kitne comfortable ho?",
        // TODO TA: needs updated Tanglish to match the new HI phrasing ("Doosra sawaal —" prefix).
        ta: "✍️ English la sentences pannradhula neenga evlo comfortable?",
      },
      options: [
        {
          hi: "1️⃣ Chhote sentences banata hoon",
          // TODO TA: HI shortened and renumbered — Tanglish still uses the old
          // ✂️/😅/🙂 icons and longer wording.
          ta: "✂️ Enoda sentences chinna-chinna-a irukkum.",
        },
        {
          hi: "2️⃣ Lambe sentences, kaafi mistakes ke saath",
          ta: "😅 Naan periya sentences pannuven, aana niraya mistakes-oda.",
        },
        {
          hi: "3️⃣ Lambe sentences, thodi mistakes ke saath",
          ta: "🙂 Naan periya sentences pannuven, konjam mistakes-oda mattum.",
        },
      ],
    },
    // Assurance
    {
      id: "assurance",
      kind: "auto",
      text: {
        hi: "💪 Don't worry, main aapko English mein fluent hone mein poori help karungi.",
        // TODO TA: HI wording changed completely — this Tanglish line is a stale
        // placeholder (old meaning: "speaking & grammar both matter"). Needs a real
        // Tanglish translation of the new HI line above.
        ta: "💪 [TODO TA] Don't worry, main aapko English mein fluent hone mein poori help karungi.",
      },
      preDelayMs: 2000,
    },
    // Q3: Time commitment
    {
      id: "q3-time",
      kind: "select-plain",
      text: {
        hi: "⏱️ Teesra sawaal — aap English bolne ke liye kitna samay de sakte hain?",
        // TODO TA: needs updated Tanglish to match the new HI phrasing ("Teesra sawaal —" prefix).
        ta: "⏱️ Neenga English pesa evlo neram kudukka mudiyum?",
      },
      options: ["5 minutes", "10 minutes", "20 minutes", "30 minutes"],
    },
    // Time reaction
    {
      id: "time-reaction",
      kind: "auto",
      text: {
        hi: "📈 Aap jitna zyada time denge, utna aapki English behtar hogi.",
        // TODO TA: brand-new line, no prior Tanglish translation exists yet.
        ta: "📈 [TODO TA] Jitna zyada time denge, utna aapki English behtar hogi.",
      },
      preDelayMs: 0,
    },
  ];
}

// V2 onboarding intro — replaces V1's greeting/personalise-intro with a live
// speaking demo, then rejoins V1's calibration questions before the same
// transition into the level test. Everything from the level test onward is
// untouched/shared — this only swaps which script the pretest stage walks
// through. Reuses the existing "auto"/"cta"/"final" line kinds so it runs
// through the same runPretestLine machinery as V1, no new kind needed.
// Hinglish only for now (ta mirrors hi) — this flow doesn't have a Tanglish
// pass yet.
export function buildV2IntroScript(occupation: string, goal: string): PretestLine[] {
  return [
    // Line 1 — Nova intro
    {
      id: "v2-greeting",
      kind: "auto",
      text: {
        hi: "👋 Hi! Main hoon Nova AI. Aapki 24/7 English teacher.",
        ta: "👋 Hi! Main hoon Nova AI. Aapki 24/7 English teacher.",
      },
      preDelayMs: 0,
    },
    // Line 2a — Context (occupation/goal are template variables, not
    // hardcoded — see Props.v2Occupation / Props.v2Goal on the component).
    // Split from the question itself so they read as two separate messages.
    {
      id: "v2-context",
      kind: "auto",
      text: {
        hi: `Aapne bataya ki aap ${occupation}, aur ${goal} ke liye English improve karna chahte ho. Chaliye, pehle main sunti hoon aap English mein kaise bolte ho.`,
        ta: `Aapne bataya ki aap ${occupation}, aur ${goal} ke liye English improve karna chahte ho. Chaliye, pehle main sunti hoon aap English mein kaise bolte ho.`,
      },
      preDelayMs: 400,
    },
    // Line 2b — The actual question. Kind "cta" is reused purely for its
    // "wait after narration, don't auto-advance" behavior — no button
    // actually renders for this line (suppressed in NovaRiveLevelTest.tsx);
    // once narration ends the real tap-to-speak mic bar appears instead, and
    // the recorded answer is graded for real via /api/nova-onboarding/grade-speaking
    // (see handleV2AnswerRecorded).
    {
      id: "v2-question",
      kind: "cta",
      text: {
        hi: `Batao — agar interviewer poochhe "Tell me about yourself," aap English mein kaise bologe?`,
        ta: `Batao — agar interviewer poochhe "Tell me about yourself," aap English mein kaise bologe?`,
      },
      cta: { hi: "Tap to answer", ta: "Tap to answer" },
    },
    // Line 3 — Capability reveal, appears right after the feedback card
    {
      id: "v2-capability-reveal",
      kind: "auto",
      text: {
        hi: "Dekha uppar? Jab bhi aap English bolte ho, main turant aapki galtiyan sudhaar deti hoon — taaki aap har din thoda aur behtar bano.",
        ta: "Dekha uppar? Jab bhi aap English bolte ho, main turant aapki galtiyan sudhaar deti hoon — taaki aap har din thoda aur behtar bano.",
      },
      preDelayMs: 600,
    },
    // Line 4 — Personalisation intro. Sets up the calibration questions that
    // follow, so the MCQs arrive as part of a promised flow rather than out of
    // nowhere. Mirrors V1's "personalise-intro" line.
    {
      id: "v2-personalise-intro",
      kind: "cta",
      text: {
        hi: "Par pehle, mujhe thoda aur jaanna hai aapke baare mein — taaki aapka plan bilkul aapke hisaab se bane. Bas kuch sawaal aur ek chhota level test. Shuru karein?",
        ta: "Par pehle, mujhe thoda aur jaanna hai aapke baare mein — taaki aapka plan bilkul aapke hisaab se bane. Bas kuch sawaal aur ek chhota level test. Shuru karein?",
      },
      cta: {
        hi: "Yes, personalise my English course",
        ta: "Yes, personalise my English course",
      },
    },
    // Lines 5-9 — same 3 MCQ calibration questions (+ reaction lines) as V1,
    // so the personalise-intro line's "bas kuch sawaal" promise is fulfilled.
    ...buildCalibrationQuestions(),
    // Line 10 — Transition into the shared level-test flow. Reuses the "final"
    // kind purely for its CTA-triggers-stage-change behavior; no bullets.
    {
      id: "v2-transition",
      kind: "final",
      text: {
        hi: "✨ Ab main aapka ek chhota English level test loongi. Shuru karein?",
        ta: "✨ Ab main aapka ek chhota English level test loongi. Shuru karein?",
      },
      bullets: [],
      cta: { hi: "Let's start →", ta: "Let's start →" },
    },
  ];
}

export function buildPretestScript(sentenceCount: number): PretestLine[] {
  return [
    // Line 1 — Greeting
    {
      id: "greeting",
      kind: "auto",
      text: {
        hi: "👋 Hi! Main hoon Nova AI. Aapki 24/7 English teacher.",
        ta: "👋 Hi! Naan Nova AI. Ungaloda 24/7 English teacher.",
      },
      preDelayMs: 0,
    },
    // Line 2 — Personalisation intro
    {
      id: "personalise-intro",
      kind: "cta",
      text: {
        hi: "✨ Chaliye main aapka course plan personalise karungi — iske liye kuch sawaal poochungi aur ek chhota English level test loongi. Shuru karein?",
        ta: "✨ Ungaloda course plan-a naan personalise pannuren — konjam questions kekkuven, oru chinna English level test edukkuven, appo dhaan unga kaaga customised plan banikka mudiyum. Aarambikalama?",
      },
      cta: { hi: "Yes, personalise my English course", ta: "Yes, personalise my English course" },
    },
    // Lines 3-7 — the 3 MCQ calibration questions (+ reaction lines)
    ...buildCalibrationQuestions(),
    // Line 8 — Know your English level
    {
      id: "know-your-level",
      kind: "final",
      text: {
        hi: `🎯 Chaliye, ab main aapka English level pata karoongi. Iske liye aapse mai ${sentenceCount} chhote sawaal poochoongi, taaki aapke liye sahi 30-day plan bana sakoon.`,
        // TODO TA: HI wording changed again — needs updated Tanglish.
        ta: `🎯 [TODO TA] Chaliye, ab main aapka English level pata karti hoon. Iske liye aapse ${sentenceCount} chinna questions kekkuven, appo dhaan unga kaaga sariyaana 30-day plan-a banikka mudiyum.`,
      },
      bullets: [
        { hi: "Grammar & speaking test", ta: "Grammar matrum speaking test" },
        { hi: "Personalised 30-day plan", ta: "Unga kaaga customised 30-day plan" },
      ],
      cta: { hi: "Find my English level", ta: "Find my English level" },
    },
  ];
}
