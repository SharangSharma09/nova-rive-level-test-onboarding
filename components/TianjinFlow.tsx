"use client";

import { useState, useRef, useEffect } from "react";
import TianjinDemo from "./TianjinDemo";

type Phase = "video" | "cta" | "demo";

export default function TianjinFlow() {
  const [phase, setPhase] = useState<Phase>("video");
  const [tapToPlay, setTapToPlay] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.play().catch(() => setTapToPlay(true));
  }, []);

  if (phase === "demo") return <TianjinDemo />;

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
        style={{
          display: "flex",
          flexDirection: "column",
          width: "min(430px, 100%)",
          height: "100%",
        }}
      >
        {/* Video — fills all space above the CTA */}
        <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
          <video
            ref={videoRef}
            src="/tianjin/intro.mp4"
            playsInline
            style={{
              width: "100%",
              height: "100%",
              objectFit: "contain",
            }}
            onEnded={() => setPhase("cta")}
            onError={() => setPhase("cta")}
          />

          {/* Tap-to-play overlay */}
          {tapToPlay && (
            <div
              onClick={() => {
                videoRef.current?.play();
                setTapToPlay(false);
              }}
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
              }}
            >
              <div
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: "50%",
                  background: "rgba(139,92,246,0.9)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 0 0 12px rgba(139,92,246,0.2)",
                }}
              >
                <svg width="28" height="28" viewBox="0 0 24 24" fill="white">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
              </div>
            </div>
          )}
        </div>

        {/* CTA — slides in below the video when it ends */}
        <div
          style={{
            height: phase === "cta" ? 110 : 0,
            overflow: "hidden",
            transition: "height 0.4s ease",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "0 40px",
          }}
        >
          <button
            onClick={() => setPhase("demo")}
            style={{
              width: "100%",
              background: "linear-gradient(135deg, #8B5CF6, #6D28D9)",
              color: "#fff",
              border: "none",
              borderRadius: 50,
              padding: "16px 0",
              fontSize: 18,
              fontWeight: 700,
              cursor: "pointer",
              boxShadow: "0 8px 32px rgba(109,40,217,0.45)",
              letterSpacing: "0.2px",
            }}
          >
            Try it now! →
          </button>
        </div>
      </div>
    </div>
  );
}
