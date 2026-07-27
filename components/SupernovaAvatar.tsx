"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  useRive,
  useViewModelInstanceNumber,
  Layout,
  Fit,
  Alignment,
} from "@rive-app/react-canvas";

// supernova.riv: artboard "Main", state machine "State Machine 1", ViewModel "MainVm"
// Viseme number input: "visemes"
const ARTBOARD = "Main";
const STATE_MACHINE = "State Machine 1";

const MIN_HOLD_MS = 110;
const GAIN = 3.0;
const SILENCE = 0.05;

const LEVEL_SHAPE = [0, 1, 2, 2];
const UP = [0.05, 0.34, 0.6];
const DOWN = [0.04, 0.2, 0.46];

function levelForAmp(amp: number, level: number): number {
  while (level < 3 && amp >= UP[level]!) level++;
  while (level > 0 && amp < DOWN[level - 1]!) level--;
  return level;
}

interface SupernovaAvatarProps {
  isListening: boolean;
  isThinking: boolean;
  isSpeaking: boolean;
  audioRef?: { current: HTMLAudioElement | null };
  lipSyncAnalyserRef?: { current: AnalyserNode | null };
  onSpeakEnd?: () => void;
}

export default function SupernovaAvatar({
  isSpeaking,
  audioRef,
  lipSyncAnalyserRef,
  onSpeakEnd,
}: SupernovaAvatarProps) {
  const layout = useMemo(
    () => new Layout({ fit: Fit.Contain, alignment: Alignment.Center }),
    [],
  );

  const { rive, RiveComponent } = useRive({
    src: "/supernova.riv",
    artboard: ARTBOARD,
    stateMachines: STATE_MACHINE,
    layout,
    autoplay: true,
    autoBind: true,
  });

  const vmi = rive?.viewModelInstance ?? null;
  const { setValue: setViseme } = useViewModelInstanceNumber("visemes", vmi);

  const setVisemeRef = useRef(setViseme);
  setVisemeRef.current = setViseme;

  const rafRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  // Resume AudioContext on user gesture (Safari)
  useEffect(() => {
    const resume = () => { audioCtxRef.current?.resume().catch(() => {}); };
    const events = ["pointerdown", "touchstart"] as const;
    events.forEach((e) => document.addEventListener(e, resume));
    return () => events.forEach((e) => document.removeEventListener(e, resume));
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      audioCtxRef.current?.close().catch(() => {});
      audioCtxRef.current = null;
    };
  }, []);

  const stopLipSync = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (analyserRef.current) {
      try { analyserRef.current.disconnect(); } catch { /* already disconnected */ }
      analyserRef.current = null;
    }
    setVisemeRef.current?.(0);
  }, []);

  // Lip sync RAF loop — drives "visemes" number input on the ViewModel
  useEffect(() => {
    if (!isSpeaking) {
      stopLipSync();
      return;
    }

    console.log("[SupernovaAvatar] isSpeaking=true", {
      hasExtAnalyser: !!lipSyncAnalyserRef?.current,
      hasAudioEl: !!audioRef?.current,
    });

    const runRaf = (analyser: AnalyserNode) => {
      const data = new Uint8Array(analyser.fftSize);
      let smoothedAmp = 0, targetViseme = 0, curLevel = 0, lastSwitch = 0;
      const tick = (now: number) => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const x = (data[i]! - 128) / 128;
          sum += x * x;
        }
        const target = Math.min(Math.sqrt(sum / data.length) * GAIN, 1);
        const k = target > smoothedAmp ? 0.5 : target < SILENCE ? 0.45 : 0.18;
        smoothedAmp += (target - smoothedAmp) * k;
        curLevel = levelForAmp(smoothedAmp, curLevel);
        const shape = LEVEL_SHAPE[curLevel]!;
        if (shape !== targetViseme && now - lastSwitch > MIN_HOLD_MS) {
          targetViseme = shape;
          lastSwitch = now;
          setVisemeRef.current?.(shape);
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    };

    // Path A: external AnalyserNode wired by parent (AudioBufferSource path — lip sync active)
    const extAnalyser = lipSyncAnalyserRef?.current;
    if (extAnalyser) {
      console.log("[SupernovaAvatar] → Path A (external analyser — lip sync active)");
      runRaf(extAnalyser);
      return () => {
        if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
        setVisemeRef.current?.(0);
      };
    }

    // Path B: HTMLMediaElement fallback
    console.log("[SupernovaAvatar] → Path B (HTMLMediaElement)");
    const el = audioRef?.current;
    if (!el) return;

    let ctx = audioCtxRef.current;
    if (!ctx || ctx.state === "closed") {
      ctx = new AudioContext();
      audioCtxRef.current = ctx;
    }
    if (ctx.state === "suspended") {
      void ctx.resume();
      return;
    }

    let source: MediaElementAudioSourceNode;
    try {
      source = ctx.createMediaElementSource(el);
    } catch (err) {
      console.error("[SupernovaAvatar] createMediaElementSource failed", err);
      return;
    }
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.6;
    analyserRef.current = analyser;
    source.connect(analyser);
    analyser.connect(ctx.destination);
    runRaf(analyser);

    return () => {
      if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
      try { source.disconnect(); } catch { /* ok */ }
      try { analyser.disconnect(); } catch { /* ok */ }
      analyserRef.current = null;
      setVisemeRef.current?.(0);
    };
  }, [isSpeaking, stopLipSync, lipSyncAnalyserRef]);

  // Stop lip sync when page is backgrounded (tab switch / app switch)
  useEffect(() => {
    const stopForBackground = () => {
      if (!analyserRef.current) return;
      stopLipSync();
      onSpeakEnd?.();
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") stopForBackground();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", stopForBackground);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", stopForBackground);
    };
  }, [stopLipSync, onSpeakEnd]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-white">
      <RiveComponent className="h-full w-full" />
    </div>
  );
}
