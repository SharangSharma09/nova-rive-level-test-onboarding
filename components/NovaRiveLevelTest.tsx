"use client";

import { useEffect, useLayoutEffect, useRef, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { Volume2, Square, X, Check, Loader2 } from "lucide-react";
import type { Rive } from "@rive-app/react-canvas";
import { LevelSentence } from "@/lib/level-test-content";
import { useMicRecorder } from "@/lib/voice/use-mic-recorder";
import {
  buildPretestScript,
  buildV2IntroScript,
  buildV3IntroScript,
  buildV3AckText,
  stripEmojisForTts,
  V3_ACK_LINE_ID,
  V3_QUESTION_LINE_ID,
  type PretestRegister,
} from "@/lib/pretest-dialogue";

export type AvatarVariant = "nova" | "realistic-female";
export type IntroVariant = "v1" | "v2" | "v3";

interface Point {
  x: number;
  y: number;
}

const SupernovaAvatar = dynamic(
  () => import("@/components/SupernovaAvatar"),
  {
    ssr: false,
    loading: () => (
      <div style={{ width: "320px", height: "240px", backgroundColor: "#000000", borderRadius: "10px" }} />
    ),
  },
);

const RealisticFemaleAvatar = dynamic(
  () => import("@/components/RealisticFemaleAvatar"),
  {
    ssr: false,
    loading: () => (
      <div style={{ width: "320px", height: "240px", backgroundColor: "#000000", borderRadius: "10px" }} />
    ),
  },
);

// Splits narration text around a phrase that must always be recited in
// English (Cartesia's language auto-detect can otherwise apply Hindi/Tamil
// pronunciation to English phrases embedded in a Hinglish/Tanglish string).
// Each returned segment is played as its own TTS call so the phrase's
// pronunciation is never influenced by the surrounding native-script text.
function splitForcedEnglishSegments(text: string, phrase: string): string[] {
  if (!text.includes(phrase)) return [text];
  const parts = text.split(phrase);
  const segments: string[] = [];
  parts.forEach((part, i) => {
    if (part.length > 0) segments.push(part);
    if (i < parts.length - 1) segments.push(phrase);
  });
  return segments;
}

// When audio can't play at all (a fresh origin blocks autoplay until the user
// has interacted), the script still has to advance — but at a readable pace.
// Roughly 2.8 words/sec, floored and capped, so a blocked line dwells about as
// long as it would have been spoken for instead of flashing past.
function silentReadMs(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.min(Math.max(words * 360, 1200), 9000);
}

// ─── Types ────────────────────────────────────────────────────────────────────

// One entry per level-test question, captured live as each is graded — the
// source data for the dynamic post-test results summary (never hardcoded).
interface AnswerLogEntry {
  concept: string;
  sentence: string;
  correct: boolean;
  userAnswer: string;
  expectedTranslation: string;
}

type MsgInteractive =
  | { type: "cta"; ctaLabel: string; tapped: boolean }
  | { type: "select"; options: string[]; selectedIndex?: number }
  | { type: "final"; bullets: string[]; ctaLabel: string; tapped: boolean }
  // Single-line, 2s auto-advancing loading beat — fires the instant "Show my
  // results" is tapped, before the results message itself renders. No CTA,
  // not the same thing as the 6-item "loader" sequence in Step 4.
  | { type: "report-loading" }
  // Dynamic post-test results — same chat-bubble shape as "final", generated
  // live from the answer log rather than hardcoded copy.
  | { type: "results"; log: AnswerLogEntry[]; ctaLabel: string; tapped: boolean }
  // Single-line, 2s auto-advancing loading beat — same pattern as
  // "report-loading" above, fires after the results bubble's "Next" and
  // before the Grammar Overview message renders. Not the 14s sequence.
  | { type: "grammar-loading" }
  // Hardcoded prototype content (not wired to real data yet) — appears
  // after the results bubble's "Next".
  | { type: "grammar-overview"; ctaLabel: string; tapped: boolean }
  // Pure loader bubble, no CTA — appears after the grammar overview's CTA.
  | { type: "loader" }
  // Hardcoded 30-day plan widget — auto-appears once the loader completes.
  // The widget is visual only; msg.text (spoken/written separately) is the
  // only part of this message ever sent to TTS.
  | { type: "plan" };

interface Msg {
  id: string;
  role: "ai" | "user";
  text: string;
  interactive?: MsgInteractive;
  // true for user bubbles created from tapping a CTA / MCQ option (pretest),
  // styled distinctly from the level-test's spoken-reply bubbles.
  isTappedResponse?: boolean;
  // the native-script sentence being tested, rendered larger (20px) and
  // separately from the surrounding instructional text.
  quizSentence?: string;
  // V2 intro only: attaches the real-time grading state to this (user)
  // message — see handleV2Grade. "checking" covers both the STT and grading
  // wait, so there's never a gap with no visible state.
  feedback?:
    | { status: "checking" }
    | { status: "correct" }
    | { status: "incorrect"; original: string; corrected: string }
    // V3 intro: same card, but the highlight spans come pre-marked by the
    // grader (<e> on the original, <c> on the correction) instead of being
    // inferred client-side by word diffing.
    | { status: "tagged"; original: string; corrected: string };
}

type Phase = "idle" | "recording" | "transcribing" | "evaluating" | "playing";

type Stage = "pretest" | "test";

interface Props {
  language: "tamil" | "hindi";
  sentences: LevelSentence[];
  avatarVariant?: AvatarVariant;
  onAvatarRiveInstance?: (rive: Rive | null) => void;
  // Bumping this (any change in value) jumps straight to the last level-test
  // question — a prototyping shortcut, wired from outside the mobile UI.
  skipToLastQuestionSignal?: number;
  // V1 = existing pretest script, unchanged. V2 = the new 4-message intro
  // (see buildV2IntroScript) — only the pretest/intro branches; the level
  // test and everything after stays single-source between both.
  introVariant?: IntroVariant;
  // Template variables for V2 Message 2 — real values would come from
  // post-login answers in production; the prototype defaults to samples.
  v2Occupation?: string;
  v2Goal?: string;
  // Silhouette the scale-down control collapses into. Prototype control, wired
  // from outside the mobile UI like the other toggles.
  minimizedShape?: MinimizedShape;
  // Auto-minimise Nova while the user is reading back through the thread.
  minimizeOnScroll?: boolean;
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function MicIcon() {
  return (
    <svg className="w-6 h-6" style={{ color: "#12151E" }} fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
      <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
    </svg>
  );
}

// ─── Waveform Recorder UI ──────────────────────────────────────────────────────

interface RecorderProps {
  phase: Phase;
  analyser: AnalyserNode | null;
  isRecording: boolean;
  onTapStart: () => void;
  onTapStop: () => void;
  onTapCancel: () => void;
}

function Recorder({ phase, analyser, isRecording, onTapStart, onTapStop, onTapCancel }: RecorderProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    if (phase !== "recording") return;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    canvas.width = container.offsetWidth;
    canvas.height = container.offsetHeight || 40;
  }, [phase]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !analyser || phase !== "recording") {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return;
    }

    const ctx = canvas.getContext("2d")!;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const barW = 3;
      const gap = 2;
      const barCount = Math.floor(canvas.width / (barW + gap));

      for (let i = 0; i < barCount; i++) {
        const idx = Math.floor((i / barCount) * bufferLength);
        const v = (dataArray[idx] ?? 0) / 255;
        const barH = Math.max(3, v * canvas.height * 0.88);
        const x = i * (barW + gap);
        const y = (canvas.height - barH) / 2;

        ctx.fillStyle = v < 0.06 ? "rgba(34,197,94,0.2)" : "rgba(34,197,94,0.85)";
        ctx.beginPath();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if ((ctx as any).roundRect) (ctx as any).roundRect(x, y, barW, barH, 1.5);
        else ctx.rect(x, y, barW, barH);
        ctx.fill();
      }
    };

    draw();
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [analyser, phase]);

  const isProcessing = phase === "transcribing" || phase === "evaluating";
  const isPlaying = phase === "playing";
  const isDisabled = isProcessing || isPlaying;

  if (phase === "recording") {
    return (
      <div className="flex items-center gap-3 px-4 py-3 bg-[#12151E]">
        <button
          onClick={onTapCancel}
          aria-label="Cancel recording"
          className="p-2 text-zinc-500 hover:text-zinc-300 flex-shrink-0 transition-colors"
        >
          <TrashIcon />
        </button>
        <div ref={containerRef} className="flex-1 min-w-0 h-8">
          <canvas ref={canvasRef} className="block w-full h-full" />
        </div>
        <button
          onClick={onTapStop}
          aria-label="Submit recording"
          className="w-9 h-9 rounded-full bg-green-500 hover:bg-green-400 flex items-center justify-center flex-shrink-0 transition-colors"
        >
          <CheckIcon />
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2 pt-4 bg-[#12151E]">
      <button
        onClick={phase === "idle" ? onTapStart : undefined}
        disabled={isDisabled}
        aria-label="Start recording"
        className={`w-[72px] h-[72px] rounded-full flex items-center justify-center transition-all duration-200 ${
          isDisabled
            ? "bg-green-500 opacity-40 cursor-not-allowed"
            : "bg-green-500 hover:bg-green-400 cursor-pointer active:scale-95"
        }`}
      >
        {isProcessing ? (
          <span className="w-6 h-6 border-2 border-black border-t-transparent rounded-full animate-spin" />
        ) : (
          <MicIcon />
        )}
      </button>
      <p className="text-xs text-zinc-500">
        {isProcessing ? "Processing…" : isPlaying ? "AI speaking…" : "Tap to answer"}
      </p>
    </div>
  );
}

// ─── Typing dots ──────────────────────────────────────────────────────────────

function TypingDots() {
  const cls = "w-1.5 h-1.5 rounded-full bg-zinc-400 animate-bounce";
  return (
    <div className="flex items-center gap-1 py-0.5">
      <span className={cls} style={{ animationDelay: "0ms" }} />
      <span className={cls} style={{ animationDelay: "150ms" }} />
      <span className={cls} style={{ animationDelay: "300ms" }} />
    </div>
  );
}

// ─── Post-test results summary ──────────────────────────────────────────────
// Entirely generated from answerLogRef at render time — never hardcoded copy.

function tokenizeWords(s: string): string[] {
  return s.trim().split(/\s+/).filter(Boolean);
}

function normalizeWord(w: string): string {
  return w.toLowerCase().replace(/[.,!?;:"'’]/g, "");
}

// Word-level LCS diff — flags[i] === true means that word is NOT part of the
// common subsequence, i.e. it's the part that actually differs and should be
// highlighted (only the wrong/fixed word(s), never the whole sentence).
function diffWordFlags(a: string[], b: string[]): { aFlags: boolean[]; bFlags: boolean[] } {
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      dp[i][j] = normalizeWord(a[i - 1]!) === normalizeWord(b[j - 1]!)
        ? dp[i - 1][j - 1]! + 1
        : Math.max(dp[i - 1][j]!, dp[i][j - 1]!);
    }
  }
  const aFlags = new Array<boolean>(n).fill(true);
  const bFlags = new Array<boolean>(m).fill(true);
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    if (normalizeWord(a[i - 1]!) === normalizeWord(b[j - 1]!)) {
      aFlags[i - 1] = false;
      bFlags[j - 1] = false;
      i--;
      j--;
    } else if (dp[i - 1]![j]! >= dp[i]![j - 1]!) {
      i--;
    } else {
      j--;
    }
  }
  return { aFlags, bFlags };
}

function DiffedPair({ userAnswer, expected }: { userAnswer: string; expected: string }) {
  const userWords = tokenizeWords(userAnswer);
  const expectedWords = tokenizeWords(expected);
  const { aFlags, bFlags } = diffWordFlags(userWords, expectedWords);

  return (
    <div className="flex flex-col gap-1 text-sm">
      <div className="flex items-start gap-2">
        <span>❌</span>
        <span style={{ color: "#f4f4f5" }}>
          {userWords.map((w, i) => (
            <span key={i} style={aFlags[i] ? { color: "#F97316", fontWeight: 700 } : undefined}>
              {w}
              {i < userWords.length - 1 ? " " : ""}
            </span>
          ))}
        </span>
      </div>
      <div className="flex items-start gap-2">
        <span>✅</span>
        <span style={{ color: "#f4f4f5" }}>
          {expectedWords.map((w, i) => (
            <span key={i} style={bFlags[i] ? { color: "#3CDB9E", fontWeight: 700 } : undefined}>
              {w}
              {i < expectedWords.length - 1 ? " " : ""}
            </span>
          ))}
        </span>
      </div>
    </div>
  );
}

