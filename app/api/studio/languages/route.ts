// Lists the translation languages available in the rule library.
import { readFileSync } from 'node:fs';
import path from 'node:path';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const langs = JSON.parse(
      readFileSync(path.resolve('video-generation-flow/translation/languages.json'), 'utf8'),
    ).languages as { id: string; name: string }[];
    return Response.json({ languages: langs.map(l => ({ id: l.id, name: l.name })) });
  } catch {
    return Response.json({ languages: [] });
  }
}
