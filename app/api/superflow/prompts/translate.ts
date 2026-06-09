export const translatePrompt = (transcription: string, language: string) =>
  `The user spoke in ${language}. Here is the transcription: "${transcription}"

Translate this into natural, fluent English.
Return ONLY the English translation — no commentary, no explanation, no prefix like "Translation:" — just the translated text ready to paste.`;
