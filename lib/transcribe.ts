import { GoogleGenerativeAI } from "@google/generative-ai";
import { sttPrompt } from "@/app/api/superflow/prompts/stt";

export async function transcribeAudio(
  base64: string,
  mimeType: string,
  label: string,
  language?: string
): Promise<string> {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite" });

  const result = await model.generateContent([
    { inlineData: { mimeType, data: base64 } },
    sttPrompt(language),
  ]);

  const transcription = result.response.text().trim();
  console.log(`[${label}] STT transcription: "${transcription || "[empty — inaudible]"}"`);
  return transcription;
}
