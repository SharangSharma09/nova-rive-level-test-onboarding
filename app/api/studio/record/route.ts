import { spawn } from "node:child_process";
import path from "node:path";

export async function POST() {
  if (process.env.NODE_ENV !== "development") {
    return new Response("dev only", { status: 405 });
  }

  const root = path.resolve(process.cwd());
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(ctrl) {
      const proc = spawn("node", [
        path.join(root, "video-generation-flow/scripts/record-animation.mjs"),
        "/superflow-demo", "50", "540", "960",
      ], { cwd: root });

      const send = (line: string) =>
        ctrl.enqueue(encoder.encode(`data: ${line.trim()}\n\n`));

      proc.stdout.on("data", (d) => String(d).split("\n").filter(Boolean).forEach(send));
      proc.stderr.on("data", (d) => String(d).split("\n").filter(Boolean).forEach(send));
      proc.on("close", (code) => {
        send(`[done:${code}]`);
        ctrl.close();
      });
      proc.on("error", (err) => {
        send(`[error:${err.message}]`);
        ctrl.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
