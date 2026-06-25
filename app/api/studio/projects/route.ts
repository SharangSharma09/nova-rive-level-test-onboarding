// Lists studio projects for the sidebar. The live "Superflow Demo" (the working set in
// .context/recordings) is the default; each folder under .context/projects/<name>/final.mp4
// is another project. Dev-only-ish; safe read-only.

import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

export const dynamic = 'force-dynamic';

export async function GET() {
  const root = process.cwd();
  const projects: { id: string; label: string; hasVideo: boolean }[] = [];

  // Default project = the live superflow working set.
  projects.push({
    id: 'superflow-demo',
    label: 'Superflow Demo',
    hasVideo: existsSync(path.join(root, '.context/recordings/superflow-demo-final.mp4')),
  });

  // User projects = every folder under .context/projects/ (even empty ones).
  const dir = path.join(root, '.context/projects');
  if (existsSync(dir)) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue; // skip files like .DS_Store
      const name = entry.name;
      projects.push({
        id: name,
        label: name.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        hasVideo: existsSync(path.join(dir, name, 'final.mp4')),
      });
    }
  }

  return Response.json({ projects });
}
