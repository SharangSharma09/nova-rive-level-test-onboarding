// Shared colloquial Tamil / Hindi answer-style rules.
// These mirror the rules embedded in v5-combined.ts (kept there unchanged so the v5
// routes behave identically). They are exported here so the single-call combined
// prompt (combined.ts) can render localized answers for the /v3-* and /v4-* routes
// without an extra LLM round-trip.

export const TAMIL_ANSWER_RULES = `Render the Tamil answer following these Tamil style rules, applied in this order — (1) retain English words, (2) translation style, (3) structure, (4) fallback:

Translation style:
- Use informal, conversational Tamil (colloquial) that an everyday speaker would use.
- Use Tamil words primarily. Use English words only when: the Tamil equivalent is too formal/complex; for modern/technical/grammar concept names; or when an English word is more common in daily Tamil speech (e.g. computer, phone, internet, office, bus, train, time, late, ready).
- Avoid literary/complex Tamil words when a simple Tamil or common English word exists.
- Write Tamil words in Tamil script; use English script for proper nouns, brand names, and technical terms.

Retain in English (do NOT translate):
- Technical terms — all technical/digital/modern terminology; grammar terms (verb, tense, past, present, etc.).
- Proper nouns — people, places, brands (John, America, Samsung); section labels (Eg, Tip, Hint).
- Quoted content — anything within quotes (" ", ' '); anything under 'Examples'/'For example'.
- Common English expressions — greetings (Hi, Hey, Hello), interjections (Wow, Oh, Great!), pleasantries (Good Job!, Perfect!), words inside example sentences, basic common words (superstar, funny, worried, friendly, later).
- Numbers stay in English numerals (1, 2, 3); keep punctuation as-is.
- For already mixed Tamil-English content, keep existing Tamil portions unchanged.

Structure:
- Maintain natural Tamil flow; keep tense and aspect; keep the meaning fully intact.
- Reorder words only when Tamil grammar requires it, for idioms, or for complex instructions.
- Keep the original format — question stays a question, statement a statement, command a command.
- Never use awkward word ordering; never add or remove content; no explanatory additions.

Fallback:
- If a rendering is unclear, keep the English word as-is; if rules conflict, keep the English.
- If any Tamil script already appears, keep it as-is.
- For English words with multiple Tamil meanings, choose by context; only if context is absent, keep the English word.

Reference patterns:
I am gardening -> நான் gardening பண்ணிட்டு இருக்கேன்
I was sleeping -> நான் தூங்கிட்டு இருந்தேன்
I need to run -> எனக்கு ஓட வேண்டும்
You are happy -> நீங்க happy-ஆ இருக்கீங்க
You are cleaning -> நீங்க clean பண்ணிட்டு இருக்கீங்க
We use present continuous tense to talk about actions happening right now -> இப்ப நடந்திட்டு இருக்க actions-அ பத்தி பேச present continuous tense-ஐ use பண்றோம்
He is cooking dinner -> அவன் dinner cook பண்ணிட்டு இருக்கான்
Can I help you? -> நான் உங்களுக்கு help பண்ணட்டுமா?
Almost there -> கிட்டத்தட்ட
It is Hot -> அது Hot-ஆ இருக்கு`;

export const HINDI_ANSWER_RULES = `Render the Hindi answer following these Hindi style rules, applied in this order — (1) retain English words, (2) translation style, (3) structure, (4) fallback:

Translation style:
- Use informal, conversational Hindi (colloquial) that an everyday speaker would use.
- Use Hindi words primarily. Use English words only when: the Hindi equivalent is too formal/complex; for modern/technical/grammar concept names; or when an English word is more common in daily Hindi speech (e.g. computer, phone, internet, office, bus, train, time, late, ready).
- Avoid literary/complex Hindi words when a simple Hindi or common English word exists.
- Write Hindi words in Devanagari; use English script for proper nouns, brand names, and technical terms.

Retain in English (do NOT translate):
- Technical terms — all technical/digital/modern terminology; grammar terms (verb, tense, past, present, etc.).
- Proper nouns — people, places, brands (John, America, Samsung); section labels (Eg, Tip, Hint).
- Quoted content — anything within quotes (" ", ' '); anything under 'Examples'/'For example'.
- Common English expressions — greetings (Hi, Hey, Hello), interjections (Wow, Oh, Great!), pleasantries (Good Job!, Perfect!), words inside example sentences, basic common words (superstar, funny, worried, friendly, later).
- Numbers stay in English numerals (1, 2, 3); keep punctuation as-is.
- For already mixed Hindi-English content, keep existing Hindi portions unchanged.

Structure:
- Maintain natural Hindi flow; keep tense and aspect; keep the meaning fully intact.
- Treat the whole sentence (including interjections) as one unit, even with mixed English and Hindi.
- Reorder words only when Hindi grammar requires it, for idioms, or for complex instructions.
- Keep the original format — question stays a question, statement a statement, command a command.
- Never use awkward word ordering; never add or remove content; no explanatory additions.

Fallback:
- If a rendering is unclear, keep the English word as-is; if rules conflict, keep the English.
- If any Hindi script already appears, keep it as-is.
- For English words with multiple Hindi meanings, choose by context; only if context is absent, keep the English word.

Reference patterns:
I am gardening -> मैं gardening कर रहा हूँ।
I was sleeping -> मैं सो रहा था।
You are happy -> आप खुश हैं।
You are cleaning -> आप सफाई कर रहे हो।
They are cooking -> वे cook कर रहे हैं।
We missed the bus -> हमने bus मिस कर दी।
The skit is funny -> स्किट funny है।
it is hot -> यह गर्म है।
Almost! -> लगभग सही!`;
