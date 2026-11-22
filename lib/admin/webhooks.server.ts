/**
 * The server half of /admin/webhooks: a filtered page of webhook endpoints with their 24-hour delivery figures, one
 * endpoint's last 50 deliveries, and the audited admin disable and lift. Admin routes only.
 *
 * Nothing here selects `secret`, `previousSecret`, a delivery's `payload` or a signature, and the full URL never
 * leaves this module: rows, details, audit rows and the owner's notice carry `redactWebhookUrl` / `webhookHost`
 * output, and a delivery's error text is redacted of the URL before it is cut to length.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { recordAdminActionIn } from '@/lib/admin-audit.server';
import { userChipSelect } from '@/lib/user-display';
import { createNotification } from '@/lib/notifications.server';
import { notice } from '@/lib/notifications/notice-keys';
import {
  AUTO_DISABLE_FAILURES,
  FIGURES_WINDOW_MS,
  NO_FIGURES,
  WEBHOOKS_PAGE_SIZE,
  WEBHOOK_DELIVERIES_SHOWN,
  adminErrorText,
  decodeCursor,
  encodeCursor,
  figuresFromRow,
  redactWebhookUrl,
  webhookHost,
  webhookStatus,
  type AdminDeliveryRow,
  type AdminWebhookDetail,
  type AdminWebhookRow,
  type AdminWebhooksPage,
  type FigureRow,
  type WebhookFigures,
  type WebhookFilter,
} from '@/lib/admin/webhooks';

/** The entity type of the owner's notice; `components/feed/notification-labels.ts` labels it. */
export const WEBHOOK_ADMIN_DISABLED_ENTITY = 'webhook-admin-disabled';

export interface WebhooksFilters {
  filter?: WebhookFilter | undefined;
  owner?: string | undefined;
  host?: string | undefined;
  cursor?: string | undefined;
}

/** The only endpoint columns an admin read selects: no secret, no previous secret. */
const rowSelect = {
  id: true,
  url: true,
  events: true,
  enabled: true,
  failureCount: true,
  lastDeliveryAt: true,
  createdAt: true,
  adminDisabledAt: true,
  adminDisabledReason: true,
  user: { select: userChipSelect },
} satisfies Prisma.WebhookEndpointSelect;

