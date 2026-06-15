import Link from "next/link";
import { FaWhatsapp, FaInstagram, FaTelegram, FaLinkedinIn } from "react-icons/fa";
import { SiGmail, SiX } from "react-icons/si";

const APP_ICONS = [
  { bg: "#25D366",    icon: FaWhatsapp,    title: "WhatsApp" },
  { bg: "linear-gradient(45deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)", icon: FaInstagram, title: "Instagram" },
  { bg: "#26A5E4",    icon: FaTelegram,    title: "Telegram" },
  { bg: "#EA4335",    icon: SiGmail,       title: "Gmail" },
  { bg: "#0A66C2",    icon: FaLinkedinIn,  title: "LinkedIn" },
  { bg: "#111",       icon: SiX,           title: "X" },
] as const;

const CHECK_ITEMS = [
  "Tamil-ல பேசி, English Message பெறுங்க",
  "Word meanings, grammar — Any doubt கேளுங்க",
  "எல்லா app மேலயும் float ஆகும்",
];

export default function V5TamilOnboardingPage() {
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

        {/* App icons row */}
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
      </div>

      {/* Middle content — headline + checklist */}
      <div className="flex-1 w-full px-6 pt-6 flex flex-col gap-5">
        <h1 className="font-bold leading-tight" style={{ color: "#fff", fontSize: 30 }}>
          100+ apps-ல instant<br />English help பெறுங்க
        </h1>

        <div className="flex flex-col gap-3">
          {CHECK_ITEMS.map((item) => (
            <div key={item} className="flex items-start gap-3">
              <div
                className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center mt-0.5"
                style={{ background: "rgba(74,222,128,0.2)" }}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <p className="text-sm leading-snug" style={{ color: "rgba(255,255,255,0.85)" }}>{item}</p>
            </div>
          ))}
        </div>
      </div>

      {/* CTA pinned to bottom */}
      <div className="w-full px-6 pb-10 pt-4">
        <Link
          href="/v5-tamil-onboarding-video"
          className="w-full py-4 rounded-2xl font-bold text-base text-center transition-all active:scale-95 block"
          style={{ background: "#4ade80", color: "#0e0e14" }}
        >
          Know more
        </Link>
      </div>
    </main>
    </div>
  );
}
