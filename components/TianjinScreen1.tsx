// Mobile app background for demo step 1 — white UI with gray placeholders
export default function TianjinScreen1() {
  return (
    <div style={{ width: "100%", height: "100%", background: "#fff", display: "flex", flexDirection: "column", overflow: "hidden", fontFamily: "Arial, Helvetica, sans-serif" }}>
      {/* Status bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 24px 0" }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#000" }}>9:30</span>
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M1 9l11 12L23 9H1z" /></svg>
          <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2L1 12h3v10h16V12h3L12 2z" /></svg>
          <div style={{ width: 24, height: 12, border: "1px solid #000", borderRadius: 3, position: "relative" }}>
            <div style={{ position: "absolute", top: 2, left: 2, height: 6, width: 12, background: "#000", borderRadius: 1 }} />
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ padding: "12px 20px 0" }}>
        <div style={{ height: 6, background: "#F2F2F7", borderRadius: 99, overflow: "hidden" }}>
          <div style={{ height: "100%", width: "20%", background: "#4ADE80", borderRadius: 99 }} />
        </div>
      </div>

      {/* Content placeholders */}
      <div style={{ flex: 1, padding: "24px 20px 0", display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ width: "100%", height: 72, background: "#F2F2F7", borderRadius: 24 }} />
        <div style={{ display: "flex", gap: 14 }}>
          <div style={{ flex: 2, height: 144, background: "#F2F2F7", borderRadius: 24 }} />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ width: 60, height: 60, background: "#F2F2F7", borderRadius: "50%" }} />
            <div style={{ width: 60, height: 60, background: "#F2F2F7", borderRadius: "50%" }} />
          </div>
        </div>
        <div style={{ width: "100%", height: 176, background: "#F2F2F7", borderRadius: 24 }} />
      </div>

      {/* Spacer for widget area */}
      <div style={{ height: 120 }} />

      {/* Bottom navigation */}
      <nav style={{ display: "flex", justifyContent: "space-around", alignItems: "center", padding: "0 16px 20px", borderTop: "1px solid #F2F2F7", height: 80 }}>
        {[
          <path key="phone" d="M6.62 10.79a15.053 15.053 0 006.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" />,
          <path key="mail" d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" />,
          <path key="music" d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />,
          <path key="chat" d="M21 15c0 1.1-.9 2-2 2H7l-4 4V5c0-1.1.9-2 2-2h14c1.1 0 2 .9 2 2v10z" />,
        ].map((svgPath, i) => (
          <div key={i} style={{ width: 48, height: 48, borderRadius: "50%", background: "#F2F2F7", display: "flex", alignItems: "center", justifyContent: "center", color: "#9CA3AF" }}>
            <svg width="24" height="24" fill="currentColor" viewBox="0 0 24 24">{svgPath}</svg>
          </div>
        ))}
      </nav>

      {/* iOS home indicator */}
      <div style={{ width: 128, height: 4, background: "#000", borderRadius: 99, opacity: 0.2, margin: "0 auto 6px" }} />
    </div>
  );
}
