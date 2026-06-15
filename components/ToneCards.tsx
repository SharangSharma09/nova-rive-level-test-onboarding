"use client";

import { useState, useEffect, useRef } from "react";

interface DraftResult {
  recommendation: string;
  casual: string;
  semiFormal: string;
  formal: string;
}

const RedirectArrow = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="7" y1="17" x2="17" y2="7" />
    <polyline points="7 7 17 7 17 17" />
  </svg>
);

const TONES = [
  { key: "casual",     label: "Casual",     emoji: "😊" },
  { key: "semiFormal", label: "Semi formal", emoji: "🙂" },
  { key: "formal",     label: "Formal",      emoji: "😎" },
] as const;

export default function ToneCards({ result, onClose, onActiveChange }: { result: DraftResult; onClose?: () => void; onActiveChange?: (text: string) => void }) {
  const normaliseRec = (r: string) => {
    if (r === "casual_text" || r === "casual") return "casual";
    if (r === "semi_formal_text" || r === "semi_formal" || r === "semiFormal") return "semiFormal";
    if (r === "formal_text" || r === "formal") return "formal";
    return "semiFormal";
  };
  const [active, setActive] = useState<string>(normaliseRec(result.recommendation) || "semiFormal");
  const [copied, setCopied] = useState(false);
  const [insertState, setInsertState] = useState<"idle" | "opening" | "done">("idle");
  const [showFade, setShowFade] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    onActiveChange?.(textFor(normaliseRec(result.recommendation) || "semiFormal"));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    setShowFade(el.scrollHeight > el.clientHeight);
    el.scrollTop = 0;
  }, [active]);

  const textFor = (key: string) => {
    if (key === "casual") return result.casual;
    if (key === "semiFormal") return result.semiFormal;
    return result.formal;
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(textFor(active));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleEditInApp = () => {
    if (insertState !== "idle") return;
    setInsertState("opening");
    setTimeout(() => setInsertState("idle"), 700);
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
              onClick={() => { setActive(key); onActiveChange?.(textFor(key)); }}
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
      <div className="relative mb-4">
        <div
          ref={scrollRef}
          className="overflow-y-auto"
          style={{ maxHeight: "40vh" }}
          onScroll={(e) => {
            const el = e.currentTarget;
            const atBottom = el.scrollHeight - el.scrollTop <= el.clientHeight + 4;
            setShowFade(!atBottom);
          }}
        >
          <p className="text-base leading-relaxed font-medium break-words" style={{ color: "rgba(255,255,255,0.92)" }}>
            {textFor(active)}
          </p>
        </div>
        {/* Bottom fade hint — only when content overflows */}
        {showFade && (
          <div
            className="pointer-events-none absolute bottom-0 left-0 right-0 transition-opacity duration-300"
            style={{ height: 48, background: "linear-gradient(to bottom, transparent, rgba(14,14,20,0.97))" }}
          />
        )}
      </div>

      {/* Buttons */}
      <div className="flex gap-2">
        <button
          onClick={handleCopy}
          className="flex-1 py-3 rounded-2xl font-semibold text-sm transition-all active:scale-95"
          style={{ background: "#6d28d9", color: "#fff" }}
        >
          {copied ? "✓ Copied!" : "Copy"}
        </button>
        <button
          onClick={handleEditInApp}
          className="flex-1 py-3 rounded-2xl font-semibold text-sm transition-all active:scale-95 flex items-center justify-center gap-1.5"
          style={{ background: "rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.85)" }}
        >
          {insertState === "opening" ? "Opening app..." : <><span>Edit in app</span><RedirectArrow /></>}
        </button>
      </div>
    </div>
  );
}
