import { devOnly } from '../../studio/_lib';

export const dynamic = 'force-dynamic';

const LAYOUTS = [
  { id: '01', name: 'Horizontal Split (9:16)', preview: '/ads-layouts/01.png' },
  { id: '02', name: 'Horizontal Swap (9:16)', preview: '/ads-layouts/02.png' },
  { id: '03', name: 'Vertical Split (9:16)', preview: '/ads-layouts/03.png' },
  { id: '04b', name: 'G-Meet · Active Speaker (9:16)', preview: '/ads-layouts/04b.png' },
  { id: '05b', name: 'G-Meet · Active Circle (9:16)', preview: '/ads-layouts/05b.png' },
  { id: '07', name: 'Square IG (1:1)', preview: '/ads-layouts/07.png' },
  { id: '09', name: 'G-Meet Grid (9:16)', preview: '/ads-layouts/09.png' },
];

export function GET() {
  const guard = devOnly();
  if (guard) return guard;
  return new Response(JSON.stringify(LAYOUTS), { headers: { 'Content-Type': 'application/json' } });
}
