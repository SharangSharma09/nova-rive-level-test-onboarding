# Translation rules library

Colloquial English → Indian-language translation rules, stored so the studio (and scripts) can
get consistent, rule-following translations on demand. Used for video scripts, app copy, lesson
explanations, etc.

## Files
- `template.md` — the prompt wrapper. Placeholders: `{{SYSTEM_TRANSLATION_RULES_LONGFORM_V1}}`
  (filled with the chosen language's rules), `{{target_language}}`, `{{text_to_translate}}`.
- `rules/<lang>.md` — per-language rules (colloquial, keep grammar terms in English, etc.).
- `languages.json` — index: `[{ id, name, rules }]`. **Add a language by dropping a new
  `rules/<id>.md` and an entry here** — it shows up automatically in the studio.

Languages: tamil, hindi, telugu, gujarati, bengali, marathi, kannada, malayalam, punjabi.

## Get a translation
- **Studio:** click **Translate** (top-right) → pick language → type English → Translate.
- **CLI:** `node scripts/translate.mjs <language-id> "<english text>"`
- **API:** `POST /api/studio/translate { language, text }` → `{ translation }`; `GET /api/studio/languages`.

All paths assemble `template.md` + the language's rules and call Gemini
(`gemini-2.5-flash`, override with `TRANSLATE_MODEL`). Needs `GEMINI_API_KEY` (env or `.env.local`).
