"use client";

import { useState } from "react";

interface DraftResult {
  recommendation: string;
  casual: string;
  semiFormal: string;
  formal: string;
}

const TONES = [
  { key: "casual",     label: "Casual",     emoji: "😊" },
  { key: "semiFormal", label: "Semi-formal", emoji: "🤝" },
  { key: "formal",     label: "Formal",      emoji: "📋" },
] as const;

export default function ToneCards({ result, onClose }: { result: DraftResult; onClose?: () => void }) {
  const normaliseRec = (r: string) => r === "semi_formal" ? "semiFormal" : r;
  const [active, setActive] = useState<string>(normaliseRec(result.recommendation) || "semiFormal");
  const [copied, setCopied] = useState(false);

  const textFor = (key: string) => {
    if (key === "casual") return result.casual;
    if (key === "semiFormal") return result.semiFormal;
    return result.formal;
  };

  const handleCopy = async () => {
    const text = textFor(active);
    const ta = document.getElementById("main-textarea") as HTMLTextAreaElement | null;
    if (ta) {
      const start = ta.selectionStart ?? ta.value.length;
      const end = ta.selectionEnd ?? ta.value.length;
      ta.value = ta.value.substring(0, start) + text + ta.value.substring(end);
      ta.selectionStart = ta.selectionEnd = start + text.length;
      ta.focus();
    } else {
      await navigator.clipboard.writeText(text);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col h-full" style={{ color: "#fff" }}>
      {/* Tone tabs */}
      <div className="flex items-center gap-2 mb-4">
        {TONES.map(({ key, label, emoji }) => {
          const isActive = active === key;
          return (
            <button
              key={key}
              onClick={() => setActive(key)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
              style={{
                background: isActive ? "#6d28d9" : "rgba(255,255,255,0.08)",
                color: isActive ? "#fff" : "rgba(255,255,255,0.45)",
                border: isActive ? "none" : "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <span>{emoji}</span>
              <span>{label}</span>
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto mb-4">
        <p className="text-base leading-relaxed font-medium" style={{ color: "rgba(255,255,255,0.92)" }}>
          {textFor(active)}
        </p>
      </div>

      {/* Insert / Copy button */}
      <button
        onClick={handleCopy}
        className="w-full py-3 rounded-2xl font-semibold text-sm transition-all active:scale-95 flex items-center justify-center gap-2"
        style={{ background: "#6d28d9", color: "#fff" }}
      >
        {copied ? "✓ Inserted!" : <>Insert <span style={{ fontSize: "16px" }}>↵</span></>}
      </button>
    </div>
  );
}
