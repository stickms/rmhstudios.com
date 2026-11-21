/**
 * The account security log, database half (see `security-log.ts` for the pure half).
 *
 * `recordSecurityEvent` is called from the auth hooks and the handle, deletion and merge paths. It is
 * built so that none of them can be hurt by it: it never throws, callers do not await it on the
 * sign-in path, and it stores nothing that identifies more than the existing coarse device label
 * ("Chrome on macOS") and the existing salted IP hash. No raw IP, no full user agent, no token.
 */

import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { hashIp } from '@/lib/hash-ip.server';
import { getClientIp } from '@/lib/rate-limit';
import {
  FILTER_KINDS,
  PAGE_SIZE,
  SECURITY_LOG_RETENTION_DAYS,
  isSecurityEventKind,
  sanitizeDetail,
  type CsvEventRow,
  type SecurityEventDetail,
  type SecurityEventKind,
  type SecurityFilter,
} from '@/lib/auth/security-log';
import type { SecurityActivityPage } from '@/lib/auth/security-log.contract';

export interface RecordSecurityEventInput {
  userId: string;
  kind: SecurityEventKind;
  /** The request the change came in on; its device and network are what is recorded. */
  request?: Request | null;
  /** The session the change was made from (the page marks it "This device"). */
  sessionId?: string | null;
  /** For an event about another session: that session's own device label, instead of the request's. */
  device?: string | null;
  detail?: SecurityEventDetail;
}

let warned = false;

/**
 * Append one event. Never throws and never rejects: a failed insert is logged once per process and
 * dropped, because a missing history row is better than a failed sign-in or a failed handle change.
 */
export async function recordSecurityEvent(input: RecordSecurityEventInput): Promise<void> {
  try {
    if (!input.userId || !isSecurityEventKind(input.kind)) return;
    let device: string | null = input.device ?? null;
    let ipHash: string | null = null;
    if (input.request) {
      if (device === null) {
        const { deviceFingerprintFromRequest } = await import('@/lib/auth/session-alert.server');
        device = deviceFingerprintFromRequest(input.request);
      }
      ipHash = hashIp(getClientIp(input.request));
    }
    await prisma.securityEvent.create({
      data: {
        userId: input.userId,
        kind: input.kind,
        device: device ? device.slice(0, 80) : null,
        ipHash,
        sessionId: input.sessionId ? input.sessionId.slice(0, 64) : null,
        detail: (sanitizeDetail(input.detail) as Prisma.InputJsonObject | null) ?? undefined,
      },
    });
  } catch (err) {
    if (!warned) {
      warned = true;
      console.error('[security-log] could not record an event (further failures are not logged):', err);
    }
  }
}

export interface ListSecurityEventsOptions {
  filter?: SecurityFilter;
  /** Id of the last row of the previous page. */
  cursor?: string;
  /** The session the list is read from: marks its events and anchors "same network". */
  currentSessionId?: string | null;
}

/** One page of a member's events, newest first, scoped to `userId`. */
export async function listSecurityEvents(
  userId: string,
  options: ListSecurityEventsOptions = {},
): Promise<SecurityActivityPage> {
  const { filter = 'all', cursor, currentSessionId = null } = options;
  const rows = await prisma.securityEvent.findMany({
    where: {
      userId,
      kind: { in: [...FILTER_KINDS[filter]] },
      ...(cursor ? { id: { lt: BigInt(cursor) } } : {}),
    },
    orderBy: { id: 'desc' },
    take: PAGE_SIZE + 1,
  });
  const page = rows.slice(0, PAGE_SIZE);

  let currentIpHash: string | null = null;
  if (currentSessionId) {
    const current = await prisma.session.findFirst({
      where: { id: currentSessionId, userId },
      select: { ipHash: true },
    });
    currentIpHash = current?.ipHash ?? null;
  }

  return {
    items: page.flatMap((row) =>
      isSecurityEventKind(row.kind)
        ? [
            {
              id: row.id.toString(),
              kind: row.kind,
              device: row.device,
              createdAt: row.createdAt.toISOString(),
              thisDevice: !!currentSessionId && row.sessionId === currentSessionId,
              // The hash is only compared here, never sent to the browser.
              sameNetwork: currentIpHash && row.ipHash ? row.ipHash === currentIpHash : null,
              detail: sanitizeDetail(row.detail),
            },
          ]
        : [],
    ),
    nextCursor: rows.length > PAGE_SIZE && page.length > 0 ? page[page.length - 1]!.id.toString() : null,
  };
}

/** Most rows a download or account export carries. */
const EXPORT_LIMIT = 20_000;

/**
 * Every event of a member, newest first, for the CSV download and the account export
 * (`/api/account/export`). The IP hash and session id stay on the server.
 */
export async function exportSecurityEvents(userId: string): Promise<CsvEventRow[]> {
  const rows = await prisma.securityEvent.findMany({
    where: { userId },
    orderBy: { id: 'desc' },
    take: EXPORT_LIMIT,
    select: { kind: true, device: true, detail: true, createdAt: true },
  });
  return rows;
}

const PRUNE_BATCH = 5_000;

/** Delete events older than `before`, 5,000 rows at a time. Returns how many were deleted. */
export async function pruneSecurityEvents(before: Date): Promise<number> {
  let total = 0;
  for (;;) {
    const batch = await prisma.securityEvent.findMany({
      where: { createdAt: { lt: before } },
      select: { id: true },
      orderBy: { id: 'asc' },
      take: PRUNE_BATCH,
    });
    if (batch.length === 0) break;
    const { count } = await prisma.securityEvent.deleteMany({
      where: { id: { in: batch.map((r) => r.id) } },
    });
    total += count;
    if (batch.length < PRUNE_BATCH) break;
  }
  return total;
}

export const SECURITY_LOG_PRUNE_QUEUE = 'security-log.prune';

/** Daily at 03:25 UTC, off the hour like the other crons. */
const PRUNE_CRON = '25 3 * * *';

export async function registerSecurityLogPrune(boss: {
  createQueue: (name: string, options?: object) => Promise<unknown>;
  schedule: (name: string, cron: string, data: object, options: object) => Promise<unknown>;
  work: (name: string, handler: () => Promise<void>) => Promise<unknown>;
}): Promise<void> {
  await boss.createQueue(SECURITY_LOG_PRUNE_QUEUE, { policy: 'exclusive' });
  await boss.schedule(SECURITY_LOG_PRUNE_QUEUE, PRUNE_CRON, {}, { tz: 'UTC' });
  await boss.work(SECURITY_LOG_PRUNE_QUEUE, async () => {
    const before = new Date(Date.now() - SECURITY_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    await pruneSecurityEvents(before);
  });
}
