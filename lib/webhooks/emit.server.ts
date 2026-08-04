/**
 * Outbound webhook delivery.
 *
 * `emitWebhookEvent` fans an event out to the owner's matching, enabled
 * endpoints: it records a PENDING `WebhookDelivery` per endpoint and attempts an
 * immediate signed POST. Failed attempts stay PENDING with an exponential
 * backoff `nextAttemptAt`; `deliverDuePending` (called from a cron route) drains
 * them. An endpoint that accrues too many consecutive failures is auto-disabled.
 *
 * Each delivery is signed so receivers can verify authenticity:
 *   X-RMH-Signature: t=<unix-seconds>,v1=<hex hmac-sha256 of `t.body`>
 * with the endpoint's `secret`. See `signWebhookPayload`.
 */

import { prisma } from '@/lib/prisma.server';
import { mapWithConcurrency } from '@/lib/async-pool';
import { matchesEvent } from '@/lib/webhooks/events';
import { signWebhookPayload } from '@/lib/webhooks/signature';
import { safeFetch, SsrfError } from '@/lib/ssrf-guard.server';

// Pure crypto + URL validation live in ./signature; re-exported for route use.
export { generateWebhookSecret, signWebhookPayload, verifyWebhookSignature, validateWebhookUrl, WEBHOOK_SECRET_PREFIX } from '@/lib/webhooks/signature';

const MAX_ATTEMPTS = 6;
const AUTO_DISABLE_FAILURES = 20;
const DELIVERY_TIMEOUT_MS = 10_000;
/** Backoff per attempt number (1-indexed), capped at the last entry. */
const BACKOFF_MS = [0, 60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000, 6 * 60 * 60_000];

function backoffFor(attempt: number): number {
  return BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)];
}

interface EndpointRow {
  id: string;
  url: string;
  secret: string;
  failureCount: number;
}

/** Attempt a single delivery and record the outcome. */
async function attemptDelivery(deliveryId: string, event: string, payload: unknown, endpoint: EndpointRow, attemptNo: number): Promise<void> {
  const body = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = `t=${timestamp},v1=${signWebhookPayload(endpoint.secret, timestamp, body)}`;

  let status = 0;
  let errMsg: string | null = null;
  try {
    // Deliver through the SSRF guard, NOT native fetch. Endpoint URLs are
    // user-supplied and only lexically validated at registration
    // (validateWebhookUrl never resolves DNS), so a hostname that resolves to a
    // private/link-local address — or an endpoint that 302-redirects inward —
    // would otherwise let a subscriber reach internal services (e.g. cloud
    // metadata). safeFetch resolves DNS, rejects private/reserved IPs, enforces
    // https, and re-validates every redirect hop.
    const resp = await safeFetch(endpoint.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'RMHStudios-Webhooks/1.0',
        'X-RMH-Event': event,
        'X-RMH-Delivery': deliveryId,
        'X-RMH-Timestamp': String(timestamp),
        'X-RMH-Signature': signature,
      },
      body,
      timeoutMs: DELIVERY_TIMEOUT_MS,
    });
    status = resp.status;
  } catch (e) {
    errMsg =
      e instanceof SsrfError
        ? `blocked destination: ${e.message}`.slice(0, 500)
        : e instanceof Error
          ? e.message.slice(0, 500)
          : 'delivery failed';
  }

  const ok = status >= 200 && status < 300;
  if (ok) {
    await prisma.$transaction([
      prisma.webhookDelivery.update({
        where: { id: deliveryId },
        data: { status: 'DELIVERED', attempts: attemptNo, responseStatus: status, deliveredAt: new Date(), error: null },
      }),
      prisma.webhookEndpoint.update({ where: { id: endpoint.id }, data: { failureCount: 0, lastDeliveryAt: new Date() } }),
    ]).catch((e) => console.error('[webhooks] mark delivered failed:', e));
    return;
  }

  const exhausted = attemptNo >= MAX_ATTEMPTS;
  const nextAttemptAt = new Date(Date.now() + backoffFor(attemptNo));
  await prisma.webhookDelivery
    .update({
      where: { id: deliveryId },
      data: {
        status: exhausted ? 'FAILED' : 'PENDING',
        attempts: attemptNo,
        responseStatus: status || null,
        error: errMsg ?? `HTTP ${status}`,
        nextAttemptAt,
      },
    })
    .catch((e) => console.error('[webhooks] mark retry failed:', e));

  const newFailureCount = endpoint.failureCount + 1;
  await prisma.webhookEndpoint
    .update({
      where: { id: endpoint.id },
      data: {
        failureCount: newFailureCount,
        lastDeliveryAt: new Date(),
        ...(newFailureCount >= AUTO_DISABLE_FAILURES ? { enabled: false } : {}),
      },
    })
    .catch(() => {});
}

