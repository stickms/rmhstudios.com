/**
 * The webhook console's data layer. Every query is scoped to the signed-in
 * owner in its `where`, so a foreign or missing id is indistinguishable (404,
 * never 403). Nothing here selects `secret` or `previousSecret` except
 * `rotateWebhookSecret` and `createWebhook`, which return the new secret once.
 */
import { prisma } from '@/lib/prisma.server';
import type { Prisma } from '@prisma/client';
import { deliverToEndpoint, generateWebhookSecret, validateWebhookUrl } from '@/lib/webhooks/emit.server';
import { normalizeWebhookEvents, WEBHOOK_PING_EVENT } from '@/lib/webhooks/events';
import { MAX_WEBHOOK_ENDPOINTS, SECRET_OVERLAP_MS } from '@/lib/webhooks/limits';
import { HEALTH_WINDOW, webhookHealth, type HealthCounts } from '@/lib/webhooks/health';
import type { WebhookDeliveryRow, WebhookEndpointRow } from '@/lib/developer/webhooks.contract';
import type { z } from 'zod';
import type { createWebhookBody, deliveriesQuery, patchWebhookBody } from '@/lib/developer/webhooks-schema';

export const DELIVERY_PAGE_SIZE = 25;

/** A failure the route turns into `{ error }` with this status. The text is ours, never a caught error's. */
export interface Failure {
  ok: false;
  status: 400 | 404 | 409;
  error: string;
}
export type Result<T> = ({ ok: true } & T) | Failure;

const notFound: Failure = { ok: false, status: 404, error: 'Webhook not found' };

const endpointSelect = {
  id: true,
  url: true,
  description: true,
  events: true,
  enabled: true,
  failureCount: true,
  lastDeliveryAt: true,
  createdAt: true,
  previousSecretExpiresAt: true,
} satisfies Prisma.WebhookEndpointSelect;

type EndpointRecord = Prisma.WebhookEndpointGetPayload<{ select: typeof endpointSelect }>;

const deliverySelect = {
  id: true,
  event: true,
  status: true,
  attempts: true,
  responseStatus: true,
  durationMs: true,
  error: true,
  createdAt: true,
  deliveredAt: true,
  redeliveryOfId: true,
  payload: true,
} satisfies Prisma.WebhookDeliverySelect;

type DeliveryRecord = Prisma.WebhookDeliveryGetPayload<{ select: typeof deliverySelect }>;

function serializeEndpoint(
  e: EndpointRecord,
  counts: HealthCounts | undefined,
  disabledReason: string | null,
  now: Date,
): WebhookEndpointRow {
  const overlapOpen = e.previousSecretExpiresAt !== null && e.previousSecretExpiresAt.getTime() > now.getTime();
  return {
    id: e.id,
    url: e.url,
    description: e.description,
    events: e.events,
    enabled: e.enabled,
    failureCount: e.failureCount,
    lastDeliveryAt: e.lastDeliveryAt?.toISOString() ?? null,
    createdAt: e.createdAt.toISOString(),
    health: webhookHealth(counts ?? { delivered: 0, failed: 0, pending: 0 }),
    disabledReason: e.enabled ? null : disabledReason,
    previousSecretExpiresAt: overlapOpen ? (e.previousSecretExpiresAt as Date).toISOString() : null,
  };
}

function serializeDelivery(d: DeliveryRecord): WebhookDeliveryRow {
  return {
    id: d.id,
    event: d.event,
    status: d.status,
    attempts: d.attempts,
    responseStatus: d.responseStatus,
    durationMs: d.durationMs,
    error: d.error,
    createdAt: d.createdAt.toISOString(),
    deliveredAt: d.deliveredAt?.toISOString() ?? null,
    redeliveryOfId: d.redeliveryOfId,
    payload: d.payload,
  };
}

/**
 * Outcome counts over each endpoint's last `HEALTH_WINDOW` deliveries, in one
 * grouped query (a window function ranks each endpoint's deliveries newest first).
 */
async function healthCounts(endpointIds: string[]): Promise<Map<string, HealthCounts>> {
  const out = new Map<string, HealthCounts>();
  if (endpointIds.length === 0) return out;
  const rows = await prisma.$queryRaw<
    { endpointId: string; status: 'PENDING' | 'DELIVERED' | 'FAILED'; n: bigint | number }[]
  >`
    SELECT "endpointId", "status"::text AS "status", COUNT(*) AS "n"
    FROM (
      SELECT "endpointId", "status",
             ROW_NUMBER() OVER (PARTITION BY "endpointId" ORDER BY "createdAt" DESC, "id" DESC) AS rn
      FROM "webhook_delivery"
      WHERE "endpointId" = ANY(${endpointIds})
    ) ranked
    WHERE rn <= ${HEALTH_WINDOW}
    GROUP BY "endpointId", "status"`;
  for (const r of rows) {
    const c = out.get(r.endpointId) ?? { delivered: 0, failed: 0, pending: 0 };
    const n = Number(r.n);
    if (r.status === 'DELIVERED') c.delivered += n;
    else if (r.status === 'FAILED') c.failed += n;
    else c.pending += n;
    out.set(r.endpointId, c);
  }
  return out;
}