// ─── V2 intro: real-time speaking feedback ──────────────────────────────────
// One unified card per spoken answer: a waveform row on top (the "you spoke"
// indicator), then a state section below that's one of three things —
// checking (STT + grading both covered, no gap with nothing visible),
// correct (no mistakes), or the Figma-matched (node 12509:936) diff card.

function SpeakingWaveform() {
  // Static decorative bars — not reactive to real audio, just the "you sent
  // a voice message" visual language from the design.
  const heights = [5, 10, 7, 14, 9, 12, 6, 10, 8, 11, 5];
  return (
    <div className="flex items-center gap-[2px]">
      {heights.map((h, i) => (
        <span
          key={i}
          style={{ width: "2px", height: `${h}px`, backgroundColor: "#8C94AE", borderRadius: "1px" }}
        />
      ))}
    </div>
  );
}

// Content only — original line (wrong word/phrase orange), a hairline
// divider, a "Feedback" label, the corrected line (fixed word/phrase green),
// and a dotted-underlined "Explain" link. Colors pulled straight from the
// design (#ff9904 / #75eabe / #8c94ae / #40b9f8), not the app's own
// (slightly different) accent shades, per "match exactly". Reuses the same
// word-level diff already built for the results screen.
// One run of text plus whether it should be highlighted.
type Segment = { text: string; hit: boolean };

