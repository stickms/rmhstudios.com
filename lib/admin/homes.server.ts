/**
 * The server half of /admin/homes: every RMHHomes scrape source with its state and last error, the last 20 runs, and
 * the audited actions: pause or resume a source (a compare-and-set on the status the admin saw), add an RSS feed
 * (https, through the SSRF guard) and queue one MANUAL scrape. Admin routes only.
 *
 * The feed URL leaves this module as a host and path only (`feedLabel`): a feed's access key often rides in its query.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { recordAdminActionIn } from '@/lib/admin-audit.server';
import { getBoss } from '@/lib/jobs/boss.server';
import { assertPublicHttpsUrl, SsrfError } from '@/lib/ssrf-guard.server';
import { HOMES_SCRAPE_QUEUE } from '@/lib/homes/scrape/trigger';
import type { ErrorCode } from '@/lib/errors/codes';
import {
  RUNS_SHOWN,
  STATUS_AUDIT_ACTION,
  canApplyAction,
  checkFeedUrl,
  feedLabel,
  lastErrorText,
  runDurationMs,
  sortSources,
  statusAfter,
  type AdminHomeRun,
  type AdminHomeSource,
  type AdminHomesPage,
  type HomeListingTypeName,
  type HomeRunTrigger,
  type HomeSourceProvider,
  type HomeSourceStatus,
  type StatusAction,
} from '@/lib/admin/homes';

/** The only source columns an admin read selects. */
const sourceSelect = {
  id: true,
  key: true,
  provider: true,
  label: true,
  listingType: true,
  url: true,
  status: true,
  lastError: true,
  lastRunAt: true,
  lastSuccessAt: true,
} satisfies Prisma.HomeSourceSelect;

type SourceRecord = Prisma.HomeSourceGetPayload<{ select: typeof sourceSelect }>;

function toSource(r: SourceRecord, activeListings: number): AdminHomeSource {
  return {
    id: r.id,
    key: r.key,
    provider: r.provider as HomeSourceProvider,
    label: r.label,
    listingType: r.listingType as HomeListingTypeName,
    status: r.status as HomeSourceStatus,
    feed: feedLabel(r.url),
    lastError: lastErrorText(r.lastError),
    lastRunAt: r.lastRunAt?.toISOString() ?? null,
    lastSuccessAt: r.lastSuccessAt?.toISOString() ?? null,
    activeListings,
  };
}

/** Active external listings per source, in one grouped read. */
async function activeCounts(ids: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (ids.length === 0) return out;
  const groups = await prisma.homeListing.groupBy({
    by: ['sourceRefId'],
    where: { source: 'EXTERNAL', status: 'ACTIVE', sourceRefId: { in: ids } },
    _count: { _all: true },
  });
  for (const g of Array.isArray(groups) ? groups : []) {
    if (g.sourceRefId) out.set(g.sourceRefId, g._count._all);
  }
  return out;
}

/** Every source: `ERROR` and `BLOCKED` first, with the number of active external listings each one has. */
export async function listSources(): Promise<AdminHomeSource[]> {
  const records = await prisma.homeSource.findMany({ select: sourceSelect });
  const counts = await activeCounts(records.map((r) => r.id));
  return sortSources(records.map((r) => toSource(r, counts.get(r.id) ?? 0)));
}

/** The last 20 scrape runs, newest first. */
export async function listRuns(): Promise<AdminHomeRun[]> {
  const runs = await prisma.homeScrapeRun.findMany({
    orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
    take: RUNS_SHOWN,
    select: {
      id: true,
      trigger: true,
      startedAt: true,
      finishedAt: true,
      discoveredCount: true,
      createdCount: true,
      updatedCount: true,
      expiredCount: true,
      errorCount: true,
    },
  });
  return runs.map((r) => ({
    id: r.id,
    trigger: r.trigger as HomeRunTrigger,
    startedAt: r.startedAt.toISOString(),
    finishedAt: r.finishedAt?.toISOString() ?? null,
    durationMs: runDurationMs(r.startedAt, r.finishedAt),
    discovered: r.discoveredCount,
    created: r.createdCount,
    updated: r.updatedCount,
    expired: r.expiredCount,
    errors: r.errorCount,
  }));
}

export async function getHomesPage(): Promise<AdminHomesPage> {
  const [sources, runs] = await Promise.all([listSources(), listRuns()]);
  return { sources, runs };
}

/** A refusal the endpoint answers with `refusalBody(code)` and the code's own HTTP status. */
export type HomesRefusal = { ok: false; code: ErrorCode };
export type HomesChange = { ok: true; source: AdminHomeSource } | HomesRefusal;

class Refused extends Error {
  constructor(readonly code: ErrorCode) {
    super(code);
  }
}

async function readSource(id: string): Promise<AdminHomeSource | null> {
  const record = await prisma.homeSource.findUnique({ where: { id }, select: sourceSelect });
  if (!record) return null;
  const counts = await activeCounts([id]);
  return toSource(record, counts.get(id) ?? 0);
}

/**
 * Pause or resume one source. The write is one `updateMany` whose `where` names the status the admin saw, so two
 * admins (or an admin and the scraper) cannot both win: a stale `seen` writes nothing and answers `CONFLICT`. Pausing
 * leaves the source's listings alone (the scraper's own expiry still applies to them); resuming clears `lastError`.
 * The audit row is written in the same transaction.
 */
