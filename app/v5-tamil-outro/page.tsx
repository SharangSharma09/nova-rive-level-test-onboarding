export default function V5TamilOutroPage() {
  return (
    <>
    <style>{`
      @keyframes hand-tap {
        0%   { transform: translate(50px, 60px) scale(1.1); opacity: 0; }
        15%  { transform: translate(50px, 60px) scale(1.1); opacity: 1; }
        45%  { transform: translate(0px, 0px)   scale(1.1); opacity: 1; }
        58%  { transform: translate(0px, 6px)   scale(0.95); opacity: 1; }
        68%  { transform: translate(0px, 0px)   scale(1.1); opacity: 1; }
        85%  { transform: translate(50px, 60px) scale(1.1); opacity: 0.6; }
        100% { transform: translate(50px, 60px) scale(1.1); opacity: 0; }
      }
      .hand-emoji {
        position: absolute;
        font-size: 38px;
        pointer-events: none;
        animation: hand-tap 2.8s ease-in-out infinite;
        filter: drop-shadow(0 4px 8px rgba(0,0,0,0.5));
        z-index: 10;
      }
    `}</style>
    <main
      style={{
        width: 390,
        height: 844,
        background: "#0e0e14",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 0,
        fontFamily: "'Tamil Sangam MN', 'Noto Sans Tamil', sans-serif",
        overflow: "hidden",
      }}
    >
      {/* Purple glow behind Nova */}
      <div
        style={{
          position: "absolute",
          width: 280,
          height: 280,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(109,40,217,0.55) 0%, transparent 70%)",
          top: 180,
          left: "50%",
          transform: "translateX(-50%)",
        }}
      />

      {/* Nova avatar */}
      <div style={{ position: "relative", zIndex: 1, marginBottom: 36 }}>
        <div
          style={{
            width: 160,
            height: 160,
            borderRadius: "50%",
            overflow: "hidden",
            border: "3px solid rgba(168,85,247,0.8)",
            boxShadow: "0 0 40px rgba(109,40,217,0.6)",
            background: "linear-gradient(135deg,#a855f7,#6d28d9)",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/nova.png"
            alt="Nova"
            style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center top", transform: "scale(1.2) translateY(8px)" }}
          />
        </div>
      </div>

      {/* Text block */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          textAlign: "center",
          padding: "0 32px",
          marginBottom: 32,
        }}
      >
        <p style={{ color: "#fff", fontSize: 24, fontWeight: 700, lineHeight: 1.45, margin: 0 }}>
          Nova ஒவ்வொரு நாளும் உங்க<br />
          English better ஆகுறதுக்கு<br />
          help பண்ணும்.
        </p>
      </div>

      {/* CTA button */}
      <div style={{ position: "relative", zIndex: 1 }}>
        <a
          href="/v5-tamil"
          style={{
            display: "block",
            background: "#6d28d9",
            color: "#fff",
            fontSize: 18,
            fontWeight: 700,
            padding: "16px 40px",
            borderRadius: 16,
            textDecoration: "none",
            letterSpacing: 0.3,
          }}
        >
          இப்பவே try பண்ணுங்க →
        </a>
        {/* Animated hand tap */}
        <span className="hand-emoji" style={{ bottom: -10, right: -10 }}>👆</span>
      </div>
    </main>
    </>
  );
}
