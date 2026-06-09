"use client";

import type { Feature } from "./RecordingPanel";

const FEATURES: { key: Feature; emoji: string; label: string }[] = [
  { key: "draft",     emoji: "✏️", label: "Draft Message" },
  { key: "translate", emoji: "🌐", label: "Translate" },
  { key: "grammar",   emoji: "✅", label: "Check Grammar" },
  { key: "meaning",   emoji: "📖", label: "Find Meaning" },
];

interface Props {
  onSelect: (feature: Feature) => void;
  onClose: () => void;
}

export default function FeatureMenu({ onSelect }: Props) {
  return (
    <div
      className="w-60 rounded-3xl p-3 grid grid-cols-2 gap-2"
      style={{
        background: "rgba(18, 18, 24, 0.96)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        border: "1px solid rgba(255,255,255,0.08)",
        boxShadow: "0 24px 64px rgba(0,0,0,0.6), 0 0 0 1px rgba(109,40,217,0.2)",
        overflow: "hidden",
      }}
    >
      {FEATURES.map(({ key, emoji, label }) => (
        <button
          key={key}
          onClick={() => onSelect(key)}
          className="flex flex-col items-center justify-center gap-2 rounded-2xl py-4 px-2 transition-all active:scale-95"
          style={{
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.06)",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background = "rgba(109,40,217,0.3)";
            (e.currentTarget as HTMLElement).style.border = "1px solid rgba(124,58,237,0.4)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)";
            (e.currentTarget as HTMLElement).style.border = "1px solid rgba(255,255,255,0.06)";
          }}
        >
          <span className="text-2xl">{emoji}</span>
          <span className="text-xs font-medium text-center leading-tight" style={{ color: "rgba(255,255,255,0.85)" }}>
            {label}
          </span>
        </button>
      ))}
    </div>
  );
}
