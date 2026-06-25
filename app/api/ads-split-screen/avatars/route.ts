import { readFileSync } from 'node:fs';
import { devOnly } from '../../studio/_lib';

export const dynamic = 'force-dynamic';

export function GET() {
  const guard = devOnly();
  if (guard) return guard;
  const data = readFileSync('data/ads-avatars.json', 'utf8');
  return new Response(data, { headers: { 'Content-Type': 'application/json' } });
}
