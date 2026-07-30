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
          position: "relative",
          width: "min(430px, 100%)",
          height: "100%",
          overflow: "hidden",
        }}
      >
        {/* Video */}
        <video
          ref={videoRef}
          src="/tianjin/intro.mp4"
          playsInline
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "contain",
            display: phase === "video" ? "block" : "none",
          }}
          onEnded={() => setPhase("cta")}
          onError={() => setPhase("cta")}
        />

        {/* Tap-to-play overlay (autoplay blocked) */}
        {phase === "video" && tapToPlay && (
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

        {/* CTA screen */}
        {phase === "cta" && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 32,
              padding: "0 40px",
            }}
          >
            {/* Logo/avatar placeholder */}
            <div style={{ textAlign: "center" }}>
              <div
                style={{
                  width: 80,
                  height: 80,
                  borderRadius: "50%",
                  background: "linear-gradient(135deg, #8B5CF6, #6D28D9)",
                  margin: "0 auto 20px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 0 0 12px rgba(109,40,217,0.15)",
                }}
              >
                <svg width="40" height="40" viewBox="0 0 24 24" fill="white">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round"/>
                </svg>
              </div>
              <div
                style={{
                  fontSize: 26,
                  fontWeight: 700,
                  color: "#fff",
                  letterSpacing: "-0.5px",
                  marginBottom: 10,
                }}
              >
                Superflow AI Widget
              </div>
              <div
                style={{
                  fontSize: 15,
                  color: "rgba(255,255,255,0.55)",
                  lineHeight: 1.5,
                }}
              >
                Hindi में doubt पूछें{"\n"}तुरंत English answer पाएं
              </div>
            </div>

            <button
              onClick={() => setPhase("demo")}
              style={{
                background: "linear-gradient(135deg, #8B5CF6, #6D28D9)",
                color: "#fff",
                border: "none",
                borderRadius: 50,
                padding: "16px 52px",
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
        )}
      </div>
    </div>
  );
}
