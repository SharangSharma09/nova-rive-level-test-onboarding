// Shared helpers for studio pipeline routes (dev-only): spawn a node script and stream its
// stdout/stderr to the browser as Server-Sent Events.

import { spawn } from 'node:child_process';
import path from 'node:path';

export function devOnly(): Response | null {
  return process.env.NODE_ENV !== 'development' ? new Response('dev only', { status: 405 }) : null;
}

export function spawnSSE(scriptRel: string, args: string[] = []): Response {
  const root = path.resolve(process.cwd());
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(ctrl) {
      const proc = spawn('node', [path.join(root, scriptRel), ...args], { cwd: root });
      const send = (line: string) => { try { ctrl.enqueue(encoder.encode(`data: ${line.trimEnd()}\n\n`)); } catch { /* closed */ } };
      proc.stdout.on('data', (d) => String(d).split('\n').filter(Boolean).forEach(send));
      proc.stderr.on('data', (d) => String(d).split('\n').filter(Boolean).forEach(send));
      proc.on('close', (code) => { send(`[done:${code}]`); ctrl.close(); });
      proc.on('error', (err) => { send(`[error:${err.message}]`); ctrl.close(); });
    },
  });
  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
  });
}

// Like spawnSSE but takes an explicit command (e.g. the tsx binary) instead of hardcoding 'node'.
// Use for TypeScript orchestrators: spawnSSEcmd(path.resolve('node_modules/.bin/tsx'), ['scripts/foo.ts', arg])
export function spawnSSEcmd(cmd: string, args: string[] = []): Response {
  const root = path.resolve(process.cwd());
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(ctrl) {
      const proc = spawn(cmd, args, { cwd: root });
      const send = (line: string) => { try { ctrl.enqueue(encoder.encode(`data: ${line.trimEnd()}\n\n`)); } catch { /* closed */ } };
      proc.stdout.on('data', (d) => String(d).split('\n').filter(Boolean).forEach(send));
      proc.stderr.on('data', (d) => String(d).split('\n').filter(Boolean).forEach(send));
      proc.on('close', (code) => { send(`[done:${code}]`); ctrl.close(); });
      proc.on('error', (err) => { send(`[error:${err.message}]`); ctrl.close(); });
    },
  });
  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
  });
}