// Splits "I <e>am work</e> here" into highlighted / plain runs. Unmatched or
// malformed tags just fall through as plain text rather than rendering markup.
function parseTaggedSegments(text: string, tag: "e" | "c"): Segment[] {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "g");
  const segments: Segment[] = [];
  let last = 0;
  for (let m = re.exec(text); m !== null; m = re.exec(text)) {
    if (m.index > last) segments.push({ text: text.slice(last, m.index), hit: false });
    segments.push({ text: m[1]!, hit: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) segments.push({ text: text.slice(last), hit: false });
  // Strip any stray tags of the *other* kind so nothing leaks into the UI.
  return segments.map((s) => ({ ...s, text: s.text.replace(/<\/?[ec]>/g, "") }));
}

// Word-diffed segments — V2's path, where the grader returns plain corrected
// text and the highlight spans are inferred here.
function diffedSegments(original: string, corrected: string): { a: Segment[]; b: Segment[] } {
  const originalWords = tokenizeWords(original);
  const correctedWords = tokenizeWords(corrected);
  const { aFlags, bFlags } = diffWordFlags(originalWords, correctedWords);
  const join = (words: string[], flags: boolean[]) =>
    words.map((w, i) => ({ text: w + (i < words.length - 1 ? " " : ""), hit: Boolean(flags[i]) }));
  return { a: join(originalWords, aFlags), b: join(correctedWords, bFlags) };
}

function SegmentLine({ segments, color }: { segments: Segment[]; color: string }) {
  return (
    <div className="text-sm leading-relaxed" style={{ color: "#f4f4f5" }}>
      {segments.map((s, i) => (
        <span key={i} style={s.hit ? { color } : undefined}>
          {s.text}
        </span>
      ))}
    </div>
  );
}

function IncorrectFeedbackBody({ original, corrected }: { original: Segment[]; corrected: Segment[] }) {
  return (
    <div className="flex flex-col gap-2">
      <SegmentLine segments={original} color="#ff9904" />

      <div style={{ height: "1px", backgroundColor: "#2B3044" }} />

      <div className="flex flex-col gap-1">
        <div className="text-xs" style={{ color: "#8c94ae" }}>Feedback</div>
        <SegmentLine segments={corrected} color="#75eabe" />
      </div>

      <div className="flex justify-end">
        <span
          className="text-xs"
          style={{ color: "#40b9f8", borderBottom: "1px dotted #8c94ae", paddingBottom: "2px", cursor: "pointer" }}
        >
          Explain
        </span>
      </div>
    </div>
  );
}

function SpeakingFeedbackState({ feedback }: { feedback: NonNullable<Msg["feedback"]> }) {
  if (feedback.status === "checking") {
    return (
      <div className="flex items-center gap-2 text-sm" style={{ color: "#8C94AE" }}>
        <Loader2 size={14} className="animate-spin" />
        Checking...
      </div>
    );
  }
  if (feedback.status === "correct") {
    return (
      <div className="flex items-center gap-2 text-sm" style={{ color: "#75eabe" }}>
        <Check size={16} />
        Great. No mistakes.
      </div>
    );
  }
  if (feedback.status === "tagged") {
    return (
      <IncorrectFeedbackBody
        original={parseTaggedSegments(feedback.original, "e")}
        corrected={parseTaggedSegments(feedback.corrected, "c")}
      />
    );
  }
  const { a, b } = diffedSegments(feedback.original, feedback.corrected);
  return <IncorrectFeedbackBody original={a} corrected={b} />;
}

// Single static line, no fade-in sequence (that animation is reserved for
// the 6-item Step 4 loader) — holds for a fixed 2s before auto-advancing.
function ReportLoadingBody() {
  return (
    <div className="text-sm leading-relaxed" style={{ color: "#f4f4f5" }}>
      Creating a level report...
    </div>
  );
}

// Same single-line, no-fade-in pattern as ReportLoadingBody above — a
// separate, shorter beat from the 14s thinking sequence, not merged with it.
function GrammarLoadingBody() {
  return (
    <div className="text-sm leading-relaxed" style={{ color: "#f4f4f5" }}>
      Preparing your speaking & grammar overview...
    </div>
  );
}

// Inner content only — no card/background of its own. Rendered inside the
// same standard AI message bubble every other chat message uses, with the
// "Next" CTA handled by the shared cta/final/results button block below.
function ResultsBody({ log }: { log: AnswerLogEntry[] }) {
  const total = log.length;
  const correctItems = log.filter((e) => e.correct);
  const mistakeItems = log.filter((e) => !e.correct); // log is already in question order

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="text-sm font-semibold mb-2" style={{ color: "#3CDB9E" }}>
          👍 {correctItems.length}/{total} correct!
        </div>
        <div className="flex flex-col gap-2">
          {correctItems.map((item, i) => (
            <div key={i} className="flex items-start gap-2 text-sm" style={{ color: "#8C94AE" }}>
              <span>✓</span>
              <span>{item.sentence}</span>
            </div>
          ))}
        </div>
      </div>

      {mistakeItems.length > 0 && (
        <div>
          <div className="text-sm font-semibold mb-2" style={{ color: "#f4f4f5" }}>
            ⚠️ {mistakeItems.length}/{total} mistakes found
          </div>
          <div className="flex flex-col gap-3">
            {mistakeItems.map((item, i) => (
              // 1px rule closes off each ❌/✅ pair so consecutive mistakes
              // don't read as one run-on block.
              <div key={i} className="pb-3" style={{ borderBottom: "1px solid #8C94AE" }}>
                <DiffedPair userAnswer={item.userAnswer} expected={item.expectedTranslation} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Grammar overview (hardcoded prototype content, not live data) ─────────

type DotColor = "green" | "orange" | "red" | "grey";

// grey is a filled, desaturated dot (not hollow) — visibly dimmer than the
// three strength colors so it reads as "empty" sitting next to them.
const DOT_COLOR: Record<DotColor, string> = {
  green: "#3CDB9E",
  orange: "#F97316",
  red: "#EF4444",
  grey: "#454B63",
};

// Each row is exactly 3 independent per-slot colors, left to right — never
// one color applied to the whole row. Do not simplify/average this.
const GRAMMAR_TOPICS: { name: string; dots: DotColor[] }[] = [
  { name: "Articles", dots: ["green", "green", "green"] },
  { name: "Prepositions", dots: ["green", "green", "grey"] },
  { name: "Present Continuous", dots: ["orange", "orange", "grey"] },
  { name: "Simple Past", dots: ["orange", "orange", "grey"] },
  { name: "Simple Future", dots: ["orange", "orange", "grey"] },
  { name: "Simple Present", dots: ["red", "grey", "grey"] },
  { name: "Past Continuous", dots: ["red", "grey", "grey"] },
];

function StrengthDot({ color }: { color: DotColor }) {
  return (
    <span
      className="inline-block rounded-full shrink-0"
      style={{
        width: "7px",
        height: "7px",
        backgroundColor: DOT_COLOR[color],
      }}
    />
  );
}

function GrammarOverviewCard() {
  return (
    <div
      className="rounded-2xl px-4 py-4 flex flex-col gap-3"
      style={{
        backgroundColor: "#12151E",
        border: "1px solid #2B3044",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
        letterSpacing: "0.02em",
      }}
    >
      {/* Headline metrics — all three share one row format: label left,
          colour-coded value right. */}
      <div className="flex flex-col gap-2" style={{ fontSize: "12px" }}>
        <div className="flex items-center justify-between" style={{ color: "#f4f4f5" }}>
          <span>Speaking Score</span>
          <span style={{ color: "#3CDB9E", fontWeight: 700 }}>72%</span>
        </div>
        <div className="flex items-center justify-between" style={{ color: "#f4f4f5" }}>
          <span>English words spoken</span>
          <span style={{ color: "#F472B6", fontWeight: 700 }}>120</span>
        </div>
        <div className="flex items-center justify-between" style={{ color: "#f4f4f5" }}>
          <span>Time spoken</span>
          <span style={{ color: "#FACC15", fontWeight: 700 }}>1min20s</span>
        </div>
        {/* Closes off the metrics block from the per-topic list below. */}
        <div style={{ borderTop: "1px solid #2B3044" }} />
      </div>

      <div className="flex flex-col gap-2">
        {GRAMMAR_TOPICS.map((topic) => (
          <div key={topic.name} className="flex items-center justify-between gap-3">
            <span
              className="text-xs px-2.5 py-1 rounded-md"
              style={{ backgroundColor: "#333952", color: "#FFFFFF" }}
            >
              {topic.name}
            </span>
            <div className="flex items-center gap-1.5 shrink-0">
              {topic.dots.map((d, i) => (
                <StrengthDot key={i} color={d} />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div
        className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs pt-3"
        style={{ borderTop: "1px solid #2B3044", color: "#8C94AE" }}
      >
        <div className="flex items-center gap-1.5"><StrengthDot color="green" /> Strong</div>
        <div className="flex items-center gap-1.5"><StrengthDot color="orange" /> Needs practice</div>
        <div className="flex items-center gap-1.5"><StrengthDot color="red" /> Weak</div>
      </div>
    </div>
  );
}

// Full Step-3 message body: intro line, the overview card, and the closing
// copy (first sentence highlighted green) — msg.text is unused for this
// interactive type since the content is richer than a plain string.
function GrammarOverviewBody() {
  return (
    <div className="flex flex-col gap-4">
      <div className="text-sm leading-relaxed" style={{ color: "#f4f4f5" }}>
        Aapke level test ke base par, yeh raha aapka English overview.
      </div>

      <div className="text-sm leading-relaxed" style={{ color: "#f4f4f5" }}>
        English mein confident banne ke liye, aapko do cheezein chahiye — apni{" "}
        <span style={{ color: "#3CDB9E", fontWeight: 700 }}>grammar</span> sahi karna, aur{" "}
        <span style={{ color: "#3CDB9E", fontWeight: 700 }}>speaking practice</span> karna. Dono milkar hi aapko fluent banayenge.
      </div>

      <GrammarOverviewCard />

      <div className="text-sm leading-relaxed" style={{ color: "#f4f4f5" }}>
        Aapki strengths aur weaknesses ke base par, main aapka 30-day plan aise banaungi 👇
      </div>
    </div>
  );
}

// ─── Post-test "thinking" loader ────────────────────────────────────────────
// Pure loader, no user action: six lines reveal one at a time inside a single
// card, then hold on the last line — no screen follows yet.

const THINKING_LINES: { text: string; at: number; dots?: boolean }[] = [
  { text: "Thinking...", at: 0 },
  { text: "Analysing your weak areas", at: 2000 },
  { text: "Analysing your strong areas", at: 4000 },
  { text: "Understanding your goals", at: 6000 },
  { text: "Building your practice plan", at: 8000, dots: true },
  { text: "Finishing up...", at: 12000 },
];

// Inner content only — same reasoning as ResultsBody above.
function ThinkingLoaderBody({ onComplete }: { onComplete?: () => void }) {
  const [visibleCount, setVisibleCount] = useState(1);

  useEffect(() => {
    const timers = THINKING_LINES.map((line, i) =>
      i === 0 ? null : window.setTimeout(() => setVisibleCount(i + 1), line.at)
    ).filter((t): t is number => t !== null);
    // "Auto-advances at 14s" — 2s after the last line (12s) appears.
    const completeTimer = window.setTimeout(() => onComplete?.(), 14000);
    return () => { timers.forEach((t) => clearTimeout(t)); clearTimeout(completeTimer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col gap-1">
      <style>{`
        @keyframes thinkingLineFadeIn {
          0% { opacity: 0; transform: translateY(4px); }
          100% { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      {THINKING_LINES.slice(0, visibleCount).map((line, i) => {
        const isLast = i === visibleCount - 1;
        // Every line except the first ("Thinking...") and last ("Finishing
        // up...") gets a checkmark — those two are pure status text, not
        // completed steps.
        const showCheckmark = i !== 0 && i !== THINKING_LINES.length - 1;
        return (
          <div
            key={line.text}
            className="text-sm leading-relaxed flex items-center gap-2"
            style={{
              color: isLast ? "#f4f4f5" : "#8C94AE",
              animation: "thinkingLineFadeIn 400ms ease-out",
            }}
          >
            {showCheckmark && <span style={{ color: "#8C94AE" }}>✓</span>}
            <span>{line.text}</span>
            {line.dots && isLast && <TypingDots />}
          </div>
        );
      })}
    </div>
  );
}

// ─── 30-day plan widget (hardcoded prototype content) ───────────────────────
// Purely visual — structurally separate from the message text above it, and
// never itself passed to TTS (see handleThinkingComplete's playTts call,
// which only ever receives msg.text).

interface PlanWeek {
  label: string;
  emoji: string;
  topics: string[];
  boosterCount: number;
}

const PLAN_WEEKS: PlanWeek[] = [
  {
    label: "Week 1",
    emoji: "🌱",
    topics: ["Prepositions of place", "Talking about Past", "Prepositions of Time", "Talking about Future"],
    boosterCount: 3,
  },
  {
    label: "Week 2",
    emoji: "🌿",
    topics: ["Talking about What's Happening", "Talking about Future Activities"],
    boosterCount: 5,
  },
  {
    label: "Week 3",
    emoji: "🪴",
    topics: ["Talking about What You Were Doing", "Using To/By/For"],
    boosterCount: 6,
  },
  {
    label: "Week 4",
    emoji: "🌳",
    topics: [
      "Talking about Daily Life",
      "Sharing Views on the Future",
      "Sharing Views on the Past",
      "Irregular Past Verbs",
      "Saying How Often",
      "Describing Words",
      "Negative Continuous Sentences",
    ],
    boosterCount: 3,
  },
];

const PLAN_CTAS = [
  "How will this plan help me?",
  "What's a Fluency Booster?",
  "Let's start my first lesson →",
];

function ThirtyDayPlanWidget() {
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-2xl px-4 py-4 flex flex-col gap-4" style={{ backgroundColor: "#12151E", border: "1px solid #2B3044" }}>
        <div className="text-sm font-semibold" style={{ color: "#f4f4f5" }}>
          📚 Your 30-Day Plan
        </div>

        {PLAN_WEEKS.map((week) => (
          <div key={week.label} className="flex flex-col gap-1.5">
            <div className="text-sm font-semibold" style={{ color: "#f4f4f5" }}>
              {week.label} {week.emoji}
            </div>
            <div className="flex flex-col gap-1">
              {week.topics.map((topic, i) => (
                <div key={i} className="flex items-start gap-2 text-sm" style={{ color: "#8C94AE" }}>
                  {/* Grey checkmarks throughout — never green here. */}
                  <span>✓</span>
                  <span>{topic}</span>
                </div>
              ))}
            </div>
            <div className="text-xs" style={{ color: "#8C94AE" }}>
              Fluency Booster ⚡{week.boosterCount}
            </div>
          </div>
        ))}

        <div className="text-sm font-semibold" style={{ color: "#f4f4f5" }}>
          🏆 Unlock next 60 days
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {PLAN_CTAS.map((cta) => (
          <button
            key={cta}
            type="button"
            className="w-full text-center text-sm font-medium rounded-xl transition-colors"
            style={{ backgroundColor: "#1A1E2D", border: "1px solid #2B3044", color: "#40b9f8", padding: "12px" }}
          >
            {cta}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Fake status bar ──────────────────────────────────────────────────────────

function FakeStatusBar() {
  return (
    <div className="shrink-0 relative z-20 flex items-center justify-between px-5 h-[44px] bg-[#12151E] text-white text-[14px] font-medium">
      <span className="tabular-nums">9:41</span>
      <div className="flex items-center gap-[6px]">
        {/* Signal */}
        <svg viewBox="0 0 18 12" width="17" height="11" fill="currentColor" aria-hidden>
          <rect x="0" y="8" width="3" height="4" rx="0.6" />
          <rect x="5" y="6" width="3" height="6" rx="0.6" />
          <rect x="10" y="3" width="3" height="9" rx="0.6" />
          <rect x="15" y="0" width="3" height="12" rx="0.6" />
        </svg>
        {/* Wifi */}
        <svg viewBox="0 0 18 12" width="15" height="10" fill="currentColor" aria-hidden>
          <path d="M9 12L11.6 8.7C11 8.25 10.06 8 9 8s-2 .25-2.6.7L9 12zm5.6-7.06C13.13 3.72 11.16 3 9 3S4.87 3.72 3.4 4.94l1.5 1.87C6 5.87 7.4 5.3 9 5.3s3 .57 4.1 1.51l1.5-1.87zM9 0C5.55 0 2.4 1.2 0 3.15L1.5 5.02C3.46 3.35 6.1 2.3 9 2.3s5.54 1.05 7.5 2.72L18 3.15C15.6 1.2 12.45 0 9 0z" />
        </svg>
        {/* Battery */}
        <svg viewBox="0 0 26 12" width="24" height="11" fill="none" aria-hidden>
          <rect x="0.5" y="0.5" width="22" height="11" rx="2.5" stroke="currentColor" opacity="0.6" />
          <rect x="2" y="2" width="19" height="8" rx="1.2" fill="currentColor" />
          <rect x="23.5" y="4" width="1.5" height="4" rx="0.5" fill="currentColor" opacity="0.6" />
        </svg>
      </div>
    </div>
  );
}

// ─── Progress Bar SFX (synthesized — no external audio assets) ────────────────
// Volume is kept well below TTS/voice level. Tick fires on every fill increase;
// chime fires exactly once, the moment the bar reaches 100%.

let progressSfxCtx: AudioContext | null = null;

function getProgressSfxCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!progressSfxCtx || progressSfxCtx.state === "closed") {
    progressSfxCtx = new Ctor();
  }
  return progressSfxCtx;
}

function playProgressTone(freq: number, durationMs: number, peakGain: number, type: OscillatorType) {
  const ctx = getProgressSfxCtx();
  if (!ctx) return;
  try {
    if (ctx.state === "suspended") void ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(peakGain, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + durationMs / 1000);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + durationMs / 1000 + 0.02);
  } catch {
    // best-effort UI sound — never let it break the flow
  }
}

// Short, subtle tick (<200ms), volume well below voice/TTS.
function playProgressTick() {
  playProgressTone(720, 90, 0.045, "sine");
}

// Slightly more satisfying two-note chime — still short, not a fanfare.
function playProgressChime() {
  playProgressTone(880, 160, 0.06, "triangle");
  window.setTimeout(() => playProgressTone(1318.5, 220, 0.055, "triangle"), 90);
}

// ─── Progress Bar ─────────────────────────────────────────────────────────────

const SPARKLE_POSITIONS = [
  { left: "6%", top: "-11px" },
  { left: "26%", top: "15px" },
  { left: "50%", top: "-13px" },
  { left: "74%", top: "15px" },
  { left: "94%", top: "-10px" },
];

// Decorative mic → progress-bar flourish, fired once per spoken level-test
// reply. Purely visual: positions are computed once at spawn time and the
// animation is entirely self-contained (rAF-driven), so it can never block or
// delay the actual reply pipeline, and the bar updates correctly whether or
// not this ever renders (e.g. reduced-motion skips it via spawnLightningBolt).
const LIGHTNING_BOLT_DURATION_MS = 900;

function LightningBolt({ from, to, onDone }: { from: Point; to: Point; onDone: () => void }) {
  const elRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.hypot(dx, dy) || 1;
    const mx = (from.x + to.x) / 2;
    const my = (from.y + to.y) / 2;
    // Bow the midpoint out perpendicular to the travel line — a gentle arc
    // rather than a straight mechanical slide.
    const bow = Math.min(len * 0.28, 70);
    const px = -dy / len;
    const py = dx / len;
    const cx = mx + px * bow;
    const cy = my + py * bow;

    const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
    const FADE_START = 0.78; // fade over the last ~22% of the flight

    let rafId: number;
    let start: number | null = null;

    const tick = (now: number) => {
      if (start === null) start = now;
      const t = Math.min((now - start) / LIGHTNING_BOLT_DURATION_MS, 1);
      const e = easeOutCubic(t);

      const x = (1 - e) * (1 - e) * from.x + 2 * (1 - e) * e * cx + e * e * to.x;
      const y = (1 - e) * (1 - e) * from.y + 2 * (1 - e) * e * cy + e * e * to.y;
      const opacity = t < FADE_START ? 1 : Math.max(0, 1 - (t - FADE_START) / (1 - FADE_START));

      const el = elRef.current;
      if (el) {
        el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
        el.style.opacity = String(opacity);
      }

      if (t < 1) {
        rafId = requestAnimationFrame(tick);
      } else {
        onDone();
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
    // from/to/onDone are captured once at spawn time — this effect intentionally
    // runs exactly once per bolt instance (identity via the `key` prop at the call site).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={elRef}
      className="absolute pointer-events-none select-none"
      style={{ left: 0, top: 0, fontSize: "44px", zIndex: 60, willChange: "transform, opacity" }}
    >
      ⚡
    </div>
  );
}

function SparkleIcon({ size = 11, color = "#75EABE" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M12 0c0 6 2 10 6 12-4 2-6 6-6 12 0-6-2-10-6-12 4-2 6-6 6-12Z" />
    </svg>
  );
}

function ProgressBar({
  progress,
  sparkleTrigger,
}: {
  progress: number;
  sparkleTrigger?: number;
}) {
  const clamped = Math.max(0, Math.min(1, progress));
  const pct = clamped * 100;

  const prevPctRef = useRef(pct);
  const completedRef = useRef(false);
  const [pulseKey, setPulseKey] = useState(0);
  const [shimmerKey, setShimmerKey] = useState<number | null>(null);

  const prevSparkleTriggerRef = useRef(sparkleTrigger ?? 0);
  const [sparkleKey, setSparkleKey] = useState<number | null>(null);

  useEffect(() => {
    const prev = prevPctRef.current;
    if (pct > prev) {
      setPulseKey((k) => k + 1);
      if (pct >= 100 && !completedRef.current) {
        completedRef.current = true;
        playProgressChime();
        setShimmerKey((k) => (k ?? 0) + 1);
      } else if (pct < 100) {
        playProgressTick();
      }
    }
    prevPctRef.current = pct;
  }, [pct]);

  useEffect(() => {
    const prev = prevSparkleTriggerRef.current;
    const next = sparkleTrigger ?? 0;
    if (next > prev) {
      setSparkleKey((k) => (k ?? 0) + 1);
    }
    prevSparkleTriggerRef.current = next;
  }, [sparkleTrigger]);

  return (
    <div className="flex items-center gap-7 px-[18px] py-2">
      <style>{`
        @keyframes progressLeadingGlow {
          0% { opacity: 0.9; transform: scaleY(1.6); }
          100% { opacity: 0; transform: scaleY(1); }
        }
        @keyframes progressShimmerSweep {
          0% { transform: translateX(-120%); opacity: 0; }
          15% { opacity: 0.9; }
          100% { transform: translateX(220%); opacity: 0; }
        }
        @keyframes progressSparkleTwinkle {
          0% { opacity: 0; transform: scale(0.3) rotate(0deg); }
          40% { opacity: 1; transform: scale(1.15) rotate(15deg); }
          100% { opacity: 0; transform: scale(0.6) rotate(30deg); }
        }
      `}</style>
      <button
        type="button"
        aria-label="Close"
        className="shrink-0 w-6 h-6 flex items-center justify-center"
        style={{ color: "#8C94AE" }}
      >
        <X size={24} strokeWidth={2.5} />
      </button>
      <div className="flex-1 relative">
        <div className="h-[11px] bg-[#333952] rounded-full overflow-hidden relative">
          <div
            className="h-full bg-[#3CDB9E] rounded-full transition-[width] duration-[350ms] ease-out relative"
            style={{ width: `${pct}%` }}
          >
            {pct > 5 && (
              <span
                className="absolute bg-[#75EABE] h-[3px] rounded-full top-[2.5px] left-1"
                style={{ right: "4px" }}
              />
            )}

            {/* Leading-edge glow pulse — replays on every fill increase */}
            {pulseKey > 0 && (
              <span
                key={pulseKey}
                className="absolute top-0 bottom-0 w-3 rounded-full"
                style={{
                  right: 0,
                  background: "radial-gradient(circle, rgba(117,234,190,0.9) 0%, rgba(117,234,190,0) 70%)",
                  animation: "progressLeadingGlow 300ms ease-out forwards",
                }}
              />
            )}

            {/* One-off shimmer sweep across the full bar at 100% */}
            {shimmerKey !== null && (
              <span
                key={shimmerKey}
                className="absolute inset-y-0 w-1/3"
                style={{
                  background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.55), transparent)",
                  animation: "progressShimmerSweep 480ms ease-out forwards",
                }}
              />
            )}
          </div>
        </div>

        {/* Sparkle burst around the bar — plays once per level-test reply */}
        {sparkleKey !== null && (
          <div key={sparkleKey} className="pointer-events-none absolute inset-0">
            {SPARKLE_POSITIONS.map((pos, i) => (
              <span
                key={i}
                className="absolute"
                style={{
                  ...pos,
                  animation: `progressSparkleTwinkle 700ms ease-out ${i * 60}ms forwards`,
                }}
              >
                <SparkleIcon />
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Avatar unit ───────────────────────────────────────────────────────────────
// The avatar box and the blurred plate behind it are one unit. The plate is
// deliberately larger than the box so the blur reads as a halo bleeding past
// the edges; the two share a top edge and a horizontal centre, so the plate
// overhangs left, right and bottom only — never above.
const AVATAR_BOX_W = 326;
const AVATAR_BOX_H = 240;
const AVATAR_BACKDROP_W = 360;
const AVATAR_BACKDROP_H = 260;
const AVATAR_BACKDROP_BLUR = 24;
const AVATAR_BACKDROP_COLOR = "#1A1E2D";
// Minimised state: one scale factor drives the whole unit, so the box and the
// plate stay in exact proportion (326x240 -> 130.4x96, 360x260 -> 144x104).
const AVATAR_MINIMIZED_SCALE = 0.4;
const AVATAR_SCALE_MS = 260;
// Where the minimised unit parks, measured to the frame edges. Anchoring by
// `right` (not `left`) is what makes this hold for both silhouettes: the
// top-right transform origin pins that corner, so the right edge lands here
// regardless of how wide the unit is before scaling.
const AVATAR_MINIMIZED_RIGHT = 16;
const AVATAR_MINIMIZED_TOP = 5;

// The scale-down control must stay tappable while minimised, so it gets
// counter-scaled out of the unit's 0.4: 24 * 0.4 * 1.667 = 16px on screen.
const SCALE_BUTTON_PX = 24;
const SCALE_BUTTON_MIN_PX = 16;
const SCALE_BUTTON_COUNTER = SCALE_BUTTON_MIN_PX / (SCALE_BUTTON_PX * AVATAR_MINIMIZED_SCALE);

// How far off the bottom of the thread counts as "reading back". Needs slack:
// smooth-scrolling and sub-pixel layout leave a few px of drift at rest, and a
// 0 threshold would flicker Nova on every settle.
const SCROLL_MINIMIZE_THRESHOLD_PX = 24;

// Minimised silhouette. "rect" keeps the full-size proportions. "circle"
// narrows each layer to its own height so both come out square, then rounds
// them — at 40% that's a 104px plate ring around a 96px avatar disc. The
// narrowing is done on the layout width, not the scale, because scale() is
// uniform and can't change an aspect ratio.
export type MinimizedShape = "rect" | "circle";

// ─── Main Component ────────────────────────────────────────────────────────────

export default function NovaRiveLevelTest({
  language,
  sentences,
  avatarVariant = "nova",
  onAvatarRiveInstance,
  skipToLastQuestionSignal,
  introVariant = "v1",
  v2Occupation = "kaam karte ho",
  v2Goal = "interview",
  minimizedShape = "circle",
  minimizeOnScroll = true,
}: Props) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const messagesRef = useRef<Msg[]>([]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [playingMsgId, setPlayingMsgId] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [results, setResults] = useState<boolean[]>([]);
  const [isDone, setIsDone] = useState(false);

  const [stage, setStage] = useState<Stage>("pretest");
  const [pretestIndex, setPretestIndex] = useState(0);
  // Counts only USER-driven pretest turns (CTA taps + MCQ selections) — auto
  // lines don't move the progress bar, per "progress bar moves on user responses".
  const [pretestResponseCount, setPretestResponseCount] = useState(0);
  const pretestLang: PretestRegister = language === "tamil" ? "ta" : "hi";
  const pretestScriptRef = useRef(
    introVariant === "v3"
      ? buildV3IntroScript()
      : introVariant === "v2"
      ? buildV2IntroScript(v2Occupation, v2Goal)
      : buildPretestScript(sentences.length)
  );
  // V3 only: the goal phrase the grader extracted, or null when it wasn't
  // confident. Read when Message 3 narrates, to pick its Part B branch.
  const v3GoalRef = useRef<string | null>(null);
  // Two independent reasons Nova can be small, kept separate so neither
  // clobbers the other: the button is an explicit user choice that persists,
  // while scrolling back through the thread is a temporary "get out of the way"
  // that undoes itself the moment you return to the latest message.
  const [isManuallyMinimized, setIsManuallyMinimized] = useState(false);
  const [isThreadScrolledUp, setIsThreadScrolledUp] = useState(false);
  const isNovaMinimized = isManuallyMinimized || (minimizeOnScroll && isThreadScrolledUp);

  // Scroll events alone can't tell "the user dragged the thread" from "a new
  // message auto-scrolled it" — both look identical to onScroll. So arm the
  // handler only on real input gestures, and disarm it whenever we scroll
  // programmatically (see the auto-scroll effect below).
  const userScrolledRef = useRef(false);
  const armUserScroll = useCallback(() => {
    userScrolledRef.current = true;
  }, []);

  const handleThreadScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const fromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    // Arriving at the bottom always restores Nova, no matter who scrolled —
    // that's how the auto-scroll to a new message brings her back.
    if (fromBottom <= SCROLL_MINIMIZE_THRESHOLD_PX) {
      setIsThreadScrolledUp(false);
      return;
    }
    // Leaving the bottom only counts when the user did it. The mid-flight
    // frames of a smooth auto-scroll also sit away from the bottom, and acting
    // on those is what made Nova flicker on every new message.
    if (userScrolledRef.current) setIsThreadScrolledUp(true);
  }, []);

  // Geometry for the Nova unit. Only the widths and the corner radii change
  // between silhouettes — heights and the 0.4 scale are constant, so the
  // circle's diameters fall out of the existing heights (260*0.4=104 plate,
  // 240*0.4=96 box) exactly as specced.
  const isCircle = isNovaMinimized && minimizedShape === "circle";
  const unitW = isCircle ? AVATAR_BACKDROP_H : AVATAR_BACKDROP_W;
  const boxW = isCircle ? AVATAR_BOX_H : AVATAR_BOX_W;
  // Circle mode centres the avatar disc inside the plate disc (a 10px ring at
  // this scale); rect mode keeps them sharing a top edge as before.
  const boxTop = isCircle ? (AVATAR_BACKDROP_H - AVATAR_BOX_H) / 2 : 0;
  const pretestResponseTotalRef = useRef(
    pretestScriptRef.current.filter((l) => l.kind !== "auto").length,
  );
  // Bumped once per spoken reply during the level test — triggers a one-off
  // sparkle burst around the progress bar.
  const [levelTestReplySparkle, setLevelTestReplySparkle] = useState(0);

  const bottomRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const lipSyncAnalyserRef = useRef<AnalyserNode | null>(null);
  // Pending "audio never played, advance anyway" timer — see silentReadMs.
  const silentEndRef = useRef<number | null>(null);
  const cancelledRef = useRef(false);
  const currentIndexRef = useRef(0);
  const scoreRef = useRef(0);
  // Set for exactly one render when the "skip to last question" shortcut
  // fires — suppresses the normal pretest-finish / first-question effects so
  // they don't race the skip's own jump-straight-to-Q6 message.
  const debugSkipRef = useRef(false);
  // Per-question log, appended live as each answer is graded — feeds the
  // dynamic post-test results summary. Never reconstructed after the fact.
  const answerLogRef = useRef<AnswerLogEntry[]>([]);

  // ── Lightning-bolt flourish: mic button → progress bar ──────────────────────
  const phoneBoxRef = useRef<HTMLDivElement>(null);
  const micButtonWrapRef = useRef<HTMLDivElement>(null);
  const progressBarWrapRef = useRef<HTMLDivElement>(null);
  const boltInFlightRef = useRef(false);
  const [bolt, setBolt] = useState<{ id: number; from: Point; to: Point } | null>(null);

  const spawnLightningBolt = useCallback(() => {
    if (boltInFlightRef.current) return; // let the in-flight bolt finish, never stack
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const boxEl = phoneBoxRef.current;
    const micEl = micButtonWrapRef.current;
    const barEl = progressBarWrapRef.current;
    if (!boxEl || !micEl || !barEl) return;

    const boxRect = boxEl.getBoundingClientRect();
    const micRect = micEl.getBoundingClientRect();
    const barRect = barEl.getBoundingClientRect();

    boltInFlightRef.current = true;
    setBolt({
      id: Date.now(),
      from: {
        x: micRect.left + micRect.width / 2 - boxRect.left,
        y: micRect.top + micRect.height / 2 - boxRect.top,
      },
      to: {
        x: barRect.left + barRect.width / 2 - boxRect.left,
        y: barRect.top + barRect.height / 2 - boxRect.top,
      },
    });
  }, []);

  const handleBoltDone = useCallback(() => {
    boltInFlightRef.current = false;
    setBolt(null);
  }, []);

  const { start: startMic, stop: stopMic, blob: audioBlob, isRecording, analyser, resetBlob } = useMicRecorder();

  useEffect(() => {
    // Auto-scrolling to the newest message is a system action, not the user
    // reading back — so disarm the scroll handler for it. The handler still
    // clears the flag once the scroll lands at the bottom, which is what
    // restores Nova after a new message arrives.
    userScrolledRef.current = false;
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, phase]);

  // ── TTS playback ─────────────────────────────────────────────────────────────

  const stopTts = useCallback(() => {
    if (silentEndRef.current !== null) {
      clearTimeout(silentEndRef.current);
      silentEndRef.current = null;
    }
    audioRef.current?.pause();
    if (audioSourceRef.current) {
      audioSourceRef.current.onended = null;
      try { audioSourceRef.current.stop(); } catch { /* already stopped */ }
      audioSourceRef.current = null;
    }
    lipSyncAnalyserRef.current = null;
    window.speechSynthesis?.cancel();
    setPlayingMsgId(null);
    setPhase("idle");
  }, []);

  const playTts = useCallback(async (msgId: string, text: string, onEnd?: () => void) => {
    // Stop anything currently playing
    if (silentEndRef.current !== null) {
      clearTimeout(silentEndRef.current);
      silentEndRef.current = null;
    }
    audioRef.current?.pause();
    if (audioSourceRef.current) {
      audioSourceRef.current.onended = null;
      try { audioSourceRef.current.stop(); } catch { /* already stopped */ }
      audioSourceRef.current = null;
    }
    lipSyncAnalyserRef.current = null;

    setPlayingMsgId(msgId);
    // NOTE: setPhase("playing") is called LAST in each path, AFTER the analyser is wired,
    // so SupernovaAvatar's isSpeaking effect sees lipSyncAnalyserRef.current already set.

    console.log("[TTS] playTts", { msgId, text: text.slice(0, 60) });

    const handleEnd = () => {
      audioSourceRef.current = null;
      lipSyncAnalyserRef.current = null;
      setPlayingMsgId(null);
      setPhase("idle");
      onEnd?.();
    };

    // Audio was blocked or broke. Advancing immediately would stampede the
    // whole script, so hold the line on screen for as long as speaking it would
    // have taken, then continue.
    const endAfterSilence = () => {
      lipSyncAnalyserRef.current = null;
      setPlayingMsgId(null);
      setPhase("idle");
      silentEndRef.current = window.setTimeout(() => {
        silentEndRef.current = null;
        onEnd?.();
      }, silentReadMs(text));
    };

    const ctx = audioCtxRef.current;

    if (!ctx || ctx.state === "closed") {
      // HTMLAudioElement fallback (no lip sync — AudioContext not yet created)
      try {
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
        const ab = await res.arrayBuffer();
        const blob = new Blob([ab], { type: "audio/mpeg" });
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onended = () => { URL.revokeObjectURL(url); handleEnd(); };
        await audio.play();
        setPhase("playing"); // after play() so avatar knows audio is running
      } catch (err) {
        console.error("[TTS] HTMLAudioElement fallback failed", err);
        endAfterSilence();
      }
      return;
    }

    // AudioBufferSource path — wire analyser BEFORE setPhase("playing") so the
    // avatar's isSpeaking effect always finds lipSyncAnalyserRef.current non-null.
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.6;
    lipSyncAnalyserRef.current = analyser; // set SYNCHRONOUSLY before any await

    try {
      if (ctx.state === "suspended") await ctx.resume();
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const ab = await res.arrayBuffer();
      const buffer = await ctx.decodeAudioData(ab);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      audioSourceRef.current = source;
      source.connect(analyser);
      analyser.connect(ctx.destination);
      source.onended = handleEnd;
      source.start();
      setPhase("playing"); // AFTER source.start() + analyser wired → avatar gets correct ref
      console.log("[TTS] source.start() — lip sync wired");
    } catch (err) {
      audioSourceRef.current = null;
      lipSyncAnalyserRef.current = null;
      console.error("[TTS] AudioBufferSource failed", err);
      endAfterSilence();
    }
  }, []);

  // ── Advance to next sentence or finish ────────────────────────────────────────

  const advanceSentence = useCallback((wasCorrect: boolean) => {
    const nextIndex = currentIndexRef.current + 1;
    // Fired here, in the same tick as the state updates below that actually
    // move the bar — the bolt's flight and the bar's own fill transition
    // play concurrently, so the bolt "lands" right as the bar finishes
    // filling, whether this is a normal step or the final one.
    spawnLightningBolt();
    setResults((prev) => {
      const updated = [...prev, wasCorrect];
      return updated;
    });
    if (wasCorrect) {
      scoreRef.current += 1;
      setScore(scoreRef.current);
    }

    if (nextIndex >= sentences.length) {
      setIsDone(true);
      // Nova's own reply to the final answer — stays in the normal chat
      // thread (same screen the bar just hit 100% on) and waits for the
      // user to tap through before the thinking loader takes over.
      const msgId = "ai-final-cta";
      const text = `Great! You've answered all ${sentences.length} questions. Ready to see your results?`;
      const msg: Msg = {
        id: msgId,
        role: "ai",
        text,
        interactive: { type: "cta", ctaLabel: "Show my results", tapped: false },
      };
      messagesRef.current = [...messagesRef.current, msg];
      setMessages([...messagesRef.current]);
      void playTts(msgId, text);
      return;
    }

    currentIndexRef.current = nextIndex;
    setCurrentIndex(nextIndex);

    const next = sentences[nextIndex]!;
    // Display keeps the "1/6" shorthand; TTS gets "1 of 6" — Cartesia reads
    // "1/6" as a date ("1 July") otherwise.
    const displayLeadIn = `Question ${nextIndex + 1}/${sentences.length}: translate this to English.`;
    const spokenLeadIn = `Question ${nextIndex + 1} of ${sentences.length}. Translate this to English.`;
    const msgId = `ai-q-${nextIndex}`;
    const msg: Msg = { id: msgId, role: "ai", text: displayLeadIn, quizSentence: next.sentence };

    const showNextQuestion = () => {
      messagesRef.current = [...messagesRef.current, msg];
      setMessages([...messagesRef.current]);
      // Spoken as two separate TTS calls — "Question N of Total" must always
      // be recited in English, but Cartesia's language auto-detect can bleed
      // Hindi/Tamil pronunciation onto it if it shares one utterance with the
      // native-script sentence that follows.
      void playTts(msgId, spokenLeadIn, () => {
        void playTts(msgId, next.sentence);
      });
    };

    // One-time milestone nudge after the 3rd question is answered (halfway
    // through a 6-question test) — spoken/shown before the next question.
    if (nextIndex === 3) {
      const encourageId = `ai-encourage-${nextIndex}`;
      const encourageText = "Aap bahut achha kar rahe ho! Abhi 3 aur sawaal baaki hain.";
      const encourageMsg: Msg = { id: encourageId, role: "ai", text: encourageText };
      messagesRef.current = [...messagesRef.current, encourageMsg];
      setMessages([...messagesRef.current]);
      void playTts(encourageId, encourageText, showNextQuestion);
    } else {
      showNextQuestion();
    }
  }, [sentences, playTts, spawnLightningBolt]);

  // ── Evaluate user translation ──────────────────────────────────────────────────
  // Nova asks questions one after another with no feedback in between — the
  // evaluation result is only used silently for scoring (ResultsScreen), never
  // shown or spoken. Always advances straight to the next question.

  const evaluateTranslation = useCallback(async (userText: string) => {
    setPhase("evaluating");
    const current = sentences[currentIndexRef.current]!;

    try {
      const res = await fetch("/api/nova-level-test/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sentence: current.sentence,
          language,
          userTranslation: userText,
          expectedTranslation: current.expectedTranslation,
        }),
      });
      const data = (await res.json()) as { correct: boolean };
      answerLogRef.current = [...answerLogRef.current, {
        concept: current.concept,
        sentence: current.sentence,
        correct: data.correct,
        userAnswer: userText,
        expectedTranslation: current.expectedTranslation,
      }];
      advanceSentence(data.correct);
    } catch (err) {
      console.error("[evaluate] failed", err);
      // Don't get stuck on a broken API call — advance anyway (counted as
      // incorrect for scoring purposes).
      answerLogRef.current = [...answerLogRef.current, {
        concept: current.concept,
        sentence: current.sentence,
        correct: false,
        userAnswer: userText,
        expectedTranslation: current.expectedTranslation,
      }];
      advanceSentence(false);
    }
  }, [sentences, language, advanceSentence]);

  // V2 intro only: the real tap-to-speak mic bar (same one the level test
  // uses) appears once the "Tell me about yourself" question has finished
  // narrating, and hides again the instant the answer is submitted. Declared
  // here (not near the other render-time derived values below) because the
  // transcribe effect right below needs it too.
  // V2 asks "tell me about yourself", V3 asks "why do you want to improve
  // English" — different copy, identical answer plumbing, so both resolve to
  // one question message id and share the bar below.
  const introQuestionLineId = introVariant === "v3" ? V3_QUESTION_LINE_ID : "v2-question";
  const introQuestionMsgId = `pretest-${introQuestionLineId}`;
  const introQuestionMsg = messages.find((m) => m.id === introQuestionMsgId);
  const showV2MicBar =
    (introVariant === "v2" || introVariant === "v3") &&
    stage === "pretest" &&
    introQuestionMsg?.interactive?.type === "cta" &&
    !introQuestionMsg.interactive.tapped;

  // V2 intro only: grades the real transcript via Gemini and attaches the
  // result to the same message the "checking" placeholder already put on
  // screen. Message 3 only appears once grading resolves, matching "feedback
  // renders, then Message 3 appears."
  // V3 intro: corrects the answer AND extracts the user's goal in one call,
  // then attaches the tagged-span feedback to the placeholder already on
  // screen. The extracted goal is stashed for Message 3's Part B.
  //
  // Every failure path lands on goal_confident: false. Naming a goal the user
  // never stated is worse than not naming one — it turns "it understood me"
  // into "it wasn't listening" — so an unsure grade must never be upgraded to
  // a confident one.
  const handleV3Grade = useCallback(async (answerMsgId: string, answer: string) => {
    messagesRef.current = messagesRef.current.map((m) =>
      m.id === answerMsgId ? { ...m, text: answer } : m
    );
    setMessages([...messagesRef.current]);
    setPhase("evaluating");

    let original = answer;
    let corrected = answer;
    try {
      const res = await fetch("/api/nova-onboarding/correct-and-extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer }),
      });
      const data = (await res.json()) as {
        original?: string;
        corrected?: string;
        goal_theme?: string;
        goal_confident?: boolean;
      };
      if (typeof data.original === "string" && typeof data.corrected === "string") {
        original = data.original;
        corrected = data.corrected;
      }
      v3GoalRef.current =
        data.goal_confident === true && data.goal_theme?.trim() ? data.goal_theme.trim() : null;
    } catch (err) {
      // Hardcoded fallback — echo their own words back with no corrections and
      // no goal, so the flow continues without inventing either.
      console.error("[v3-grade] failed", err);
      v3GoalRef.current = null;
    } finally {
      messagesRef.current = messagesRef.current.map((m) =>
        m.id === answerMsgId ? { ...m, feedback: { status: "tagged", original, corrected } } : m
      );
      setMessages([...messagesRef.current]);
      setPhase("idle");
      setPretestIndex((i) => i + 1);
    }
  }, []);

  const handleV2Grade = useCallback(async (answerMsgId: string, transcript: string) => {
    messagesRef.current = messagesRef.current.map((m) =>
      m.id === answerMsgId ? { ...m, text: transcript } : m
    );
    setMessages([...messagesRef.current]);
    setPhase("evaluating");

    try {
      const res = await fetch("/api/nova-onboarding/grade-speaking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript }),
      });
      const data = (await res.json()) as { correct: boolean; corrected: string };
      messagesRef.current = messagesRef.current.map((m) =>
        m.id === answerMsgId
          ? {
              ...m,
              feedback: data.correct
                ? { status: "correct" }
                : { status: "incorrect", original: transcript, corrected: data.corrected },
            }
          : m
      );
    } catch (err) {
      console.error("[v2-grade] failed", err);
      // Don't get stuck on a broken API call — fail open rather than leave
      // the card stuck on "Checking...".
      messagesRef.current = messagesRef.current.map((m) =>
        m.id === answerMsgId ? { ...m, feedback: { status: "correct" } } : m
      );
    } finally {
      setMessages([...messagesRef.current]);
      setPhase("idle");
      setPretestIndex((i) => i + 1);
    }
  }, []);

  // ── Transcribe blob when recording stops ──────────────────────────────────────

  useEffect(() => {
    if (!audioBlob) return;
    resetBlob();

    if (cancelledRef.current) {
      cancelledRef.current = false;
      setPhase("idle");
      return;
    }

    setPhase("transcribing");

    // V2 intro only: show the "Checking..." card immediately — before we
    // even know the transcript, let alone the grade — so there's no gap
    // between "recording stopped" and "some feedback state is visible".
    const isV2Answer = showV2MicBar;
    const v2AnswerMsgId = "v2-answer";
    if (isV2Answer) {
      messagesRef.current = messagesRef.current.map((m) =>
        m.id === introQuestionMsgId && m.interactive?.type === "cta"
          ? { ...m, interactive: { ...m.interactive, tapped: true } }
          : m
      );
      const placeholderMsg: Msg = { id: v2AnswerMsgId, role: "user", text: "", feedback: { status: "checking" } };
      messagesRef.current = [...messagesRef.current, placeholderMsg];
      setMessages([...messagesRef.current]);
      setPretestResponseCount((c) => c + 1);
    }

    const transcribe = async () => {
      const formData = new FormData();
      formData.append("audio", audioBlob, "audio.webm");

      try {
        const res = await fetch("/api/nova-level-test/transcribe", { method: "POST", body: formData });
        const data = (await res.json()) as { text?: string };

        if (data.text) {
          if (isV2Answer) {
            if (introVariant === "v3") void handleV3Grade(v2AnswerMsgId, data.text);
            else void handleV2Grade(v2AnswerMsgId, data.text);
          } else {
            const userMsg: Msg = { id: `u-${Date.now()}`, role: "user", text: data.text };
            messagesRef.current = [...messagesRef.current, userMsg];
            setMessages([...messagesRef.current]);
            setLevelTestReplySparkle((n) => n + 1);
            void evaluateTranslation(data.text);
          }
        } else if (isV2Answer) {
          // STT failed — drop the placeholder and re-arm the question's mic
          // bar so the user can just try again, no dead-end error bubble.
          messagesRef.current = messagesRef.current
            .filter((m) => m.id !== v2AnswerMsgId)
            .map((m) =>
              m.id === introQuestionMsgId && m.interactive?.type === "cta"
                ? { ...m, interactive: { ...m.interactive, tapped: false } }
                : m
            );
          setMessages([...messagesRef.current]);
          setPretestResponseCount((c) => Math.max(0, c - 1));
          setPhase("idle");
        } else {
          const errMsg: Msg = { id: `err-${Date.now()}`, role: "ai", text: "Couldn't catch that — tap the mic and try again." };
          messagesRef.current = [...messagesRef.current, errMsg];
          setMessages([...messagesRef.current]);
          setPhase("idle");
        }
      } catch (err) {
        console.error("[transcribe] failed", err);
        setPhase("idle");
      }
    };

    void transcribe();
  }, [audioBlob]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Pre-test dialogue (hardcoded script) ─────────────────────────────────────

  const runPretestLine = useCallback((index: number) => {
    const line = pretestScriptRef.current[index];
    if (!line) return;

    // V3's Message 3 is the one script line whose copy isn't fixed — its
    // Part B names the extracted goal, or falls back to the generic
    // acknowledgment when the grader wasn't confident.
    const text =
      line.id === V3_ACK_LINE_ID ? buildV3AckText(v3GoalRef.current) : line.text[pretestLang];
    const preDelay = line.kind === "auto" ? (line.preDelayMs ?? 0) : 0;

    window.setTimeout(() => {
      if (debugSkipRef.current) return; // a skip fired while this line was pending
      setPhase("evaluating"); // reuse the existing typing-dots bubble
      window.setTimeout(() => {
        if (debugSkipRef.current) return;
        const msgId = `pretest-${line.id}`;
        // Dev-only React StrictMode double-invokes this effect on mount,
        // which would otherwise push this exact line twice — guard by id.
        if (messagesRef.current.some((m) => m.id === msgId)) return;
        setPhase("idle");
        const msg: Msg = { id: msgId, role: "ai", text };
        messagesRef.current = [...messagesRef.current, msg];
        setMessages([...messagesRef.current]);

        // Only advance / reveal the next interactive step once this line's
        // narration has actually finished playing — prevents the next line's
        // TTS call from cutting this one off mid-sentence.
        const onNarrationEnd = () => {
          if (line.kind === "auto") {
            setPretestIndex(index + 1);
            return;
          }

          let interactive: MsgInteractive;
          if (line.kind === "cta") {
            interactive = { type: "cta", ctaLabel: line.cta[pretestLang], tapped: false };
          } else if (line.kind === "select") {
            interactive = { type: "select", options: line.options.map((o) => o[pretestLang]) };
          } else if (line.kind === "select-plain") {
            interactive = { type: "select", options: line.options };
          } else {
            interactive = {
              type: "final",
              bullets: line.bullets.map((b) => b[pretestLang]),
              ctaLabel: line.cta[pretestLang],
              tapped: false,
            };
          }

          messagesRef.current = messagesRef.current.map((m) =>
            m.id === msgId ? { ...m, interactive } : m
          );
          setMessages([...messagesRef.current]);
        };

        const segments = splitForcedEnglishSegments(stripEmojisForTts(text), "30-day plan");
        const playSegment = (i: number) => {
          if (i >= segments.length) { onNarrationEnd(); return; }
          void playTts(msgId, segments[i]!, () => playSegment(i + 1));
        };
        playSegment(0);
      }, 900);
    }, preDelay);
  }, [pretestLang, playTts]);

  useEffect(() => {
    if (stage !== "pretest") return;
    runPretestLine(pretestIndex);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pretestIndex]);

  // Tapping a CTA or MCQ option locks the original card (button/options hidden,
  // any informational content like bullets stays) and appends a distinct
  // "user response" bubble recording exactly what was chosen.

  const pushTappedResponse = useCallback((label: string) => {
    const userMsg: Msg = {
      id: `pretest-u-${Date.now()}`,
      role: "user",
      text: label,
      isTappedResponse: true,
    };
    messagesRef.current = [...messagesRef.current, userMsg];
    setMessages([...messagesRef.current]);
  }, []);

  const handlePretestOptionTap = useCallback((msgId: string, optionIndex: number) => {
    const target = messagesRef.current.find((m) => m.id === msgId);
    if (target?.interactive?.type !== "select" || target.interactive.selectedIndex !== undefined) {
      return;
    }
    const label = target.interactive.options[optionIndex] ?? "";
    messagesRef.current = messagesRef.current.map((m) =>
      m.id === msgId && m.interactive?.type === "select"
        ? { ...m, interactive: { ...m.interactive, selectedIndex: optionIndex } }
        : m
    );
    setMessages([...messagesRef.current]);
    pushTappedResponse(label);
    setPretestResponseCount((c) => c + 1);
    setPretestIndex((i) => i + 1);
  }, [pushTappedResponse]);

  const handlePretestCta = useCallback((msgId: string) => {
    const target = messagesRef.current.find((m) => m.id === msgId);
    if (target?.interactive?.type !== "cta" || target.interactive.tapped) {
      return;
    }
    const label = target.interactive.ctaLabel;
    messagesRef.current = messagesRef.current.map((m) =>
      m.id === msgId && m.interactive?.type === "cta"
        ? { ...m, interactive: { ...m.interactive, tapped: true } }
        : m
    );
    setMessages([...messagesRef.current]);
    pushTappedResponse(label);
    setPretestResponseCount((c) => c + 1);
    setPretestIndex((i) => i + 1);
  }, [pushTappedResponse]);

  const handlePretestFinalCta = useCallback((msgId: string) => {
    const target = messagesRef.current.find((m) => m.id === msgId);
    if (target?.interactive?.type !== "final" || target.interactive.tapped) {
      return;
    }
    const label = target.interactive.ctaLabel;
    messagesRef.current = messagesRef.current.map((m) =>
      m.id === msgId && m.interactive?.type === "final"
        ? { ...m, interactive: { ...m.interactive, tapped: true } }
        : m
    );
    setMessages([...messagesRef.current]);
    pushTappedResponse(label);
    setPretestResponseCount((c) => c + 1);
    stopTts();
    setStage("test");
  }, [pushTappedResponse, stopTts]);

  const handleShowResultsCta = useCallback((msgId: string) => {
    const target = messagesRef.current.find((m) => m.id === msgId);
    if (target?.interactive?.type !== "cta" || target.interactive.tapped) {
      return;
    }
    messagesRef.current = messagesRef.current.map((m) =>
      m.id === msgId && m.interactive?.type === "cta"
        ? { ...m, interactive: { ...m.interactive, tapped: true } }
        : m
    );
    stopTts();
    pushTappedResponse("Show my results");

    // Appends as the next message in the same chat thread — same bubble
    // component as every other AI message, not a separate screen. A short
    // 2s loading beat comes first, then auto-advances into the real results.
    const loadingMsg: Msg = {
      id: "ai-report-loading",
      role: "ai",
      text: "",
      interactive: { type: "report-loading" },
    };
    messagesRef.current = [...messagesRef.current, loadingMsg];
    setMessages([...messagesRef.current]);

    window.setTimeout(() => {
      const resultsMsg: Msg = {
        id: "ai-results",
        role: "ai",
        text: "",
        interactive: { type: "results", log: answerLogRef.current, ctaLabel: "Next", tapped: false },
      };
      messagesRef.current = [...messagesRef.current, resultsMsg];
      setMessages([...messagesRef.current]);
    }, 2000);
  }, [stopTts, pushTappedResponse]);

  const handleResultsNext = useCallback((msgId: string) => {
    const target = messagesRef.current.find((m) => m.id === msgId);
    if (target?.interactive?.type !== "results" || target.interactive.tapped) {
      return;
    }
    messagesRef.current = messagesRef.current.map((m) =>
      m.id === msgId && m.interactive?.type === "results"
        ? { ...m, interactive: { ...m.interactive, tapped: true } }
        : m
    );
    pushTappedResponse("Next");

    // Same 2s loading-beat pattern as handleShowResultsCta's report-loading
    // — auto-advances into the real Grammar Overview message, no CTA gate.
    const loadingMsg: Msg = {
      id: "ai-grammar-loading",
      role: "ai",
      text: "",
      interactive: { type: "grammar-loading" },
    };
    messagesRef.current = [...messagesRef.current, loadingMsg];
    setMessages([...messagesRef.current]);

    window.setTimeout(() => {
      const grammarMsgId = "ai-grammar-overview";
      const grammarMsg: Msg = {
        id: grammarMsgId,
        role: "ai",
        text: "",
        interactive: { type: "grammar-overview", ctaLabel: "Create my 30 day plan", tapped: false },
      };
      messagesRef.current = [...messagesRef.current, grammarMsg];
      setMessages([...messagesRef.current]);
      // Spoken text mirrors GrammarOverviewBody's copy exactly — the dot
      // widget itself has no text of its own, so nothing to strip out here.
      const spokenText =
        "Aapke level test ke base par, yeh raha aapka English overview. " +
        "English mein confident banne ke liye, aapko do cheezein chahiye — apni grammar sahi karna, aur speaking practice karna. " +
        "Dono milkar hi aapko fluent banayenge. " +
        "Aapki strengths aur weaknesses ke base par, main aapka 30-day plan aise banaungi 👇";
      void playTts(grammarMsgId, stripEmojisForTts(spokenText));
    }, 2000);
  }, [pushTappedResponse, playTts]);

  const handleGrammarOverviewNext = useCallback((msgId: string) => {
    const target = messagesRef.current.find((m) => m.id === msgId);
    if (target?.interactive?.type !== "grammar-overview" || target.interactive.tapped) {
      return;
    }
    messagesRef.current = messagesRef.current.map((m) =>
      m.id === msgId && m.interactive?.type === "grammar-overview"
        ? { ...m, interactive: { ...m.interactive, tapped: true } }
        : m
    );
    pushTappedResponse("Create my 30 day plan");

    // A plain spoken line — no widget, so it renders through the default
    // AI-bubble path. The loader message only appears once this one's
    // narration actually finishes (same "wait for TTS to end" convention
    // used throughout the pretest script), not on a fixed timer.
    const buildingMsgId = "ai-plan-building";
    const buildingText = "Main aapka 30-day plan bana rahi hoon.";
    const buildingMsg: Msg = { id: buildingMsgId, role: "ai", text: buildingText };
    messagesRef.current = [...messagesRef.current, buildingMsg];
    setMessages([...messagesRef.current]);

    void playTts(buildingMsgId, stripEmojisForTts(buildingText), () => {
      const loaderMsg: Msg = {
        id: "ai-loader",
        role: "ai",
        text: "",
        interactive: { type: "loader" },
      };
      messagesRef.current = [...messagesRef.current, loaderMsg];
      setMessages([...messagesRef.current]);
    });
  }, [pushTappedResponse, playTts]);

  // Fires once the 14s thinking loader completes — pushes the 30-day plan
  // message. TTS is given ONLY the plain message text (emoji stripped, same
  // rule as everywhere else); the widget itself is a structurally separate
  // node and is never concatenated into the string sent to Cartesia.
  const handleThinkingComplete = useCallback(() => {
    const msgId = "ai-plan";
    const text = "Your 30-day plan is ready! 🏆 This will help improve your English by up to 40%.";
    const planMsg: Msg = {
      id: msgId,
      role: "ai",
      text,
      interactive: { type: "plan" },
    };
    messagesRef.current = [...messagesRef.current, planMsg];
    setMessages([...messagesRef.current]);
    void playTts(msgId, stripEmojisForTts(text));
  }, [playTts]);

  // ── Auto-play first level-test sentence once the pre-test script finishes ────

  useEffect(() => {
    if (stage !== "test") return;
    if (debugSkipRef.current) { debugSkipRef.current = false; return; } // skip owns this transition
    const first = sentences[0];
    if (!first) return;
    const displayLeadIn = `Let's begin. Question 1/${sentences.length}: translate this to English.`;
    const spokenLeadIn = `Let's begin. Question 1 of ${sentences.length}. Translate this to English.`;
    const msgId = "ai-q-0";
    const msg: Msg = { id: msgId, role: "ai", text: displayLeadIn, quizSentence: first.sentence };
    messagesRef.current = [...messagesRef.current, msg];
    setMessages([...messagesRef.current]);
    // Two separate TTS calls — see note in advanceSentence: keeps "Question 1
    // of N" as clean English speech, unaffected by the native-script sentence.
    void playTts(msgId, spokenLeadIn, () => {
      void playTts(msgId, first.sentence);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  // ── Debug shortcut: jump straight to the last level-test question ───────────
  // Wired from outside the mobile UI (a prototyping aid, not user-facing) —
  // any change in skipToLastQuestionSignal fires this, regardless of value.

  const didMountSkipRef = useRef(false);
  useEffect(() => {
    if (!didMountSkipRef.current) {
      didMountSkipRef.current = true;
      return; // don't fire on initial mount, only on later signal changes
    }
    if (skipToLastQuestionSignal === undefined) return;

    debugSkipRef.current = true;
    stopTts();
    window.speechSynthesis?.cancel();

    const lastIndex = sentences.length - 1;
    const last = sentences[lastIndex];
    if (!last) return;

    currentIndexRef.current = lastIndex;
    setCurrentIndex(lastIndex);
    setResults([]);
    answerLogRef.current = [];
    scoreRef.current = 0;
    setScore(0);
    setIsDone(false);
    setPhase("idle");
    setStage("test");

    const displayLeadIn = `Question ${lastIndex + 1}/${sentences.length}: translate this to English.`;
    const spokenLeadIn = `Question ${lastIndex + 1} of ${sentences.length}. Translate this to English.`;
    const msgId = `ai-q-${lastIndex}`;
    const msg: Msg = { id: msgId, role: "ai", text: displayLeadIn, quizSentence: last.sentence };
    messagesRef.current = [msg];
    setMessages([msg]);
    void playTts(msgId, spokenLeadIn, () => {
      void playTts(msgId, last.sentence);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skipToLastQuestionSignal]);

  // ── Cleanup on unmount ───────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      if (audioSourceRef.current) {
        audioSourceRef.current.onended = null;
        try { audioSourceRef.current.stop(); } catch {}
      }
      window.speechSynthesis?.cancel();
      audioCtxRef.current?.close().catch(() => {});
    };
  }, []);

  // ── Audio unlock ─────────────────────────────────────────────────────────────
  // Browsers block audio on an origin until the user has interacted with it.
  // Locally that never bites — the dev origin builds up enough media engagement
  // that Chrome just allows autoplay — but on a fresh deployed domain (and
  // always on iOS) the first play() rejects and Nova is silent.
  //
  // An AudioContext created outside a gesture starts suspended, so create it
  // *inside* the first one, anywhere on the page. That both unlocks playback and
  // upgrades every later line from the HTMLAudio fallback to the AudioBuffer
  // path, which is the one that drives lip sync.
  useEffect(() => {
    const unlock = () => {
      if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
        audioCtxRef.current = new AudioContext();
      }
      void audioCtxRef.current.resume().catch(() => {});
      remove();
    };
    const events: (keyof DocumentEventMap)[] = ["pointerdown", "touchstart", "keydown"];
    const remove = () => events.forEach((e) => document.removeEventListener(e, unlock, true));
    events.forEach((e) => document.addEventListener(e, unlock, true));
    return remove;
  }, []);

  // ── Recorder controls ────────────────────────────────────────────────────────

  const handleTapStart = useCallback(async () => {
    stopTts();
    if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
      audioCtxRef.current = new AudioContext();
    }
    audioCtxRef.current?.resume().catch(() => {});
    setPhase("recording");
    await startMic();
  }, [startMic, stopTts]);

  const handleTapStop = useCallback(() => {
    stopMic();
  }, [stopMic]);

  const handleTapCancel = useCallback(() => {
    cancelledRef.current = true;
    stopMic();
  }, [stopMic]);

  const current = sentences[currentIndex];

  // Progress moves on USER RESPONSES only — pretest auto lines (greeting,
  // assurance, etc.) don't move the bar; only CTA taps / MCQ selections do.
  // Computed from the actual script (not a hardcoded step count), so it stays
  // correct as either phase grows. isDone is the explicit override that snaps
  // progress to exactly 100% on the same turn the final question is answered.
  // An extra "started" step is counted as complete from the very first render
  // so the bar always shows a sliver of fill instead of sitting empty.
  const START_STEP = 1;
  const totalTurns = START_STEP + pretestResponseTotalRef.current + sentences.length;
  const completedTurns =
    START_STEP +
    (stage === "pretest"
      ? pretestResponseCount
      : pretestResponseTotalRef.current + currentIndex);
  const progress = isDone ? 1 : Math.min(completedTurns / totalTurns, 1);

  return (
    <div className="min-h-dvh flex items-center justify-center" style={{ backgroundColor: "#FFFFFF" }}>
      <style>{`.nova-canvas-blend canvas { width: 100% !important; height: 100% !important; display: block; }`}</style>
      <div ref={phoneBoxRef} className="relative flex flex-col w-[360px] h-[800px] mx-auto bg-[#12151E] overflow-hidden">

        {/* Fake status bar */}
        <FakeStatusBar />

        {/* Progress bar */}
        <div ref={progressBarWrapRef} className="shrink-0 relative z-20 bg-[#12151E]">
          <ProgressBar progress={progress} sparkleTrigger={levelTestReplySparkle} />
        </div>

        {bolt && <LightningBolt key={bolt.id} from={bolt.from} to={bolt.to} onDone={handleBoltDone} />}

        {/* Rive avatar + Chat overlay area */}
        <div className="relative flex-1 min-h-0">
          {/* Nova unit — the blur plate and the avatar box scale together as
              one. A single transform on this wrapper is what keeps them locked:
              scaling them separately would let rounding drift the two apart.
              Centred with marginLeft rather than translateX(-50%) so `transform`
              is free to carry the scale alone.
              z-[5] deliberately: the chat thread below is position:absolute with
              z-index:auto, which paints at the same level as z-index:0 in DOM
              order — and it comes later, so at z-0 this unit sat *under* the
              messages despite being opaque. */}
          <div
            className="absolute z-[5] pointer-events-none"
            style={{
              width: `${unitW}px`,
              height: `${AVATAR_BACKDROP_H}px`,
              // Anchored by its right edge. At full size the unit is exactly the
              // 360px frame width, so right:0 sits flush/centred; minimised, the
              // top-right origin holds that same edge, so this is simply where
              // the shrunken unit ends up — true for both silhouettes even
              // though they differ in width.
              top: `${isNovaMinimized ? AVATAR_MINIMIZED_TOP : 0}px`,
              right: `${isNovaMinimized ? AVATAR_MINIMIZED_RIGHT : 0}px`,
              transform: `scale(${isNovaMinimized ? AVATAR_MINIMIZED_SCALE : 1})`,
              transformOrigin: "top right",
              transition: `transform ${AVATAR_SCALE_MS}ms linear, width ${AVATAR_SCALE_MS}ms linear, top ${AVATAR_SCALE_MS}ms linear, right ${AVATAR_SCALE_MS}ms linear`,
            }}
          >
            {/* Blur plate — fills the unit */}
            <div
              className="absolute inset-0"
              style={{
                backgroundColor: AVATAR_BACKDROP_COLOR,
                filter: `blur(${AVATAR_BACKDROP_BLUR}px)`,
                borderRadius: isCircle ? "50%" : "0px",
                transition: `border-radius ${AVATAR_SCALE_MS}ms linear`,
              }}
            />

          {/* Avatar frame — deliberately NOT overflow-hidden, so the scale-down
              control below can sit at its corner without being eaten by the
              circular clip on the box inside it. */}
          <div
            className="absolute z-10"
            style={{
              width: `${boxW}px`,
              height: `${AVATAR_BOX_H}px`,
              top: `${boxTop}px`,
              left: "50%",
              marginLeft: `-${boxW / 2}px`,
              transition: `width ${AVATAR_SCALE_MS}ms linear, margin-left ${AVATAR_SCALE_MS}ms linear, top ${AVATAR_SCALE_MS}ms linear`,
            }}
          >
          {/* The box itself — background, clip and radius */}
          <div
            className="absolute inset-0 overflow-hidden"
            style={{
              margin: 0,
              padding: 0,
              backgroundColor: "#1A1E2D",
              backgroundImage: "url('/classroom-bg.jpg')",
              backgroundSize: "100% 100%",
              backgroundPosition: "center",
              backgroundRepeat: "no-repeat",
              borderRadius: isCircle ? "50%" : "20px",
              transition: `border-radius ${AVATAR_SCALE_MS}ms linear`,
            }}
          >
            <div
              className="pointer-events-none nova-canvas-blend absolute"
              style={{
                // Pinned to the full-size box footprint and centred, rather than
                // w-full/h-full: when the box narrows for the circle the canvas
                // keeps its dimensions and simply gets cropped, instead of Rive
                // re-fitting the artboard into a narrower canvas and shrinking
                // the avatar.
                width: `${AVATAR_BOX_W}px`,
                height: `${AVATAR_BOX_H}px`,
                top: 0,
                left: "50%",
                marginLeft: `-${AVATAR_BOX_W / 2}px`,
                // Each rig is framed differently inside its artboard, so the
                // two variants need their own scale. Both grow/shrink from the
                // bottom edge so the character stays seated on it.
                transform: avatarVariant === "realistic-female" ? "scale(0.8625)" : "scale(1.224)",
                transformOrigin: "center bottom",
              }}
            >
              {avatarVariant === "realistic-female" ? (
                <RealisticFemaleAvatar
                  isListening={phase === "recording"}
                  isThinking={phase === "transcribing" || phase === "evaluating"}
                  isSpeaking={phase === "playing"}
                  audioRef={audioRef}
                  lipSyncAnalyserRef={lipSyncAnalyserRef}
                  onSpeakEnd={stopTts}
                  onRiveInstance={onAvatarRiveInstance}
                />
              ) : (
                <SupernovaAvatar
                  isListening={phase === "recording"}
                  isThinking={phase === "transcribing" || phase === "evaluating"}
                  isSpeaking={phase === "playing"}
                  audioRef={audioRef}
                  lipSyncAnalyserRef={lipSyncAnalyserRef}
                  onSpeakEnd={stopTts}
                  onRiveInstance={onAvatarRiveInstance}
                />
              )}
            </div>
          </div>

            {/* Scale-down control, at the frame's bottom-right — a sibling of
                the clipped box, not a child, so the circular silhouette can't
                clip it away. Re-enables pointer events (the unit above is
                pointer-events-none, so this is the only hit-testable thing in
                it). Toggles both sizes. */}
            <button
              type="button"
              aria-label={isNovaMinimized ? "Scale up" : "Scale down"}
              onClick={() => setIsManuallyMinimized((v) => !v)}
              className="absolute z-20 pointer-events-auto flex items-center justify-center"
              style={{
                right: "8px",
                bottom: "8px",
                width: `${SCALE_BUTTON_PX}px`,
                height: `${SCALE_BUTTON_PX}px`,
                // Counter-scales the unit's 0.4 so the control renders at 16px
                // instead of collapsing to 9.6px — it's the only way back to
                // full size, so it has to stay hittable. Anchored bottom-right
                // so it grows inward from its corner rather than drifting off.
                transform: isNovaMinimized ? `scale(${SCALE_BUTTON_COUNTER})` : "none",
                transformOrigin: "bottom right",
                transition: `transform ${AVATAR_SCALE_MS}ms linear`,
              }}
            >
              <span
                className="absolute rounded-full"
                style={{
                  width: "22.154px",
                  height: "22.154px",
                  backgroundColor: "rgba(255, 255, 255, 0.2)",
                }}
              />
              <img
                src="/icon-minimize.svg"
                alt=""
                width={16}
                height={16}
                className="relative"
                style={{ width: "16px", height: "16px" }}
              />
            </button>
          </div>
          </div>

          {/* Chat thread scrolls under Nova */}
          <div
            className="absolute inset-0 overflow-y-auto overscroll-y-none px-4 flex flex-col"
            style={{ paddingTop: "256px", paddingBottom: "16px" }}
            onScroll={minimizeOnScroll ? handleThreadScroll : undefined}
            // Gestures that mean "I am scrolling this myself" — wheel/trackpad,
            // touch drag, and scrollbar or keyboard interaction.
            onWheel={minimizeOnScroll ? armUserScroll : undefined}
            onTouchMove={minimizeOnScroll ? armUserScroll : undefined}
            onPointerDown={minimizeOnScroll ? armUserScroll : undefined}
            onKeyDown={minimizeOnScroll ? armUserScroll : undefined}
          >
          {/* mt-auto bottom-anchors the thread: with only a message or two the
              spare room collects above them, so the first line lands at the
              bottom and later ones push it up — the usual chat feel. Once the
              thread outgrows the viewport the auto margin collapses to 0 and it
              scrolls normally. (Doing this with justify-end instead would clip
              the top of an overflowing thread and make it unscrollable.) */}
          <div className="mt-auto space-y-3">
          {messages.map((msg) => {
            const isUser = msg.role === "user";
            const isThisPlaying = playingMsgId === msg.id;
            const interactive = msg.interactive;

            // AI message with a CTA (final line's bullets, dynamic results, or
            // the plain post-test reply): the CTA is the last element INSIDE
            // the same rounded card as the text, separated by a hairline
            // divider — never a separate floating button. Once tapped, the
            // button itself is removed. The thinking loader is the one
            // variant with no CTA at all — a pure, self-contained bubble.
            if (!isUser && (interactive?.type === "cta" || interactive?.type === "final" || interactive?.type === "results" || interactive?.type === "grammar-overview" || interactive?.type === "report-loading" || interactive?.type === "grammar-loading" || interactive?.type === "loader" || interactive?.type === "plan")) {
              return (
                <div key={msg.id} className="flex justify-start">
                  <div className="max-w-[80%] w-full min-w-[240px] rounded-2xl rounded-bl-sm bg-[#1A1E2D] overflow-hidden">
                    {msg.text && (
                      <div className="px-4 py-2.5 text-sm leading-relaxed whitespace-pre-line text-zinc-100">
                        {msg.text}
                      </div>
                    )}

                    {interactive.type === "final" && (
                      <div className="px-4 pb-3 flex flex-col gap-1.5">
                        {interactive.bullets.map((b, i) => (
                          <div key={i} className="flex items-start gap-2 text-sm text-zinc-200">
                            <span className="text-green-400 mt-0.5">✓</span>
                            <span>{b}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {interactive.type === "results" && (
                      <div className="px-4 py-3">
                        <ResultsBody log={interactive.log} />
                      </div>
                    )}

                    {interactive.type === "grammar-overview" && (
                      <div className="px-4 py-3">
                        <GrammarOverviewBody />
                      </div>
                    )}

                    {interactive.type === "report-loading" && (
                      <div className="px-4 py-3">
                        <ReportLoadingBody />
                      </div>
                    )}

                    {interactive.type === "grammar-loading" && (
                      <div className="px-4 py-3">
                        <GrammarLoadingBody />
                      </div>
                    )}

                    {interactive.type === "loader" && (
                      <div className="px-4 py-3">
                        <ThinkingLoaderBody onComplete={handleThinkingComplete} />
                      </div>
                    )}

                    {interactive.type === "plan" && (
                      <div className="px-4 pb-3">
                        <ThirtyDayPlanWidget />
                      </div>
                    )}

                    {interactive.type !== "loader" && interactive.type !== "report-loading" && interactive.type !== "grammar-loading" && interactive.type !== "plan" && msg.id !== introQuestionMsgId && !interactive.tapped && (
                      <button
                        onClick={() =>
                          interactive.type === "final"
                            ? handlePretestFinalCta(msg.id)
                            : interactive.type === "results"
                            ? handleResultsNext(msg.id)
                            : interactive.type === "grammar-overview"
                            ? handleGrammarOverviewNext(msg.id)
                            : msg.id === "ai-final-cta"
                            ? handleShowResultsCta(msg.id)
                            : handlePretestCta(msg.id)
                        }
                        className="w-full text-center text-[15px] font-semibold transition-colors"
                        style={{
                          borderTop: "1px solid #2B3044",
                          color: "#40b9f8",
                          paddingTop: "15px",
                          paddingBottom: "15px",
                          paddingLeft: "8px",
                          paddingRight: "8px",
                        }}
                      >
                        {interactive.ctaLabel}
                      </button>
                    )}
                  </div>
                </div>
              );
            }

            // AI message with select options: question text and its option
            // cards live inside ONE shared card. Once an option is tapped, the
            // options list is removed (the tap is now recorded by a separate
            // user-response bubble below).
            if (!isUser && interactive?.type === "select") {
              const answered = interactive.selectedIndex !== undefined;
              return (
                <div key={msg.id} className="flex justify-start">
                  <div className={`max-w-[80%] w-full min-w-[240px] rounded-2xl rounded-bl-sm bg-[#1A1E2D] px-4 pt-2.5 ${answered ? "pb-2.5" : "pb-4"}`}>
                    <div className={`text-sm leading-relaxed whitespace-pre-line text-zinc-100 ${answered ? "" : "mb-3"}`}>
                      {msg.text}
                    </div>
                    {!answered && (
                      <div className="flex flex-col gap-2">
                        {interactive.options.map((opt, i) => (
                          <button
                            key={i}
                            onClick={() => handlePretestOptionTap(msg.id, i)}
                            className="w-full text-center text-sm text-zinc-100 transition-colors"
                            style={{
                              backgroundColor: "#161a27",
                              border: "1.5px solid #2B3044",
                              borderRadius: "12px",
                              padding: "8px",
                            }}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            }

            // V2 intro's spoken answer: one unified card (waveform row +
            // checking/correct/incorrect state below), not a separate bubble
            // plus a floating feedback card.
            if (msg.feedback) {
              return (
                <div key={msg.id} className="flex justify-end">
                  <div
                    className="max-w-[80%] w-full min-w-[240px] rounded-2xl rounded-br-sm overflow-hidden border"
                    style={{ borderColor: "#2B3044", backgroundColor: "#1A1E2D" }}
                  >
                    <div className="px-4 py-3.5 flex items-center justify-center gap-2">
                      <Volume2 size={18} style={{ color: "#8C94AE" }} aria-label="Spoken reply" />
                      <SpeakingWaveform />
                    </div>
                    <div className="px-4 pb-3.5" style={{ borderTop: "1px solid #2B3044", paddingTop: "12px" }}>
                      <SpeakingFeedbackState feedback={msg.feedback} />
                    </div>
                  </div>
                </div>
              );
            }

            // Default: plain bubble (user replies, and ai text with no interactive)
            return (
              <div key={msg.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                <div className={`flex flex-col gap-2 max-w-[80%] ${isUser ? "items-end" : "items-start"}`}>
                  <div
                    className={`rounded-2xl whitespace-pre-line ${
                      isUser ? "rounded-br-sm" : "rounded-bl-sm"
                    } ${
                      isUser && !msg.isTappedResponse
                        ? "px-3.5 py-3.5"
                        : "px-4 py-2.5 text-sm leading-relaxed"
                    }`}
                    style={{
                      backgroundColor: "#1A1E2D",
                      color: isUser ? "#8C94AE" : "#f4f4f5",
                    }}
                  >
                    {isUser && !msg.isTappedResponse ? (
                      <Volume2 size={18} aria-label="Spoken reply" />
                    ) : (
                      <>
                        <span style={msg.quizSentence ? { color: "#8C94AE" } : undefined}>
                          {msg.text}
                        </span>
                        {msg.quizSentence && (
                          <div
                            className="mt-2 font-medium"
                            style={{ fontSize: "20px", lineHeight: 1.4 }}
                          >
                            {msg.quizSentence}
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {!isUser && (
                    isThisPlaying ? (
                      <button
                        onClick={stopTts}
                        className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                      >
                        <Square size={13} className="fill-current" />
                        Stop
                      </button>
                    ) : (
                      <button
                        onClick={() => void playTts(msg.id, stripEmojisForTts(msg.text))}
                        disabled={phase === "playing"}
                        className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Volume2 size={13} />
                        Play
                      </button>
                    )
                  )}
                </div>
              </div>
            );
          })}

          {(phase === "evaluating") && (
            <div className="flex justify-start">
              <div className="rounded-2xl rounded-bl-sm bg-[#1A1E2D] px-4 py-2.5">
                <TypingDots />
              </div>
            </div>
          )}

          <div ref={bottomRef} />
          </div>
        </div>
        </div>

        {/* Bottom bar — tap-to-speak appears once the level test begins (until
            done), and — V2 intro only — for the "Tell me about yourself"
            question's real mic answer. Same bar, same recording pipeline. */}
        {((stage === "test" && !isDone) || showV2MicBar) && (
          <div
            className="shrink-0 bg-[#12151E] pb-4 relative z-20"
            style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 16px)" }}
          >
            {phase === "recording" ? (
              <Recorder
                phase={phase}
                analyser={isRecording ? analyser : null}
                isRecording={isRecording}
                onTapStart={handleTapStart}
                onTapStop={handleTapStop}
                onTapCancel={handleTapCancel}
              />
            ) : (
              <div className="flex items-center justify-center relative py-3">
                <div className="flex flex-col items-center gap-1">
                  <style>{`
                    @keyframes micTapRipple {
                      0% { transform: scale(1); opacity: 0.35; }
                      100% { transform: scale(1.8); opacity: 0; }
                    }
                  `}</style>
                  <div ref={micButtonWrapRef} className="relative w-12 h-12">
                    {phase === "idle" && (
                      <>
                        <span
                          className="absolute inset-0 rounded-full pointer-events-none"
                          style={{ backgroundColor: "#75EABE", animation: "micTapRipple 2.2s ease-out infinite" }}
                        />
                        <span
                          className="absolute inset-0 rounded-full pointer-events-none"
                          style={{ backgroundColor: "#75EABE", animation: "micTapRipple 2.2s ease-out 1.1s infinite" }}
                        />
                      </>
                    )}
                    <button
                      onClick={phase === "idle" ? handleTapStart : undefined}
                      disabled={phase !== "idle"}
                      aria-label="Start recording"
                      className={`relative w-12 h-12 rounded-full flex items-center justify-center transition-all duration-200 ${
                        phase !== "idle"
                          ? "opacity-40 cursor-not-allowed"
                          : "cursor-pointer active:scale-95 hover:brightness-95"
                      }`}
                      style={{ backgroundColor: "#75EABE" }}
                    >
                      {phase === "transcribing" || phase === "evaluating" ? (
                        <span className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <MicIcon />
                      )}
                    </button>
                  </div>
                  <p className="text-xs text-zinc-400">
                    {phase === "transcribing" || phase === "evaluating"
                      ? "Processing…"
                      : phase === "playing"
                      ? "AI speaking…"
                      : "Tap to answer"}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
