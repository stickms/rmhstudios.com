import thresholds from './rum-slo-bands.json';

export type RumMetricName = 'LCP' | 'INP' | 'CLS' | 'TTFB' | 'FCP';

export type RumRouteClass = 'core' | 'content' | 'interactive' | 'realtime';

type RumThresholds = Record<RumRouteClass, Record<RumMetricName, number>>;

export const RUM_THRESHOLDS: RumThresholds = thresholds;

const CORE_EXACT = new Set(['/']);
const CORE_PREFIXES = [
  '/feed',
  '/explore',
  '/communities',
  '/c',
  '/groups',
  '/notifications',
  '/profile',
  '/u',
  '/messages',
  '/bookmarks',
  '/search',
];
const CONTENT_PREFIXES = ['/blog', '/news', '/library', '/textbook', '/indonesia-history'];
const REALTIME_PREFIXES = ['/rmhbox', '/discord', '/games', '/altair', '/dream-rift'];

function isPathSegment(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

function normalizeRumPath(path: string | null | undefined): string {
  let safePath = (path || '/').split(/[?#]/, 1)[0] || '/';
  if (!safePath.startsWith('/')) safePath = `/${safePath}`;
  if (safePath !== '/') safePath = safePath.replace(/\/+$/, '');
  return safePath;
}

export function classifyRumRoute(path: string | null | undefined): RumRouteClass {
  const safePath = normalizeRumPath(path);
  if (CORE_EXACT.has(safePath) || CORE_PREFIXES.some((prefix) => isPathSegment(safePath, prefix))) {
    return 'core';
  }
  if (CONTENT_PREFIXES.some((prefix) => isPathSegment(safePath, prefix))) {
    return 'content';
  }
  if (REALTIME_PREFIXES.some((prefix) => isPathSegment(safePath, prefix))) {
    return 'realtime';
  }
  return 'interactive';
}

/** Low-cardinality route label that does not retain handles, IDs, or slugs. */
export function getRumRouteLabel(path: string | null | undefined): string {
  const safePath = normalizeRumPath(path);
  if (safePath === '/') return '/';
  return `/${safePath.split('/').filter(Boolean)[0]}`;
}

export function getRumThreshold(routeClass: RumRouteClass, metricName: string): number | null {
  const metric = metricName.toUpperCase() as RumMetricName;
  if (!(metric in RUM_THRESHOLDS[routeClass])) return null;
  return RUM_THRESHOLDS[routeClass][metric];
}
