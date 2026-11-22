/**
 * An endpoint's health, derived from the outcomes of its last 20 deliveries.
 * Pure, so the server (which counts) and the console (which labels) agree.
 */

/** How many of an endpoint's most recent deliveries count toward its health. */
export const HEALTH_WINDOW = 20;

export type WebhookHealth = 'idle' | 'healthy' | 'degraded' | 'failing';

export interface HealthCounts {
  delivered: number;
  failed: number;
  pending: number;
}

/**
 * `idle`: nothing has settled yet. `healthy`: every settled delivery succeeded.
 * `degraded`: some failed, fewer than half. `failing`: half or more failed.
 * Deliveries still retrying are neither: they settle one way or the other.
 */
export function webhookHealth(counts: HealthCounts): WebhookHealth {
  const settled = counts.delivered + counts.failed;
  if (settled === 0) return 'idle';
  if (counts.failed === 0) return 'healthy';
  return counts.failed * 2 >= settled ? 'failing' : 'degraded';
}
