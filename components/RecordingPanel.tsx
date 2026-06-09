"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { createRecorder, type Recorder } from "@/lib/recorder";
import { speak, stopSpeaking } from "@/lib/tts";
import ToneCards from "./ToneCards";
import LanguageSelector from "./LanguageSelector";

export type Feature = "draft" | "translate" | "grammar" | "meaning";

interface DraftResult {
  recommendation: string;
  casual: string;
  semiFormal: string;
  formal: string;
}

interface GrammarResult {
  isCorrect: boolean;
  original: string;
  corrected: string;
  tip: string;
}

type Stage = "idle" | "recording" | "analyzing" | "result" | "error";

const FEATURE_META: Record<Feature, { label: string; emoji: string; needsLanguage: boolean; hint: string }> = {
  draft:     { label: "Draft Message",                    emoji: "✏️", needsLanguage: true,  hint: "Tap and speak in your language" },
  translate: { label: "Translate to English",             emoji: "🌐", needsLanguage: true,  hint: "Tap and speak in your language" },
  grammar:   { label: "Check Grammar",                    emoji: "✅", needsLanguage: false, hint: "Tap and speak in English" },
  meaning:   { label: "Find meaning of word/sentence", emoji: "📖", needsLanguage: true,  hint: "Tap and speak the word/sentence" },
};

const PANEL_STYLE = {
  background: "rgba(14, 14, 20, 0.97)",
  border: "1px solid rgba(255,255,255,0.08)",
  boxShadow: "0 24px 64px rgba(0,0,0,0.7), 0 0 0 1px rgba(109,40,217,0.15)",
};

interface Props {
  feature: Feature;
  onBack: () => void;
}

