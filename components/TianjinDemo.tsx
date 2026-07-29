"use client";

import { useRef, useEffect, useState } from "react";
import FloatingWidgetV5 from "./FloatingWidgetV5";
import TianjinScreen1 from "./TianjinScreen1";

export default function TianjinDemo() {
  const phoneRef = useRef<HTMLDivElement>(null);
  const [containerDims, setContainerDims] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    const audio = new Audio("/tts/tianjin/hi-0.mp3");
    audio.play().catch(() => {});
    return () => audio.pause();
  }, []);

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
        {/* Static background */}
        <div style={{ position: "absolute", inset: 0 }}>
          <TianjinScreen1 />
        </div>

        <FloatingWidgetV5
          lang="Hindi"
          apiEndpoint="/api/superflow/v5-hindi"
          viewportWidth={containerDims?.w ?? 430}
          viewportHeight={containerDims?.h}
          showCoachMark
          recordingPrompt={'Boliye: "Classic" ka kya meaning hai?'}
          resultPrompt={"Amazing, isnt?\nYour English doubt solved!"}
          menuAudio="/tts/tianjin/hi-menu.mp3"
          resultAudio="/tts/tianjin/hi-4.mp3"
        />
      </div>
    </div>
  );
}
