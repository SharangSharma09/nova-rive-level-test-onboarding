import FloatingWidgetV5 from "@/components/FloatingWidgetV5";

export default function V5TamilWhatsappPage() {
  return (
    <main
      className="relative overflow-hidden"
      style={{ width: "100vw", height: "100dvh", background: "#e5ddd5" }}
    >
      {/* Mock WhatsApp chat background */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/mock-whatsapp.png"
        alt="WhatsApp chat"
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
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.3)" }} />

      {/* Nova widget floats on top */}
      <FloatingWidgetV5 lang="Tamil" apiEndpoint="/api/superflow/v5-tamil" />
    </main>
  );
}
