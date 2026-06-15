"use client";

import { useRef, useState } from "react";
import Link from "next/link";

export default function V5TamilOnboardingVideoPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(true);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { v.play(); setPlaying(true); }
    else { v.pause(); setPlaying(false); }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0e0e14" }}>
    <main
      className="flex flex-col"
      style={{ background: "#0e0e14", maxWidth: 430, margin: "0 auto", height: "100dvh", overflow: "hidden" }}
    >
      {/* Video */}
      <div className="relative flex-1 min-h-0" onClick={togglePlay}>
        <video
          ref={videoRef}
          src="https://sn-main.b-cdn.net/system-uploads/scenario-data/58cbfc27-8978-43c3-b11f-2223abab3fad-final-copy.mp4"
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          autoPlay
          playsInline
          loop
        />

        {/* Pause indicator */}
        {!playing && (
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{ background: "rgba(0,0,0,0.3)" }}
          >
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center"
              style={{ background: "rgba(255,255,255,0.2)" }}
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="white">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
            </div>
          </div>
        )}
      </div>

      {/* CTA */}
      <div className="w-full px-6 py-8">
        <Link
          href="/v5-tamil"
          className="w-full py-4 rounded-2xl font-bold text-base text-center transition-all active:scale-95 block"
          style={{ background: "#6d28d9", color: "#fff" }}
        >
          Try it now →
        </Link>
      </div>
    </main>
    </div>
  );
}
