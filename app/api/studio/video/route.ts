// Serves the assembled final video to the studio <video> element, with HTTP Range support
// so the browser can seek/scrub without downloading the whole file. Dev-only.

import { createReadStream, existsSync, statSync } from 'node:fs';
import { Readable } from 'node:stream';
import path from 'node:path';

export const dynamic = 'force-dynamic';

// Resolve which project's final.mp4 to serve. Default = the live superflow working set;
// otherwise .context/projects/<name>/final.mp4 (name sanitized to block path traversal).
function resolveVideo(project: string | null): string | null {
  const root = process.cwd();
  if (!project || project === 'superflow-demo') {
    return path.join(root, '.context/recordings/superflow-demo-final.mp4');
  }
  if (!/^[a-zA-Z0-9._-]+$/.test(project)) return null;
  return path.join(root, '.context/projects', project, 'final.mp4');
}

export async function GET(req: Request) {
  if (process.env.NODE_ENV !== 'development') return new Response('dev only', { status: 405 });

  const VIDEO = resolveVideo(new URL(req.url).searchParams.get('project'));
  if (!VIDEO || !existsSync(VIDEO)) return new Response('not assembled yet', { status: 404 });

  const size = statSync(VIDEO).size;
  const range = req.headers.get('range');

  if (range) {
    const m = /bytes=(\d+)-(\d*)/.exec(range);
    const start = m ? parseInt(m[1], 10) : 0;
    const end = m && m[2] ? parseInt(m[2], 10) : size - 1;
    const stream = createReadStream(VIDEO, { start, end });
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

  return new Response(Readable.toWeb(createReadStream(VIDEO)) as ReadableStream, {
    status: 200,
    headers: {
      'Content-Length': String(size),
      'Content-Type': 'video/mp4',
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store',
    },
  });
}