export async function setSourceStatus(
  adminId: string,
  id: string,
  action: StatusAction,
  seen: HomeSourceStatus,
): Promise<HomesChange> {
  if (!canApplyAction(action, seen)) return { ok: false, code: 'INVALID_INPUT' };
  const next = statusAfter(action);
  try {
    await prisma.$transaction(async (tx) => {
      const found = await tx.homeSource.findUnique({ where: { id }, select: { id: true, label: true } });
      if (!found) throw new Refused('NOT_FOUND');
      const { count } = await tx.homeSource.updateMany({
        where: { id, status: seen },
        data: action === 'pause' ? { status: next } : { status: next, lastError: null },
      });
      if (count === 0) throw new Refused('CONFLICT');
      await recordAdminActionIn(tx, adminId, STATUS_AUDIT_ACTION[action], {
        targetType: 'home_source',
        targetId: id,
        detail: `${found.label}: ${seen} to ${next}`,
      });
    });
  } catch (err) {
    if (err instanceof Refused) return { ok: false, code: err.code };
    throw err;
  }
  const source = await readSource(id);
  return source ? { ok: true, source } : { ok: false, code: 'NOT_FOUND' };
}

export interface NewRssSource {
  label: string;
  url: string;
  listingType: HomeListingTypeName;
  defaultCity?: string | undefined;
  defaultState?: string | undefined;
  defaultLat?: number | undefined;
  defaultLng?: number | undefined;
}

/**
 * Add an RSS feed. The URL must be `https:` and pass the SSRF guard (every address it resolves to is public) before it
 * is stored; the adapter checks again when it fetches. The key is `rss:<host><path>` and must be new.
 */
export async function addRssSource(adminId: string, input: NewRssSource): Promise<HomesChange> {
  const checked = checkFeedUrl(input.url);
  if (!checked.ok) return { ok: false, code: 'HOME_SOURCE_URL_UNSAFE' };
  try {
    await assertPublicHttpsUrl(checked.url);
  } catch (err) {
    if (err instanceof SsrfError) return { ok: false, code: 'HOME_SOURCE_URL_UNSAFE' };
    throw err;
  }

  let id = '';
  try {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.homeSource.findUnique({ where: { key: checked.key }, select: { id: true } });
      if (existing) throw new Refused('HOME_SOURCE_EXISTS');
      const created = await tx.homeSource.create({
        data: {
          key: checked.key,
          provider: 'RSS',
          label: input.label,
          url: checked.url,
          listingType: input.listingType,
          defaultCity: input.defaultCity || null,
          defaultState: input.defaultState || null,
          defaultLat: input.defaultLat ?? null,
          defaultLng: input.defaultLng ?? null,
        },
        select: { id: true },
      });
      id = created.id;
      await recordAdminActionIn(tx, adminId, 'homes.source.add', {
        targetType: 'home_source',
        targetId: id,
        detail: `${input.label}: ${checked.key}`,
      });
    });
  } catch (err) {
    if (err instanceof Refused) return { ok: false, code: err.code };
    // Two admins adding the same feed at once: the unique key is the last word.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return { ok: false, code: 'HOME_SOURCE_EXISTS' };
    }
    throw err;
  }
  const source = await readSource(id);
  return source ? { ok: true, source } : { ok: false, code: 'NOT_FOUND' };
}

/** `unavailable`: the queue cannot be reached (no database URL, pg-boss down, or the worker has not created the queue). */
export type ScrapeQueued = { ok: true } | HomesRefusal | { ok: false; unavailable: true };

/** Words pg-boss uses when a queue policy turns a second `send` away. */
const POLICY_REFUSAL = /policy|exclusive|could not be created/i;

/**
 * Queue one `homes.scrape` job with `{ trigger: 'MANUAL', by }`, which the homes worker passes to the run. The queue's
 * `exclusive` policy keeps one scrape queued or active, so a second press answers `HOME_SCRAPE_QUEUED`. The send is
 * outside any database transaction; the audit row is written after it, once there is a job to name.
 */
export async function queueScrape(adminId: string): Promise<ScrapeQueued> {
  const boss = await getBoss();
  if (!boss) return { ok: false, unavailable: true };
  // The worker creates the queue when it starts; before that there is nothing to send to.
  if ((await boss.getQueue(HOMES_SCRAPE_QUEUE)) === null) return { ok: false, unavailable: true };
  let jobId: string | null;
  try {
    jobId = await boss.send(HOMES_SCRAPE_QUEUE, { trigger: 'MANUAL', by: adminId });
  } catch (err) {
    if (err instanceof Error && POLICY_REFUSAL.test(err.message)) return { ok: false, code: 'HOME_SCRAPE_QUEUED' };
    throw err;
  }
  if (jobId === null) return { ok: false, code: 'HOME_SCRAPE_QUEUED' };
  await prisma.$transaction(async (tx) => {
    await recordAdminActionIn(tx, adminId, 'homes.scrape.run', {
      targetType: 'home_scrape',
      targetId: jobId,
      detail: 'Manual scrape queued',
    });
  });
  return { ok: true };
}
