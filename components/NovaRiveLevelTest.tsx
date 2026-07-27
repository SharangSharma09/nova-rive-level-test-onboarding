"use client";

import { useEffect, useLayoutEffect, useRef, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { Volume2, Square } from "lucide-react";
import { LevelSentence } from "@/lib/level-test-content";
import { useMicRecorder } from "@/lib/voice/use-mic-recorder";

const SupernovaAvatar = dynamic(
  () => import("@/components/SupernovaAvatar"),
  {
    ssr: false,
    loading: () => (
      <div className="w-full bg-white" style={{ height: "35dvh" }} />
    ),
  },
);

// ─── Types ────────────────────────────────────────────────────────────────────

interface Msg {
  id: string;
  role: "ai" | "user";
  text: string;
}

type Phase = "idle" | "recording" | "transcribing" | "evaluating" | "playing";

interface Props {
  language: "tamil" | "hindi";
  sentences: LevelSentence[];
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function MicIcon() {
  return (
    <svg className="w-6 h-6 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M19 10v1a7 7 0 0 1-14 0v-1M12 19v4M8 23h8" />
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
      <div className="flex items-center gap-3 px-4 py-3 bg-zinc-950">
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
    <div className="flex flex-col items-center gap-2 pt-4 bg-zinc-950">
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
        {isProcessing ? "Processing…" : isPlaying ? "AI speaking…" : "Tap to speak"}
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

// ─── Main Component ────────────────────────────────────────────────────────────

export default function NovaRiveLevelTest({ language, sentences }: Props) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const messagesRef = useRef<Msg[]>([]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [playingMsgId, setPlayingMsgId] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const [score, setScore] = useState(0);
  const [results, setResults] = useState<boolean[]>([]);
  const [isDone, setIsDone] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const lipSyncAnalyserRef = useRef<AnalyserNode | null>(null);
  const cancelledRef = useRef(false);
  const currentIndexRef = useRef(0);
  const attemptsRef = useRef(0);
  const scoreRef = useRef(0);

  const { start: startMic, stop: stopMic, blob: audioBlob, isRecording, analyser, resetBlob } = useMicRecorder();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, phase]);

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
      return;
    }

    currentIndexRef.current = nextIndex;
    attemptsRef.current = 0;
    setCurrentIndex(nextIndex);
    setAttempts(0);

    const next = sentences[nextIndex]!;
    const promptText = `Next sentence. ${next.sentence} — translate that to English.`;
    const msgId = `ai-q-${nextIndex}`;
    const msg: Msg = { id: msgId, role: "ai", text: promptText };
    messagesRef.current = [...messagesRef.current, msg];
    setMessages([...messagesRef.current]);

    void playTts(msgId, promptText);
  }, [sentences, playTts]);

  // ── Evaluate user translation ──────────────────────────────────────────────────

  const evaluateTranslation = useCallback(async (userText: string) => {
    setPhase("evaluating");
    const current = sentences[currentIndexRef.current]!;

    console.log("[evaluate] calling /api/nova-level-test/evaluate");
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
      const data = (await res.json()) as { correct: boolean; feedback: string; hint: string };
      console.log("[evaluate] result:", data);

      const feedbackId = `ai-fb-${Date.now()}`;

      if (data.correct) {
        const feedbackMsg: Msg = { id: feedbackId, role: "ai", text: data.feedback };
        messagesRef.current = [...messagesRef.current, feedbackMsg];
        setMessages([...messagesRef.current]);
        void playTts(feedbackId, data.feedback, () => advanceSentence(true));
      } else {
        const thisAttempt = attemptsRef.current;
        if (thisAttempt < 1) {
          // Give hint, allow retry
          attemptsRef.current += 1;
          setAttempts(attemptsRef.current);
          const hintText = data.hint || "Try again!";
          const hintMsg: Msg = { id: feedbackId, role: "ai", text: hintText };
          messagesRef.current = [...messagesRef.current, hintMsg];
          setMessages([...messagesRef.current]);
          void playTts(feedbackId, hintText);
        } else {
          // Show correct answer and move on
          const answerText = `The correct translation is: ${current.expectedTranslation}`;
          const answerMsg: Msg = { id: feedbackId, role: "ai", text: answerText };
          messagesRef.current = [...messagesRef.current, answerMsg];
          setMessages([...messagesRef.current]);
          void playTts(feedbackId, answerText, () => advanceSentence(false));
        }
      }
    } catch (err) {
      console.error("[evaluate] failed", err);
      setPhase("idle");
    }
  }, [sentences, language, playTts, advanceSentence]);

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

  // ── Auto-play first sentence on mount ────────────────────────────────────────

  useEffect(() => {
    const first = sentences[0];
    if (!first) return;
    const introText = `Let's begin. Translate this sentence to English: ${first.sentence}`;
    const msgId = "ai-q-0";
    const msg: Msg = { id: msgId, role: "ai", text: introText };
    messagesRef.current = [msg];
    setMessages([msg]);
    void playTts(msgId, introText);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  if (isDone) {
    return (
      <ResultsScreen
        score={score}
        sentences={sentences}
        results={results}
      />
    );
  }

  const langLabel = language === "tamil" ? "Tamil" : "Hindi";
  const current = sentences[currentIndex];

  return (
    <div className="min-h-dvh bg-black">
      <div className="flex flex-col h-dvh max-w-xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-950 shrink-0">
          <span className="text-sm font-medium text-zinc-200">{langLabel} Level Test</span>
          <span className="text-xs text-zinc-500">{currentIndex + 1}/{sentences.length}</span>
        </div>

        {/* Rive avatar */}
        <div className="w-full bg-white shrink-0" style={{ height: "35dvh" }}>
          <SupernovaAvatar
            isListening={phase === "recording"}
            isThinking={phase === "transcribing" || phase === "evaluating"}
            isSpeaking={phase === "playing"}
            audioRef={audioRef}
            lipSyncAnalyserRef={lipSyncAnalyserRef}
            onSpeakEnd={stopTts}
          />
        </div>

        {/* Concept label + sentence */}
        {current && (
          <div className="shrink-0 px-4 py-3 bg-zinc-900 border-b border-zinc-800">
            <div className="text-xs text-zinc-500 mb-0.5">{current.concept}</div>
            <div className="text-lg font-medium text-white">{current.sentence}</div>
            <div className="text-xs text-zinc-500 mt-1">Translate to English</div>
          </div>
        )}

        {/* Chat thread */}
        <div className="flex-1 overflow-y-auto overscroll-y-none min-h-0 px-4 py-4 space-y-3">
          {messages.map((msg) => {
            const isUser = msg.role === "user";
            const isThisPlaying = playingMsgId === msg.id;

            return (
              <div key={msg.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                <div className={`flex flex-col gap-1 max-w-[80%] ${isUser ? "items-end" : "items-start"}`}>
                  <div
                    className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-line ${
                      isUser
                        ? "bg-green-500 text-black rounded-br-sm"
                        : "bg-zinc-800 border border-zinc-700 text-zinc-100 rounded-bl-sm"
                    }`}
                  >
                    {msg.text}
                  </div>

                  {!isUser && (
                    isThisPlaying ? (
                      <button
                        onClick={stopTts}
                        className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 transition-colors"
                      >
                        <Square size={13} className="fill-current" />
                        Stop
                      </button>
                    ) : (
                      <button
                        onClick={() => void playTts(msg.id, msg.text)}
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
              <div className="rounded-2xl rounded-bl-sm bg-zinc-800 border border-zinc-700 px-4 py-2.5">
                <TypingDots />
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Bottom bar */}
        <div
          className="shrink-0 bg-zinc-950 pb-4"
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
                <button
                  onClick={phase === "idle" ? handleTapStart : undefined}
                  disabled={phase !== "idle"}
                  aria-label="Start recording"
                  className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-200 ${
                    phase !== "idle"
                      ? "bg-green-500 opacity-40 cursor-not-allowed"
                      : "bg-green-500 hover:bg-green-400 cursor-pointer active:scale-95"
                  }`}
                >
                  {phase === "transcribing" || phase === "evaluating" ? (
                    <span className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <MicIcon />
                  )}
                </button>
                <p className="text-xs text-zinc-400">
                  {phase === "transcribing" || phase === "evaluating"
                    ? "Processing…"
                    : phase === "playing"
                    ? "AI speaking…"
                    : "Tap to speak"}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
