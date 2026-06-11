"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { createRecorder, type Recorder } from "@/lib/recorder";
import { speak, stopSpeaking } from "@/lib/tts";
import ToneCards from "./ToneCards";

type V4State = "closed" | "idle_expanded" | "recording" | "analyzing" | "result" | "error";

type Feature = "draft" | "translate" | "grammar" | "meaning";

interface V4Result {
  feature: Feature;
  detectedLanguage: string;
  transcription: string;
  // draft
  recommendation?: string;
  casual?: string;
  semiFormal?: string;
  formal?: string;
  // translate
  sourceText?: string;
  translation?: string;
  // grammar
  isCorrect?: boolean;
  original?: string;
  corrected?: string;
  tip?: string;
  // meaning
  phrase?: string;
  meaning?: string;
}

function diffWords(original: string, corrected: string): { word: string; changed: boolean }[] {
  const wa = original.split(/\s+/);
  const wb = corrected.split(/\s+/);
  const dp: number[][] = Array(wa.length + 1).fill(null).map(() => Array(wb.length + 1).fill(0));
  for (let i = 1; i <= wa.length; i++) {
    for (let j = 1; j <= wb.length; j++) {
      if (wa[i - 1].toLowerCase().replace(/[^a-z]/g, "") === wb[j - 1].toLowerCase().replace(/[^a-z]/g, "")) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  const changed = new Array(wb.length).fill(true);
  let i = wa.length, j = wb.length;
  while (i > 0 && j > 0) {
    if (wa[i - 1].toLowerCase().replace(/[^a-z]/g, "") === wb[j - 1].toLowerCase().replace(/[^a-z]/g, "")) {
      changed[j - 1] = false;
      i--; j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }
  return wb.map((word, idx) => ({ word, changed: changed[idx] }));
}

const FEATURE_META: Record<Feature, { label: string; emoji: string }> = {
  draft:     { label: "Draft Message",        emoji: "✏️" },
  translate: { label: "Translate to English", emoji: "🌐" },
  grammar:   { label: "Check Grammar",        emoji: "✅" },
  meaning:   { label: "Find Meaning",         emoji: "📖" },
};

function diffWordsOriginal(original: string, corrected: string): { word: string; changed: boolean }[] {
  const wa = original.split(/\s+/);
  const wb = corrected.split(/\s+/);
  const dp: number[][] = Array(wa.length + 1).fill(null).map(() => Array(wb.length + 1).fill(0));
  for (let i = 1; i <= wa.length; i++) {
    for (let j = 1; j <= wb.length; j++) {
      if (wa[i - 1].toLowerCase().replace(/[^a-z]/g, "") === wb[j - 1].toLowerCase().replace(/[^a-z]/g, "")) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  const changed = new Array(wa.length).fill(true);
  let i = wa.length, j = wb.length;
  while (i > 0 && j > 0) {
    if (wa[i - 1].toLowerCase().replace(/[^a-z]/g, "") === wb[j - 1].toLowerCase().replace(/[^a-z]/g, "")) {
      changed[i - 1] = false;
      i--; j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }
  return wa.map((word, idx) => ({ word, changed: changed[idx] }));
}

const PANEL_STYLE = {
  background: "rgba(14, 14, 20, 0.97)",
  border: "1px solid rgba(124,58,237,0.55)",
  boxShadow: "0 24px 64px rgba(0,0,0,0.7), 0 0 0 1px rgba(109,40,217,0.15)",
};

const HINTS = [
  "Draft a message in English",
  "Check my grammar",
  "I have English doubt...",
  "What is the meaning of...",
];

const CopyIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
  </svg>
);

const CloseIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"/>
    <line x1="6" y1="6" x2="18" y2="18"/>
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

export default function FloatingWidgetV4() {
  const [state, setState] = useState<V4State>("closed");
  const [pos, setPos] = useState({ x: 300, y: 200 });
  const [result, setResult] = useState<V4Result | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [activeDraftText, setActiveDraftText] = useState<string | null>(null);
  const [translateEditState, setTranslateEditState] = useState<"idle" | "opening" | "done">("idle");
  const [grammarCopied, setGrammarCopied] = useState(false);
  const [translateCopied, setTranslateCopied] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [grammarContinueState, setGrammarContinueState] = useState<"idle" | "opening">("idle");
  const [meaningContinueState, setMeaningContinueState] = useState<"idle" | "opening">("idle");
  const [hintIndex, setHintIndex] = useState(0);
  const [hintVisible, setHintVisible] = useState(true);

  const dragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const dragMoved = useRef(false);
  const recorderRef = useRef<Recorder | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  useEffect(() => {
    setPos({ x: Math.round(window.innerWidth * 0.72), y: Math.round(window.innerHeight * 0.28) });
  }, []);

  // Cycle hints while idle_expanded
  useEffect(() => {
    if (state !== "idle_expanded") return;
    const interval = setInterval(() => {
      setHintVisible(false);
      setTimeout(() => {
        setHintIndex(i => (i + 1) % HINTS.length);
        setHintVisible(true);
      }, 300);
    }, 2500);
    return () => clearInterval(interval);
  }, [state]);

  const clamp = useCallback((x: number, y: number) => ({
    x: Math.max(12, Math.min(window.innerWidth - 76, x)),
    y: Math.max(12, Math.min(window.innerHeight - 76, y)),
  }), []);

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

  // Start waveform after canvas mounts
  useEffect(() => {
    if (state === "recording" && analyserRef.current) {
      drawWaveform(analyserRef.current);
    }
  }, [state, drawWaveform]);

  const startRecording = useCallback(async () => {
    console.log("[v4] starting recording");
    try {
      const recorder = await createRecorder();
      recorderRef.current = recorder;
      await recorder.start();
      analyserRef.current = recorder.getAnalyser();
      setState("recording");
    } catch (e: unknown) {
      const code = (e as { code?: string }).code;
      setErrorMsg(
        code === "permission-denied"
          ? "Microphone permission denied."
          : "Microphone not available."
      );
      setState("error");
    }
  }, []);

  const cancelRecording = useCallback(() => {
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
      console.error("[v4] stop error:", e);
      setErrorMsg("Recording failed. Please try again.");
      setState("error");
      return;
    }

    const formData = new FormData();
    formData.append("audio", blob);
    console.log("[v4] POST /api/superflow/v3 — blob size:", blob.size);

    try {
      const res = await fetch("/api/superflow/v3", { method: "POST", body: formData });
      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.error || "Something went wrong. Please try again.");
        setState("error");
        return;
      }

      console.log("[v4] STT transcription:", data.transcription);
      console.log(`[v4] classified as: ${data.feature} | language: ${data.detectedLanguage}`);
      console.log("[v4] response:", data);

      setResult(data);
      setActiveDraftText(null);
      setState("result");
    } catch (e) {
      console.error("[v4] API error:", e);
      setErrorMsg("Something went wrong. Please try again.");
      setState("error");
    }
  }, [stopAnimation]);

  const handleReset = useCallback(() => {
    stopAnimation();
    recorderRef.current?.cleanup();
    recorderRef.current = null;
    analyserRef.current = null;
    stopSpeaking().catch(console.error);
    setIsSpeaking(false);
    setResult(null);
    setErrorMsg(null);
    setCopied(false);
    setState("closed");
  }, [stopAnimation]);

  const handleCopy = useCallback(async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);

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
      console.error("[v4] TTS error", e);
    } finally {
      setIsSpeaking(false);
    }
  }, [isSpeaking]);

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
      setState("idle_expanded");
    }
  }, [state]);

  const panelAbove = typeof window !== "undefined" ? pos.y > window.innerHeight / 2 : true;
  const isOpen = state !== "closed";

  const panelLeft = typeof window !== "undefined"
    ? Math.min(pos.x, window.innerWidth - 340)
    : pos.x;

  const panelPosition = panelAbove
    ? { bottom: typeof window !== "undefined" ? window.innerHeight - pos.y + 12 : 100 }
    : { top: pos.y + 76 };

  // suppress unused warning — kept for potential future use
  void FEATURE_META;
  void copied;
  void handleCopy;

  return (
    <>
      {/* Click-outside backdrop */}
      {isOpen && (
        <div className="fixed inset-0 z-30" onClick={handleReset} />
      )}

      {/* Popup panel */}
      {(state === "idle_expanded" || state === "analyzing" || state === "result" || state === "error") && (
        <div
          className="fixed z-40"
          onClick={(e) => e.stopPropagation()}
          style={{ left: panelLeft, ...panelPosition }}
        >
          {/* Idle expanded card */}
          {state === "idle_expanded" && (
            <div className="flex flex-col items-center gap-5 rounded-3xl p-5" style={{ ...PANEL_STYLE, width: 280 }}>
              {/* Close button */}
              <div className="w-full flex justify-end">
                <button
                  onClick={() => setState("closed")}
                  className="w-8 h-8 flex items-center justify-center rounded-full transition-all active:opacity-60"
                  style={{ color: "rgba(255,255,255,0.5)", background: "rgba(255,255,255,0.08)" }}
                >
                  <CloseIcon />
                </button>
              </div>

              {/* Label */}
              <p
                className="font-bold tracking-widest uppercase text-center"
                style={{ color: "#fff", fontSize: 13, letterSpacing: "0.12em" }}
              >
                Ask me anything
              </p>

              {/* Cycling hint */}
              <p
                className="text-center leading-snug transition-opacity duration-300"
                style={{
                  color: "#fff",
                  fontSize: 16,
                  opacity: hintVisible ? 1 : 0,
                  minHeight: 48,
                }}
              >
                &ldquo;{HINTS[hintIndex]}&rdquo;
              </p>

              {/* Mic button */}
              <button
                onClick={startRecording}
                className="flex items-center justify-center rounded-full transition-all active:scale-90 shadow-lg"
                style={{
                  width: 64,
                  height: 64,
                  background: "linear-gradient(135deg, #a855f7 0%, #7c3aed 40%, #6d28d9 100%)",
                  color: "#fff",
                  boxShadow: "0 8px 24px rgba(109,40,217,0.5)",
                }}
              >
                <MicIcon />
              </button>
            </div>
          )}

          {/* Analyzing */}
          {state === "analyzing" && (
            <div className="flex items-center justify-center gap-3 px-6 py-4 rounded-2xl w-72" style={PANEL_STYLE}>
              <div className="w-5 h-5 rounded-full border-2 border-purple-400 border-t-transparent animate-spin" />
              <span className="text-sm font-medium" style={{ color: "rgba(255,255,255,0.7)" }}>Thinking…</span>
            </div>
          )}

          {/* Error */}
          {state === "error" && (
            <div className="w-80 rounded-3xl p-4 flex flex-col gap-3" style={PANEL_STYLE}>
              <p className="text-sm text-center" style={{ color: "#f87171" }}>{errorMsg}</p>
              <button onClick={handleReset} className="text-sm font-medium text-center" style={{ color: "#a78bfa" }}>
                Tap Nova to try again
              </button>
            </div>
          )}

          {/* Result */}
          {state === "result" && result && (() => {
            const speakableText =
              result.feature === "draft" ? (activeDraftText ?? result.semiFormal ?? result.casual ?? result.formal ?? "") :
              result.feature === "translate" ? (result.translation || "") :
              result.feature === "grammar" ? (result.corrected || result.original || "") :
              result.feature === "meaning" ? (result.phrase || result.transcription || "") : "";

            return (
              <div className="w-80 rounded-3xl p-4 flex flex-col gap-3" style={{ ...PANEL_STYLE, maxHeight: "80vh", overflowY: "auto" }}>
                {/* Header — × close + speaker */}
                <div className="flex items-center justify-between">
                  <button
                    onClick={handleReset}
                    className="w-8 h-8 flex items-center justify-center rounded-full transition-all active:opacity-60"
                    style={{ color: "rgba(255,255,255,0.5)", background: "rgba(255,255,255,0.08)" }}
                  >
                    <CloseIcon />
                  </button>
                  <button
                    onClick={() => handleSpeak(speakableText)}
                    className={`w-8 h-8 flex items-center justify-center rounded-full transition-all active:opacity-60 ${isSpeaking ? "animate-pulse" : ""}`}
                    style={{ color: isSpeaking ? "#a78bfa" : "rgba(255,255,255,0.5)", background: isSpeaking ? "rgba(109,40,217,0.35)" : "rgba(255,255,255,0.08)" }}
                  >
                    <SpeakerIcon />
                  </button>
                </div>

                {/* Draft */}
                {result.feature === "draft" && result.casual != null && (
                  <ToneCards
                    result={{
                      recommendation: result.recommendation || "semiFormal",
                      casual: result.casual!,
                      semiFormal: result.semiFormal!,
                      formal: result.formal!,
                    }}
                    onActiveChange={setActiveDraftText}
                  />
                )}

                {/* Translate */}
                {result.feature === "translate" && result.translation && (
                  <div className="flex flex-col gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: "#f97316" }}>You said</p>
                      <p className="text-sm leading-relaxed break-words" style={{ color: "rgba(255,255,255,0.85)" }}>
                        &ldquo;{result.sourceText || result.transcription}&rdquo;
                      </p>
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "#00d9a0" }}>Translated</p>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(result.translation!);
                            setTranslateCopied(true);
                            setTimeout(() => setTranslateCopied(false), 1500);
                          }}
                          className="flex items-center justify-center rounded-lg transition-all active:scale-90"
                          style={{ width: 28, height: 28, background: translateCopied ? "rgba(0,217,160,0.25)" : "rgba(255,255,255,0.1)", color: translateCopied ? "#00d9a0" : "rgba(255,255,255,0.6)" }}
                          title="Copy"
                        >
                          {translateCopied
                            ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                            : <CopyIcon />
                          }
                        </button>
                      </div>
                      <p className="text-sm leading-relaxed break-words" style={{ color: "rgba(255,255,255,0.85)" }}>
                        &ldquo;{result.translation}&rdquo;
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        if (translateEditState !== "idle") return;
                        setTranslateEditState("opening");
                        setTimeout(() => setTranslateEditState("idle"), 700);
                      }}
                      className="w-full py-3 rounded-2xl font-semibold text-sm transition-all active:scale-95 flex items-center justify-center gap-1.5"
                      style={{ background: "#6d28d9", color: "#fff" }}
                    >
                      {translateEditState === "opening" ? <span>Opening app...</span> : <>
                        <span>Continue in app</span>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="7" y1="17" x2="17" y2="7" /><polyline points="7 7 17 7 17 17" />
                        </svg>
                      </>}
                    </button>
                  </div>
                )}

                {/* Grammar */}
                {result.feature === "grammar" && (
                  <div className="flex flex-col gap-3">
                    {/* YOU SAID */}
                    <div>
                      <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: result.isCorrect ? "#00d9a0" : "#f97316" }}>
                        You said
                      </p>
                      <p className="text-sm leading-relaxed">
                        {result.isCorrect || !result.corrected || !result.original
                          ? <span style={{ color: "rgba(255,255,255,0.85)" }}>&ldquo;{result.original}&rdquo;</span>
                          : <>
                              &ldquo;{diffWordsOriginal(result.original, result.corrected).map((token, idx) =>
                                token.changed ? (
                                  <mark key={idx} style={{ background: "rgba(249,115,22,0.2)", color: "#f97316", borderRadius: "3px", padding: "0 2px", marginRight: "3px" }}>
                                    {token.word}
                                  </mark>
                                ) : (
                                  <span key={idx} style={{ color: "rgba(255,255,255,0.85)", marginRight: "3px" }}>{token.word}</span>
                                )
                              )}&rdquo;
                            </>
                        }
                      </p>
                    </div>

                    {/* TRY THIS — only if incorrect */}
                    {!result.isCorrect && result.corrected && result.original && (
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "#00d9a0" }}>Try this</p>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(result.corrected!);
                              setGrammarCopied(true);
                              setTimeout(() => setGrammarCopied(false), 1500);
                            }}
                            className="flex items-center justify-center rounded-lg transition-all active:scale-90"
                            style={{ width: 28, height: 28, background: grammarCopied ? "rgba(0,217,160,0.25)" : "rgba(255,255,255,0.1)", color: grammarCopied ? "#00d9a0" : "rgba(255,255,255,0.6)" }}
                            title="Copy correction"
                          >
                            {grammarCopied
                              ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                              : <CopyIcon />
                            }
                          </button>
                        </div>
                        <p className="text-sm leading-relaxed">
                          &ldquo;{diffWords(result.original, result.corrected).map((token, idx) =>
                            token.changed ? (
                              <mark key={idx} style={{ background: "rgba(0,217,160,0.2)", color: "#00d9a0", borderRadius: "3px", padding: "0 2px", marginRight: "3px" }}>
                                {token.word}
                              </mark>
                            ) : (
                              <span key={idx} style={{ color: "rgba(255,255,255,0.85)", marginRight: "3px" }}>{token.word}</span>
                            )
                          )}&rdquo;
                        </p>
                      </div>
                    )}

                    {/* Tip */}
                    {result.tip && (
                      <p className="text-xs leading-relaxed break-words" style={{ color: "rgba(255,255,255,0.4)" }}>{result.tip}</p>
                    )}

                    {/* Continue in app */}
                    <button
                      onClick={() => {
                        if (grammarContinueState !== "idle") return;
                        setGrammarContinueState("opening");
                        if (!result.isCorrect) navigator.clipboard.writeText(result.corrected!);
                        setTimeout(() => setGrammarContinueState("idle"), 700);
                      }}
                      className="w-full py-3 rounded-2xl font-semibold text-sm transition-all active:scale-95 flex items-center justify-center gap-1.5"
                      style={{ background: "#6d28d9", color: "#fff" }}
                    >
                      {grammarContinueState === "opening"
                        ? <span>Opening app...</span>
                        : <>
                            <span>Continue in app</span>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <line x1="7" y1="17" x2="17" y2="7" /><polyline points="7 7 17 7 17 17" />
                            </svg>
                          </>
                      }
                    </button>
                  </div>
                )}

                {/* Meaning */}
                {result.feature === "meaning" && result.meaning && (
                  <div className="flex flex-col gap-3">
                    <p className="font-bold leading-tight break-words" style={{ color: "#00d9a0", fontSize: 20 }}>
                      {result.phrase || result.transcription}
                    </p>
                    <p className="text-sm leading-relaxed break-words whitespace-pre-wrap" style={{ color: "rgba(255,255,255,0.85)" }}>
                      <span style={{ color: "rgba(255,255,255,0.45)" }}>Meaning: </span>{result.meaning}
                    </p>
                    <button
                      onClick={() => {
                        if (meaningContinueState !== "idle") return;
                        setMeaningContinueState("opening");
                        setTimeout(() => setMeaningContinueState("idle"), 700);
                      }}
                      className="w-full py-3 rounded-2xl font-semibold text-sm transition-all active:scale-95 flex items-center justify-center gap-1.5"
                      style={{ background: "#6d28d9", color: "#fff" }}
                    >
                      {meaningContinueState === "opening"
                        ? <span>Opening app...</span>
                        : <>
                            <span>Continue in app</span>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <line x1="7" y1="17" x2="17" y2="7" /><polyline points="7 7 17 7 17 17" />
                            </svg>
                          </>
                      }
                    </button>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* Recording pill — anchored near Nova */}
      {state === "recording" && (
        <div
          className="fixed z-40"
          onClick={(e) => e.stopPropagation()}
          style={{ left: panelLeft, ...panelPosition }}
        >
          <div
            className="flex items-center gap-3 px-3 py-3 rounded-full w-72"
            style={{ background: "rgba(14,14,20,0.97)", border: "1px solid rgba(124,58,237,0.55)", boxShadow: "0 16px 48px rgba(0,0,0,0.7)" }}
          >
            <button
              onClick={cancelRecording}
              className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 transition-all active:scale-90"
              style={{ background: "rgba(255,255,255,0.1)", color: "#fff" }}
            >
              <CloseIcon />
            </button>
            <div className="flex-1 flex items-center justify-center h-11">
              <canvas ref={canvasRef} width={140} height={40} className="w-full h-full" />
            </div>
            <button
              onClick={stopAndAnalyze}
              className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 transition-all active:scale-90"
              style={{ background: "#6d28d9" }}
            >
              <span style={{ color: "#fff", fontSize: 20 }}>✓</span>
            </button>
          </div>
        </div>
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
          className="w-full h-full rounded-full shadow-xl shadow-purple-300/50 overflow-hidden border-2 border-white ring-2 ring-purple-400 hover:ring-purple-600 transition-shadow relative"
          style={{ background: "linear-gradient(135deg, #a855f7 0%, #7c3aed 40%, #6d28d9 100%)" }}
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
