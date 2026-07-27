import { transcribeWithSarvam } from "@/lib/sarvam-transcribe";

export async function POST(request: Request) {
  console.log("[level-test/transcribe] POST received");

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (e) {
    console.error("[level-test/transcribe] ✗ failed to parse FormData", e);
    return Response.json({ error: "Bad request" }, { status: 400 });
  }

  const audioFile = formData.get("audio");
  if (!audioFile || !(audioFile instanceof Blob)) {
    console.error("[level-test/transcribe] ✗ no audio field in FormData");
    return Response.json({ error: "Missing audio" }, { status: 400 });
  }

  const text = await transcribeWithSarvam(audioFile, "level-test");
  console.log("[level-test/transcribe] ✓ result:", `"${text || "[empty]"}"`);

  return Response.json({ text });
}
