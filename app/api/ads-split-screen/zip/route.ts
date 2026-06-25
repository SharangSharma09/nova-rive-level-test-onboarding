import { readFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { devOnly } from '../../studio/_lib';

export const dynamic = 'force-dynamic';

// Streams a zip of all final MP4s for a run (the "Download all" button). Reads the clean
// auto-gen-split/ folder that make-split-ad writes, and zips it flat with the system `zip` CLI.
export function GET(req: Request) {
  const guard = devOnly();
  if (guard) return guard;

  const run = new URL(req.url).searchParams.get('run');
  if (!run || !/^[A-Za-z0-9_]+$/.test(run)) return new Response('bad run id', { status: 400 });

  const runDir = path.resolve('.context/projects/_runs', run);
  const folder = path.join(runDir, 'auto-gen-split');
  if (!existsSync(folder)) return new Response('no outputs for this run yet', { status: 404 });
  const files = readdirSync(folder).filter(f => f.endsWith('.mp4'));
  if (files.length === 0) return new Response('no videos to zip', { status: 404 });

  const zipPath = path.join(runDir, `ads-${run}.zip`);
  try { rmSync(zipPath, { force: true }); } catch { /* ignore */ }
  // -j junk paths (flat archive), -q quiet
  const r = spawnSync('zip', ['-j', '-q', zipPath, ...files.map(f => path.join(folder, f))], { encoding: 'utf8' });
  if (r.status !== 0 || !existsSync(zipPath)) {
    return new Response(`zip failed: ${(r.stderr || r.error?.message || 'unknown').slice(0, 300)}`, { status: 500 });
  }

  const buf = readFileSync(zipPath);
  return new Response(buf, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="ads-${run}.zip"`,
      'Content-Length': String(buf.length),
    },
  });
}
