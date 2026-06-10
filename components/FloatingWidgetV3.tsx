"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { createRecorder, type Recorder } from "@/lib/recorder";
import { speak, stopSpeaking } from "@/lib/tts";
import ToneCards from "./ToneCards";

type V3State = "closed" | "recording" | "analyzing" | "result" | "error";

type Feature = "draft" | "translate" | "grammar" | "meaning";

interface V3Result {
  feature: Feature;
  detectedLanguage: string;
  transcription: string;
  // draft
  recommendation?: string;
  casual?: string;
  semiFormal?: string;
  formal?: string;
  // translate
  translation?: string;
  // grammar
  isCorrect?: boolean;
  original?: string;
  corrected?: string;
  tip?: string;
  // meaning
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

const PANEL_STYLE = {
  background: "rgba(14, 14, 20, 0.97)",
  border: "1px solid rgba(255,255,255,0.08)",
  boxShadow: "0 24px 64px rgba(0,0,0,0.7), 0 0 0 1px rgba(109,40,217,0.15)",
};

export default function FloatingWidgetV3() {
  const [state, setState] = useState<V3State>("closed");
  const [pos, setPos] = useState({ x: 300, y: 200 });
  const [result, setResult] = useState<V3Result | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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

  // Start waveform after canvas mounts
  useEffect(() => {
    if (state === "recording" && analyserRef.current) {
      drawWaveform(analyserRef.current);
    }
  }, [state, drawWaveform]);

  const startRecording = useCallback(async () => {
    console.log("[v3] starting recording");
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
      console.error("[v3] stop error:", e);
      setErrorMsg("Recording failed. Please try again.");
      setState("error");
      return;
    }

    const formData = new FormData();
    formData.append("audio", blob);
    console.log("[v3] POST /api/superflow/v3 — blob size:", blob.size);

    try {
      const res = await fetch("/api/superflow/v3", { method: "POST", body: formData });
      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.error || "Something went wrong. Please try again.");
        setState("error");
        return;
      }

      console.log("[v3] STT transcription:", data.transcription);
      console.log(`[v3] classified as: ${data.feature} | language: ${data.detectedLanguage}`);
      console.log("[v3] response:", data);

      setResult(data);

      setState("result");
    } catch (e) {
      console.error("[v3] API error:", e);
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
      startRecording();
    }
  }, [state, startRecording]);

  const panelAbove = typeof window !== "undefined" ? pos.y > window.innerHeight / 2 : true;
  const isOpen = state !== "closed";

  const panelLeft = typeof window !== "undefined"
    ? Math.min(pos.x, window.innerWidth - 340)
    : pos.x;

  const panelPosition = panelAbove
    ? { bottom: typeof window !== "undefined" ? window.innerHeight - pos.y + 12 : 100 }
    : { top: pos.y + 76 };

  return (
    <>
      {/* Click-outside backdrop */}
      {isOpen && (
        <div className="fixed inset-0 z-30" onClick={handleReset} />
      )}

      {/* Popup panel */}
      {(state === "analyzing" || state === "result" || state === "error") && (
        <div
          className="fixed z-40"
          onClick={(e) => e.stopPropagation()}
          style={{ left: panelLeft, ...panelPosition }}
        >
          {/* Analyzing */}
          {state === "analyzing" && (
            <div className="flex items-center justify-center gap-3 px-6 py-4 rounded-2xl w-72" style={PANEL_STYLE}>
              <div className="w-5 h-5 rounded-full border-2 border-purple-400 border-t-transparent animate-spin" />
              <span className="text-sm font-medium" style={{ color: "rgba(255,255,255,0.7)" }}>Listening…</span>
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
            const meta = FEATURE_META[result.feature];
            return (
              <div className="w-80 rounded-3xl p-4 flex flex-col gap-3" style={PANEL_STYLE}>
                {/* Header */}
                <div className="flex items-center justify-between">
                  <button
                    onClick={handleReset}
                    className="text-lg transition-all active:opacity-60"
                    style={{ color: "rgba(255,255,255,0.4)", background: "none" }}
                  >
                    ←
                  </button>
                  <span className="text-xs font-semibold px-2 py-1 rounded-full" style={{ background: "rgba(109,40,217,0.3)", color: "rgba(139,92,246,0.9)" }}>
                    {meta.emoji} {meta.label}
                  </span>
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
                  />
                )}

                {/* Translate */}
                {result.feature === "translate" && result.translation && (
                  <div className="flex flex-col gap-3">
                    <span className="text-xs uppercase tracking-wider font-semibold" style={{ color: "rgba(255,255,255,0.35)" }}>
                      English translation
                    </span>
                    <p className="text-base font-medium leading-relaxed whitespace-pre-wrap" style={{ color: "rgba(255,255,255,0.9)" }}>
                      {result.translation}
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => speak(result.translation!).catch(console.error)}
                        style={{ color: "rgba(139,92,246,0.8)", fontSize: 18 }}
                        title="Replay"
                      >🔊</button>
                      <button
                        onClick={() => handleCopy(result.translation!)}
                        className="flex-1 py-3 rounded-2xl font-semibold text-sm transition-all active:scale-95"
                        style={{ background: "#6d28d9", color: "#fff" }}
                      >
                        {copied ? "✓ Copied!" : "Copy"}
                      </button>
                    </div>
                  </div>
                )}

                {/* Grammar */}
                {result.feature === "grammar" && (
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold" style={{ color: result.isCorrect ? "#4ade80" : "#fbbf24" }}>
                        {result.isCorrect ? "✅ Looks good!" : "💡 Suggestion"}
                      </span>
                      <button
                        onClick={() => {
                          const t = result.isCorrect
                            ? `${result.tip}`
                            : `Try this: ${result.corrected}. ${result.tip}`;
                          speak(t).catch(console.error);
                        }}
                        style={{ color: "rgba(139,92,246,0.8)", fontSize: 18 }}
                      >🔊</button>
                    </div>

                    {result.original && (
                      <p className="text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>
                        You said: <span style={{ color: "rgba(255,255,255,0.55)" }}>{result.original}</span>
                      </p>
                    )}

                    {!result.isCorrect && result.corrected && result.original && (
                      <p className="text-base font-medium leading-relaxed">
                        {diffWords(result.original, result.corrected).map((token, idx) =>
                          token.changed ? (
                            <mark
                              key={idx}
                              style={{
                                background: "rgba(74,222,128,0.2)",
                                color: "#4ade80",
                                borderRadius: "3px",
                                padding: "0 2px",
                                marginRight: "3px",
                              }}
                            >
                              {token.word}
                            </mark>
                          ) : (
                            <span key={idx} style={{ color: "rgba(255,255,255,0.9)", marginRight: "3px" }}>
                              {token.word}
                            </span>
                          )
                        )}
                      </p>
                    )}

                    <p className="text-xs italic" style={{ color: "rgba(255,255,255,0.4)" }}>{result.tip}</p>

                    {!result.isCorrect && (
                      <button
                        onClick={() => handleCopy(result.corrected!)}
                        className="w-full py-3 rounded-2xl font-semibold text-sm transition-all active:scale-95"
                        style={{ background: "#6d28d9", color: "#fff" }}
                      >
                        {copied ? "✓ Copied!" : "Copy correction"}
                      </button>
                    )}
                  </div>
                )}

                {/* Meaning */}
                {result.feature === "meaning" && result.meaning && (
                  <div className="flex flex-col gap-3">
                    <span className="text-xs uppercase tracking-wider font-semibold" style={{ color: "rgba(255,255,255,0.35)" }}>
                      Meaning in {result.detectedLanguage}
                    </span>
                    <p className="text-base font-medium leading-relaxed whitespace-pre-wrap" style={{ color: "rgba(255,255,255,0.9)" }}>
                      {result.meaning}
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => speak(result.meaning!).catch(console.error)}
                        style={{ color: "rgba(139,92,246,0.8)", fontSize: 18 }}
                        title="Replay"
                      >🔊</button>
                      <button
                        onClick={() => handleCopy(result.meaning!)}
                        className="flex-1 py-3 rounded-2xl font-semibold text-sm transition-all active:scale-95"
                        style={{ background: "#6d28d9", color: "#fff" }}
                      >
                        {copied ? "✓ Copied!" : "Copy"}
                      </button>
                    </div>
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
            style={{ background: "rgba(14,14,20,0.97)", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 16px 48px rgba(0,0,0,0.7)" }}
          >
            <button
              onClick={cancelRecording}
              className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 transition-all active:scale-90"
              style={{ background: "rgba(255,255,255,0.1)" }}
            >
              <span style={{ color: "#fff", fontSize: 18 }}>✕</span>
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
