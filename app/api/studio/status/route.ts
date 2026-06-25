import { statSync, readFileSync } from "node:fs";
import path from "node:path";

function fileInfo(p: string) {
  try {
    const s = statSync(p);
    return { exists: true, sizeMB: (s.size / 1024 / 1024).toFixed(1), modifiedAt: s.mtime.toISOString() };
  } catch {
    return { exists: false };
  }
}

function mtime(p: string): number | null {
  try { return statSync(p).mtimeMs; } catch { return null; }
}

// Staleness model (mtime-based):
//   scene clip stale  → page source changed after the clip was recorded (or clip missing)
//   final stale       → any scene clip or any TTS mp3 changed after the final was assembled (or missing)
function computeStale(root: string) {
  const scenes = JSON.parse(readFileSync(path.join(root, "video-generation-flow/config/scenes.json"), "utf8")).scenes as { name: string }[];
  const cues   = JSON.parse(readFileSync(path.join(root, "video-generation-flow/config/tts-cues.json"), "utf8")).ttsCues as { file: string }[];

  const pageM  = mtime(path.join(root, "app/superflow-demo/page.tsx")) ?? 0;
  const finalM = mtime(path.join(root, ".context/recordings/superflow-demo-final.mp4"));

  const sceneMs = scenes.map((_, i) => mtime(path.join(root, `.context/recordings/scenes/scene-${i}.mp4`)));
  const sceneStale = sceneMs.map((m) => m === null || pageM > m);

  const audioMs = cues.map((c) => mtime(path.join(root, "public/tts/video", c.file)) ?? 0);
  const newestInput = Math.max(...sceneMs.map((m) => m ?? Infinity).filter(Number.isFinite), ...audioMs, 0);
  const finalStale = finalM === null || newestInput > finalM;

  return { scenes: sceneStale, final: finalStale, haveFinal: finalM !== null };
}

export async function GET() {
  const root = process.cwd();
  return Response.json({
    silent: fileInfo(path.join(root, ".context/recordings/superflow-demo.mp4")),
    final: fileInfo(path.join(root, ".context/recordings/superflow-demo-final.mp4")),
    qaReport: fileInfo(path.join(root, ".context/qa-report.md")),
    stale: computeStale(root),
  });
}
