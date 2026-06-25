// Record ALL per-scene silent clips (scripts/record-scenes.mjs). Dev-only, SSE.
import { devOnly, spawnSSE } from '../_lib';

export async function POST() {
  return devOnly() ?? spawnSSE('scripts/record-scenes.mjs');
}
