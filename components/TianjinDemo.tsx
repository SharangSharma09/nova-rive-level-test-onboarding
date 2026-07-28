"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import FloatingWidgetV5 from "./FloatingWidgetV5";
import TianjinScreen1 from "./TianjinScreen1";

const STEPS = [
  {
    background: "screen1" as const,
    tts: "यह देखो Supernova का AI widget! Tap करो और English help पाओ।",
  },
  {
    background: "/tianjin/screen-2.svg",
    tts: "दो options हैं — doubt पूछो, या English में message बनाओ।",
  },
  {
    background: "/tianjin/screen-3.svg",
    tts: "बोलिए: Classic का क्या meaning है?",
  },
  {
    background: "/tianjin/screen-4.svg",
    tts: "Superflow समझ रहा है... बस 7 seconds में जवाब आएगा!",
  },
  {
    background: "/tianjin/screen-5.svg",
    tts: "Amazing, isn't it? आपका English doubt solve हो गया!",
  },
];

export default function TianjinDemo() {
  const [step, setStep] = useState(0);
  const audioBlobUrls = useRef<Map<number, string>>(new Map());
  const currentAudio = useRef<HTMLAudioElement | null>(null);
  const loadingRef = useRef<Set<number>>(new Set());
  const phoneRef = useRef<HTMLDivElement>(null);
  const [containerDims, setContainerDims] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    const el = phoneRef.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setContainerDims({ w: Math.round(width), h: Math.round(height) });
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const playStep = useCallback(async (idx: number) => {
    if (currentAudio.current) {
      currentAudio.current.pause();
      currentAudio.current = null;
    }

    let url = audioBlobUrls.current.get(idx);
    if (!url) {
      if (loadingRef.current.has(idx)) return;
      loadingRef.current.add(idx);
      try {
        console.log("[tianjin-demo] fetching TTS for step", idx);
        const res = await fetch("/api/tts-demo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: STEPS[idx].tts }),
        });
        if (!res.ok) {
          console.error("[tianjin-demo] TTS error", res.status);
          return;
        }
        const blob = await res.blob();
        url = URL.createObjectURL(blob);
        audioBlobUrls.current.set(idx, url);
        console.log("[tianjin-demo] TTS ready for step", idx);
      } catch (e) {
        console.error("[tianjin-demo] TTS fetch failed", e);
        return;
      } finally {
        loadingRef.current.delete(idx);
      }
    }

    const audio = new Audio(url);
    currentAudio.current = audio;
    audio.play().catch((e) =>
      console.warn("[tianjin-demo] autoplay blocked", e)
    );
  }, []);

  useEffect(() => {
    playStep(step);
  }, [step, playStep]);

  // Preload next step TTS
  useEffect(() => {
    const next = (step + 1) % STEPS.length;
    if (audioBlobUrls.current.has(next) || loadingRef.current.has(next)) return;
    const t = setTimeout(async () => {
      if (audioBlobUrls.current.has(next)) return;
      loadingRef.current.add(next);
      try {
        const res = await fetch("/api/tts-demo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: STEPS[next].tts }),
        });
        if (!res.ok) return;
        const blob = await res.blob();
        audioBlobUrls.current.set(next, URL.createObjectURL(blob));
        console.log("[tianjin-demo] preloaded TTS for step", next);
      } catch {
        // silent
      } finally {
        loadingRef.current.delete(next);
      }
    }, 1500);
    return () => clearTimeout(t);
  }, [step]);

  useEffect(() => {
    return () => {
      if (currentAudio.current) currentAudio.current.pause();
      audioBlobUrls.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  const advance = useCallback(() => {
    setStep((s) => (s + 1) % STEPS.length);
  }, []);

  const bg = STEPS[step].background;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#0e0e14",
        display: "flex",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      <div
        ref={phoneRef}
        style={{
          position: "relative",
          width: "min(430px, 100%)",
          height: "100%",
          flexShrink: 0,
          overflow: "hidden",
          transform: "translateZ(0)",
        }}
      >
        {/* Background: HTML component for step 1, SVG image for steps 2-5 */}
        {bg === "screen1" ? (
          <div
            onClick={advance}
            style={{ position: "absolute", inset: 0, cursor: "pointer" }}
          >
            <TianjinScreen1 />
          </div>
        ) : (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={bg}
            alt=""
            onClick={advance}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              objectPosition: "center",
              cursor: "pointer",
              userSelect: "none",
            }}
            draggable={false}
          />
        )}

        {/* FloatingWidgetV5 with coach mark on step 1 */}
        <FloatingWidgetV5
          lang="Hindi"
          apiEndpoint="/api/superflow/v5-hindi"
          viewportWidth={containerDims?.w ?? 430}
          viewportHeight={containerDims?.h}
          showCoachMark={step === 0}
          recordingPrompt={'Boliye: "Classic" ka kya meaning hai?'}
          resultPrompt={"Amazing, isnt?\nYour English doubt solved!"}
        />

        {/* Step indicator dots */}
        <div
          style={{
            position: "fixed",
            bottom: 24,
            left: "50%",
            transform: "translateX(-50%)",
            display: "flex",
            gap: 6,
            zIndex: 20,
            pointerEvents: "none",
          }}
        >
          {STEPS.map((_, i) => (
            <div
              key={i}
              style={{
                width: i === step ? 20 : 6,
                height: 6,
                borderRadius: 3,
                background: i === step ? "#8652FF" : "rgba(255,255,255,0.25)",
                transition: "width 0.25s ease, background 0.25s ease",
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
