/**
 * RMHVibe gallery-thumbnail worker (D3: ported from the Go worker `internal/vibeworker`,
 * which ported the original Node worker). Server-only; runs in the `jobs` worker as a
 * pg-boss cron.
 *
 * Generated vibe pages are arbitrary interactive HTML. This renders the saved HTML once
 * in headless Chromium, screenshots it, downscales it to a WebP and uploads
 * `vibe-thumbs/<slug>.webp` to object storage. The render itself is
 * `captureVibeThumbnail` (./vibe-screenshot.server): Playwright against the OS Chromium
 * (PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, set in the image), a 1200x750 viewport, a 10 s
 * navigation deadline, a 1.5 s settle, a request allowlist, sharp resize to 640 px.
 *
 *   vibe-worker.thumbnails   every minute: select up to 5 `thumbnailStale` pages (oldest
 *                             first), render each, then clear the flag with optimistic
 *                             concurrency. Also once at boot.
 *
 * Per page, as in the Go worker:
 *   - render failed (or the upload did): the row is untouched, still stale, retried next tick;
 *   - rendered and `updatedAt` is unchanged since the row was read: stale = false and
 *     thumbnailUrl = the cache-busted URL, in one conditional UPDATE;
 *   - rendered but the page changed meanwhile: only thumbnailUrl is recorded, the page stays
 *     stale so the latest content re-renders next tick. (Both UPDATEs are raw SQL so the
 *     `@updatedAt` column is not bumped, exactly like the Go worker's.)
 *
 * The queue uses the `exclusive` policy, which is the old per-tick reentrancy guard, and
 * `retryLimit: 0`: a tick swallows its own errors and never throws, so pg-boss never retries.
 * Unlike the Go worker there is no 10 s poll: pg-boss cron is one-minute granular, so a tick
 * keeps taking batches while a full batch had at least one success (bounded by
 * RUN_BUDGET_MS) instead of sleeping between passes. A new stale page waits at most a minute.
 *
 * Not ported: Prometheus `RecordJob` counters (`vibe_thumbnails` ok / partial / error /
 * panic) are structured `vibe_worker.run` log lines instead. There was no freshness limit for
 * this worker in the status service, so nothing there moved.
 */
import { prisma } from '@/lib/prisma.server';

export const VIBE_THUMB_QUEUE = 'vibe-worker.thumbnails';
export const VIBE_THUMB_CRON = '* * * * *';
/** Pages rendered per pass (the Go `batchSize`). */
export const VIBE_THUMB_BATCH = 5;
/** Soft cap on one tick, so an exclusive job never runs into the next minute's tick for long. */
export const VIBE_THUMB_RUN_BUDGET_MS = 50_000;

export interface StalePage {
  id: string;
  slug: string;
  html: string;
  updatedAt: Date;
}

export interface VibeThumbRepo {
  /** Up to `limit` stale pages, oldest first. */
  selectStale(limit: number): Promise<StalePage[]>;
  /** Clear the flag and record the URL only if `updatedAt` still equals `expectedUpdatedAt`. */
  clearStale(id: string, thumbnailUrl: string, expectedUpdatedAt: Date): Promise<boolean>;
  /** Record a URL without clearing the flag (the page changed mid-render). */
  setThumbnailUrl(id: string, thumbnailUrl: string): Promise<void>;
}

/** Render + upload; resolves to the public URL or null on any failure. */
export type VibeCapture = (slug: string, html: string) => Promise<string | null>;

export type VibeRunOutcome = 'ok' | 'partial' | 'error';

export const prismaVibeThumbRepo: VibeThumbRepo = {
  async selectStale(limit) {
    return prisma.vibePage.findMany({
      where: { thumbnailStale: true },
      orderBy: { updatedAt: 'asc' },
      take: limit,
      select: { id: true, slug: true, html: true, updatedAt: true },
    });
  },
  async clearStale(id, thumbnailUrl, expectedUpdatedAt) {
    const n = await prisma.$executeRaw`
      UPDATE "vibe_page"
         SET "thumbnailStale" = false, "thumbnailUrl" = ${thumbnailUrl}
       WHERE "id" = ${id} AND "updatedAt" = ${expectedUpdatedAt}`;
    return n > 0;
  },
  async setThumbnailUrl(id, thumbnailUrl) {
    await prisma.$executeRaw`
      UPDATE "vibe_page" SET "thumbnailUrl" = ${thumbnailUrl} WHERE "id" = ${id}`;
  },
};

/** The production capturer: Playwright is only loaded (lazily) when a page really needs rendering. */
export const defaultVibeCapture: VibeCapture = async (slug, html) => {
  const { captureVibeThumbnail } = await import('./vibe-screenshot.server');
  return captureVibeThumbnail(slug, html);
};

/** Close the shared browser at shutdown (a no-op when nothing was ever rendered). */
export async function closeVibeThumbnailBrowser(): Promise<void> {
  const mod = await import('./vibe-screenshot.server');
  await mod.closeVibeBrowser();
}

type VibeLog = Pick<Console, 'info' | 'warn' | 'error'>;

export interface VibeThumbDeps {
  repo?: VibeThumbRepo;
  capture?: VibeCapture;
  log?: VibeLog;
  now?: () => number;
  budgetMs?: number;
}

