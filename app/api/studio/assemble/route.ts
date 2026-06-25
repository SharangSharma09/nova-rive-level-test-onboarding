// Concatenate scene clips → silent video, then mux audio (scripts/assemble-video.mjs). Dev-only, SSE.
import { devOnly, spawnSSE } from '../_lib';

export async function POST() {
  return devOnly() ?? spawnSSE('scripts/assemble-video.mjs');
}
