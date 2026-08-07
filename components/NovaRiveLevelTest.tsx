"use client";

import { useEffect, useLayoutEffect, useRef, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { Volume2, Square, X } from "lucide-react";
import type { Rive } from "@rive-app/react-canvas";
import { LevelSentence } from "@/lib/level-test-content";
import { useMicRecorder } from "@/lib/voice/use-mic-recorder";
import { buildPretestScript, stripEmojisForTts, type PretestRegister } from "@/lib/pretest-dialogue";

export type AvatarVariant = "nova" | "realistic-female";

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

// ─── Types ────────────────────────────────────────────────────────────────────

type MsgInteractive =
  | { type: "cta"; ctaLabel: string; tapped: boolean }
  | { type: "select"; options: string[]; selectedIndex?: number }
  | { type: "final"; bullets: string[]; ctaLabel: string; tapped: boolean };

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
}

type Phase = "idle" | "recording" | "transcribing" | "evaluating" | "playing";

type Stage = "pretest" | "test";

interface Props {
  language: "tamil" | "hindi";
  sentences: LevelSentence[];
  avatarVariant?: AvatarVariant;
  onAvatarRiveInstance?: (rive: Rive | null) => void;
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

// ─── Results screen ────────────────────────────────────────────────────────────

function ResultsScreen({
  score,
  sentences,
  results,
}: {
  score: number;
  sentences: LevelSentence[];
  results: boolean[];
}) {
  return (
    <div className="min-h-dvh bg-black text-white flex flex-col items-center px-4 py-10 gap-6">
      <div className="text-center">
        <div className="text-5xl font-bold text-green-400">{score}/{sentences.length}</div>
        <div className="text-zinc-400 mt-1 text-sm">sentences correct on first try</div>
      </div>

      <div className="w-full max-w-sm space-y-3">
        {sentences.map((s, i) => (
          <div
            key={i}
            className={`rounded-xl px-4 py-3 border ${
              results[i]
                ? "border-green-700 bg-green-950/40"
                : "border-zinc-700 bg-zinc-900"
            }`}
          >
            <div className="text-xs text-zinc-500 mb-0.5">{s.concept}</div>
            <div className="text-sm">{s.sentence}</div>
            <div className={`text-xs mt-1 ${results[i] ? "text-green-400" : "text-zinc-500"}`}>
              {s.expectedTranslation}
            </div>
          </div>
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

// ─── Main Component ────────────────────────────────────────────────────────────

export default function NovaRiveLevelTest({
  language,
  sentences,
  avatarVariant = "nova",
  onAvatarRiveInstance,
}: Props) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const messagesRef = useRef<Msg[]>([]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [playingMsgId, setPlayingMsgId] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [results, setResults] = useState<boolean[]>([]);
  const [isDone, setIsDone] = useState(false);
  const [showResults, setShowResults] = useState(false);

  const [stage, setStage] = useState<Stage>("pretest");
  const [pretestIndex, setPretestIndex] = useState(0);
  // Counts only USER-driven pretest turns (CTA taps + MCQ selections) — auto
  // lines don't move the progress bar, per "progress bar moves on user responses".
  const [pretestResponseCount, setPretestResponseCount] = useState(0);
  const pretestLang: PretestRegister = language === "tamil" ? "ta" : "hi";
  const pretestScriptRef = useRef(buildPretestScript(sentences.length));
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
  const cancelledRef = useRef(false);
  const currentIndexRef = useRef(0);
  const scoreRef = useRef(0);

  const { start: startMic, stop: stopMic, blob: audioBlob, isRecording, analyser, resetBlob } = useMicRecorder();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, phase]);

  // ── TTS playback ─────────────────────────────────────────────────────────────

  const stopTts = useCallback(() => {
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
        handleEnd();
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
      handleEnd();
    }
  }, []);

  // ── Advance to next sentence or finish ────────────────────────────────────────

  const advanceSentence = useCallback((wasCorrect: boolean) => {
    const nextIndex = currentIndexRef.current + 1;
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
      // Hold the progress bar at 100% (with its completion flourish) for a beat
      // before swapping to the results screen — the bar must visibly reach 100%
      // on this turn, not be skipped straight past.
      window.setTimeout(() => setShowResults(true), 450);
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
  }, [sentences, playTts]);

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
      advanceSentence(data.correct);
    } catch (err) {
      console.error("[evaluate] failed", err);
      // Don't get stuck on a broken API call — advance anyway (counted as
      // incorrect for scoring purposes).
      advanceSentence(false);
    }
  }, [sentences, language, advanceSentence]);

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

