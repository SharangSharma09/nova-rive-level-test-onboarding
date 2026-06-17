// Copy + config for the Nova onboarding flow (3 text screens + 1 video).
// Shared by all six routes: /v{3,4,5}-{tamil,hindi}-onboarding.
// Each text screen is a single left-aligned title; its text is also spoken via
// Cartesia TTS when the screen shows (see components/NovaOnboarding.tsx).
// English nouns stay in English; the rest is in native script (Tanglish / Hinglish),
// colloquial spoken register — see superflow-uiux/superflow-native-language-prompt.md.

export type OnboardingScreen = {
  text: string; // the screen's single title line (left-aligned, native script)
  cta: string; // button label (kept in English)
};

// Current CDN demo video (Tamil voiceover) — reused for all six per product decision.
export const ONBOARDING_VIDEO_URL =
  "https://sn-main.b-cdn.net/system-uploads/scenario-data/58cbfc27-8978-43c3-b11f-2223abab3fad-final-copy.mp4";

export const VIDEO_CTA = "Try it now";

// English source (canonical structure) — kept for reference:
// S1 "Meet the Nova widget — your 24/7 personal English tutor that helps with your day-to-day English needs."
// S2 "Whenever you need English-related help — like sending someone a message in English — you can use this."
// S3 "This way every English need of yours gets solved, and you keep learning English along the way."

export const TAMIL_SCREENS: OnboardingScreen[] = [
  {
    text: "Nova widget-ஐ meet பண்ணுங்க - உங்க 24/7 personal English tutor, உங்க day-to-day English needs-க்கு help பண்ணும்.",
    cta: "Continue",
  },
  {
    text: "நீங்க English-ல Message அனுப்பனுமா? நீங்க இத use பண்ணி தமிழ்-ல பேசி English Message அனுப்பலாம்.",
    cta: "Continue",
  },
  {
    text: "உங்க எல்லா English needs-உம் solve ஆகும், கூடவே நீங்க English-ah learn-உம் பண்ணிட்டு இருப்பீங்க.",
    cta: "See how it works",
  },
];

export const HINDI_SCREENS: OnboardingScreen[] = [
  {
    text: "मिलिए Nova widget से — आपका 24/7 personal English tutor, जो आपकी day-to-day English needs handle करता है।",
    cta: "Continue",
  },
  {
    text: "जब भी आपको English-related कोई help चाहिए — जैसे किसी को English में message भेजना है — तो आप इसे use कर सकते हैं।",
    cta: "Continue",
  },
  {
    text: "इस तरह आपकी English की हर ज़रूरत भी पूरी होती है, और आप साथ-साथ सीखते भी रहते हैं।",
    cta: "See how it works",
  },
];
