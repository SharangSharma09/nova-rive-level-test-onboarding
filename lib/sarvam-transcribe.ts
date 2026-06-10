// Requires SARVAM_API_KEY in .env.local
export async function transcribeWithSarvam(
  audioBlob: Blob,
  label: string
): Promise<string> {
  const formData = new FormData();
  // Strip codec variant from MIME type to avoid Sarvam rejecting "audio/webm;codecs=opus"
  const cleanBlob = new Blob([await audioBlob.arrayBuffer()], { type: "audio/webm" });
  formData.append("file", cleanBlob, "audio.webm");
  formData.append("language_code", "unknown");

  const res = await fetch("https://api.sarvam.ai/speech-to-text", {
    method: "POST",
    headers: { "api-subscription-key": process.env.SARVAM_API_KEY! },
    body: formData,
  });

  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    console.error(`[${label}] Sarvam STT error ${res.status}:`, err);
    return "";
  }

  const json = await res.json();
  const transcription = (json.transcript || "").trim();
  console.log(`[${label}] Sarvam STT transcription: "${transcription || "[empty — inaudible]"}"`);
  return transcription;
}