export default function RecordingPanel({ feature, onBack }: Props) {
  const meta = FEATURE_META[feature];
  const [stage, setStage] = useState<Stage>("idle");
  const [language, setLanguage] = useState("Hindi");
  const [draftResult, setDraftResult] = useState<DraftResult | null>(null);
  const [grammarResult, setGrammarResult] = useState<GrammarResult | null>(null);
  const [textResult, setTextResult] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const recorderRef = useRef<Recorder | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

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

  const stopAnimation = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
  }, []);

  // Start waveform once canvas is mounted (after stage → "recording")
  useEffect(() => {
    if (stage === "recording" && analyserRef.current) {
      drawWaveform(analyserRef.current);
    }
  }, [stage, drawWaveform]);

  const startRecording = async () => {
    console.log("[RecordingPanel] starting recording, feature:", feature);
    try {
      const recorder = await createRecorder();
      recorderRef.current = recorder;
      await recorder.start();
      const analyser = recorder.getAnalyser();
      analyserRef.current = analyser;
      setStage("recording");
    } catch (e: unknown) {
      const code = (e as { code?: string }).code;
      console.error("[RecordingPanel] recorder error:", code, e);
      setErrorMsg(
        code === "permission-denied"
          ? "Microphone permission denied. Please allow mic access and try again."
          : "Microphone not available on this device."
      );
      setStage("error");
    }
  };

  const cancelRecording = () => {
    stopAnimation();
    recorderRef.current?.cleanup();
    recorderRef.current = null;
    analyserRef.current = null;
    setStage("idle");
  };

  const stopAndAnalyze = async () => {
    const recorder = recorderRef.current;
    if (!recorder) return;
    stopAnimation();
    setStage("analyzing");
    console.log("[RecordingPanel] analyzing, feature:", feature);

    let blob: Blob;
    try {
      blob = await recorder.stop();
      recorder.cleanup();
      recorderRef.current = null;
    } catch (e) {
      console.error("[RecordingPanel] stop error:", e);
      setErrorMsg("Recording failed. Please try again.");
      setStage("error");
      return;
    }

    const formData = new FormData();
    formData.append("audio", blob);
    if (meta.needsLanguage) formData.append("language", language);

    const endpoint = `/api/superflow/${feature}`;
    console.log("[RecordingPanel] POST", endpoint, "blob size:", blob.size);

    try {
      const res = await fetch(endpoint, { method: "POST", body: formData });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      console.log("[RecordingPanel] STT transcription:", data.transcription);
      console.log("[RecordingPanel] response:", data);

      if (feature === "draft") {
        setDraftResult(data);
      } else if (feature === "grammar") {
        setGrammarResult(data);
        const ttsText = data.isCorrect
          ? `That's correct! ${data.tip}`
          : `The correct way to say it is: ${data.corrected}. ${data.tip}`;
        speak(ttsText).catch(console.error);
      } else if (feature === "translate") {
        setTextResult(data.translation);
        speak(data.translation).catch(console.error);
      } else if (feature === "meaning") {
        setTextResult(data.meaning);
        speak(data.meaning).catch(console.error);
      }
      setStage("result");
    } catch (e) {
      console.error("[RecordingPanel] API error:", e);
      setErrorMsg("Something went wrong. Please try again.");
      setStage("error");
    }
  };

  const handleRetry = () => {
    stopSpeaking().catch(console.error);
    setDraftResult(null);
    setGrammarResult(null);
    setTextResult(null);
    setErrorMsg(null);
    setStage("idle");
  };

  useEffect(() => {
    return () => {
      stopAnimation();
      recorderRef.current?.cleanup();
      stopSpeaking().catch(console.error);
    };
  }, [stopAnimation]);

  // ── RECORDING state: SuperFlow-style pill ────────────────────────────────
  if (stage === "recording") {
    return (
      <div
        className="flex items-center gap-3 px-3 py-3 rounded-full w-72"
        style={{ background: "rgba(14,14,20,0.97)", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 16px 48px rgba(0,0,0,0.7)" }}
      >
        {/* Cancel */}
        <button
          onClick={cancelRecording}
          className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 transition-all active:scale-90"
          style={{ background: "rgba(255,255,255,0.1)" }}
        >
          <span style={{ color: "#fff", fontSize: 18 }}>✕</span>
        </button>

        {/* Waveform */}
        <div className="flex-1 flex items-center justify-center h-11">
          <canvas ref={canvasRef} width={140} height={40} className="w-full h-full" />
        </div>

        {/* Confirm */}
        <button
          onClick={stopAndAnalyze}
          className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 transition-all active:scale-90"
          style={{ background: "#6d28d9" }}
        >
          <span style={{ color: "#fff", fontSize: 20 }}>✓</span>
        </button>
      </div>
    );
  }

  // ── ANALYZING state ──────────────────────────────────────────────────────
  if (stage === "analyzing") {
    return (
      <div
        className="flex items-center justify-center gap-3 px-6 py-4 rounded-2xl w-72"
        style={PANEL_STYLE}
      >
        <div className="w-5 h-5 rounded-full border-2 border-purple-400 border-t-transparent animate-spin" />
        <span className="text-sm font-medium" style={{ color: "rgba(255,255,255,0.7)" }}>Processing…</span>
      </div>
    );
  }

  // ── RESULT state ─────────────────────────────────────────────────────────
  if (stage === "result") {
    return (
      <div className="w-80 rounded-3xl p-4 flex flex-col gap-3" style={PANEL_STYLE}>
        {/* Header */}
        <div className="flex items-center justify-between">
          <button
            onClick={handleRetry}
            className="flex items-center gap-1 text-sm transition-all active:opacity-60"
            style={{ color: "rgba(255,255,255,0.4)", background: "none" }}
          >
            ←
          </button>
        </div>

        {feature === "draft" && draftResult && (
          <ToneCards result={draftResult} onClose={onBack} />
        )}

        {feature === "translate" && textResult && (
          <DarkResultCard label="English translation" text={textResult} onReplay={() => speak(textResult).catch(console.error)} onBack={onBack} />
        )}

        {feature === "grammar" && grammarResult && (
          <DarkGrammarCard
            result={grammarResult}
            onReplay={() => {
              const t = grammarResult.isCorrect
                ? `That's correct! ${grammarResult.tip}`
                : `The correct way: ${grammarResult.corrected}. ${grammarResult.tip}`;
              speak(t).catch(console.error);
            }}
          />
        )}

        {feature === "meaning" && textResult && (
          <DarkResultCard label={`Meaning in ${language}`} text={textResult} onReplay={() => speak(textResult).catch(console.error)} onBack={onBack} />
        )}
      </div>
    );
  }

  // ── IDLE + ERROR state: full panel ───────────────────────────────────────
  return (
    <div className="w-80 rounded-3xl p-4 flex flex-col gap-4" style={PANEL_STYLE}>
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="text-lg transition-all active:opacity-60 flex-shrink-0"
          style={{ color: "rgba(255,255,255,0.4)", background: "none" }}
        >
          ←
        </button>
        <span className="text-sm font-semibold" style={{ color: "rgba(255,255,255,0.9)" }}>
          {meta.label}
        </span>
      </div>

      {/* Language selector */}
      {meta.needsLanguage && (
        <LanguageSelector value={language} onChange={setLanguage} dark />
      )}

      {/* Mic area */}
      <div className="flex flex-col items-center gap-3 py-4">
        {stage === "error" ? (
          <>
            <p className="text-sm text-center" style={{ color: "#f87171" }}>{errorMsg}</p>
            <button onClick={handleRetry} className="text-sm font-medium" style={{ color: "#a78bfa" }}>Try again →</button>
          </>
        ) : (
          <>
            <button
              onClick={startRecording}
              className="w-16 h-16 rounded-full flex items-center justify-center transition-all active:scale-95"
              style={{
                background: "linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)",
                boxShadow: "0 8px 24px rgba(109,40,217,0.5)",
              }}
            >
              <MicIcon />
            </button>
            <p className="text-xs text-center" style={{ color: "rgba(255,255,255,0.3)" }}>{meta.hint}</p>
          </>
        )}
      </div>
    </div>
  );
}

function DarkResultCard({ label, text, onReplay }: { label: string; text: string; onReplay: () => void; onBack: () => void }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wider font-semibold" style={{ color: "rgba(255,255,255,0.35)" }}>{label}</span>
        <button onClick={onReplay} style={{ color: "rgba(139,92,246,0.8)", fontSize: 18 }} title="Replay">🔊</button>
      </div>
      <p className="text-base font-medium leading-relaxed whitespace-pre-wrap" style={{ color: "rgba(255,255,255,0.9)" }}>{text}</p>
      <button
        onClick={handleCopy}
        className="w-full py-3 rounded-2xl font-semibold text-sm transition-all active:scale-95 flex items-center justify-center gap-2"
        style={{ background: "#6d28d9", color: "#fff" }}
      >
        {copied ? "✓ Copied!" : "Copy"}
      </button>
    </div>
  );
}

