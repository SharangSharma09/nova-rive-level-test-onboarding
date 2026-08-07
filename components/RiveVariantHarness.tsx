"use client";

import { useCallback, useEffect, useState } from "react";
import { StateMachineInputType, type Rive, type StateMachineInput } from "@rive-app/react-canvas";
import { LevelSentence } from "@/lib/level-test-content";
import NovaRiveLevelTest, { type AvatarVariant } from "@/components/NovaRiveLevelTest";

// Must match RealisticFemaleAvatar.tsx's ARTBOARD/STATE_MACHINE constants.
const REALISTIC_FEMALE_STATE_MACHINE = "InLesson";

interface RiveVariantHarnessProps {
  language: "tamil" | "hindi";
  sentences: LevelSentence[];
}

export default function RiveVariantHarness({ language, sentences }: RiveVariantHarnessProps) {
  const [avatarVariant, setAvatarVariant] = useState<AvatarVariant>("nova");
  const [rive, setRive] = useState<Rive | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const handleVariantChange = useCallback((variant: AvatarVariant) => {
    setAvatarVariant(variant);
    setRive(null);
    setSettingsOpen(false);
  }, []);

  return (
    <>
      {/* Avatar picker — fixed to the viewport, deliberately outside the
          360x800 mobile UI box so it always renders on the surrounding page. */}
      <div
        className="fixed z-[100] flex items-center gap-3"
        style={{ top: "16px", left: "50%", transform: "translateX(-50%)" }}
      >
        <div className="flex rounded-full overflow-hidden border" style={{ borderColor: "#2B3044", backgroundColor: "#12151E" }}>
          {(["nova", "realistic-female"] as const).map((variant) => (
            <button
              key={variant}
              type="button"
              onClick={() => handleVariantChange(variant)}
              className="px-4 py-2 text-sm font-medium transition-colors"
              style={{
                backgroundColor: avatarVariant === variant ? "#75EABE" : "transparent",
                color: avatarVariant === variant ? "#12151E" : "#8C94AE",
              }}
            >
              {variant === "nova" ? "Nova" : "Realistic Female"}
            </button>
          ))}
        </div>

        {avatarVariant === "realistic-female" && (
          <button
            type="button"
            onClick={() => setSettingsOpen((o) => !o)}
            className="px-3 py-2 rounded-full border text-sm font-medium transition-colors"
            style={{ borderColor: "#2B3044", backgroundColor: "#12151E", color: "#8C94AE" }}
          >
            ⚙️ Rive options
          </button>
        )}
      </div>

      <NovaRiveLevelTest
        language={language}
        sentences={sentences}
        avatarVariant={avatarVariant}
        onAvatarRiveInstance={setRive}
      />

      {settingsOpen && avatarVariant === "realistic-female" && (
        <RiveOptionsPanel
          rive={rive}
          stateMachineName={REALISTIC_FEMALE_STATE_MACHINE}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </>
  );
}

// ─── Settings panel: auto-lists every input on the active state machine ───────

function RiveOptionsPanel({
  rive,
  stateMachineName,
  onClose,
}: {
  rive: Rive | null;
  stateMachineName: string;
  onClose: () => void;
}) {
  const [inputs, setInputs] = useState<StateMachineInput[]>([]);

  useEffect(() => {
    if (!rive) {
      setInputs([]);
      return;
    }
    try {
      setInputs(rive.stateMachineInputs(stateMachineName) ?? []);
    } catch {
      setInputs([]);
    }
  }, [rive, stateMachineName]);

  return (
    <div
      className="fixed top-0 right-0 h-full overflow-y-auto z-[100]"
      style={{
        width: "320px",
        maxWidth: "90vw",
        backgroundColor: "#161A27",
        borderLeft: "1px solid #2B3044",
        padding: "20px 16px",
      }}
    >
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold" style={{ color: "#f4f4f5" }}>
          Rive options — {stateMachineName}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="text-lg leading-none"
          style={{ color: "#8C94AE" }}
          aria-label="Close Rive options"
        >
          ×
        </button>
      </div>

      {!rive && <p className="text-xs" style={{ color: "#8C94AE" }}>Loading avatar…</p>}
      {rive && inputs.length === 0 && (
        <p className="text-xs" style={{ color: "#8C94AE" }}>No inputs found on this state machine.</p>
      )}

      <div className="flex flex-col gap-4">
        {inputs.map((input) => (
          <RiveInputControl key={input.name} input={input} />
        ))}
      </div>
    </div>
  );
}

function RiveInputControl({ input }: { input: StateMachineInput }) {
  const [, forceRender] = useState(0);

  if (input.type === StateMachineInputType.Boolean) {
    return (
      <label className="flex items-center justify-between text-xs" style={{ color: "#f4f4f5" }}>
        <span>{input.name}</span>
        <input
          type="checkbox"
          checked={Boolean(input.value)}
          onChange={(e) => {
            input.value = e.target.checked;
            forceRender((n) => n + 1);
          }}
        />
      </label>
    );
  }

  if (input.type === StateMachineInputType.Trigger) {
    return (
      <button
        type="button"
        onClick={() => {
          input.fire();
          forceRender((n) => n + 1);
        }}
        className="text-xs text-left px-2 py-1.5 rounded transition-colors"
        style={{ backgroundColor: "#1A1E2D", color: "#f4f4f5" }}
      >
        Fire: {input.name}
      </button>
    );
  }

  // Number input — ranges are best-effort, inferred from the file's own
  // animation names (e.g. "eyes-hue-360", "eyes-saturation-100", "head_-100").
  const [min, max, step] = numberRangeFor(input.name);
  return (
    <label className="flex flex-col gap-1 text-xs" style={{ color: "#f4f4f5" }}>
      <span className="flex items-center justify-between">
        <span>{input.name}</span>
        <span style={{ color: "#8C94AE" }}>{Number(input.value).toFixed(2)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={Number(input.value)}
        onChange={(e) => {
          input.value = Number(e.target.value);
          forceRender((n) => n + 1);
        }}
      />
    </label>
  );
}

function numberRangeFor(name: string): [number, number, number] {
  if (name === "eyes-hue") return [0, 360, 1];
  if (name === "eyes-saturation" || name === "eyes-brightness") return [0, 100, 1];
  if (/^\d+$/.test(name)) return [0, 1, 0.01]; // viseme blend weights (100-118)
  return [-100, 100, 1]; // scale/skin/distance-style sliders
}
