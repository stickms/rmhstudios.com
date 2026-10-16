import { prisma } from '@/lib/prisma.server';
import { apiCache } from '@/lib/cache';
import { STATIC_ROUTES, catalogRoutes } from '@/lib/sitemap';

/**
 * Hard-load page views per route label, buffered in memory and flushed in one
 * statement every 30s so the RUM beacon path never waits on the DB. Losing a
 * buffer on restart under-counts slightly; it can never over-count.
 */
const firstSegment = (loc: string) => (loc === '/' ? '/' : `/${loc.split('/').filter(Boolean)[0]}`);
const buffer = new Map<string, number>();
const MAX_KEYS = 500;
let timer: ReturnType<typeof setInterval> | null = null;

let knownSet: Set<string> | null = null;
function knownRoutes(): Set<string> {
  return (knownSet ??= new Set(
    [...STATIC_ROUTES, ...catalogRoutes()].map((e) => firstSegment(e.loc)),
  ));
}

/** Unknown first segments (typos, probes) share one `(other)` row so cardinality stays bounded. */
export function recordRouteView(label: string): void {
  const route = knownRoutes().has(label) ? label : '(other)';
  if (buffer.size >= MAX_KEYS && !buffer.has(route)) return;
  buffer.set(route, (buffer.get(route) ?? 0) + 1);
  if (!timer) {
    timer = setInterval(() => void flushRouteViews(), 30_000);
    timer.unref?.();
  }
}

export async function flushRouteViews(): Promise<void> {
  if (buffer.size === 0) return;
  const batch = [...buffer.entries()];
  buffer.clear();
  const day = new Date().toISOString().slice(0, 10);
  try {
    await prisma.$executeRaw`
      INSERT INTO "route_view_day" ("route", "day", "views")
      SELECT r, ${day}::date, v FROM unnest(${batch.map(([r]) => r)}::text[], ${batch.map(([, v]) => v)}::int[]) AS t(r, v)
      ON CONFLICT ("route", "day") DO UPDATE SET "views" = "route_view_day"."views" + EXCLUDED."views"`;
  } catch {
    /* analytics must never throw */
  }
}

/** Known route labels (sitemap static routes + game/app catalog) with their 90-day views. */
export async function getRouteViews() {
  const hit = apiCache.get<Awaited<ReturnType<typeof compute>>>('ops:route-views');
  if (hit) return hit;
  const out = await compute();
  apiCache.set('ops:route-views', out, 5 * 60_000);
  return out;
}

async function compute() {
  const since = new Date(Date.now() - 90 * 86_400_000);
  const [rows, first] = await Promise.all([
    prisma.routeViewDay.groupBy({
      by: ['route'],
      where: { day: { gte: since } },
      _sum: { views: true },
    }),
    prisma.routeViewDay.aggregate({ _min: { day: true } }),
  ]);
  const views = new Map(rows.map((r) => [r.route, r._sum.views ?? 0]));
  const known = knownRoutes();
  const routes = [...new Set([...known, ...views.keys()])]
    .map((route) => ({ route, views: views.get(route) ?? 0, known: known.has(route) }))
    .sort((a, b) => a.views - b.views);
  return { trackingSince: first._min.day?.toISOString().slice(0, 10) ?? null, routes };
}