function baseWhere(f: WebhooksFilters): Prisma.WebhookEndpointWhereInput {
  const and: Prisma.WebhookEndpointWhereInput[] = [];
  if (f.filter === 'failing') and.push({ failureCount: { gt: 0 } });
  if (f.filter === 'auto_disabled')
    and.push({ enabled: false, failureCount: { gte: AUTO_DISABLE_FAILURES }, adminDisabledAt: null });
  if (f.filter === 'admin_disabled') and.push({ adminDisabledAt: { not: null } });
  const handle = f.owner?.replace(/^@/, '');
  if (handle) and.push({ user: { handle: { equals: handle, mode: 'insensitive' } } });
  const host = f.host?.trim().toLowerCase();
  // A host is only a host: anything that could reach into the userinfo, the path or the query (and so probe a
  // token by search) matches nothing.
  if (host && /[/?#@\s\\]/.test(host)) and.push({ id: { in: [] } });
  else if (host) {
    // The host followed by the end of the authority, so "example.com" does not match "example.com.evil.test".
    const prefix = `https://${host}`;
    and.push({
      OR: [
        { url: { equals: prefix, mode: 'insensitive' } },
        ...['/', '?', '#'].map((c) => ({ url: { startsWith: `${prefix}${c}`, mode: 'insensitive' as const } })),
        // A port; not when the URL carries userinfo, whose first part would otherwise read as a host here.
        {
          AND: [
            { url: { startsWith: `${prefix}:`, mode: 'insensitive' as const } },
            { NOT: { url: { contains: '@' } } },
          ],
        },
      ],
    });
  }
  return { AND: and };
}

/**
 * The last 24 hours of deliveries for these endpoints in one grouped query over `webhook_delivery`, which the
 * `[endpointId, createdAt]` index serves. Counts, a failure rate and the median duration; never a payload.
 */
async function figuresFor(ids: string[], now: Date): Promise<Map<string, WebhookFigures>> {
  const out = new Map<string, WebhookFigures>();
  if (ids.length === 0) return out;
  const since = new Date(now.getTime() - FIGURES_WINDOW_MS);
  const rows = await prisma.$queryRaw<(FigureRow & { endpointId: string })[]>`
    SELECT "endpointId",
           COUNT(*) AS "total",
           COUNT(*) FILTER (WHERE "status"::text = 'DELIVERED') AS "delivered",
           COUNT(*) FILTER (WHERE "status"::text = 'FAILED') AS "failed",
           percentile_cont(0.5) WITHIN GROUP (ORDER BY "durationMs") FILTER (WHERE "durationMs" IS NOT NULL) AS "medianMs"
    FROM "webhook_delivery"
    WHERE "endpointId" = ANY(${ids}) AND "createdAt" >= ${since}
    GROUP BY "endpointId"`;
  for (const r of Array.isArray(rows) ? rows : []) out.set(r.endpointId, figuresFromRow(r));
  return out;
}

type Record_ = Prisma.WebhookEndpointGetPayload<{ select: typeof rowSelect }>;

function toRow(e: Record_, figures: WebhookFigures | undefined): AdminWebhookRow {
  return {
    id: e.id,
    owner: { id: e.user.id, handle: e.user.handle, name: e.user.name },
    url: redactWebhookUrl(e.url) ?? '',
    host: webhookHost(e.url) ?? '',
    events: e.events,
    status: webhookStatus(e),
    failureCount: e.failureCount,
    lastDeliveryAt: e.lastDeliveryAt?.toISOString() ?? null,
    createdAt: e.createdAt.toISOString(),
    figures: figures ?? NO_FIGURES,
    adminDisabledAt: e.adminDisabledAt?.toISOString() ?? null,
    adminDisabledReason: e.adminDisabledReason,
  };
}

async function rowsFor(records: Record_[], now: Date): Promise<AdminWebhookRow[]> {
  const figures = await figuresFor(
    records.map((r) => r.id),
    now,
  );
  return records.map((r) => toRow(r, figures.get(r.id)));
}

/** One page of endpoints, newest first (keyset on `createdAt desc, id desc`). `null` for a cursor this module did not issue. */
export async function listWebhooks(
  filters: WebhooksFilters,
  now: Date = new Date(),
): Promise<AdminWebhooksPage | null> {
  const cursor = decodeCursor(filters.cursor);
  if (cursor === null) return null;
  const where = baseWhere(filters);
  const and = [...((where.AND as Prisma.WebhookEndpointWhereInput[] | undefined) ?? [])];
  if (cursor) and.push({ OR: [{ createdAt: { lt: cursor.at } }, { createdAt: cursor.at, id: { lt: cursor.id } }] });
  const records = await prisma.webhookEndpoint.findMany({
    where: { AND: and },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: WEBHOOKS_PAGE_SIZE + 1,
    select: rowSelect,
  });
  const page = records.slice(0, WEBHOOKS_PAGE_SIZE);
  const last = page[page.length - 1];
  return {
    webhooks: await rowsFor(page, now),
    nextCursor: records.length > WEBHOOKS_PAGE_SIZE && last ? encodeCursor(last) : null,
  };
}

async function readRow(id: string, now: Date): Promise<AdminWebhookRow | null> {
  const record = await prisma.webhookEndpoint.findUnique({ where: { id }, select: rowSelect });
  if (!record) return null;
  const [row] = await rowsFor([record], now);
  return row ?? null;
}

/** One endpoint and its last 50 deliveries: event, status, response status, duration and redacted error text. */
export async function getWebhookDetail(id: string, now: Date = new Date()): Promise<AdminWebhookDetail | null> {
  const record = await prisma.webhookEndpoint.findUnique({ where: { id }, select: { ...rowSelect } });
  if (!record) return null;
  const [webhook] = await rowsFor([record], now);
  const deliveries = await prisma.webhookDelivery.findMany({
    where: { endpointId: id },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: WEBHOOK_DELIVERIES_SHOWN,
    select: {
      id: true,
      event: true,
      status: true,
      responseStatus: true,
      durationMs: true,
      error: true,
      createdAt: true,
    },
  });
  const rows: AdminDeliveryRow[] = deliveries.map((d) => ({
    id: d.id,
    event: d.event,
    status: d.status,
    responseStatus: d.responseStatus,
    durationMs: d.durationMs,
    error: adminErrorText(d.error, record.url),
    createdAt: d.createdAt.toISOString(),
  }));
  return webhook ? { webhook, deliveries: rows } : null;
}

export type WebhookChange = { ok: true; webhook: AdminWebhookRow } | { ok: false; status: 404 | 409; error: string };

class Refused extends Error {
  constructor(
    readonly status: 404 | 409,
    message: string,
  ) {
    super(message);
  }
}

/** What a cancelled delivery says. Ours, never the receiver's. */
export const CANCELLED_BY_ADMIN = 'endpoint disabled by an admin';

/**
 * Turn an endpoint off for its owner with a reason they read. In one transaction: the admin disable is set
 * (compare-and-set, so two admins cannot both win), `enabled` goes false, pending deliveries are cancelled and the
 * audit row is written; a failed audit write rolls the lot back. The owner's notice goes out after the commit and
 * never fails the change.
 */
export async function adminDisableWebhook(
  adminId: string,
  id: string,
  reason: string,
  now: Date = new Date(),
): Promise<WebhookChange> {
  let ownerId = '';
  let host = '';
  try {
    await prisma.$transaction(async (tx) => {
      const found = await tx.webhookEndpoint.findUnique({
        where: { id },
        select: { id: true, userId: true, url: true },
      });
      if (!found) throw new Refused(404, 'Webhook not found');
      const { count } = await tx.webhookEndpoint.updateMany({
        where: { id, adminDisabledAt: null },
        data: { adminDisabledAt: now, adminDisabledReason: reason, adminDisabledById: adminId, enabled: false },
      });
      if (count === 0) throw new Refused(409, 'This webhook is already turned off by an admin.');
      await tx.webhookDelivery.updateMany({
        where: { endpointId: id, status: 'PENDING' },
        data: { status: 'FAILED', error: CANCELLED_BY_ADMIN },
      });
      await recordAdminActionIn(tx, adminId, 'webhook.admin_disable', {
        targetType: 'webhook_endpoint',
        targetId: id,
        detail: `${redactWebhookUrl(found.url) ?? 'webhook'}: ${reason}`,
      });
      ownerId = found.userId;
      host = webhookHost(found.url) ?? '';
    });
  } catch (err) {
    if (err instanceof Refused) return { ok: false, status: err.status, error: err.message };
    throw err;
  }

  // Best effort: the change is committed, and createNotification applies the owner's preferences.
  await createNotification({
    userId: ownerId,
    type: 'SYSTEM',
    entityType: WEBHOOK_ADMIN_DISABLED_ENTITY,
    entityId: id,
    preview: notice('webhook-admin-disabled', { host, reason }),
    link: '/developer/webhooks',
  }).catch(() => {});
  return finish(id, now);
}

/**
 * Lift an admin disable. The endpoint stays off (`enabled` is not touched): the owner turns it on when they are
 * ready, so a backlog does not burst. Audited in the same transaction.
 */
export async function liftWebhookDisable(adminId: string, id: string, now: Date = new Date()): Promise<WebhookChange> {
  try {
    await prisma.$transaction(async (tx) => {
      const found = await tx.webhookEndpoint.findUnique({ where: { id }, select: { id: true, url: true } });
      if (!found) throw new Refused(404, 'Webhook not found');
      const { count } = await tx.webhookEndpoint.updateMany({
        where: { id, adminDisabledAt: { not: null } },
        data: { adminDisabledAt: null, adminDisabledReason: null, adminDisabledById: null },
      });
      if (count === 0) throw new Refused(409, 'This webhook is not turned off by an admin.');
      await recordAdminActionIn(tx, adminId, 'webhook.admin_lift', {
        targetType: 'webhook_endpoint',
        targetId: id,
        detail: redactWebhookUrl(found.url) ?? 'webhook',
      });
    });
  } catch (err) {
    if (err instanceof Refused) return { ok: false, status: err.status, error: err.message };
    throw err;
  }
  return finish(id, now);
}

async function finish(id: string, now: Date): Promise<WebhookChange> {
  const webhook = await readRow(id, now);
  return webhook ? { ok: true, webhook } : { ok: false, status: 404, error: 'Webhook not found' };
}
