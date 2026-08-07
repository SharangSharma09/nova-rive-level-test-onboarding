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
    // Line 3 — Q1: Speaking
    {
      id: "q1-speaking",
      kind: "select",
      text: {
        hi: "🗣️ Chaliye pehla sawaal — kya aap aasaani se English mein 2-minute tak baat kar sakte hain?",
        // TODO TA: needs updated Tanglish to match the new HI phrasing ("Chaliye pehla sawaal —" prefix).
        ta: "🗣️ Neenga easy-a English la 2-minute conversation hold panna mudiyuma?",
      },
      options: [
        { hi: "👍 Haan, kabhi kabhi", ta: "👍 Aamaam, chila velaila" },
        {
          hi: "😅 Bol leta hoon, par bahut dheere aur bahut pauses ke saath",
          ta: "😅 Naan pesuven, aana romba slow-a, niraya pause vechundu pesuven.",
        },
        {
          hi: "🙈 Nahi, atak jaata hoon aur dimaag blank ho jaata hai",
          ta: "🙈 Illa, naan stuck aayiduven, mind blank-um aayiduchu.",
        },
      ],
    },
    // Line 4 — Q2: Grammar
    {
      id: "q2-grammar",
      kind: "select",
      text: {
        hi: "✍️ Doosra sawaal — English mein sentence banane mein aap kitne comfortable hai?",
        // TODO TA: needs updated Tanglish to match the new HI phrasing ("Doosra sawaal —" prefix).
        ta: "✍️ English la sentences pannradhula neenga evlo comfortable?",
      },
      options: [
        { hi: "✂️ Mere sentences chhote hote hain", ta: "✂️ Enoda sentences chinna-chinna-a irukkum." },
        {
          hi: "😅 Main lambe sentences bana sakta hoon, par bahut mistakes ke saath",
          ta: "😅 Naan periya sentences pannuven, aana niraya mistakes-oda.",
        },
        {
          hi: "🙂 Main lambe sentences bana sakta hoon, sirf kuch mistakes ke saath",
          ta: "🙂 Naan periya sentences pannuven, konjam mistakes-oda mattum.",
        },
      ],
    },
    // Line 5 — Assurance
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
    // Line 6 — Q3: Time commitment
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
    // Line 7 — Time reaction
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
