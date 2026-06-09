# Super Flow Prompts — Usage Report

## What is SuperFlow?

SuperFlow (`ai.getsupernova.superflow`) is an Android-only floating overlay voice dictation service. Users tap any text field on their phone (WhatsApp, Slack, email, search bars, etc.), the SuperFlow widget appears, the user speaks, the speech is transcribed, and an LLM cleans/transforms the raw transcription into polished text in multiple tones. The cleaned text is then inserted into the active field.

The codebase lives in `supernova-app/speak` at:
- **App**: `apps/superflow/` (React Native Android app)
- **API**: `apps/next/app/api/superflow/` (3 routes: `/transcribe`, `/config`, `/feedback`)
- **Server logic**: `packages/server/src/usecases/superflow-logs/`, `packages/server/src/usecases/prompts/constants/transcription-prompts.ts`

---

## Prompts in the DB (all prefixed `[SUPERFLOW]`)

There are **5 prompts** directly used by SuperFlow (4 named `[SUPERFLOW]` + 1 new experiment variant):

### 1. `[SUPERFLOW] Formatting prompt` (LEGACY — build ≤ 7 only)

| Field | Value |
|-------|-------|
| **DB ID** | `a8536336-8db2-428c-a470-204285130b0d` |
| **Code constant** | `SUPERFLOW_TRANSCRIPT_CLEANUP_PROMPT` |
| **Model** | `cerebras:gpt-oss-120b` |
| **Use case** | Legacy single-prompt cleanup for old client builds (≤ 7). Takes raw transcription and outputs clean English. |
| **Called from** | `processLegacyTranscription()` in `apps/next/app/api/superflow/transcribe/route.ts` |
| **LLM usecase tag** | `SUPERFLOW_TRANSCRIPT_CLEANUP` |
| **Status** | Only used for old builds. New builds (≥ 8) use the tones logic below. |

### 2. `[SUPERFLOW] Cleanup Prompt - ENGLISH` (default English tones prompt)

| Field | Value |
|-------|-------|
| **DB ID** | `97b70f6a-4afa-47df-8bc2-d07dc4134f2c` |
| **Code constant** | `SUPERFLOW_TRANSCRIPT_ENGLISH_TONES_PROMPT` |
| **Model** | `cerebras:gpt-oss-120b` |
| **Use case** | English tone generation — takes raw voice transcription and produces 3 tone variants: `casual_text`, `semi_formal_text`, `formal_text`, plus a `recommendation` and `explanation`. |
| **Called from** | `processTonesTranscription()` → default for `englishTranslationPrompt` (when no experiment override) |
| **LLM usecase tag** | `SUPERFLOW_TRANSCRIPT_ENGLISH` |
| **Status** | Currently the **fallback/control** for the `superflow_transcription_prompts` experiment. Receiving **10% of traffic** in the "Old" variant. |

### 3. `[SUPERFLOW] ENGLISH prompt (Improved)` (new experiment variant)

| Field | Value |
|-------|-------|
| **DB ID** | `484813e8-fe7f-4de5-afce-99db89bc0016` |
| **Code constant** | *(not hardcoded — injected via experiment)* |
| **Model** | `vertex:gemini-3.1-flash-lite` |
| **Use case** | Same as above (English tone generation) but an improved prompt, running on Gemini instead of Cerebras. |
| **Called from** | `getSuperflowTranscriptionPrompts()` → via experiment `superflow/transcription_prompts/all` |
| **LLM usecase tag** | `SUPERFLOW_TRANSCRIPT_ENGLISH` |
| **Status** | Receiving **90% of traffic** in the "New (English)" variant of the experiment. |

### 4. `[SUPERFLOW] Cleanup Prompt - NATIVE LANGUAGE` (original language tones)

