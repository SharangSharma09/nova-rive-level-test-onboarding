"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useRive, Layout, Fit, Alignment } from "@rive-app/react-canvas";

// realistic-female.riv: artboard "Character", state machine "InLesson".
// Unlike supernova.riv (ViewModel-driven single "visemes" number), this rig has
// no ViewModels — the mouth is driven by classic StateMachineInputs named after
// viseme ids ("100".."118"), each a 0-100 blend weight, exactly one of which
// should be at 100 at a time. "is_speaking" is a separate boolean that drives
// body/idle state only; on its own it does NOT move the mouth, so lip sync has
// to write the viseme weights directly.
const ARTBOARD = "Character";
const STATE_MACHINE = "InLesson";

const SPEAKING_INPUT = "is_speaking";
// The rig ships with glasses off; this character is meant to wear them, so it
// gets switched on once the file loads (the Rive options checkbox reads the
// same input, so it shows checked to match).
const GLASSES_INPUT = "glasses";

// Every viseme weight the rig exposes (106/111/117 don't exist on this file).
// The whole set gets zeroed on each change so blends never stack.
const VISEME_INPUTS = [
  "100", "101", "102", "103", "104", "105", "107", "108",
  "109", "110", "112", "113", "114", "115", "116", "118",
];

const NEUTRAL_VISEME = "100";
const VISEME_ON = 100;

// Closed → mid → open, measured off the real file: with every weight zeroed as
// the baseline, "100" barely deviates (it IS the closed mouth) while "116" is
// the widest, teeth-apart shape. "112" sits between the two.
const LEVEL_VISEME = [NEUTRAL_VISEME, "112", "116"];

// Same amplitude→shape response as SupernovaAvatar, so both avatars read as the
// same character speaking at the same pace.
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

interface RealisticFemaleAvatarProps {
  isListening: boolean;
  isThinking: boolean;
  isSpeaking: boolean;
  audioRef?: { current: HTMLAudioElement | null };
  lipSyncAnalyserRef?: { current: AnalyserNode | null };
  onSpeakEnd?: () => void;
  onRiveInstance?: (rive: ReturnType<typeof useRive>["rive"]) => void;
}

export default function RealisticFemaleAvatar({
  isSpeaking,
  audioRef,
  lipSyncAnalyserRef,
  onRiveInstance,
}: RealisticFemaleAvatarProps) {
  const layout = useMemo(
    () => new Layout({ fit: Fit.Contain, alignment: Alignment.Center }),
    [],
  );

  const { rive, RiveComponent } = useRive({
    src: "/realistic-female.riv",
    artboard: ARTBOARD,
    stateMachines: STATE_MACHINE,
    layout,
    autoplay: true,
    // This file has no ViewModels (viewModelCount 0) — inputs are driven via
    // classic StateMachineInput, so auto-binding would just log a warning.
    autoBind: false,
  });

  const rafRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  useEffect(() => {
    onRiveInstance?.(rive ?? null);
  }, [rive, onRiveInstance]);

  // Writes one viseme at full weight and clears the rest. Held in a ref so the
  // RAF loop below never has to re-subscribe when the rive instance settles.
  const setVisemeRef = useRef<((name: string) => void) | null>(null);
  useEffect(() => {
    if (!rive) {
      setVisemeRef.current = null;
      return;
    }
    const inputs = rive.stateMachineInputs(STATE_MACHINE) ?? [];
    const byName = new Map(inputs.map((i) => [i.name, i]));
    setVisemeRef.current = (name: string) => {
      for (const v of VISEME_INPUTS) {
        const input = byName.get(v);
        if (input) input.value = v === name ? VISEME_ON : 0;
      }
    };
    setVisemeRef.current(NEUTRAL_VISEME);

    const glasses = byName.get(GLASSES_INPUT);
    if (glasses) glasses.value = true;
  }, [rive]);

  useEffect(() => {
    if (!rive) return;
    const inputs = rive.stateMachineInputs(STATE_MACHINE) ?? [];
    const speakingInput = inputs.find((i) => i.name === SPEAKING_INPUT);
    if (speakingInput) speakingInput.value = isSpeaking;
  }, [rive, isSpeaking]);

  const stopLipSync = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setVisemeRef.current?.(NEUTRAL_VISEME);
    if (analyserRef.current) {
      try { analyserRef.current.disconnect(); } catch { /* already disconnected */ }
      analyserRef.current = null;
    }
  }, []);

  useEffect(() => stopLipSync, [stopLipSync]);

  // Lip sync RAF loop — mirrors SupernovaAvatar's, but writes named viseme
  // weights instead of a single ViewModel number.
  useEffect(() => {
    if (!isSpeaking) {
      stopLipSync();
      return;
    }

    console.log("[RealisticFemaleAvatar] isSpeaking=true", {
      hasExtAnalyser: !!lipSyncAnalyserRef?.current,
      hasAudioEl: !!audioRef?.current,
    });

    const runRaf = (analyser: AnalyserNode) => {
      const data = new Uint8Array(analyser.fftSize);
      let smoothedAmp = 0, curLevel = 0, lastSwitch = 0;
      let targetViseme = NEUTRAL_VISEME;
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
        const shape = LEVEL_VISEME[LEVEL_SHAPE[curLevel]!]!;
        if (shape !== targetViseme && now - lastSwitch > MIN_HOLD_MS) {
          targetViseme = shape;
          lastSwitch = now;
          setVisemeRef.current?.(shape);
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    };

    // Path A: external AnalyserNode wired by the parent (AudioBufferSource path)
    const extAnalyser = lipSyncAnalyserRef?.current;
    if (extAnalyser) {
      console.log("[RealisticFemaleAvatar] → Path A (external analyser — lip sync active)");
      runRaf(extAnalyser);
      return () => {
        if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
        setVisemeRef.current?.(NEUTRAL_VISEME);
      };
    }

    // Path B: HTMLMediaElement fallback
    console.log("[RealisticFemaleAvatar] → Path B (HTMLMediaElement)");
    const el = audioRef?.current;
    if (!el) {
      console.warn("[RealisticFemaleAvatar] no audio element yet — lip sync skipped");
      return;
    }

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
      // Already wired to another node (only one source per element is allowed)
      console.error("[RealisticFemaleAvatar] createMediaElementSource failed", err);
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
      setVisemeRef.current?.(NEUTRAL_VISEME);
    };
  }, [isSpeaking, stopLipSync, lipSyncAnalyserRef, audioRef]);

  return (
    <div className="relative h-full w-full overflow-hidden">
      <RiveComponent className="h-full w-full" />
    </div>
  );
}