    const transcribe = async () => {
      const formData = new FormData();
      formData.append("audio", audioBlob, "audio.webm");

      try {
        const res = await fetch("/api/nova-level-test/transcribe", { method: "POST", body: formData });
        const data = (await res.json()) as { text?: string };

        if (data.text) {
          const userMsg: Msg = { id: `u-${Date.now()}`, role: "user", text: data.text };
          messagesRef.current = [...messagesRef.current, userMsg];
          setMessages([...messagesRef.current]);
          setLevelTestReplySparkle((n) => n + 1);
          void evaluateTranslation(data.text);
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

    const text = line.text[pretestLang];
    const preDelay = line.kind === "auto" ? (line.preDelayMs ?? 0) : 0;

    window.setTimeout(() => {
      setPhase("evaluating"); // reuse the existing typing-dots bubble
      window.setTimeout(() => {
        setPhase("idle");
        const msgId = `pretest-${line.id}`;
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

  // ── Auto-play first level-test sentence once the pre-test script finishes ────

  useEffect(() => {
    if (stage !== "test") return;
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

  // ── Done screen ───────────────────────────────────────────────────────────────

  if (showResults) {
    return (
      <ResultsScreen
        score={score}
        sentences={sentences}
        results={results}
      />
    );
  }

  const current = sentences[currentIndex];

  // Progress moves on USER RESPONSES only — pretest auto lines (greeting,
  // assurance, etc.) don't move the bar; only CTA taps / MCQ selections do.
  // Computed from the actual script (not a hardcoded step count), so it stays
  // correct as either phase grows. isDone is the explicit override that snaps
  // progress to exactly 100% on the same turn the results screen is triggered
  // — never before — and the screen itself only swaps in ~450ms later so that
  // moment is visible.
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
      <div className="relative flex flex-col w-[360px] h-[800px] mx-auto bg-[#12151E] overflow-hidden">

        {/* Fake status bar */}
        <FakeStatusBar />

        {/* Progress bar */}
        <div className="shrink-0 relative z-20 bg-[#12151E]">
          <ProgressBar progress={progress} sparkleTrigger={levelTestReplySparkle} />
        </div>

        {/* Rive avatar + Chat overlay area */}
        <div className="relative flex-1 min-h-0">
          {/* Rive avatar floats on top */}
          <div
            className="absolute left-1/2 z-10 pointer-events-none overflow-hidden"
            style={{
              width: "326px",
              height: "240px",
              top: "0px",
              margin: 0,
              padding: 0,
              transform: "translateX(-50%)",
              backgroundColor: "#1A1E2D",
              backgroundImage: "url('/classroom-bg.jpg')",
              backgroundSize: "100% 100%",
              backgroundPosition: "center",
              backgroundRepeat: "no-repeat",
              borderRadius: "20px",
            }}
          >
            <div
              className="pointer-events-none w-full h-full nova-canvas-blend"
              style={{ transform: "scale(1.224)", transformOrigin: "center bottom" }}
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

          {/* Fade-out div directly below the Nova container — blends it into the chat */}
          <div
            className="absolute left-0 z-10 pointer-events-none"
            style={{
              top: "240px",
              width: "360px",
              height: "60px",
              background: "linear-gradient(to bottom, #12151E 0%, rgba(18,21,30,0) 100%)",
            }}
          />

          {/* Chat thread scrolls under Nova */}
          <div
            className="absolute inset-0 overflow-y-auto overscroll-y-none px-4 space-y-3"
            style={{ paddingTop: "256px", paddingBottom: "16px" }}
          >
          {messages.map((msg) => {
            const isUser = msg.role === "user";
            const isThisPlaying = playingMsgId === msg.id;
            const interactive = msg.interactive;

            // AI message with a CTA (or the final line's bullets + CTA): the CTA is
            // the last element INSIDE the same rounded card as the text, separated
            // by a hairline divider — never a separate floating button. Once
            // tapped, the button itself is removed (the tap is now recorded by a
            // separate user-response bubble below); bullets/text stay visible.
            if (!isUser && (interactive?.type === "cta" || interactive?.type === "final")) {
              return (
                <div key={msg.id} className="flex justify-start">
                  <div className="max-w-[80%] w-full min-w-[240px] rounded-2xl rounded-bl-sm bg-[#1A1E2D] overflow-hidden">
                    <div className="px-4 py-2.5 text-sm leading-relaxed whitespace-pre-line text-zinc-100">
                      {msg.text}
                    </div>

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

                    {!interactive.tapped && (
                      <button
                        onClick={() =>
                          interactive.type === "final"
                            ? handlePretestFinalCta(msg.id)
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

        {/* Bottom bar — tap-to-speak only appears once the level test begins */}
        {stage === "test" && (
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
                  <div className="relative w-12 h-12">
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
