// Translate English → an Indian language using the stored colloquial rules.
// POST { language: <id>, text: <english> } → { translation }
import { readFileSync } from 'node:fs';
import path from 'node:path';

export const dynamic = 'force-dynamic';

const TDIR = path.resolve('video-generation-flow/translation');
const MODEL = process.env.TRANSLATE_MODEL || 'gemini-2.5-flash';

function buildPrompt(langId: string, text: string): string {
  const langs = JSON.parse(readFileSync(path.join(TDIR, 'languages.json'), 'utf8')).languages as { id: string; name: string; rules: string }[];
  const lang = langs.find(l => l.id === langId.toLowerCase());
  if (!lang) throw new Error(`unknown language "${langId}"`);
  const template = readFileSync(path.join(TDIR, 'template.md'), 'utf8');
  const rules = readFileSync(path.join(TDIR, lang.rules), 'utf8');
  return template
    .replace('{{SYSTEM_TRANSLATION_RULES_LONGFORM_V1}}', rules)
    .replace('{{target_language}}', lang.name)
    .replace('{{text_to_translate}}', text);
}

export async function POST(req: Request) {
  let body: { language?: string; text?: string };
  try { body = await req.json(); } catch { return Response.json({ error: 'bad json' }, { status: 400 }); }
  const { language, text } = body;
  if (!language || !text?.trim()) return Response.json({ error: 'language and text required' }, { status: 400 });

  const key = process.env.GEMINI_API_KEY;
  if (!key) return Response.json({ error: 'GEMINI_API_KEY not set' }, { status: 500 });

  let prompt: string;
  try { prompt = buildPrompt(language, text); } catch (e: any) { return Response.json({ error: e.message }, { status: 400 }); }

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.3 } }) },
    );
    if (!res.ok) return Response.json({ error: `gemini ${res.status}` }, { status: 502 });
    const json = await res.json();
    const translation = (json.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim();
    return Response.json({ translation });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 502 });
  }
}