function DarkGrammarCard({ result, onReplay }: { result: GrammarResult; onReplay: () => void }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(result.isCorrect ? result.original : result.corrected);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span
          className="text-sm font-bold"
          style={{ color: result.isCorrect ? "#4ade80" : "#f97316" }}
        >
          {result.isCorrect ? "✅ Correct!" : "❌ Not quite"}
        </span>
        <button onClick={onReplay} style={{ color: "rgba(139,92,246,0.8)", fontSize: 18 }}>🔊</button>
      </div>

      {result.original && (
        <p className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>
          You said: <span style={{ color: "rgba(255,255,255,0.6)" }}>{result.original}</span>
        </p>
      )}

      {!result.isCorrect && result.corrected && (
        <p className="text-base font-medium leading-relaxed" style={{ color: "rgba(255,255,255,0.9)" }}>
          {result.corrected}
        </p>
      )}

      <p className="text-xs italic" style={{ color: "rgba(255,255,255,0.4)" }}>{result.tip}</p>

      {!result.isCorrect && (
        <button
          onClick={handleCopy}
          className="w-full py-3 rounded-2xl font-semibold text-sm transition-all active:scale-95"
          style={{ background: "#6d28d9", color: "#fff" }}
        >
          {copied ? "✓ Copied!" : "Copy correction ↵"}
        </button>
      )}
    </div>
  );
}

function MicIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="22" />
      <line x1="8" y1="22" x2="16" y2="22" />
    </svg>
  );
}
