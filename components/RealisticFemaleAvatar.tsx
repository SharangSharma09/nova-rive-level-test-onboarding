"use client";

import { useEffect, useMemo } from "react";
import { useRive, Layout, Fit, Alignment } from "@rive-app/react-canvas";

// realistic-female.riv: artboard "Character", state machine "InLesson".
// Unlike supernova.riv (ViewModel-driven single "visemes" number), this rig
// exposes a boolean "is_speaking" input — the state machine itself owns the
// talking-cycle animation blend once that's flipped true.
const ARTBOARD = "Character";
const STATE_MACHINE = "InLesson";

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

  useEffect(() => {
    onRiveInstance?.(rive ?? null);
  }, [rive, onRiveInstance]);

  useEffect(() => {
    if (!rive) return;
    const inputs = rive.stateMachineInputs(STATE_MACHINE) ?? [];
    const speakingInput = inputs.find((i) => i.name === "is_speaking");
    if (speakingInput) speakingInput.value = isSpeaking;
  }, [rive, isSpeaking]);

  return (
    <div className="relative h-full w-full overflow-hidden">
      <RiveComponent className="h-full w-full" />
    </div>
  );
}
