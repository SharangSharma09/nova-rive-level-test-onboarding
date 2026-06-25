// Single source of truth for ffmpeg/ffprobe paths.
// Prefers a WORKING system binary (full codecs, native arch) → falls back to the bundled
// ffmpeg-static / ffprobe-static (for clones with no system ffmpeg). Honors FFMPEG_PATH/FFPROBE_PATH.
// (On Apple-silicon some prebuilt static binaries are wrong-arch / drop audio, so system-first is safest.)
import { spawnSync } from 'node:child_process';
import ffmpegStatic from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';

const ok = (bin) => { try { return !!bin && spawnSync(bin, ['-version'], { stdio: 'ignore' }).status === 0; } catch { return false; } };
const resolve = (envVar, sysName, staticBin) =>
  process.env[envVar] || (ok(sysName) ? sysName : (ok(staticBin) ? staticBin : sysName));

export const FFMPEG  = resolve('FFMPEG_PATH',  'ffmpeg',  ffmpegStatic);
export const FFPROBE = resolve('FFPROBE_PATH', 'ffprobe', ffprobeStatic?.path);
