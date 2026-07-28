"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import FloatingWidgetV5 from "./FloatingWidgetV5";
import TianjinScreen1 from "./TianjinScreen1";

const STEPS = [
  { background: "screen1" as const, tts: "/tts/tianjin/hi-0.mp3" },
  { background: "/tianjin/screen-2.svg", tts: "/tts/tianjin/hi-1.mp3" },
  { background: "/tianjin/screen-3.svg", tts: "/tts/tianjin/hi-2.mp3" },
  { background: "/tianjin/screen-4.svg", tts: "/tts/tianjin/hi-3.mp3" },
  { background: "/tianjin/screen-5.svg", tts: "/tts/tianjin/hi-4.mp3" },
];

export default function TianjinDemo() {
  const [step, setStep] = useState(0);
  const currentAudio = useRef<HTMLAudioElement | null>(null);
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

  // Play pre-generated static MP3 — no API call needed
  const playStep = useCallback((idx: number) => {
    if (currentAudio.current) {
      currentAudio.current.pause();
      currentAudio.current = null;
    }
    const audio = new Audio(STEPS[idx].tts);
    currentAudio.current = audio;
    audio.play().catch((e) => console.warn("[tianjin-demo] autoplay blocked", e));
  }, []);

  useEffect(() => {
    playStep(step);
  }, [step, playStep]);

  useEffect(() => {
    return () => { if (currentAudio.current) currentAudio.current.pause(); };
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
          menuAudio="/tts/tianjin/hi-menu.mp3"
          resultAudio="/tts/tianjin/hi-4.mp3"
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
