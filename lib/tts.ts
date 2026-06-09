const cache = new Map<string, string>();
const pending = new Map<string, Promise<string>>();

let currentAudio: HTMLAudioElement | null = null;
let currentPlayPromise: Promise<void> | null = null;
let speakGeneration = 0;

async function fetchBlobUrl(text: string): Promise<string> {
  const inflight = pending.get(text);
  if (inflight) return inflight;

  const promise = (async () => {
    console.log("[tts] sending to Cartesia:", `"${text.slice(0, 60)}"`);
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) {
      const detail = await res.text();
      console.error("[tts] request failed", res.status, detail.slice(0, 100));
      throw new Error(`TTS failed: ${res.status}`);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    cache.set(text, url);
    console.log("[tts] ✓ cached:", `"${text.slice(0, 40)}"`);
    return url;
  })().finally(() => {
    pending.delete(text);
  });

  pending.set(text, promise);
  return promise;
}

export async function speak(text: string): Promise<void> {
  if (typeof window === "undefined") return;

  const gen = ++speakGeneration;

  currentAudio?.pause();
  currentAudio = null;
  currentPlayPromise = null;

  let url: string;
  try {
    url = cache.get(text) ?? await fetchBlobUrl(text);
  } catch (e) {
    console.error("[tts] could not get audio", e);
    return;
  }

  if (gen !== speakGeneration) {
    console.log("[tts] cancelled (superseded):", text.slice(0, 40));
    return;
  }

  return new Promise((resolve) => {
    const audio = new Audio(url);
    currentAudio = audio;

    console.log("[tts] ▶ playing:", `"${text.slice(0, 60)}"`);
    audio.onended = () => { currentPlayPromise = null; resolve(); };
    audio.onerror = (e) => {
      console.error("[tts] playback error", e);
      currentPlayPromise = null;
      resolve();
    };

    currentPlayPromise = audio.play().catch((e) => {
      if ((e as DOMException).name !== "AbortError") {
        console.error("[tts] play() rejected", e);
      }
      currentPlayPromise = null;
      resolve();
    });
  });
}

export async function stopSpeaking() {
  speakGeneration++;
  if (currentPlayPromise) {
    await currentPlayPromise.catch(() => {});
    currentPlayPromise = null;
  }
  currentAudio?.pause();
  currentAudio = null;
}
