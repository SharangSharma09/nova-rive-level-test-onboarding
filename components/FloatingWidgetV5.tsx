"use client";

import { useState, useRef, useCallback, useEffect, useLayoutEffect } from "react";
import { createRecorder, type Recorder } from "@/lib/recorder";
import { speak, stopSpeaking } from "@/lib/tts";
import ToneCards from "./ToneCards";

type V5Mode = "localize" | "doubt";
type V5State = "closed" | "mode_select" | "recording" | "analyzing" | "result" | "error";

interface V5Result {
  mode: V5Mode;
  transcription: string;
  // localize
  recommendation?: string;
  casual?: string;
  semiFormal?: string;
  formal?: string;
  // doubt
  question?: string;
  answer?: string;
  answerEnglish?: string;
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

export default function FloatingWidgetV5({ lang = "Tamil", apiEndpoint = "/api/superflow/v5" }: FloatingWidgetV5Props = {}) {
  const copy = LANG_COPY[lang] ?? LANG_COPY.Tamil;
  const [state, setState] = useState<V5State>("closed");
  const [activeMode, setActiveMode] = useState<V5Mode | null>(null);
  const [pos, setPos] = useState({ x: 300, y: 200 });
  const [result, setResult] = useState<V5Result | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [answerCopied, setAnswerCopied] = useState(false);
  const [answerLang, setAnswerLang] = useState<"local" | "english">("local");
  const [showDoubtFade, setShowDoubtFade] = useState(false);
  const doubtScrollRef = useRef<HTMLDivElement>(null);
  const [activeDraftText, setActiveDraftText] = useState<string | null>(null);
  const [continueState, setContinueState] = useState<"idle" | "opening">("idle");

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

  useEffect(() => {
    if (state === "recording" && analyserRef.current) {
      drawWaveform(analyserRef.current);
    }
  }, [state, drawWaveform]);

  const startRecording = useCallback(async (mode: V5Mode) => {
    console.log("[v5] starting recording — mode:", mode);
    setActiveMode(mode);
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

  useLayoutEffect(() => {
    if (state === "result" && result?.mode === "doubt") {
      const el = doubtScrollRef.current;
      if (el) setShowDoubtFade(el.scrollHeight > el.clientHeight);
    }
  }, [state, result]);

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

  const panelAbove = typeof window !== "undefined" ? pos.y > window.innerHeight / 2 : true;
  const isOpen = state !== "closed";
  const panelLeft = typeof window !== "undefined" ? Math.min(pos.x, window.innerWidth - 320) : pos.x;
  const panelPosition = panelAbove
    ? { bottom: typeof window !== "undefined" ? window.innerHeight - pos.y + 12 : 100 }
    : { top: pos.y + 76 };

  const speakableText =
    result?.mode === "localize"
      ? (activeDraftText ?? result.semiFormal ?? result.casual ?? result.formal ?? "")
      : result?.mode === "doubt"
      ? (result.answer ?? "")
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

              {/* Option 2 — Doubt */}
              <button
                onClick={() => startRecording("doubt")}
                className="w-full flex items-center gap-3 rounded-2xl p-3.5 text-left transition-all active:scale-95"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
              >
                <div
                  className="flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center text-xl"
                  style={{ background: "rgba(255,255,255,0.08)" }}
                >
                  ❓
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm leading-tight" style={{ color: "#fff" }}>{copy.option2}</p>
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
                      onClick={handleReset}
                      className="w-8 h-8 flex items-center justify-center rounded-full transition-all active:opacity-60"
                      style={{ color: "rgba(255,255,255,0.5)", background: "rgba(255,255,255,0.08)" }}
                    >
                      <CloseIcon />
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

              {/* ── Doubt result (chat Q&A) ── */}
              {result.mode === "doubt" && result.answer && (
                <>
                  {/* Close header */}
                  <div className="flex items-center">
                    <button
                      onClick={handleReset}
                      className="w-8 h-8 flex items-center justify-center rounded-full transition-all active:opacity-60"
                      style={{ color: "rgba(255,255,255,0.5)", background: "rgba(255,255,255,0.08)" }}
                    >
                      <CloseIcon />
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
                  <div className="relative">
                  <div
                    ref={doubtScrollRef}
                    className="overflow-y-auto flex flex-col gap-3"
                    style={{ maxHeight: "40vh" }}
                    onScroll={(e) => {
                      const el = e.currentTarget;
                      const atBottom = el.scrollHeight - el.scrollTop <= el.clientHeight + 4;
                      setShowDoubtFade(!atBottom);
                    }}
                  >
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
                  </div>
                  {/* Bottom fade hint — only when content overflows */}
                  {showDoubtFade && (
                    <div
                      className="pointer-events-none absolute bottom-0 left-0 right-0 transition-opacity duration-300"
                      style={{ height: 48, background: "linear-gradient(to bottom, transparent, rgba(14,14,20,0.97))" }}
                    />
                  )}
                  </div>

                  {/* CTAs */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleCopyAnswer(answerLang === "english" && result.answerEnglish ? result.answerEnglish : result.answer!)}
                      className="flex-1 py-3 rounded-2xl font-semibold text-sm transition-all active:scale-95 flex items-center justify-center gap-1.5"
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
                        : <><span>Open in app</span><ArrowIcon /></>
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
