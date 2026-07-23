export type RumMetricName = 'LCP' | 'INP' | 'CLS' | 'TTFB' | 'FCP';

export type RumRouteClass = 'core' | 'content' | 'interactive' | 'realtime';

type RumThresholds = Record<RumRouteClass, Record<RumMetricName, number>>;

export const RUM_THRESHOLDS: RumThresholds = {
  core: { LCP: 2500, INP: 200, CLS: 0.1, TTFB: 800, FCP: 1800 },
  content: { LCP: 3000, INP: 250, CLS: 0.15, TTFB: 1000, FCP: 2200 },
  interactive: { LCP: 3500, INP: 300, CLS: 0.2, TTFB: 1200, FCP: 2500 },
  realtime: { LCP: 4000, INP: 350, CLS: 0.2, TTFB: 1500, FCP: 2800 },
};

const CORE_EXACT = new Set(['/']);
const CORE_PREFIXES = ['/feed', '/explore', '/communities', '/notifications', '/profile'];
const CONTENT_PREFIXES = ['/blog', '/news', '/library', '/textbook', '/indonesia-history'];
const REALTIME_PREFIXES = ['/rmhbox', '/discord', '/games', '/altair', '/dream-rift'];

export function classifyRumRoute(path: string | null | undefined): RumRouteClass {
  const safePath = (path || '/').split('?')[0];
  if (CORE_EXACT.has(safePath) || CORE_PREFIXES.some((prefix) => safePath.startsWith(prefix))) {
    return 'core';
  }
  if (CONTENT_PREFIXES.some((prefix) => safePath.startsWith(prefix))) {
    return 'content';
  }
  if (REALTIME_PREFIXES.some((prefix) => safePath.startsWith(prefix))) {
    return 'realtime';
  }
  return 'interactive';
}

export function getRumThreshold(
  routeClass: RumRouteClass,
  metricName: string,
): number | null {
  const metric = metricName.toUpperCase() as RumMetricName;
  if (!(metric in RUM_THRESHOLDS[routeClass])) return null;
  return RUM_THRESHOLDS[routeClass][metric];
}
