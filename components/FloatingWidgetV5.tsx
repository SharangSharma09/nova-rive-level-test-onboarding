"use client";

import { useState, useRef, useCallback, useEffect, useLayoutEffect, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { createRecorder, type Recorder } from "@/lib/recorder";
import { speak, stopSpeaking } from "@/lib/tts";
import ToneCards from "./ToneCards";
import tapAnimation from "@/public/tianjin/tap.json";
import arrowAnimation from "@/public/tianjin/arrow-right.json";

const Lottie = dynamic(() => import("lottie-react"), { ssr: false });

type V5Mode = "localize" | "doubt";
type V5DoubtIntent = "translate" | "meaning" | "grammar" | "doubt";
type V5State = "closed" | "mode_select" | "recording" | "analyzing" | "result" | "error";

interface V5Result {
  mode: V5Mode;
  transcription: string;
  // localize
  recommendation?: string;
  casual?: string;
  semiFormal?: string;
  formal?: string;
  // doubt — classified intent decides which card renders
  intent?: V5DoubtIntent;
  // doubt → generic Q&A
  question?: string;
  answer?: string;
  answerEnglish?: string;
  // doubt → translate
  sourceText?: string;
  translation?: string;
  // doubt → grammar
  isCorrect?: boolean;
  original?: string;
  corrected?: string;
  tip?: string;
  // doubt → meaning
  phrase?: string;
  meaning?: string;
  example?: string;
}

// Word-level diff for grammar highlighting (lifted from FloatingWidgetV4).
function diffTokens(original: string, corrected: string, mark: "original" | "corrected"): { word: string; changed: boolean }[] {
  const wa = original.split(/\s+/);
  const wb = corrected.split(/\s+/);
  const norm = (w: string) => w.toLowerCase().replace(/[^a-z]/g, "");
  const dp: number[][] = Array(wa.length + 1).fill(null).map(() => Array(wb.length + 1).fill(0));
  for (let i = 1; i <= wa.length; i++) {
    for (let j = 1; j <= wb.length; j++) {
      dp[i][j] = norm(wa[i - 1]) === norm(wb[j - 1])
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  const target = mark === "original" ? wa : wb;
  const changed = new Array(target.length).fill(true);
  let i = wa.length, j = wb.length;
  while (i > 0 && j > 0) {
    if (norm(wa[i - 1]) === norm(wb[j - 1])) {
      changed[(mark === "original" ? i : j) - 1] = false;
      i--; j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }
  return target.map((word, idx) => ({ word, changed: changed[idx] }));
}

// Contained scroll region with a bottom fade hint that appears only while there is
// more content below. Shared by every doubt-result card (Q&A, translate, grammar, meaning).
function ScrollFade({ children, maxHeight = "40vh" }: { children: ReactNode; maxHeight?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [showFade, setShowFade] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el) setShowFade(el.scrollHeight > el.clientHeight + 4);
  }, [children]);
  return (
    <div className="relative">
      <div
        ref={ref}
        className="overflow-y-auto flex flex-col gap-3"
        style={{ maxHeight }}
        onScroll={(e) => {
          const el = e.currentTarget;
          const atBottom = el.scrollHeight - el.scrollTop <= el.clientHeight + 4;
          setShowFade(!atBottom);
        }}
      >
        {children}
      </div>
      {showFade && (
        <div
          className="pointer-events-none absolute bottom-0 left-0 right-0 transition-opacity duration-300"
          style={{ height: 48, background: "linear-gradient(to bottom, transparent, rgba(14,14,20,0.97))" }}
        />
      )}
    </div>
  );
}

const PANEL_STYLE = {
  background: "rgba(14, 14, 20, 0.97)",
  border: "1px solid rgba(124,58,237,0.55)",
  boxShadow: "0 24px 64px rgba(0,0,0,0.7), 0 0 0 1px rgba(109,40,217,0.15)",
};

const CopyIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
  </svg>
);

const CheckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);

const CloseIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"/>
    <line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);

const BackIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="19" y1="12" x2="5" y2="12"/>
    <polyline points="12 19 5 12 12 5"/>
  </svg>
);

const SpeakerIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
    <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
    <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
  </svg>
);

const MicIcon = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
    <line x1="12" y1="19" x2="12" y2="23"/>
    <line x1="8" y1="23" x2="16" y2="23"/>
  </svg>
);

const ArrowIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/>
  </svg>
);

interface FloatingWidgetV5Props {
  lang?: "Tamil" | "Hindi";
  apiEndpoint?: string;
  viewportWidth?: number;
  viewportHeight?: number;
  showCoachMark?: boolean;
  recordingPrompt?: string;
  resultPrompt?: string;
  menuAudio?: string;
  recordingAudio?: string;
  resultAudio?: string;
}

const LANG_COPY = {
  Tamil: {
    header: "என்ன help வேணும்?",
    option1Line1: "Tamil-ல பேசி,",
    option1Line2: "English message பெறுங்க",
    option2: "Any doubt கேளுங்க",
  },
  Hindi: {
    header: "क्या help चाहिए?",
    option1Line1: "Hindi में बोलें,",
    option1Line2: "English message पाएं",
    option2: "Any doubt पूछें",
  },
};