/**
 * Render one page and persist the result. True when the screenshot was produced and the
 * URL recorded (a mid-render change still counts: a thumbnail URL was stored).
 */
export async function renderStalePage(
  page: StalePage,
  repo: VibeThumbRepo,
  capture: VibeCapture,
  log: VibeLog,
): Promise<boolean> {
  let url: string | null;
  try {
    url = await capture(page.slug, page.html);
  } catch (err) {
    log.error(`[vibe-worker] capture failed slug=${page.slug} err=${(err as Error)?.message}`);
    return false;
  }
  if (!url) {
    // Leave the page stale so it retries next tick.
    log.error(`[vibe-worker] capture failed slug=${page.slug}`);
    return false;
  }

  let cleared: boolean;
  try {
    cleared = await repo.clearStale(page.id, url, page.updatedAt);
  } catch (err) {
    log.error(`[vibe-worker] clear-stale failed slug=${page.slug} err=${(err as Error)?.message}`);
    return false;
  }
  if (cleared) {
    log.info(`[vibe-worker] rendered slug=${page.slug}`);
    return true;
  }

  // Changed mid-render: still record the URL so the gallery shows something, but keep it
  // stale so the latest content gets re-rendered.
  try {
    await repo.setThumbnailUrl(page.id, url);
  } catch (err) {
    log.warn(
      `[vibe-worker] set-thumbnail (mid-render) failed slug=${page.slug} err=${(err as Error)?.message}`,
    );
    return false;
  }
  log.info(`[vibe-worker] changed mid-render, will re-render slug=${page.slug}`);
  return true;
}

/**
 * One pass over a batch of stale pages. Outcome as in the Go worker: `ok` for an empty batch
 * or all succeeded, `error` when at least one was attempted and none succeeded, else `partial`.
 */
export async function processStaleBatch(
  deps: VibeThumbDeps = {},
): Promise<{ attempted: number; succeeded: number; outcome: VibeRunOutcome }> {
  const repo = deps.repo ?? prismaVibeThumbRepo;
  const capture = deps.capture ?? defaultVibeCapture;
  const log = deps.log ?? console;

  const pages = await repo.selectStale(VIBE_THUMB_BATCH);
  let attempted = 0;
  let succeeded = 0;
  for (const page of pages) {
    attempted++;
    if (await renderStalePage(page, repo, capture, log)) succeeded++;
  }
  const outcome: VibeRunOutcome =
    attempted === 0 || succeeded === attempted ? 'ok' : succeeded === 0 ? 'error' : 'partial';
  return { attempted, succeeded, outcome };
}

/**
 * One cron tick: batches until the queue is empty, a batch made no progress (so a broken page
 * is not hammered), or the time budget is spent. Never throws (a selection failure is logged
 * and counted as `error`; a panic-equivalent is caught the same way).
 */
export async function runVibeThumbnailTick(deps: VibeThumbDeps = {}): Promise<VibeRunOutcome> {
  const log = deps.log ?? console;
  const now = deps.now ?? Date.now;
  const budget = deps.budgetMs ?? VIBE_THUMB_RUN_BUDGET_MS;
  const started = now();
  let worst: VibeRunOutcome = 'ok';
  let rendered = 0;
  try {
    for (;;) {
      const pass = await processStaleBatch(deps);
      rendered += pass.succeeded;
      if (pass.outcome === 'error') worst = 'error';
      else if (pass.outcome === 'partial' && worst === 'ok') worst = 'partial';
      const fullBatch = pass.attempted === VIBE_THUMB_BATCH;
      if (!fullBatch || pass.succeeded === 0 || now() - started >= budget) break;
    }
  } catch (err) {
    log.error(`[vibe-worker] poll failed err=${(err as Error)?.message}`);
    worst = 'error';
  }
  log.info(`[vibe-worker] run outcome=${worst} rendered=${rendered}`);
  return worst;
}

interface BossLike {
  createQueue: (name: string, options?: object) => Promise<unknown>;
  schedule: (name: string, cron: string, data: object, options: object) => Promise<unknown>;
  work: (name: string, handler: () => Promise<void>) => Promise<unknown>;
  send?: (name: string, data: object, options?: object) => Promise<unknown>;
}

/**
 * Create the queue, schedule the cron and attach the worker. The Go worker always ran (it
 * had no idle condition); a missing Chromium only means pages stay stale, as before.
 */
export async function registerVibeThumbnailCron(boss: BossLike): Promise<void> {
  // retryLimit 0: a tick swallows its own errors; a render batch can outlast the 15 min default
  // expiry only in a pathological case, so give it room rather than let pg-boss re-run it.
  await boss.createQueue(VIBE_THUMB_QUEUE, {
    policy: 'exclusive',
    retryLimit: 0,
    expireInSeconds: 10 * 60,
  });
  await boss.schedule(VIBE_THUMB_QUEUE, VIBE_THUMB_CRON, {}, { tz: 'UTC' });
  await boss.work(VIBE_THUMB_QUEUE, async () => {
    await runVibeThumbnailTick();
  });
  // The Go worker ran one pass immediately at start, before its ticker.
  await boss.send?.(VIBE_THUMB_QUEUE, {}).catch(() => undefined);
}
