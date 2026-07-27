"use client";
import { useState, useRef, useCallback, useEffect } from "react";

type RecorderState = "idle" | "recording" | "error";

export interface UseMicRecorderReturn {
  start: () => Promise<void>;
  stop: () => void;
  blob: Blob | null;
  isRecording: boolean;
  mimeType: string;
  analyser: AnalyserNode | null;
  error: string | null;
  resetBlob: () => void;
}

const PREFERRED_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];

function getSupportedMimeType(): string {
  if (typeof window === "undefined" || typeof MediaRecorder === "undefined") return "";
  for (const type of PREFERRED_TYPES) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return "";
}

export function useMicRecorder(): UseMicRecorderReturn {
  const [state, setState] = useState<RecorderState>("idle");
  const [blob, setBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [mimeType] = useState<string>(() => getSupportedMimeType());
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const maxDurationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mimeTypeRef = useRef<string>(mimeType);

  const cleanup = useCallback(() => {
    if (maxDurationTimerRef.current) {
      clearTimeout(maxDurationTimerRef.current);
      maxDurationTimerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    audioCtxRef.current?.close();
    audioCtxRef.current = null;
    recorderRef.current = null;
    setAnalyser(null);
  }, []);

  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  const start = useCallback(async () => {
    if (state === "recording") return;
    setError(null);
    setBlob(null);
    chunksRef.current = [];

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Microphone access denied";
      setError(msg);
      setState("error");
      return;
    }

    streamRef.current = stream;

    const ctx = new AudioContext();
    audioCtxRef.current = ctx;
    const source = ctx.createMediaStreamSource(stream);
    const an = ctx.createAnalyser();
    an.fftSize = 256;
    source.connect(an);
    setAnalyser(an);

    const mt = mimeTypeRef.current;
    const recorder = new MediaRecorder(stream, mt ? { mimeType: mt } : undefined);
    recorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = () => {
      const type = mimeTypeRef.current || "audio/webm";
      const result = new Blob(chunksRef.current, { type });
      setBlob(result);
      setState("idle");
      cleanup();
    };

    recorder.start(100);
    setState("recording");

    // Auto-stop after 90s to prevent runaway recordings
    maxDurationTimerRef.current = setTimeout(() => {
      if (recorder.state === "recording") {
        console.warn("[mic-recorder] 90s cap reached — auto-stopping");
        recorder.stop();
      }
    }, 90_000);
  }, [state, cleanup]);

  const stop = useCallback(() => {
    if (maxDurationTimerRef.current) {
      clearTimeout(maxDurationTimerRef.current);
      maxDurationTimerRef.current = null;
    }
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    recorder.stop();
  }, []);

  const resetBlob = useCallback(() => setBlob(null), []);

  return {
    start,
    stop,
    blob,
    isRecording: state === "recording",
    mimeType,
    analyser,
    error,
    resetBlob,
  };
}
