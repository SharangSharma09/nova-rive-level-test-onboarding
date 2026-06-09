"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import FeatureMenu from "./FeatureMenu";
import RecordingPanel from "./RecordingPanel";
import type { Feature } from "./RecordingPanel";

type WidgetState = "closed" | "menu" | Feature;

export default function FloatingWidget() {
  const [state, setState] = useState<WidgetState>("closed");
  const [pos, setPos] = useState({ x: 300, y: 200 });

  const dragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const dragMoved = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const clamp = useCallback((x: number, y: number) => {
    const btnSize = 64;
    const margin = 12;
    return {
      x: Math.max(margin, Math.min(window.innerWidth - btnSize - margin, x)),
      y: Math.max(margin, Math.min(window.innerHeight - btnSize - margin, y)),
    };
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    dragging.current = true;
    dragMoved.current = false;
    dragOffset.current = {
      x: e.clientX - pos.x,
      y: e.clientY - pos.y,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
  }, [pos]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    const dx = Math.abs(e.clientX - dragOffset.current.x - pos.x);
    const dy = Math.abs(e.clientY - dragOffset.current.y - pos.y);
    if (dx > 4 || dy > 4) dragMoved.current = true;
    setPos(clamp(e.clientX - dragOffset.current.x, e.clientY - dragOffset.current.y));
  }, [clamp, pos]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    dragging.current = false;
    if (!dragMoved.current) {
      // It was a tap, not a drag — toggle the menu
      setState((s) => s === "closed" ? "menu" : "closed");
    }
    e.preventDefault();
  }, []);

  // Set initial position after mount (SSR-safe) — between center and right, upper third
  useEffect(() => {
    setPos({ x: Math.round(window.innerWidth * 0.72), y: Math.round(window.innerHeight * 0.28) });
  }, []);

  const isFeatureActive = state !== "closed" && state !== "menu";
  const isOpen = state !== "closed";

  // Panel appears above or below depending on position in screen
  const panelAbove = typeof window !== "undefined" ? pos.y > window.innerHeight / 2 : true;

  return (
    <>
      {/* Click-outside backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-30"
          onClick={() => setState("closed")}
        />
      )}

      {/* Popup panel — absolutely positioned near Nova */}
      {(isFeatureActive || state === "menu") && (
        <div
          className="fixed z-40"
          onClick={(e) => e.stopPropagation()}
          style={{
            left: typeof window !== "undefined" ? Math.min(pos.x, window.innerWidth - 340) : pos.x,
            ...(panelAbove
              ? { bottom: typeof window !== "undefined" ? window.innerHeight - pos.y + 12 : 100 }
              : { top: pos.y + 76 }),
          }}
        >
          {isFeatureActive && (
            <RecordingPanel
              feature={state as Feature}
              onBack={() => setState("menu")}
            />
          )}
          {state === "menu" && (
            <FeatureMenu
              onSelect={(feature) => setState(feature)}
              onClose={() => setState("closed")}
            />
          )}
        </div>
      )}

      {/* Nova draggable button */}
      <div
        ref={containerRef}
        className="fixed z-50 w-16 h-16 touch-none select-none"
        style={{ left: pos.x, top: pos.y, cursor: dragging.current ? "grabbing" : "grab" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <div className="w-full h-full rounded-full shadow-xl shadow-purple-300/50 overflow-hidden border-2 border-white ring-2 ring-purple-400 hover:ring-purple-600 transition-shadow relative"
          style={{ background: "linear-gradient(135deg, #a855f7 0%, #7c3aed 40%, #6d28d9 100%)" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/nova.png"
            alt="Nova"
            className="absolute inset-0 w-full h-full object-cover object-top scale-125 translate-y-2"
          />
        </div>
      </div>
    </>
  );
}
