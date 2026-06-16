"use client";

import { useRef, useState } from "react";
import Link from "next/link";
// Apps row hidden per design — uncomment these imports to restore the app-icons row.
// import { FaWhatsapp, FaInstagram, FaTelegram, FaLinkedinIn } from "react-icons/fa";
// import { SiGmail, SiX } from "react-icons/si";
import type { OnboardingScreen } from "@/lib/onboardingCopy";

// Apps row hidden per design — uncomment to restore.
// const APP_ICONS = [
//   { bg: "#25D366",    icon: FaWhatsapp,    title: "WhatsApp" },
//   { bg: "linear-gradient(45deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)", icon: FaInstagram, title: "Instagram" },
//   { bg: "#26A5E4",    icon: FaTelegram,    title: "Telegram" },
//   { bg: "#EA4335",    icon: SiGmail,       title: "Gmail" },
//   { bg: "#0A66C2",    icon: FaLinkedinIn,  title: "LinkedIn" },
//   { bg: "#111",       icon: SiX,           title: "X" },
// ] as const;

type Props = {
  screens: OnboardingScreen[];
  videoUrl: string;
  videoCta: string;
  redirectTo: string;
};

export default function NovaOnboarding({ screens, videoUrl, videoCta, redirectTo }: Props) {
  const [step, setStep] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(true);

  const isVideo = step >= screens.length;

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { v.play(); setPlaying(true); }
    else { v.pause(); setPlaying(false); }
  };

  if (isVideo) {
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
              src={videoUrl}
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

          {/* Final CTA → matching widget */}
          <div className="w-full px-6 py-8">
            <Link
              href={redirectTo}
              className="w-full py-4 rounded-2xl font-bold text-base text-center transition-all active:scale-95 block"
              style={{ background: "#6d28d9", color: "#fff" }}
            >
              {videoCta} →
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const screen = screens[step];

  return (
    <div style={{ minHeight: "100vh", background: "#0e0e14" }}>
      <main
        className="min-h-screen flex flex-col items-center p-0"
        style={{ background: "#0e0e14", maxWidth: 430, margin: "0 auto" }}
      >
        {/* Hero section */}
        <div className="w-full relative flex flex-col items-center pt-20 pb-8">
          {/* Purple glow */}
          <div
            className="absolute top-4 left-1/2 -translate-x-1/2 pointer-events-none"
            style={{
              width: 260,
              height: 260,
              borderRadius: "50%",
              background: "radial-gradient(circle, rgba(109,40,217,0.5) 0%, transparent 70%)",
            }}
          />

          {/* Nova avatar */}
          <div className="relative z-10">
            <div
              className="rounded-full overflow-hidden border-4 border-purple-500"
              style={{
                width: 140,
                height: 140,
                background: "linear-gradient(135deg,#a855f7,#6d28d9)",
                boxShadow: "0 0 48px rgba(109,40,217,0.6)",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/nova.png"
                alt="Nova"
                className="w-full h-full object-cover object-top scale-125 translate-y-2"
              />
            </div>

            {/* Sound wave badge */}
            <div
              className="absolute -right-2 top-8 flex items-center gap-0.5 px-2 py-1 rounded-full"
              style={{ background: "rgba(109,40,217,0.95)", boxShadow: "0 4px 12px rgba(109,40,217,0.5)" }}
            >
              {[3, 6, 4, 7, 3].map((h, i) => (
                <div key={i} className="rounded-full" style={{ width: 3, height: h * 2, background: "#fff" }} />
              ))}
            </div>
          </div>

          {/* Apps row hidden per design — uncomment to restore. */}
          {/*
          <div className="flex items-center gap-3 mt-8 px-4 z-10 justify-center">
            {APP_ICONS.map(({ bg, icon: Icon, title }) => (
              <div
                key={title}
                className="rounded-2xl flex items-center justify-center shadow-lg flex-shrink-0"
                style={{ width: 48, height: 48, background: bg }}
                title={title}
              >
                <Icon size={26} color="#fff" />
              </div>
            ))}
          </div>
          */}
        </div>

        {/* Middle content — single left-aligned title */}
        <div className="flex-1 w-full px-6 pt-6">
          <h1 className="font-bold text-left leading-snug" style={{ color: "#fff", fontSize: 26 }}>
            {screen.text}
          </h1>
        </div>

        {/* CTA pinned to bottom */}
        <div className="w-full px-6 pb-10 pt-4">
          <button
            type="button"
            onClick={() => setStep((s) => s + 1)}
            className="w-full py-4 rounded-2xl font-bold text-base text-center transition-all active:scale-95 block"
            style={{ background: "#4ade80", color: "#0e0e14" }}
          >
            {screen.cta}
          </button>
        </div>
      </main>
    </div>
  );
}
