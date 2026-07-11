/**
 * RMHHomes scraper — run the whole pipeline (server only).
 *
 * Loads the enabled sources, processes each one politely (sequential, with a
 * small delay between feeds), fans watch-alerts out for newly discovered
 * listings, and records a HomeScrapeRun row for observability. Never throws:
 * one bad source can't sink the run.
 *
 * `RunPrisma` is structural so tests drive it with an in-memory fake.
 */

import { processSource, type ProcessPrisma, type SourceRunStats } from './process-source';
import type { HomeProvider, HomeSourceConfig } from './types';

interface SourceRow {
  id: string;
  key: string;
  provider: string;
  label: string;
  region: string | null;
  category: string | null;
  url: string | null;
  listingType: string;
  defaultCity: string | null;
  defaultState: string | null;
  defaultLat: number | null;
  defaultLng: number | null;
}

export interface RunPrisma extends ProcessPrisma {
  homeSource: ProcessPrisma['homeSource'] & {
    findMany(args: { where: Record<string, unknown>; orderBy?: unknown }): Promise<SourceRow[]>;
  };
  homeScrapeRun: {
    create(args: { data: Record<string, unknown> }): Promise<{ id: string }>;
    update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<{ id: string }>;
  };
}

export interface RunResult {
  runId: string;
  sources: number;
  discovered: number;
  created: number;
  updated: number;
  expired: number;
  errors: number;
  durationMs: number;
}

function toConfig(row: SourceRow): HomeSourceConfig {
  return {
    id: row.id,
    key: row.key,
    provider: row.provider as HomeProvider,
    label: row.label,
    region: row.region,
    category: row.category,
    url: row.url,
    listingType: row.listingType === 'SALE' ? 'SALE' : 'RENT',
    defaultCity: row.defaultCity,
    defaultState: row.defaultState,
    defaultLat: row.defaultLat,
    defaultLng: row.defaultLng,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runHomesScrape(
  deps: {
    prisma: RunPrisma;
    fetchImpl?: typeof fetch;
    now?: Date;
    /** Delay between consecutive feeds (politeness). Default 500ms; tests pass 0. */
    sleepMs?: number;
    /** Fan-out for newly discovered listings (watch alerts). Best-effort. */
    onNewListing?: (listingId: string) => void | Promise<unknown>;
  },
  opts: { trigger: 'CRON' | 'MANUAL'; limitSources?: number } = { trigger: 'CRON' },
): Promise<RunResult> {
  const startMs = Date.now();
  const now = deps.now ?? new Date();

  const runRow = await deps.prisma.homeScrapeRun.create({
    data: { trigger: opts.trigger, startedAt: now },
  });
  const runId = runRow.id;

  let sources = await deps.prisma.homeSource.findMany({
    where: { status: { in: ['ACTIVE', 'ERROR'] } },
    orderBy: { createdAt: 'asc' },
  });
  if (opts.limitSources !== undefined) sources = sources.slice(0, opts.limitSources);

  const totals = { discovered: 0, created: 0, updated: 0, expired: 0, errors: 0 };
  const statsSummary: Array<Record<string, unknown>> = [];

  let first = true;
  for (const row of sources) {
    if (!first) await sleep(deps.sleepMs ?? 500);
    first = false;

    let stats: SourceRunStats;
    try {
      stats = await processSource(
        { prisma: deps.prisma, fetchImpl: deps.fetchImpl, now },
        toConfig(row),
      );
    } catch (err) {
      totals.errors++;
      statsSummary.push({
        sourceId: row.id,
        key: row.key,
        errored: true,
        errorMessage: err instanceof Error ? err.message : String(err),
      });
      continue;
    }

    totals.discovered += stats.discovered;
    totals.created += stats.created;
    totals.updated += stats.updated;
    totals.expired += stats.expired;
    if (stats.errored) totals.errors++;

    // Watch-alert fan-out for new listings (best-effort, never blocks the run).
    for (const id of stats.newListingIds) {
      try {
        await deps.onNewListing?.(id);
      } catch {
        // ignore notification failures
      }
    }

    statsSummary.push({
      sourceId: row.id,
      key: row.key,
      provider: row.provider,
      discovered: stats.discovered,
      created: stats.created,
      updated: stats.updated,
      expired: stats.expired,
      errored: stats.errored,
      blocked: stats.blocked,
      errorMessage: stats.errorMessage,
    });
  }

  const durationMs = Date.now() - startMs;

  await deps.prisma.homeScrapeRun.update({
    where: { id: runId },
    data: {
      finishedAt: deps.now ?? new Date(),
      discoveredCount: totals.discovered,
      createdCount: totals.created,
      updatedCount: totals.updated,
      expiredCount: totals.expired,
      errorCount: totals.errors,
      stats: statsSummary,
    },
  });

  return { runId, sources: sources.length, ...totals, durationMs };
}
