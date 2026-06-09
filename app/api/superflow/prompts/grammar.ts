export const grammarPrompt = (transcription: string) =>
  `The user said: "${transcription}"

Check if this is grammatically correct English.
Reply with ONLY valid JSON (no markdown, no extra text):
{"isCorrect": <boolean>, "original": "<exact transcription>", "corrected": "<corrected version, or same as original if correct>", "tip": "<one short tip, max 15 words. If correct, say something encouraging like 'Perfect! That\\'s natural English.'>"}

Examples:
- "Yesterday I goes to the market" → {"isCorrect": false, "original": "Yesterday I goes to the market", "corrected": "Yesterday I went to the market", "tip": "Use past tense 'went' for things that already happened."}
- "I'll be there by 6" → {"isCorrect": true, "original": "I'll be there by 6", "corrected": "I'll be there by 6", "tip": "Perfect! Short and natural."}`;
