// Record ONE per-scene silent clip (scripts/record-scenes.mjs N). Dev-only, SSE.
// Body: { n: number }
import { devOnly, spawnSSE } from '../_lib';

export async function POST(req: Request) {
  const guard = devOnly();
  if (guard) return guard;
  let n = 0;
  try { n = Number((await req.json())?.n) || 0; } catch { /* default 0 */ }
  return spawnSSE('scripts/record-scenes.mjs', [String(n)]);
}
