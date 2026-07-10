/**
 * Real-User Monitoring — report Core Web Vitals to /api/rum.
 *
 * Uses the `web-vitals` library to capture LCP, CLS, INP, FCP and TTFB at their
 * correct moments (including bfcache restores) and beacons each metric to the
 * server, where it is rate-limited and (for poor metrics) logged. Anonymous —
 * no PII, only the metric and the pathname. Wire-compatible with forwarding to
 * a hosted RUM/analytics backend later.
 */

import { onCLS, onFCP, onINP, onLCP, onTTFB, type Metric } from 'web-vitals';

const ENDPOINT = '/api/rum';
let started = false;

function send(metric: Metric): void {
  try {
    const body = JSON.stringify({
      name: metric.name,
      value: Math.round(metric.value * 1000) / 1000,
      rating: metric.rating,
      id: metric.id,
      navigationType: metric.navigationType,
      path: window.location.pathname.slice(0, 200),
      ts: new Date().toISOString(),
    });
    if (typeof navigator.sendBeacon === 'function') {
      navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'application/json' }));
    } else {
      void fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
        keepalive: true,
      }).catch(() => {});
    }
  } catch {
    /* telemetry must never throw */
  }
}

/** Start collecting Core Web Vitals. Safe to call once on the client. */
export function initWebVitals(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  onLCP(send);
  onCLS(send);
  onINP(send);
  onFCP(send);
  onTTFB(send);
}
