import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { devOnly } from '../../studio/_lib';

export const dynamic = 'force-dynamic';

export function GET(req: Request) {
  const guard = devOnly();
  if (guard) return guard;

  const runId = new URL(req.url).searchParams.get('run');
  if (!runId || !/^[a-zA-Z0-9_-]+$/.test(runId)) return new Response('invalid run id', { status: 400 });

  const resultPath = path.join('.context/projects/_runs', runId, 'result.json');
  if (!existsSync(resultPath)) return new Response('not found', { status: 404 });

  const data = readFileSync(resultPath, 'utf8');
  return new Response(data, { headers: { 'Content-Type': 'application/json' } });
}
