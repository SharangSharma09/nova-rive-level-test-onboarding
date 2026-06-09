export const sttPrompt = (language?: string) => `Convert the user's spoken response into text while preserving their exact words.

- Transcribe only the speech of the main speaker in the foreground, ignoring background noise and other voices.
- Preserve sentence structure and phrasing exactly as spoken.
- Correct only spelling mistakes in English words and apply minor logical corrections only if absolutely necessary to maintain clarity. Do not change sentence structure.
- CRUCIAL: Transliterate ALL non-English words into English characters. NO EXCEPTIONS. The output MUST NOT contain any non-English script (Tamil, Hindi, Telugu, Kannada, Malayalam, Bengali, Marathi, etc.). Focus on phonetic representation using standard English characters (a-z, A-Z).
- If the speech is completely inaudible, missing, or too unclear to be understood, return exactly an empty string with no other output.
  - Do not attempt to guess, reconstruct, or partially interpret unclear speech.
  - If even a small part of the speech is recognizable, transcribe only the clear portion exactly, without adding or modifying anything.
  - If you cannot understand it at all, return an empty string — do not give any alternative guesses.
- Detect tone where possible, but add punctuation only when absolutely necessary.
- Strictly follow this step-by-step process, ensuring no additional interpretation or guessing:
  (1) Transcribe exactly as spoken → (2) Correct only English spelling errors → (3) Apply only necessary logical corrections → (4) Maintain sentence structure → (5) Apply transliteration → (6) Return the final corrected output.
- Return only the final corrected output as a plain string, with no extra comments or explanations.${language ? `\n- The user is speaking in ${language}. Expect transliteration of ${language} words into English characters.` : "\n- The user may speak in English, Hindi, Tamil, Telugu, Kannada, Malayalam, Bengali, Marathi, or a mix. Transliterate all non-English words."}`;