/** The latest delivery error of each disabled endpoint: why it was switched off. */
async function disabledReasons(records: EndpointRecord[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const ids = records.filter((e) => !e.enabled).map((e) => e.id);
  if (ids.length === 0) return out;
  const rows = await prisma.webhookDelivery.findMany({
    where: { endpointId: { in: ids }, error: { not: null } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    distinct: ['endpointId'],
    select: { endpointId: true, error: true },
  });
  for (const r of rows) if (r.error) out.set(r.endpointId, r.error);
  return out;
}

async function serializeEndpoints(records: EndpointRecord[]): Promise<WebhookEndpointRow[]> {
  const [counts, reasons] = await Promise.all([healthCounts(records.map((e) => e.id)), disabledReasons(records)]);
  const now = new Date();
  return records.map((e) => serializeEndpoint(e, counts.get(e.id), reasons.get(e.id) ?? null, now));
}

export async function listWebhooks(userId: string) {
  const records = await prisma.webhookEndpoint.findMany({
    where: { userId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: endpointSelect,
  });
  return { endpoints: await serializeEndpoints(records), max: MAX_WEBHOOK_ENDPOINTS };
}

async function readEndpoint(userId: string, id: string): Promise<WebhookEndpointRow | null> {
  const record = await prisma.webhookEndpoint.findFirst({
    where: { id, userId },
    select: endpointSelect,
  });
  if (!record) return null;
  const [row] = await serializeEndpoints([record]);
  return row ?? null;
}

type CreateBody = z.infer<typeof createWebhookBody>;

export async function createWebhook(
  userId: string,
  body: CreateBody,
): Promise<Result<{ endpoint: WebhookEndpointRow; secret: string }>> {
  const urlError = validateWebhookUrl(body.url);
  if (urlError) return { ok: false, status: 400, error: urlError };
  const events = normalizeWebhookEvents(body.events);
  if (events.length === 0) {
    return { ok: false, status: 400, error: 'Pick at least one event.' };
  }
  const count = await prisma.webhookEndpoint.count({ where: { userId } });
  if (count >= MAX_WEBHOOK_ENDPOINTS) {
    return {
      ok: false,
      status: 400,
      error: `You can register at most ${MAX_WEBHOOK_ENDPOINTS} webhook endpoints.`,
    };
  }
  const secret = generateWebhookSecret();
  const created = await prisma.webhookEndpoint.create({
    data: { userId, url: body.url, events, description: body.description || null, secret },
    select: endpointSelect,
  });
  const [endpoint] = await serializeEndpoints([created]);
  return { ok: true, endpoint: endpoint as WebhookEndpointRow, secret };
}

type DeliveryFilters = z.infer<typeof deliveriesQuery>;

const STATUS_FILTER = { delivered: 'DELIVERED', pending: 'PENDING', failed: 'FAILED' } as const;

function parseCursor(cursor: string): { at: Date; id: string } {
  const [ms, id] = cursor.split('_') as [string, string];
  return { at: new Date(Number(ms)), id };
}

/** An endpoint and one page of its deliveries (newest first, keyset on `createdAt desc, id desc`). */
export async function getWebhook(
  userId: string,
  id: string,
  filters: DeliveryFilters,
): Promise<Result<{ endpoint: WebhookEndpointRow; deliveries: WebhookDeliveryRow[]; nextCursor: string | null }>> {
  const endpoint = await readEndpoint(userId, id);
  if (!endpoint) return notFound;

  const where: Prisma.WebhookDeliveryWhereInput = { endpointId: id };
  if (filters.status && filters.status !== 'all') where.status = STATUS_FILTER[filters.status];
  if (filters.event) where.event = filters.event;
  if (filters.cursor) {
    const { at, id: afterId } = parseCursor(filters.cursor);
    where.OR = [{ createdAt: { lt: at } }, { createdAt: at, id: { lt: afterId } }];
  }
  const rows = await prisma.webhookDelivery.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: DELIVERY_PAGE_SIZE + 1,
    select: deliverySelect,
  });
  const page = rows.slice(0, DELIVERY_PAGE_SIZE);
  const last = page[page.length - 1];
  const nextCursor = rows.length > DELIVERY_PAGE_SIZE && last ? `${last.createdAt.getTime()}_${last.id}` : null;
  return { ok: true, endpoint, deliveries: page.map(serializeDelivery), nextCursor };
}

type PatchBody = z.infer<typeof patchWebhookBody>;

export async function updateWebhook(
  userId: string,
  id: string,
  body: PatchBody,
): Promise<Result<{ endpoint: WebhookEndpointRow }>> {
  const data: Prisma.WebhookEndpointUpdateManyMutationInput = {};
  if (body.url !== undefined) {
    const urlError = validateWebhookUrl(body.url);
    if (urlError) return { ok: false, status: 400, error: urlError };
    data.url = body.url;
  }
  if (body.events !== undefined) {
    const events = normalizeWebhookEvents(body.events);
    if (events.length === 0) return { ok: false, status: 400, error: 'Pick at least one event.' };
    data.events = events;
  }
  if (body.description !== undefined) data.description = body.description || null;
  if (body.enabled !== undefined) {
    data.enabled = body.enabled;
    // Turning an endpoint back on is a fresh start: the failures that switched it off no longer count.
    if (body.enabled) data.failureCount = 0;
  }
  const { count } = await prisma.webhookEndpoint.updateMany({ where: { id, userId }, data });
  if (count === 0) return notFound;
  const endpoint = await readEndpoint(userId, id);
  return endpoint ? { ok: true, endpoint } : notFound;
}

export async function deleteWebhook(userId: string, id: string): Promise<Result<object>> {
  const { count } = await prisma.webhookEndpoint.deleteMany({ where: { id, userId } });
  return count === 0 ? notFound : { ok: true };
}

/**
 * Issue a new secret. The old one moves to `previousSecret` and keeps signing
 * (a second `v1=` on every delivery) for `SECRET_OVERLAP_MS`. The swap is
 * conditional on the secret read, so two rotations racing cannot both win.
 */
export async function rotateWebhookSecret(
  userId: string,
  id: string,
): Promise<Result<{ endpoint: WebhookEndpointRow; secret: string }>> {
  const current = await prisma.webhookEndpoint.findFirst({
    where: { id, userId },
    select: { secret: true },
  });
  if (!current) return notFound;
  const secret = generateWebhookSecret();
  const { count } = await prisma.webhookEndpoint.updateMany({
    where: { id, userId, secret: current.secret },
    data: {
      secret,
      previousSecret: current.secret,
      previousSecretExpiresAt: new Date(Date.now() + SECRET_OVERLAP_MS),
    },
  });
  if (count === 0) {
    return { ok: false, status: 409, error: 'The secret changed while rotating. Try again.' };
  }
  const endpoint = await readEndpoint(userId, id);
  return endpoint ? { ok: true, endpoint, secret } : notFound;
}

async function readDelivery(userId: string, id: string): Promise<WebhookDeliveryRow | null> {
  const record = await prisma.webhookDelivery.findFirst({
    where: { id, endpoint: { userId } },
    select: deliverySelect,
  });
  return record ? serializeDelivery(record) : null;
}

/** Deliver a `ping` to this endpoint only, whatever it subscribes to, and return the recorded delivery. */
export async function sendTestEvent(userId: string, id: string): Promise<Result<{ delivery: WebhookDeliveryRow }>> {
  const owned = await prisma.webhookEndpoint.findFirst({ where: { id, userId }, select: { id: true } });
  if (!owned) return notFound;
  const sent = await deliverToEndpoint(id, WEBHOOK_PING_EVENT, {
    event: WEBHOOK_PING_EVENT,
    created: new Date().toISOString(),
    data: { message: 'This is a test event from the RMH Studios webhook console.' },
  });
  const delivery = sent ? await readDelivery(userId, sent.id) : null;
  return delivery ? { ok: true, delivery } : notFound;
}

/**
 * Send a settled delivery again as a new row that points at the original. The
 * original is never touched. A delivery still retrying is refused: the drain is
 * already sending it.
 */
export async function redeliver(userId: string, deliveryId: string): Promise<Result<{ delivery: WebhookDeliveryRow }>> {
  const original = await prisma.webhookDelivery.findFirst({
    where: { id: deliveryId, endpoint: { userId } },
    select: { id: true, endpointId: true, event: true, status: true, payload: true },
  });
  if (!original) return { ok: false, status: 404, error: 'Delivery not found' };
  if (original.status === 'PENDING') {
    return { ok: false, status: 409, error: 'This delivery is still being retried.' };
  }
  const payload =
    original.payload !== null && typeof original.payload === 'object' && !Array.isArray(original.payload)
      ? (original.payload as object)
      : { data: original.payload };
  const sent = await deliverToEndpoint(original.endpointId, original.event, payload, {
    redeliveryOfId: original.id,
  });
  const delivery = sent ? await readDelivery(userId, sent.id) : null;
  return delivery ? { ok: true, delivery } : { ok: false, status: 404, error: 'Delivery not found' };
}