| Field | Value |
|-------|-------|
| **DB ID** | `ebb46091-a00f-47cb-b135-f1520fbfec09` |
| **Code constant** | `SUPERFLOW_TRANSCRIPT_ORIGINAL_TONES_PROMPT` |
| **Model** | `vertex:gemini-3.1-flash-lite` |
| **Use case** | Native/vernacular language tone generation — takes raw transcription and produces tone variants in the user's mother tongue (Hindi, Tamil, Telugu, etc.). Only runs when user's mother tongue ≠ English. Produces `casual_text`, `formal_text`, and `recommendation`. |
| **Called from** | `processTonesTranscription()` → for `originalTonesPrompt` (both experiment variants use the same prompt) |
| **LLM usecase tag** | `SUPERFLOW_TRANSCRIPT_ORIGINAL` |
| **Status** | **Active** — used by both experiment variants for the native-language arm. |

---

## SuperFlow Home Screen Activity Prompts (ASK AI scenarios)

The SuperFlow config endpoint (`/api/superflow/config`) returns two home screen activities that deep-link into Ask AI scenarios. These use their own prompts (not `[SUPERFLOW]`-prefixed):

### A. "Translate into English" scenario

| Field | Value |
|-------|-------|
| **Scenario ID** | `08133d40-0434-477c-b0a5-75dff7e6f359` |
| **Prompt name** | `[ASK AI] Translate to English` |
| **Model** | `azure:gpt-4o-mini-2024-07-18` |
| **Use case** | Chat-based translation — helps non-native English learners express their thoughts in proper English. Uses "Miss Nova" persona. |

### B. "Draft a message in English" scenario

| Field | Value |
|-------|-------|
| **Scenario ID** | `318f59f5-870e-4960-8554-4f719c299ef3` |
| **Prompt name** | `[ASK AI] Write Email or Message` |
| **Model** | `azure:gpt-4o-mini-2024-07-18` |
| **Use case** | Chat-based English email/message drafting assistant. Uses "Miss Nova" persona. |

---

## Experiment: `superflow_transcription_prompts`

| Field | Value |
|-------|-------|
| **Experiment set** | `superflow_transcription_prompts` |
| **Experiment name** | `superflow/transcription_prompts/all` |
| **App ID** | `ai.getsupernova.superflow` |
| **Criteria** | `true` (all SuperFlow users) |
| **Started** | 2026-05-29 |

**Variants:**

| Variant | Weight | English Prompt | Native Prompt |
|---------|--------|----------------|---------------|
| **New (English)** | 90% | `[SUPERFLOW] ENGLISH prompt (Improved)` (Gemini 3.1 Flash Lite) | `[SUPERFLOW] Cleanup Prompt - NATIVE LANGUAGE` (Gemini 3.1 Flash Lite) |
| **Old** | 10% | `[SUPERFLOW] Cleanup Prompt - ENGLISH` (Cerebras GPT-OSS-120B) | `[SUPERFLOW] Cleanup Prompt - NATIVE LANGUAGE` (Gemini 3.1 Flash Lite) |

---

## Flow Summary

```
User speaks into SuperFlow widget
    │
    ▼
Audio → Sarvam STT (saaras:v3, codemix mode)
    │
    ▼ raw transcription
    │
    ├─ Build < 8 (legacy): SUPERFLOW_TRANSCRIPT_CLEANUP → single clean text
    │
    └─ Build ≥ 8 (current):
         ├─ English arm: experiment selects between
         │    • [SUPERFLOW] ENGLISH prompt (Improved)  [90%]
         │    • [SUPERFLOW] Cleanup Prompt - ENGLISH    [10%]
         │  → produces casual / semi-formal / formal English tones
         │
         └─ Native arm (if mother tongue ≠ "en"):
              • [SUPERFLOW] Cleanup Prompt - NATIVE LANGUAGE
              → produces casual / formal tones in user's language
```

## Note on "Prompt Dashboard"

There is no separate "prompt dashboard" web UI in the codebase. Prompts are managed directly in the `prompts` PostgreSQL table and referenced by UUID in code. The experiment system controls which prompt variant gets served. Prompt editing likely happens via direct DB access or an internal admin tool outside this repo.
