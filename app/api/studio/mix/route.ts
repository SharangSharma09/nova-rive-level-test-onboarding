// Re-mux audio onto the existing silent video (scripts/add-audio.mjs). Dev-only, SSE.
import { devOnly, spawnSSE } from '../_lib';

export async function POST() {
  return devOnly() ?? spawnSSE('scripts/add-audio.mjs');
}
