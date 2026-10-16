import { createHash } from 'node:crypto';
import { prisma } from '@/lib/prisma.server';
import { normalizeMessage, topFrameOf } from './schema';

const MAX_GROUPS = 2_000;
const MAX_BUFFER = 100;
const release = () =>
  (process.env.RELEASE_SHA || process.env.GIT_SHA || process.env.SOURCE_COMMIT || 'unknown').slice(
    0,
    40,
  );

interface Pending {
  fingerprint: string;
  message: string;
  topFrame: string;
  source: string;
  sampleUrl: string;
  count: number;
}
const buffer = new Map<string, Pending>();
let timer: ReturnType<typeof setInterval> | null = null;

export function fingerprintOf(message: string, stack: string | undefined): string {
  return createHash('sha1')
    .update(`${normalizeMessage(message)}\n${topFrameOf(stack)}`)
    .digest('hex');
}

/** Buffer one beacon; flushed every 20s in a few statements. Never throws. */
export function recordClientError(e: {
  message: string;
  stack?: string;
  source?: string;
  url?: string;
}): void {
  const fingerprint = fingerprintOf(e.message, e.stack);
  const hit = buffer.get(fingerprint);
  if (hit) {
    hit.count++;
    return;
  }
  if (buffer.size >= MAX_BUFFER) return;
  buffer.set(fingerprint, {
    fingerprint,
    message: e.message.slice(0, 500),
    topFrame: topFrameOf(e.stack),
    source: (e.source ?? 'unknown').slice(0, 64),
    sampleUrl: (e.url ?? '').slice(0, 500),
    count: 1,
  });
  if (!timer) {
    timer = setInterval(() => void flushClientErrors(), 20_000);
    timer.unref?.();
  }
}

export async function flushClientErrors(): Promise<void> {
  if (buffer.size === 0) return;
  const batch = [...buffer.values()];
  buffer.clear();
  const rel = release();
  const now = new Date();
  try {
    const total = await prisma.clientErrorGroup.count();
    for (const p of batch) {
      const existing = await prisma.clientErrorGroup.findUnique({
        where: { fingerprint: p.fingerprint },
        select: { id: true, resolvedAt: true },
      });
      if (!existing) {
        if (total >= MAX_GROUPS) continue;
        await prisma.clientErrorGroup.upsert({
          where: { fingerprint: p.fingerprint },
          create: { ...p, firstRelease: rel, lastRelease: rel },
          update: { count: { increment: p.count }, lastSeenAt: now, lastRelease: rel },
        });
        continue;
      }
      await prisma.clientErrorGroup.update({
        where: { id: existing.id },
        data: {
          count: { increment: p.count },
          lastSeenAt: now,
          lastRelease: rel,
          // A resolved group that reappears has regressed.
          ...(existing.resolvedAt ? { resolvedAt: null, regressedAt: now } : {}),
        },
      });
    }
  } catch {
    /* the error sink must never take the request down */
  }
}

export async function listErrorGroups() {
  const rows = await prisma.clientErrorGroup.findMany({
    orderBy: { lastSeenAt: 'desc' },
    take: 100,
  });
  return rows.map((r) => ({
    id: r.id,
    message: r.message,
    topFrame: r.topFrame,
    source: r.source,
    sampleUrl: r.sampleUrl,
    count: r.count,
    firstSeenAt: r.firstSeenAt.toISOString(),
    lastSeenAt: r.lastSeenAt.toISOString(),
    firstRelease: r.firstRelease,
    lastRelease: r.lastRelease,
    resolved: r.resolvedAt !== null,
    regressed: r.regressedAt !== null && r.resolvedAt === null,
  }));
}

/** Resolve (or reopen) a group; a resolved group that reappears is flagged regressed. */
export async function setErrorResolved(id: string, resolved: boolean): Promise<boolean> {
  const res = await prisma.clientErrorGroup.updateMany({
    where: { id },
    data: resolved ? { resolvedAt: new Date(), regressedAt: null } : { resolvedAt: null },
  });
  return res.count > 0;
}
