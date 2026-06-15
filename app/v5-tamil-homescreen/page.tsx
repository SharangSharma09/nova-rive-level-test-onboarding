import FloatingWidgetV5 from "@/components/FloatingWidgetV5";

export default function V5TamilHomescreenPage() {
  return (
    <main
      className="relative overflow-hidden"
      style={{ width: "100vw", height: "100dvh", background: "#000" }}
    >
      {/* Mock home screen background */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/mock-homescreen.png"
        alt="Home screen"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition: "center top",
        }}
      />
      {/* Dim overlay */}
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.7)" }} />

      {/* Nova widget floats on top */}
      <FloatingWidgetV5 lang="Tamil" apiEndpoint="/api/superflow/v5-tamil" />
    </main>
  );
}
