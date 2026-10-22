import { createHash, randomUUID } from 'node:crypto';
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
  const nowIso = new Date().toISOString();
  try {
    // perf: this was a findUnique + upsert/update per fingerprint, serially
    // (up to 100 round trips per flush). Now one statement for the whole batch.
    const total = await prisma.clientErrorGroup.count();
    if (total >= MAX_GROUPS) {
      // Group table is full: existing fingerprints still accumulate, new ones
      // are dropped (the same cap the per-row path applied).
      await prisma.$executeRaw`
        UPDATE "client_error_group" g SET
          "count" = g."count" + t."cnt",
          "lastSeenAt" = ${nowIso}::timestamp,
          "lastRelease" = ${rel},
          "regressedAt" = CASE WHEN g."resolvedAt" IS NOT NULL THEN ${nowIso}::timestamp ELSE g."regressedAt" END,
          "resolvedAt" = NULL
        FROM unnest(${batch.map((p) => p.fingerprint)}::text[], ${batch.map((p) => p.count)}::int[]) AS t("fp", "cnt")
        WHERE g."fingerprint" = t."fp"`;
      return;
    }
    await prisma.$executeRaw`
      INSERT INTO "client_error_group"
        ("id", "fingerprint", "message", "topFrame", "source", "sampleUrl", "count",
         "firstSeenAt", "lastSeenAt", "firstRelease", "lastRelease")
      SELECT t."id", t."fp", t."msg", t."frame", t."src", t."url", t."cnt",
             ${nowIso}::timestamp, ${nowIso}::timestamp, ${rel}, ${rel}
      FROM unnest(
        ${batch.map(() => randomUUID())}::text[],
        ${batch.map((p) => p.fingerprint)}::text[],
        ${batch.map((p) => p.message)}::text[],
        ${batch.map((p) => p.topFrame)}::text[],
        ${batch.map((p) => p.source)}::text[],
        ${batch.map((p) => p.sampleUrl)}::text[],
        ${batch.map((p) => p.count)}::int[]
      ) AS t("id", "fp", "msg", "frame", "src", "url", "cnt")
      ON CONFLICT ("fingerprint") DO UPDATE SET
        "count" = "client_error_group"."count" + EXCLUDED."count",
        "lastSeenAt" = EXCLUDED."lastSeenAt",
        "lastRelease" = EXCLUDED."lastRelease",
        -- A resolved group that reappears has regressed (RHS reads the OLD row).
        "regressedAt" = CASE WHEN "client_error_group"."resolvedAt" IS NOT NULL
                             THEN EXCLUDED."lastSeenAt" ELSE "client_error_group"."regressedAt" END,
        "resolvedAt" = NULL`;
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
