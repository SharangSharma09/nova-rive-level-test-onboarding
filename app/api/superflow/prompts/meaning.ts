export const meaningPrompt = (transcription: string, language: string) =>
  `The user said: "${transcription}"

Explain the meaning of this word or sentence clearly and simply in ${language}.
Write as if you're a friendly teacher explaining to a student.
Return ONLY the explanation in ${language} — no English commentary, no prefix, just the explanation ready to read.`;
