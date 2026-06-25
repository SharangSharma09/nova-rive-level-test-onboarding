// Returns the active project's cues + scenes for the studio's script panel + timeline.
//   superflow-demo → the live config in video-generation-flow/config/
//   <name>         → .context/projects/<name>/cues.json + scenes.json

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

export const dynamic = 'force-dynamic';

function load(project: string | null) {
  const root = process.cwd();
  const pack = (cues: any, scenes: any) => ({
    cues: cues.ttsCues ?? [],
    clickCues: cues.clickCues ?? [],
    scenes: scenes.scenes ?? [],
    totalMs: cues.totalDurationMs ?? scenes.totalDurationMs ?? 50000,
  });

  if (!project || project === 'superflow-demo') {
    return pack(
      JSON.parse(readFileSync(path.join(root, 'video-generation-flow/config/tts-cues.json'), 'utf8')),
      JSON.parse(readFileSync(path.join(root, 'video-generation-flow/config/scenes.json'), 'utf8')),
    );
  }
  if (!/^[a-zA-Z0-9._-]+$/.test(project)) return null;
  const dir = path.join(root, '.context/projects', project);
  if (!existsSync(path.join(dir, 'cues.json'))) return pack({}, {}); // empty project — no cues yet
  const cues = JSON.parse(readFileSync(path.join(dir, 'cues.json'), 'utf8'));
  const scenes = existsSync(path.join(dir, 'scenes.json'))
    ? JSON.parse(readFileSync(path.join(dir, 'scenes.json'), 'utf8')) : { scenes: [] };
  return pack(cues, scenes);
}

export async function GET(req: Request) {
  const cfg = load(new URL(req.url).searchParams.get('project'));
  if (!cfg) return new Response('no config', { status: 404 });
  return Response.json(cfg);
}
