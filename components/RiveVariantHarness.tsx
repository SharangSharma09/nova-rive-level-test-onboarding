"use client";

import { useCallback, useEffect, useState } from "react";
import { StateMachineInputType, type Rive, type StateMachineInput } from "@rive-app/react-canvas";
import { LevelSentence } from "@/lib/level-test-content";
import NovaRiveLevelTest, {
  type AvatarVariant,
  type IntroVariant,
  type MinimizedShape,
} from "@/components/NovaRiveLevelTest";

// The control rail is deliberately light — it is developer chrome, and sharing
// the app's dark palette made it read as part of the product UI.
const PANEL = {
  bg: "#FFFFFF",
  border: "#E4E4E7",
  heading: "#18181B",
  label: "#27272A",
  note: "#71717A",
  selectedBg: "#18181B",
  selectedFg: "#FFFFFF",
  selectedCardBg: "#F4F4F5",
  trackOff: "#D4D4D8",
  knob: "#FFFFFF",
} as const;

// Blurbs for the control rail. Kept accurate to what each script actually does
// rather than to the design intent — V1 never takes voice, and V2/V3 differ in
// what they ask, not in whether they grade.
const INTRO_VARIANTS: { id: IntroVariant; label: string; blurb: string }[] = [
  {
    id: "v1",
    label: "V1 - Tap based inputs",
    blurb:
      "No voice anywhere in onboarding. Greets, then goes straight to the calibration questions.",
  },
  {
    id: "v2",
    label: "V2 - Scenario question + AI correction",
    blurb:
      "Speaks first. Replays the goal captured at login, then asks how they'd answer \u201cTell me about yourself\u201d and corrects the reply live - the aha moment.",
  },
  {
    id: "v3",
    label: "V3 - Need question",
    blurb:
      "Speaks first, open-ended: why English matters to them. Same live correction, plus it pulls their reason out of the answer and names it back.",
  },
];

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
  const [skipSignal, setSkipSignal] = useState<number | undefined>(undefined);
  // Default to V1 on load. Prototype control only — not a user-facing
  // feature, hence outside the mobile UI like the other toggles.
  const [introVariant, setIntroVariant] = useState<IntroVariant>("v2");
  // Silhouette the scale-down control collapses Nova into. Doesn't remount the
  // flow — it only changes shape, so no key change and no script restart.
  const [minimizedShape, setMinimizedShape] = useState<MinimizedShape>("circle");
  // Whether reading back through the thread shrinks Nova out of the way.
  const [minimizeOnScroll, setMinimizeOnScroll] = useState(true);

  const handleVariantChange = useCallback((variant: AvatarVariant) => {
    setAvatarVariant(variant);
    setRive(null);
    setSettingsOpen(false);
    // Drop any pending "Skip to Q6" — the remount below restarts the script at
    // message 1, and a stale signal would fire the skip again on the new
    // instance and strand it on the last question mid-restart.
    setSkipSignal(undefined);
  }, []);

  const handleIntroVariantChange = useCallback((variant: IntroVariant) => {
    setIntroVariant(variant);
    setSkipSignal(undefined); // same reason as above
  }, []);

  return (
    <>
      {/* Prototype control rail — fixed to the left of the viewport, well
          outside the 360x800 mobile UI so nothing here reads as product
          surface. Everything that used to sit along the top lives here. */}
      <aside
        className="fixed z-[100] flex flex-col gap-5 overflow-y-auto rounded-2xl border"
        style={{
          top: "16px",
          left: "16px",
          maxHeight: "calc(100dvh - 32px)",
          width: "244px",
          borderColor: PANEL.border,
          backgroundColor: PANEL.bg,
          padding: "16px",
        }}
      >
        {/* ── Intro variant ─────────────────────────────────────────────── */}
        <section className="flex flex-col gap-2">
          <PanelHeading>Intro variant</PanelHeading>
          <PanelNote>
            Only the onboarding differs. The level test and every screen after it
            is shared across all three.
          </PanelNote>
          <div className="flex flex-col gap-1.5">
            {INTRO_VARIANTS.map((v) => {
              const active = introVariant === v.id;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => handleIntroVariantChange(v.id)}
                  className="text-left rounded-xl border transition-colors"
                  style={{
                    borderColor: active ? PANEL.selectedBg : PANEL.border,
                    backgroundColor: active ? PANEL.selectedCardBg : "transparent",
                    padding: "8px 10px",
                  }}
                >
                  <div
                    className="text-xs font-semibold"
                    style={{ color: PANEL.heading }}
                  >
                    {v.label}
                  </div>
                  <div className="text-[11px] leading-snug mt-0.5" style={{ color: PANEL.note }}>
                    {v.blurb}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* ── Nova Avatar ───────────────────────────────────────────────── */}
        <section className="flex flex-col gap-2">
          <PanelHeading>Nova Avatar</PanelHeading>

          <Segmented
            value={avatarVariant}
            onChange={handleVariantChange}
            options={[
              { id: "nova", label: "New Nova" },
              { id: "realistic-female", label: "Spy Woman" },
            ]}
          />

          {avatarVariant === "realistic-female" && (
            <button
              type="button"
              onClick={() => setSettingsOpen((o) => !o)}
              className="rounded-full border text-xs font-medium transition-colors"
              style={{
                borderColor: PANEL.border,
                backgroundColor: "transparent",
                color: PANEL.label,
                padding: "6px 10px",
              }}
            >
              {settingsOpen ? "Hide" : "Show"} Rive options
            </button>
          )}

          <PanelLabel>Minimised shape</PanelLabel>
          <PanelNote>What the scale-down control collapses Nova into.</PanelNote>
          <Segmented
            value={minimizedShape}
            onChange={setMinimizedShape}
            options={[
              { id: "rect", label: "Rect" },
              { id: "circle", label: "Circle" },
            ]}
          />

          <div style={{ marginTop: "4px" }}>
            <ToggleSwitch
              label="Minimise on scroll"
              checked={minimizeOnScroll}
              onChange={setMinimizeOnScroll}
            />
            <PanelNote>Reading back through the chat shrinks Nova on its own.</PanelNote>
          </div>
        </section>

        {/* ── Debug ─────────────────────────────────────────────────────── */}
        <section className="flex flex-col gap-2">
          <PanelHeading>Debug</PanelHeading>
          <button
            type="button"
            onClick={() => setSkipSignal((n) => (n ?? 0) + 1)}
            className="rounded-full border text-xs font-medium transition-colors"
            style={{
              borderColor: PANEL.border,
              backgroundColor: "transparent",
              color: PANEL.label,
              padding: "6px 10px",
            }}
          >
            Skip to Q{sentences.length}
          </button>
        </section>
      </aside>

      <NovaRiveLevelTest
        // Remounting on either toggle restarts the script from message 1 and
        // lets it narrate straight away, so a variant switch always shows the
        // new avatar speaking from the top rather than mid-conversation.
        key={`${introVariant}-${avatarVariant}`}
        language={language}
        sentences={sentences}
        avatarVariant={avatarVariant}
        onAvatarRiveInstance={setRive}
        skipToLastQuestionSignal={skipSignal}
        introVariant={introVariant}
        minimizedShape={minimizedShape}
        minimizeOnScroll={minimizeOnScroll}
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

// ─── Control-rail primitives ──────────────────────────────────────────────────

function PanelHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className="text-[11px] font-semibold uppercase"
      style={{ color: PANEL.heading, letterSpacing: "0.08em" }}
    >
      {children}
    </h2>
  );
}

function PanelLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-xs font-medium" style={{ color: PANEL.label, marginTop: "4px" }}>
      {children}
    </div>
  );
}

function PanelNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] leading-snug" style={{ color: PANEL.note }}>
      {children}
    </p>
  );
}

function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
}) {
  return (
    <div
      className="flex rounded-full overflow-hidden border"
      style={{ borderColor: PANEL.border }}
    >
      {options.map((o) => {
        const active = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            className="flex-1 text-xs font-medium transition-colors"
            style={{
              backgroundColor: active ? PANEL.selectedBg : "transparent",
              color: active ? PANEL.selectedFg : PANEL.label,
              padding: "6px 8px",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function ToggleSwitch({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex items-center justify-between gap-3 w-full"
    >
      <span className="text-xs font-medium" style={{ color: PANEL.label }}>
        {label}
      </span>
      <span
        className="relative shrink-0 rounded-full transition-colors"
        style={{ width: "34px", height: "20px", backgroundColor: checked ? PANEL.selectedBg : PANEL.trackOff }}
      >
        <span
          className="absolute rounded-full transition-all"
          style={{
            width: "14px",
            height: "14px",
            top: "3px",
            left: checked ? "17px" : "3px",
            backgroundColor: PANEL.knob,
          }}
        />
      </span>
    </button>
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
