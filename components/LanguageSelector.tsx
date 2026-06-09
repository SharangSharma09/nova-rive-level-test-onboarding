"use client";

const LANGUAGES = ["Hindi", "Tamil", "Telugu", "Kannada", "Malayalam", "Bengali", "Marathi"];

interface Props {
  value: string;
  onChange: (lang: string) => void;
  dark?: boolean;
}

export default function LanguageSelector({ value, onChange, dark }: Props) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-medium whitespace-nowrap" style={{ color: dark ? "rgba(255,255,255,0.4)" : "#6b7280" }}>
        Your language:
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="text-xs px-3 py-1.5 rounded-full focus:outline-none"
        style={dark ? {
          background: "rgba(255,255,255,0.1)",
          color: "#fff",
          border: "1px solid rgba(255,255,255,0.12)",
        } : {
          background: "#fff",
          color: "#374151",
          border: "1px solid #e5e7eb",
        }}
      >
        {LANGUAGES.map((lang) => (
          <option key={lang} value={lang} style={{ background: dark ? "#1a1a2e" : "#fff" }}>
            {lang}
          </option>
        ))}
      </select>
    </div>
  );
}