export default function FloatingWidgetV5({ lang = "Tamil", apiEndpoint = "/api/superflow/v5", viewportWidth, viewportHeight, showCoachMark = false, recordingPrompt, resultPrompt, menuAudio, recordingAudio, resultAudio }: FloatingWidgetV5Props = {}) {
  const copy = LANG_COPY[lang] ?? LANG_COPY.Tamil;
  const [state, setState] = useState<V5State>("closed");
  const [activeMode, setActiveMode] = useState<V5Mode | null>(null);
  const [pos, setPos] = useState({ x: 300, y: 200 });
  const [result, setResult] = useState<V5Result | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [answerCopied, setAnswerCopied] = useState(false);
  const [answerLang, setAnswerLang] = useState<"local" | "english">("local");
  const [activeDraftText, setActiveDraftText] = useState<string | null>(null);
  const [continueState, setContinueState] = useState<"idle" | "opening">("idle");
  const [hasInteracted, setHasInteracted] = useState(false);
  const [hasSelectedMode, setHasSelectedMode] = useState(false);
  const [recordingReady, setRecordingReady] = useState(false);

  const dragging = useRef(false);
  const promptCancelRef = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const dragMoved = useRef(false);
  const recorderRef = useRef<Recorder | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  useEffect(() => {
    const w = viewportWidth ?? window.innerWidth;
    const h = viewportHeight ?? window.innerHeight;
    setPos({ x: Math.round(w * 0.72), y: Math.round(h * 0.28) });
  }, [viewportWidth, viewportHeight]);

  useEffect(() => {
    if (state !== "closed") setHasInteracted(true);
    if (state === "recording" || state === "analyzing" || state === "result") {
      setHasSelectedMode(true);
    }
  }, [state]);

  const coachAudioRef = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    if (coachAudioRef.current) { coachAudioRef.current.pause(); coachAudioRef.current = null; }
    let url: string | undefined;
    if (state === "mode_select") url = menuAudio;
    else if (state === "result") url = resultAudio;
    if (url) {
      const audio = new Audio(url);
      coachAudioRef.current = audio;
      audio.play().catch(() => {});
    }
  }, [state, menuAudio, recordingAudio, resultAudio]);

  const clamp = useCallback((x: number, y: number) => ({
    x: Math.max(12, Math.min((viewportWidth ?? window.innerWidth) - 76, x)),
    y: Math.max(12, Math.min((viewportHeight ?? window.innerHeight) - 76, y)),
  }), [viewportWidth, viewportHeight]);

  const stopAnimation = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
  }, []);

  const drawWaveform = useCallback((analyser: AnalyserNode) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const data = new Uint8Array(analyser.frequencyBinCount);
    const draw = () => {
      animFrameRef.current = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(data);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const barCount = 20;
      const barW = 3;
      const gap = (canvas.width - barCount * barW) / (barCount + 1);
      const step = Math.floor(data.length / barCount);
      for (let i = 0; i < barCount; i++) {
        const value = data[i * step] / 255;
        const h = Math.max(4, value * canvas.height * 0.85);
        const x = gap + i * (barW + gap);
        const y = (canvas.height - h) / 2;
        ctx.fillStyle = `rgba(139, 92, 246, ${0.5 + value * 0.5})`;
        ctx.beginPath();
        ctx.roundRect(x, y, barW, h, 2);
        ctx.fill();
      }
    };
    draw();
  }, []);

  useEffect(() => {
    if (state === "recording" && recordingReady && analyserRef.current) {
      drawWaveform(analyserRef.current);
    }
  }, [state, recordingReady, drawWaveform]);

  const startRecording = useCallback(async (mode: V5Mode) => {
    console.log("[v5] starting recording — mode:", mode);
    setActiveMode(mode);
    setRecordingReady(false);
    promptCancelRef.current = false;
    setState("recording");

    if (recordingAudio) {
      const audio = new Audio(recordingAudio);
      audio.play().catch(() => {});
    }

    await new Promise<void>(resolve => setTimeout(resolve, 5000));
    if (promptCancelRef.current) return;

    try {
      const recorder = await createRecorder();
      recorderRef.current = recorder;
      await recorder.start();
      analyserRef.current = recorder.getAnalyser();
      setRecordingReady(true);
    } catch (e: unknown) {
      const code = (e as { code?: string }).code;
      setErrorMsg(
        code === "permission-denied"
          ? "Microphone permission denied."
          : "Microphone not available."
      );
      setState("error");
    }
  }, [recordingAudio]);

  const cancelRecording = useCallback(() => {
    promptCancelRef.current = true;
    setRecordingReady(false);
    stopAnimation();
    recorderRef.current?.cleanup();
    recorderRef.current = null;
    analyserRef.current = null;
    setState("closed");
  }, [stopAnimation]);

  const stopAndAnalyze = useCallback(async () => {
    const recorder = recorderRef.current;
    if (!recorder) return;
    stopAnimation();
    setState("analyzing");

    let blob: Blob;
    try {
      blob = await recorder.stop();
      recorder.cleanup();
      recorderRef.current = null;
      analyserRef.current = null;
    } catch (e) {
      console.error("[v5] stop error:", e);
      setErrorMsg("Recording failed. Please try again.");
      setState("error");
      return;
    }

    const formData = new FormData();
    formData.append("audio", blob);
    formData.append("mode", activeMode!);
    console.log(`[v5] POST ${apiEndpoint} — mode:`, activeMode, "blob size:", blob.size);

    try {
      const res = await fetch(apiEndpoint, { method: "POST", body: formData });
      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.error || "Something went wrong. Please try again.");
        setState("error");
        return;
      }

      console.log("[v5] response:", data);
      setResult(data);
      setActiveDraftText(null);
      setState("result");
    } catch (e) {
      console.error("[v5] API error:", e);
      setErrorMsg("Something went wrong. Please try again.");
      setState("error");
    }
  }, [stopAnimation, activeMode]);

  const handleReset = useCallback(() => {
    promptCancelRef.current = true;
    setRecordingReady(false);
    stopAnimation();
    recorderRef.current?.cleanup();
    recorderRef.current = null;
    analyserRef.current = null;
    stopSpeaking().catch(console.error);
    setIsSpeaking(false);
    setResult(null);
    setErrorMsg(null);
    setAnswerCopied(false);
    setAnswerLang("local");
    setActiveMode(null);
    setContinueState("idle");
    setState("closed");
  }, [stopAnimation]);

  // Back from a result → return to the mode-select menu (clears the current result).
  const handleBack = useCallback(() => {
    promptCancelRef.current = true;
    setRecordingReady(false);
    stopAnimation();
    recorderRef.current?.cleanup();
    recorderRef.current = null;
    analyserRef.current = null;
    stopSpeaking().catch(console.error);
    setIsSpeaking(false);
    setResult(null);
    setErrorMsg(null);
    setAnswerCopied(false);
    setAnswerLang("local");
    setActiveMode(null);
    setContinueState("idle");
    setState("mode_select");
  }, [stopAnimation]);

  const handleSpeak = useCallback(async (text: string) => {
    if (isSpeaking) {
      await stopSpeaking();
      setIsSpeaking(false);
      return;
    }
    setIsSpeaking(true);
    try {
      await speak(text);
    } catch (e) {
      console.error("[v5] TTS error", e);
    } finally {
      setIsSpeaking(false);
    }
  }, [isSpeaking]);

  const handleCopyAnswer = useCallback(async (text: string) => {
    await navigator.clipboard.writeText(text);
    setAnswerCopied(true);
    setTimeout(() => setAnswerCopied(false), 1500);
  }, []);

  useEffect(() => {
    return () => {
      stopAnimation();
      recorderRef.current?.cleanup();
      stopSpeaking().catch(console.error);
    };
  }, [stopAnimation]);

  // Drag handlers
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    dragging.current = true;
    dragMoved.current = false;
    dragOffset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
  }, [pos]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    const dx = Math.abs(e.clientX - dragOffset.current.x - pos.x);
    const dy = Math.abs(e.clientY - dragOffset.current.y - pos.y);
    if (dx > 4 || dy > 4) dragMoved.current = true;
    setPos(clamp(e.clientX - dragOffset.current.x, e.clientY - dragOffset.current.y));
  }, [clamp, pos]);

  const onPointerUp = useCallback(() => {
    if (!dragging.current) return;
    dragging.current = false;
    if (!dragMoved.current && state === "closed") {
      setState("mode_select");
    }
  }, [state]);

  const vw = viewportWidth ?? (typeof window !== "undefined" ? window.innerWidth : 430);
  const vh = viewportHeight ?? (typeof window !== "undefined" ? window.innerHeight : 800);
  const panelAbove = pos.y > vh / 2;
  const isOpen = state !== "closed";
  const panelLeft = Math.min(pos.x, vw - 320);
  const panelPosition = panelAbove
    ? { bottom: vh - pos.y + 12 }
    : { top: pos.y + 76 };

  const speakableText =
    result?.mode === "localize"
      ? (activeDraftText ?? result.semiFormal ?? result.casual ?? result.formal ?? "")
      : result?.mode === "doubt"
      ? result.intent === "translate"
        ? (result.translation ?? "")
        : result.intent === "grammar"
        ? (result.corrected || result.original || "")
        : result.intent === "meaning"
        ? [result.phrase, result.meaning, result.example].filter(Boolean).join(". ")
        : (result.answer ?? "")
      : "";

  return (
    <>
      {/* Click-outside backdrop */}
      {isOpen && (
        <div className="fixed inset-0 z-30" onClick={handleReset} />
      )}

      {/* Popup panel */}
      {(state === "mode_select" || state === "analyzing" || state === "result" || state === "error") && (
        <div
          className="fixed z-40"
          onClick={(e) => e.stopPropagation()}
          style={{ left: panelLeft, ...panelPosition }}
        >
          {/* Mode select */}
          {state === "mode_select" && (
            <div className="flex flex-col gap-3 rounded-3xl p-4" style={{ ...PANEL_STYLE, width: "min(296px, 80vw)" }}>
              {/* Header */}
              <div className="flex items-center justify-between mb-1">
                <p className="font-bold tracking-widest uppercase text-xs" style={{ color: "rgba(255,255,255,0.4)", letterSpacing: "0.12em" }}>
                  {copy.header}
                </p>
                <button
                  onClick={() => setState("closed")}
                  className="w-7 h-7 flex items-center justify-center rounded-full transition-all active:opacity-60"
                  style={{ color: "rgba(255,255,255,0.4)", background: "rgba(255,255,255,0.08)" }}
                >
                  <CloseIcon />
                </button>
              </div>

              {/* Option 1 — Localize */}
              <button
                onClick={() => startRecording("localize")}
                className="w-full flex items-center gap-3 rounded-2xl p-3.5 text-left transition-all active:scale-95"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
              >
                <div
                  className="flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center text-xl"
                  style={{ background: "rgba(255,255,255,0.08)" }}
                >
                  💬
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm leading-snug" style={{ color: "#fff" }}>
                    {copy.option1Line1}<br />{copy.option1Line2}
                  </p>
                </div>
              </button>

              {/* Option 2 — Doubt (highlighted) */}
              <button
                onClick={() => startRecording("doubt")}
                className="w-full flex items-center gap-3 rounded-2xl p-3.5 text-left transition-all active:scale-95"
                style={{
                  background: "linear-gradient(135deg, rgba(109,40,217,0.45), rgba(139,92,246,0.3))",
                  border: "1.5px solid rgba(139,92,246,0.75)",
                  boxShadow: "0 0 18px rgba(139,92,246,0.25)",
                }}
              >
                <div
                  className="flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center text-xl"
                  style={{ background: "rgba(139,92,246,0.3)" }}
                >
                  ❓
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm leading-tight" style={{ color: "#d8b4fe" }}>{copy.option2}</p>
                  <p className="text-xs mt-0.5" style={{ color: "rgba(167,139,250,0.65)" }}>Tap here →</p>
                </div>
              </button>
            </div>
          )}

          {/* Analyzing */}
          {state === "analyzing" && (
            <div className="flex items-center justify-center gap-3 px-6 py-4 rounded-2xl" style={{ ...PANEL_STYLE, width: "min(288px, 80vw)" }}>
              <div className="w-5 h-5 rounded-full border-2 border-purple-400 border-t-transparent animate-spin" />
              <span className="text-sm font-medium" style={{ color: "rgba(255,255,255,0.7)" }}>Thinking…</span>
            </div>
          )}

          {/* Error */}
          {state === "error" && (
            <div className="rounded-3xl p-4 flex flex-col gap-3" style={{ ...PANEL_STYLE, width: "min(288px, 80vw)" }}>
              <p className="text-sm text-center" style={{ color: "#f87171" }}>{errorMsg}</p>
              <button onClick={handleReset} className="text-sm font-medium text-center" style={{ color: "#a78bfa" }}>
                Tap Nova to try again
              </button>
            </div>
          )}

          {/* Result */}
          {state === "result" && result && (
            <div
              className="rounded-3xl p-4 flex flex-col gap-3"
              style={{ ...PANEL_STYLE, width: "min(320px, 80vw)", maxHeight: "80vh", overflowY: "auto" }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* ── Localize result (same as v4 draft) ── */}
              {result.mode === "localize" && result.casual != null && (
                <>
                  <div className="flex items-center justify-between">
                    <button
                      onClick={handleBack}
                      title="Back"
                      className="w-8 h-8 flex items-center justify-center rounded-full transition-all active:opacity-60"
                      style={{ color: "rgba(255,255,255,0.5)", background: "rgba(255,255,255,0.08)" }}
                    >
                      <BackIcon />
                    </button>
                    <button
                      onClick={() => handleSpeak(speakableText)}
                      className={`w-8 h-8 flex items-center justify-center rounded-full transition-all active:opacity-60 ${isSpeaking ? "animate-pulse" : ""}`}
                      style={{
                        color: isSpeaking ? "#a78bfa" : "rgba(255,255,255,0.5)",
                        background: isSpeaking ? "rgba(109,40,217,0.35)" : "rgba(255,255,255,0.08)",
                      }}
                    >
                      <SpeakerIcon />
                    </button>
                  </div>
                  <ToneCards
                    result={{
                      recommendation: result.recommendation || "semiFormal",
                      casual: result.casual!,
                      semiFormal: result.semiFormal!,
                      formal: result.formal!,
                    }}
                    onActiveChange={setActiveDraftText}
                  />
                </>
              )}

              {/* ── Doubt → Translate ── */}
              {result.mode === "doubt" && result.intent === "translate" && result.translation && (
                <>
                  {/* Header — close + speaker */}
                  <div className="flex items-center justify-between">
                    <button
                      onClick={handleBack}
                      title="Back"
                      className="w-8 h-8 flex items-center justify-center rounded-full transition-all active:opacity-60"
                      style={{ color: "rgba(255,255,255,0.5)", background: "rgba(255,255,255,0.08)" }}
                    >
                      <BackIcon />
                    </button>
                    <button
                      onClick={() => handleSpeak(speakableText)}
                      className={`w-8 h-8 flex items-center justify-center rounded-full transition-all active:opacity-60 ${isSpeaking ? "animate-pulse" : ""}`}
                      style={{ color: isSpeaking ? "#a78bfa" : "rgba(255,255,255,0.5)", background: isSpeaking ? "rgba(109,40,217,0.35)" : "rgba(255,255,255,0.08)" }}
                    >
                      <SpeakerIcon />
                    </button>
                  </div>
                  <ScrollFade>
                    <div>
                      <p className="text-xs font-bold uppercase tracking-widest mb-1.5" style={{ color: "#f97316", letterSpacing: "0.1em" }}>You said</p>
                      <p className="text-sm leading-relaxed break-words" style={{ color: "rgba(255,255,255,0.65)" }}>
                        &ldquo;{result.sourceText || result.transcription}&rdquo;
                      </p>
                    </div>
                    <div style={{ height: 1, background: "rgba(124,58,237,0.25)" }} />
                    <div>
                      <p className="text-xs font-bold uppercase tracking-widest mb-1.5" style={{ color: "#00d9a0", letterSpacing: "0.1em" }}>Translated</p>
                      <p className="text-sm leading-relaxed break-words whitespace-pre-wrap" style={{ color: "rgba(255,255,255,0.9)" }}>
                        &ldquo;{result.translation}&rdquo;
                      </p>
                    </div>
                  </ScrollFade>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleCopyAnswer(result.translation!)}
                      className="flex-none px-5 py-3 rounded-2xl font-semibold text-sm transition-all active:scale-95 flex items-center justify-center gap-1.5"
                      style={{ background: "#6d28d9", color: "#fff" }}
                    >
                      {answerCopied ? <><CheckIcon /><span>Copied</span></> : <><CopyIcon /><span>Copy</span></>}
                    </button>
                    <button
                      onClick={() => {
                        if (continueState !== "idle") return;
                        setContinueState("opening");
                        setTimeout(() => setContinueState("idle"), 700);
                      }}
                      className="flex-1 py-3 rounded-2xl font-semibold text-sm transition-all active:scale-95 flex items-center justify-center gap-1.5"
                      style={{ background: "rgba(255,255,255,0.08)", color: "#fff" }}
                    >
                      {continueState === "opening" ? <span>Opening...</span> : <><span>Continue in app</span><ArrowIcon /></>}
                    </button>
                  </div>
                </>
              )}

              {/* ── Doubt → Grammar ── */}
              {result.mode === "doubt" && result.intent === "grammar" && (result.original || result.corrected) && (
                <>
                  <div className="flex items-center justify-between">
                    <button
                      onClick={handleBack}
                      title="Back"
                      className="w-8 h-8 flex items-center justify-center rounded-full transition-all active:opacity-60"
                      style={{ color: "rgba(255,255,255,0.5)", background: "rgba(255,255,255,0.08)" }}
                    >
                      <BackIcon />
                    </button>
                    <button
                      onClick={() => handleSpeak(speakableText)}
                      className={`w-8 h-8 flex items-center justify-center rounded-full transition-all active:opacity-60 ${isSpeaking ? "animate-pulse" : ""}`}
                      style={{ color: isSpeaking ? "#a78bfa" : "rgba(255,255,255,0.5)", background: isSpeaking ? "rgba(109,40,217,0.35)" : "rgba(255,255,255,0.08)" }}
                    >
                      <SpeakerIcon />
                    </button>
                  </div>
                  <ScrollFade>
                    {/* You said */}
                    <div>
                      <p className="text-xs font-bold uppercase tracking-widest mb-1.5" style={{ color: result.isCorrect ? "#00d9a0" : "#f97316", letterSpacing: "0.1em" }}>You said</p>
                      <p className="text-sm leading-relaxed">
                        {result.isCorrect || !result.corrected || !result.original
                          ? <span style={{ color: "rgba(255,255,255,0.85)" }}>&ldquo;{result.original}&rdquo;</span>
                          : <>&ldquo;{diffTokens(result.original, result.corrected, "original").map((token, idx) =>
                              token.changed
                                ? <mark key={idx} style={{ background: "rgba(249,115,22,0.2)", color: "#f97316", borderRadius: "3px", padding: "0 2px", marginRight: "3px" }}>{token.word}</mark>
                                : <span key={idx} style={{ color: "rgba(255,255,255,0.85)", marginRight: "3px" }}>{token.word}</span>
                            )}&rdquo;</>
                        }
                      </p>
                    </div>
                    {/* Try this — only when incorrect */}
                    {!result.isCorrect && result.corrected && result.original && (
                      <div>
                        <p className="text-xs font-bold uppercase tracking-widest mb-1.5" style={{ color: "#00d9a0", letterSpacing: "0.1em" }}>Try this</p>
                        <p className="text-sm leading-relaxed">
                          &ldquo;{diffTokens(result.original, result.corrected, "corrected").map((token, idx) =>
                            token.changed
                              ? <mark key={idx} style={{ background: "rgba(0,217,160,0.2)", color: "#00d9a0", borderRadius: "3px", padding: "0 2px", marginRight: "3px" }}>{token.word}</mark>
                              : <span key={idx} style={{ color: "rgba(255,255,255,0.85)", marginRight: "3px" }}>{token.word}</span>
                          )}&rdquo;
                        </p>
                      </div>
                    )}
                    {result.tip && (
                      <p className="text-xs leading-relaxed break-words" style={{ color: "rgba(255,255,255,0.4)" }}>{result.tip}</p>
                    )}
                  </ScrollFade>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleCopyAnswer(result.corrected || result.original || "")}
                      className="flex-none px-5 py-3 rounded-2xl font-semibold text-sm transition-all active:scale-95 flex items-center justify-center gap-1.5"
                      style={{ background: "#6d28d9", color: "#fff" }}
                    >
                      {answerCopied ? <><CheckIcon /><span>Copied</span></> : <><CopyIcon /><span>Copy</span></>}
                    </button>
                    <button
                      onClick={() => {
                        if (continueState !== "idle") return;
                        setContinueState("opening");
                        setTimeout(() => setContinueState("idle"), 700);
                      }}
                      className="flex-1 py-3 rounded-2xl font-semibold text-sm transition-all active:scale-95 flex items-center justify-center gap-1.5"
                      style={{ background: "rgba(255,255,255,0.08)", color: "#fff" }}
                    >
                      {continueState === "opening" ? <span>Opening...</span> : <><span>Continue in app</span><ArrowIcon /></>}
                    </button>
                  </div>
                </>
              )}

              {/* ── Doubt → Meaning ── */}
              {result.mode === "doubt" && result.intent === "meaning" && result.meaning && (
                <>
                  <div className="flex items-center justify-between">
                    <button
                      onClick={handleBack}
                      title="Back"
                      className="w-8 h-8 flex items-center justify-center rounded-full transition-all active:opacity-60"
                      style={{ color: "rgba(255,255,255,0.5)", background: "rgba(255,255,255,0.08)" }}
                    >
                      <BackIcon />
                    </button>
                    <button
                      onClick={() => handleSpeak(speakableText)}
                      className={`w-8 h-8 flex items-center justify-center rounded-full transition-all active:opacity-60 ${isSpeaking ? "animate-pulse" : ""}`}
                      style={{ color: isSpeaking ? "#a78bfa" : "rgba(255,255,255,0.5)", background: isSpeaking ? "rgba(109,40,217,0.35)" : "rgba(255,255,255,0.08)" }}
                    >
                      <SpeakerIcon />
                    </button>
                  </div>
                  <ScrollFade>
                    <p className="font-bold leading-tight break-words" style={{ color: "#00d9a0", fontSize: 20 }}>
                      {result.phrase || result.transcription}
                    </p>
                    <p className="text-sm leading-relaxed break-words whitespace-pre-wrap" style={{ color: "rgba(255,255,255,0.9)" }}>
                      <span style={{ color: "rgba(255,255,255,0.45)" }}>Meaning: </span>{result.meaning}
                    </p>
                    {result.example && (
                      <p className="text-sm leading-relaxed break-words whitespace-pre-wrap" style={{ color: "rgba(255,255,255,0.9)" }}>
                        <span style={{ color: "rgba(255,255,255,0.45)" }}>Example: </span>{result.example}
                      </p>
                    )}
                  </ScrollFade>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleCopyAnswer(result.meaning!)}
                      className="flex-none px-5 py-3 rounded-2xl font-semibold text-sm transition-all active:scale-95 flex items-center justify-center gap-1.5"
                      style={{ background: "#6d28d9", color: "#fff" }}
                    >
                      {answerCopied ? <><CheckIcon /><span>Copied</span></> : <><CopyIcon /><span>Copy</span></>}
                    </button>
                    <button
                      onClick={() => {
                        if (continueState !== "idle") return;
                        setContinueState("opening");
                        setTimeout(() => setContinueState("idle"), 700);
                      }}
                      className="flex-1 py-3 rounded-2xl font-semibold text-sm transition-all active:scale-95 flex items-center justify-center gap-1.5"
                      style={{ background: "rgba(255,255,255,0.08)", color: "#fff" }}
                    >
                      {continueState === "opening" ? <span>Opening...</span> : <><span>Continue in app</span><ArrowIcon /></>}
                    </button>
                  </div>
                </>
              )}

              {/* ── Doubt result (generic Q&A — fallback) ── */}
              {result.mode === "doubt" && (!result.intent || result.intent === "doubt") && result.answer && (
                <>
                  {/* Close header */}
                  <div className="flex items-center">
                    <button
                      onClick={handleBack}
                      title="Back"
                      className="w-8 h-8 flex items-center justify-center rounded-full transition-all active:opacity-60"
                      style={{ color: "rgba(255,255,255,0.5)", background: "rgba(255,255,255,0.08)" }}
                    >
                      <BackIcon />
                    </button>
                  </div>

                  {/* Tamil / English toggle — only when both versions exist */}
                  {result.answerEnglish && (
                    <div className="flex items-center gap-2">
                      {([["local", lang] as const, ["english", "English"] as const]).map(([key, label]) => {
                        const isActive = answerLang === key;
                        return (
                          <button
                            key={key}
                            onClick={() => setAnswerLang(key)}
                            className="px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
                            style={{
                              background: isActive ? "#6d28d9" : "rgba(255,255,255,0.08)",
                              color: isActive ? "#fff" : "rgba(255,255,255,0.45)",
                              border: isActive ? "none" : "1px solid rgba(255,255,255,0.08)",
                            }}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Scrollable Q&A area */}
                  <ScrollFade>
                    {/* You asked */}
                    <div>
                      <p className="text-xs font-bold uppercase tracking-widest mb-1.5" style={{ color: "rgba(255,255,255,0.35)", letterSpacing: "0.1em" }}>
                        You asked
                      </p>
                      <p className="text-sm leading-relaxed break-words" style={{ color: "rgba(255,255,255,0.65)" }}>
                        &ldquo;{result.transcription}&rdquo;
                      </p>
                    </div>

                    {/* Divider */}
                    <div style={{ height: 1, background: "rgba(124,58,237,0.25)" }} />

                    {/* Answer */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "#00d9a0", letterSpacing: "0.1em" }}>
                          Answer
                        </p>
                        <button
                          onClick={() => handleSpeak(answerLang === "english" && result.answerEnglish ? result.answerEnglish : result.answer!)}
                          className={`w-7 h-7 flex items-center justify-center rounded-lg transition-all active:scale-90 ${isSpeaking ? "animate-pulse" : ""}`}
                          style={{
                            background: isSpeaking ? "rgba(109,40,217,0.35)" : "rgba(255,255,255,0.08)",
                            color: isSpeaking ? "#a78bfa" : "rgba(255,255,255,0.5)",
                          }}
                          title="Hear answer"
                        >
                          <SpeakerIcon />
                        </button>
                      </div>
                      <p className="text-sm leading-relaxed break-words whitespace-pre-wrap" style={{ color: "rgba(255,255,255,0.9)" }}>
                        {answerLang === "english" && result.answerEnglish ? result.answerEnglish : result.answer}
                      </p>
                    </div>
                  </ScrollFade>

                  {/* CTAs */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleCopyAnswer(answerLang === "english" && result.answerEnglish ? result.answerEnglish : result.answer!)}
                      className="flex-none px-5 py-3 rounded-2xl font-semibold text-sm transition-all active:scale-95 flex items-center justify-center gap-1.5"
                      style={{ background: "#6d28d9", color: "#fff" }}
                    >
                      {answerCopied ? <><CheckIcon /><span>Copied</span></> : <><CopyIcon /><span>Copy</span></>}
                    </button>
                    <button
                      onClick={() => {
                        if (continueState !== "idle") return;
                        setContinueState("opening");
                        setTimeout(() => setContinueState("idle"), 700);
                      }}
                      className="flex-1 py-3 rounded-2xl font-semibold text-sm transition-all active:scale-95 flex items-center justify-center gap-1.5"
                      style={{ background: "rgba(255,255,255,0.08)", color: "#fff" }}
                    >
                      {continueState === "opening"
                        ? <span>Opening...</span>
                        : <><span>Continue in app</span><ArrowIcon /></>
                      }
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Recording pill */}
      {state === "recording" && (
        <div
          className="fixed z-40"
          onClick={(e) => e.stopPropagation()}
          style={{ left: panelLeft, ...panelPosition }}
        >
          <div
            className="flex items-center gap-3 px-3 py-3 rounded-full"
            style={{ width: "min(288px, 80vw)", background: "rgba(14,14,20,0.97)", border: "1px solid rgba(124,58,237,0.55)", boxShadow: "0 16px 48px rgba(0,0,0,0.7)" }}
          >
            <button
              onClick={cancelRecording}
              className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 transition-all active:scale-90"
              style={{ background: "rgba(255,255,255,0.1)", color: "#fff" }}
            >
              <CloseIcon />
            </button>

            {/* Center: waveform when ready, pulsing prompt when preparing */}
            <div className="flex-1 flex items-center justify-center h-11">
              {recordingReady ? (
                <canvas ref={canvasRef} width={140} height={40} className="w-full h-full" />
              ) : (
                <span className="text-xs animate-pulse" style={{ color: "rgba(167,139,250,0.8)" }}>
                  Ab boliye…
                </span>
              )}
            </div>

            {/* Check button — only shown when mic is live; tap Lottie sits on top */}
            <div className="relative flex-shrink-0">
              <button
                onClick={stopAndAnalyze}
                disabled={!recordingReady}
                className="w-11 h-11 rounded-full flex items-center justify-center transition-all active:scale-90"
                style={{ background: recordingReady ? "#6d28d9" : "rgba(109,40,217,0.25)", opacity: recordingReady ? 1 : 0.4 }}
              >
                <span style={{ color: "#fff", fontSize: 20 }}>✓</span>
              </button>
              {recordingReady && (
                <div className="pointer-events-none absolute" style={{ top: -6, left: 2, zIndex: 1 }}>
                  <Lottie animationData={tapAnimation} loop style={{ width: 48, height: 66 }} />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Coach mark 2 — "Ask a doubt chuniye" shown when menu is open, left of the "Any doubt" option */}
      {showCoachMark && hasInteracted && !hasSelectedMode && state === "mode_select" && (
        <div
          className="fixed z-[55] pointer-events-none"
          style={{
            left: panelLeft - 12,
            // "Any doubt" is the 2nd option: header ~36px + option1 ~70px + gaps ~28px + padding ~16px = ~150px from panel top
            top: panelAbove
              ? pos.y - 12 - 220 + 150  // panel bottom is pos.y-12, panel is ~220px tall, +150 to reach option2
              : pos.y + 76 + 150,        // panel top is pos.y+76, +150 to reach option2
            transform: "translateX(-100%)",
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: 2,
          }}
        >
          <span style={{
            color: "#8652FF",
            fontSize: 16,
            fontWeight: 800,
            whiteSpace: "nowrap",
            lineHeight: 1.25,
            textAlign: "right",
            textShadow: "0 1px 8px rgba(255,255,255,0.6)",
          }}>
            Ask a doubt<br />chuniye
          </span>
          {/* Arrow Lottie pointing right toward the "Any doubt" option */}
          <Lottie
            animationData={arrowAnimation}
            loop
            style={{ width: 80, height: 20, alignSelf: "flex-end" }}
          />
        </div>
      )}

      {/* Coach mark 4 — result prompt shown below the result panel */}
      {resultPrompt && state === "result" && (
        <div
          className="fixed z-[55] pointer-events-none"
          style={{
            left: 20,
            top: panelAbove ? pos.y - 160 : pos.y + 76 - 120,
            maxWidth: "65%",
          }}
        >
          <span style={{
            color: "#8652FF",
            fontSize: 18,
            fontWeight: 800,
            lineHeight: 1.35,
          }}>
            {resultPrompt}
          </span>
        </div>
      )}

      {/* Coach mark 3 — recording prompt shown above the waveform bar */}
      {recordingPrompt && state === "recording" && (
        <div
          className="fixed z-[55] pointer-events-none"
          style={{
            left: 20,
            top: panelAbove ? pos.y - 160 : pos.y + 76 - 120,
            maxWidth: "65%",
          }}
        >
          <span style={{
            color: "#8652FF",
            fontSize: 18,
            fontWeight: 800,
            lineHeight: 1.35,
          }}>
            {recordingPrompt}
          </span>
        </div>
      )}

      {/* Coach mark — Lottie centered on the widget button, label below */}
      {showCoachMark && !hasInteracted && (
        <>
          {/* Tap Lottie — overlaid directly on the button, centered horizontally */}
          <div
            className="fixed z-[56] pointer-events-none"
            style={{
              left: pos.x + 32 - 24, // center horizontally on 64px button
              top: pos.y + 24,        // finger tap lands on avatar center
            }}
          >
            <Lottie
              animationData={tapAnimation}
              loop
              style={{ width: 48, height: 66 }}
            />
          </div>

          {/* "Tap to start" pill below the button */}
          <div
            className="fixed z-[55] pointer-events-none"
            style={{
              left: pos.x + 32,
              top: pos.y + 100,
              transform: "translateX(-50%)",
              background: "#8652FF",
              color: "#fff",
              fontSize: 13,
              fontWeight: 700,
              borderRadius: 20,
              padding: "5px 14px",
              whiteSpace: "nowrap",
              letterSpacing: "0.02em",
              boxShadow: "0 2px 12px rgba(134,82,255,0.45)",
            }}
          >
            Tap to start
          </div>
        </>
      )}

      {/* Nova draggable button */}
      <div
        className="fixed z-50 w-16 h-16 touch-none select-none"
        style={{ left: pos.x, top: pos.y, cursor: dragging.current ? "grabbing" : "grab" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <div
          className="w-full h-full rounded-full overflow-hidden border-2 border-white relative"
          style={{
            background: "linear-gradient(135deg, #a855f7 0%, #7c3aed 40%, #6d28d9 100%)",
            boxShadow: "0 0 0 3px rgba(168,85,247,0.6), 0 0 20px 6px rgba(139,92,246,0.7), 0 4px 16px rgba(0,0,0,0.4)",
            animation: "nova-pulse 2.2s ease-in-out infinite",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/nova.png"
            alt="Nova"
            className="absolute inset-0 w-full h-full object-cover object-top scale-125 translate-y-2"
          />
        </div>
      </div>
    </>
  );
}