/**
 * Emit an event to all of a user's matching, enabled endpoints. Best-effort:
 * never throws into the caller (a failed webhook must not break the action that
 * produced the event).
 */
export async function emitWebhookEvent(userId: string, event: string, data: unknown): Promise<void> {
  try {
    const endpoints = await prisma.webhookEndpoint.findMany({
      where: { userId, enabled: true },
      select: { id: true, url: true, secret: true, events: true, failureCount: true },
    });
    const targets = endpoints.filter((e) => matchesEvent(e.events, event));
    if (targets.length === 0) return;

    const payloadBase = { event, created: new Date().toISOString(), data };
    await Promise.all(
      targets.map(async (endpoint) => {
        const delivery = await prisma.webhookDelivery.create({
          data: { endpointId: endpoint.id, event, payload: payloadBase as object, status: 'PENDING', attempts: 0 },
          select: { id: true },
        });
        // Fire-and-forget the first attempt; retries are handled by the drain.
        void attemptDelivery(delivery.id, event, { id: delivery.id, ...payloadBase }, endpoint, 1);
      })
    );
  } catch (e) {
    console.error('[webhooks] emit failed:', e);
  }
}

/** Distinct subscriber endpoints drained at once (each stays sequential). */
const ENDPOINT_DELIVERY_CONCURRENCY = 6;

/**
 * Drain due PENDING deliveries (retries). Intended to be called periodically by
 * an authenticated cron route. Returns the number of deliveries attempted.
 */
export async function deliverDuePending(max = 50): Promise<number> {
  const due = await prisma.webhookDelivery.findMany({
    where: { status: 'PENDING', nextAttemptAt: { lte: new Date() } },
    orderBy: { nextAttemptAt: 'asc' },
    take: max,
    include: { endpoint: { select: { id: true, url: true, secret: true, failureCount: true, enabled: true } } },
  });

  // Deliveries whose endpoint was disabled after queueing are all failed in one
  // statement rather than an UPDATE apiece.
  const disabled = due.filter((d) => !d.endpoint.enabled);
  if (disabled.length > 0) {
    await prisma.webhookDelivery.updateMany({ where: { id: { in: disabled.map((d) => d.id) } }, data: { status: 'FAILED', error: 'endpoint disabled' } }).catch(() => {});
  }

  // The rest are outbound HTTP calls, previously awaited strictly one after
  // another — so a batch of 50 took the sum of 50 request timeouts, and one slow
  // subscriber stalled every other subscriber's retries behind it.
  //
  // Deliveries are grouped by endpoint and the groups run concurrently, while
  // each endpoint's own deliveries stay sequential and in `nextAttemptAt` order.
  // That keeps per-subscriber ordering and avoids aiming a burst of parallel
  // requests at any single subscriber, which a flat parallel drain would do.
  const byEndpoint = new Map<string, typeof due>();
  for (const d of due) {
    if (!d.endpoint.enabled) continue;
    const group = byEndpoint.get(d.endpoint.id);
    if (group) group.push(d);
    else byEndpoint.set(d.endpoint.id, [d]);
  }

  await mapWithConcurrency([...byEndpoint.values()], ENDPOINT_DELIVERY_CONCURRENCY, async (group) => {
    for (const d of group) {
      await attemptDelivery(d.id, d.event, d.payload, { id: d.endpoint.id, url: d.endpoint.url, secret: d.endpoint.secret, failureCount: d.endpoint.failureCount }, d.attempts + 1);
    }
  });

  return due.length - disabled.length;
}
