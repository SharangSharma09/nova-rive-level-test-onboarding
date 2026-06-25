import { existsSync, statSync, createReadStream, readdirSync } from 'node:fs';
import { Readable } from 'node:stream';
import path from 'node:path';

export const dynamic = 'force-dynamic';

function resolveVideoPath(runId: string, lang: string, layoutId: string): string | null {
  if (!runId || !/^[a-zA-Z0-9_-]+$/.test(runId)) return null;
  if (!lang || !/^[a-z]+$/.test(lang)) return null;
  if (!layoutId || !/^[a-zA-Z0-9]+$/.test(layoutId)) return null;

  const layoutsDir = path.join('.context/projects/_runs', runId, lang, 'layouts');
  if (!existsSync(layoutsDir)) return null;

  // find the layout directory that starts with the layoutId (e.g. "01" → "01-horizontal-split")
  const dirs = readdirSync(layoutsDir);
  const found = dirs.find(d => d.startsWith(layoutId));
  if (!found) return null;

  return path.join(layoutsDir, found, 'final.mp4');
}

export async function GET(req: Request) {
  if (process.env.NODE_ENV !== 'development') return new Response('dev only', { status: 405 });

  const url = new URL(req.url);
  const runId = url.searchParams.get('run') ?? '';
  const lang = url.searchParams.get('lang') ?? '';
  const layoutId = url.searchParams.get('layout') ?? '';

  const videoPath = resolveVideoPath(runId, lang, layoutId);
  if (!videoPath || !existsSync(videoPath)) return new Response('not found', { status: 404 });

  const size = statSync(videoPath).size;
  const range = req.headers.get('range');

  if (range) {
    const m = /bytes=(\d+)-(\d*)/.exec(range);
    const start = m ? parseInt(m[1], 10) : 0;
    const end = m && m[2] ? parseInt(m[2], 10) : size - 1;
    const stream = createReadStream(videoPath, { start, end });
    return new Response(Readable.toWeb(stream) as ReadableStream, {
      status: 206,
      headers: {
        'Content-Range': `bytes ${start}-${end}/${size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': String(end - start + 1),
        'Content-Type': 'video/mp4',
        'Cache-Control': 'no-store',
      },
    });
  }

  return new Response(Readable.toWeb(createReadStream(videoPath)) as ReadableStream, {
    status: 200,
    headers: {
      'Content-Length': String(size),
      'Content-Type': 'video/mp4',
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store',
    },
  });
}
