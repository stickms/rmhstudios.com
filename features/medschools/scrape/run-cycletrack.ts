/**
 * The hourly CycleTrack job: stamp short-circuit, first-dates, then a
 * sequential walk of every active school with a CYCLETRACK alias.
 *
 * Never throws. `MedSourceRun.stats` holds counters only, never page bodies.
 */
import { normalizeSchoolKey } from '../engine/names';
import {
  parseFirstTable,
  parseSchoolPage,
  schoolUrl,
  UnexpectedPageError,
  type ParsedSchoolPage,
} from './adapters/cycletrack';
import { SourceHaltedError, type PoliteHost } from './http';
import { ingestSchoolPage } from './ingest-page';
import { brief, pickWalkTargets } from './run-support';
import type { Logger, MedPrisma } from './types';

export interface CycletrackDeps {
  prisma: MedPrisma;
  host: PoliteHost;
  shouldStop(): boolean;
  log: Logger;
  now?: () => Date;
}

export interface RunSummary {
  runId: string;
  status: 'OK' | 'PARTIAL' | 'FAILED';
  schools: number;
  skippedUnchanged: boolean;
  created: number;
  updated: number;
  deleted: number;
  misses: number;
  requests: number;
  durationMs: number;
}

/** Targets fetched at most while looking for the first parseable page (1 + 3 extra requests). */
const MAX_STAMP_PROBES = 4;
const FIRST_PATH = '/explorer/first';
const toDbDate = (date: string | null): Date | null => (date === null ? null : new Date(`${date}T00:00:00.000Z`));
export async function runCycletrack(
  deps: CycletrackDeps,
  opts: {
    trigger: 'CRON' | 'MANUAL' | 'BOOTSTRAP';
  },
): Promise<RunSummary> {
  const { prisma, host, log } = deps;
  const now = deps.now ?? (() => new Date());
  const t0 = now().getTime();

  try {
    // The queue is exclusive and the tick guarded, so an older RUNNING row is a killed predecessor.
    for (let n = 0; n < 50; n++) {
      const stale = await prisma.medSourceRun.findFirst({
        where: {
          source: 'CYCLETRACK',
          job: 'cycletrack',
          status: 'RUNNING',
        },
      });
      if (!stale) break;
      await prisma.medSourceRun.update({
        where: {
          id: stale.id,
        },
        data: {
          status: 'FAILED',
          finishedAt: now(),
          error: 'interrupted',
        },
      });
    }
  } catch (e) {
    log.warn(`cycletrack: could not close stale runs: ${brief(e)}`);
  }

  let run: {
    id: string;
  };
  try {
    run = await prisma.medSourceRun.create({
      data: {
        source: 'CYCLETRACK',
        job: 'cycletrack',
        trigger: opts.trigger,
        status: 'RUNNING',
      },
    });
  } catch (e) {
    log.error(`cycletrack: could not open run: ${brief(e)}`);
    return {
      runId: '',
      status: 'FAILED',
      schools: 0,
      skippedUnchanged: false,
      created: 0,
      updated: 0,
      deleted: 0,
      misses: 0,
      requests: 0,
      durationMs: now().getTime() - t0,
    };
  }
  const client = host.session();

  const summary: RunSummary = {
    runId: run.id,
    status: 'FAILED',
    schools: 0,
    skippedUnchanged: false,
    created: 0,
    updated: 0,
    deleted: 0,
    misses: 0,
    requests: 0,
    durationMs: 0,
  };
  const stats: Record<string, unknown> = {};
  let error: string | null = null;

  try {
    const prev = await prisma.medSourceRun.findFirst({
      where: {
        source: 'CYCLETRACK',
        job: 'cycletrack',
        status: {
          in: ['OK', 'PARTIAL'],
        },
      },
      orderBy: {
        startedAt: 'desc',
      },
    });
    const prevStats = (prev?.stats ?? null) as {
      completedStamp?: unknown;
    } | null;
    const completedStamp = typeof prevStats?.completedStamp === 'string' ? prevStats.completedStamp : null;

    const aliases = await prisma.medSchoolAlias.findMany({
      where: {
        source: 'CYCLETRACK',
      },
    });
    const activeSchools = await prisma.medSchool.findMany({
      where: {
        active: true,
      },
    });
    const activeIds = new Set(activeSchools.map((s) => s.id));
    const keyToSchool = new Map(aliases.map((a) => [normalizeSchoolKey(a.sourceKey), a.schoolId]));
    const { targets, duplicates } = pickWalkTargets(aliases, activeIds);
    if (duplicates.length > 0) {
      stats.duplicateAliases = duplicates;
      log.warn(
        `cycletrack: skipped ${duplicates.length} duplicate CYCLETRACK alias key(s) (a school keeps its first key): ${duplicates.join(', ')}`,
      );
    }
    summary.schools = targets.length;

    let ingested = 0;
    let failed = 0;
    let firstRequestFailed = false;
    let stopped = false;
    let halted = false;
    let firstStamp: string | null = null;
    const skippedKeys: string[] = [];
    let lastHttpFailed = false;
    let zeroTablePages = 0;
    let parsedPages = 0;
    /** Pages fetched while looking for a stamp, by target index (null = skipped). */
    const probed = new Map<number, ParsedSchoolPage | null>();

    /** Fetch and parse one school page. `null` means skipped (already counted). */
    const fetchPage = async (key: string): Promise<ParsedSchoolPage | null> => {
      const res = await client.get(schoolUrl(key));
      lastHttpFailed = !res.ok;
      if (!res.ok) {
        failed++;
        skippedKeys.push(key);
        log.warn(`cycletrack: ${key} unavailable (HTTP ${res.status})`);
        return null;
      }
      try {
        const parsed = parseSchoolPage(res.body, normalizeSchoolKey(key));
        parsedPages++;
        if (parsed.tables.length === 0) zeroTablePages++;
        return parsed;
      } catch (e) {
        if (e instanceof UnexpectedPageError) {
          client.noteFailure('unexpected page');
          failed++;
          log.warn(`cycletrack: ${key} unexpected page: ${brief(e)}`);
          return null;
        }
        throw e;
      }
    };

    try {
      if (targets.length > 0) {
        // The stamp comes from the first page that parses. A 404 or a robots refusal on the
        // alphabetically first school must not leave the run stampless (it would then re-walk every
        // page each hour), so probe a few more targets, bounded, before giving up.
        for (let i = 0; i < Math.min(targets.length, MAX_STAMP_PROBES); i++) {
          const page = await fetchPage(targets[i]!.sourceKey);
          probed.set(i, page);
          firstRequestFailed = lastHttpFailed;
          if (page !== null) {
            firstStamp = page.sourceStamp;
            break;
          }
        }
        if (firstStamp !== null && firstStamp === completedStamp) {
          client.noteSuccess();
          summary.skippedUnchanged = true;
          stats.completedStamp = completedStamp;
        }
      }

      if (!summary.skippedUnchanged) {
        // First-dates: one request, failure never aborts the walk.
        try {
          const res = await client.get(FIRST_PATH);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const parsed = parseFirstTable(res.body);
          for (const row of parsed.rows) {
            const schoolId = keyToSchool.get(row.key);
            if (schoolId === undefined) {
              await prisma.medSchoolAliasMiss.upsert({
                where: {
                  source_sourceKey: {
                    source: 'CYCLETRACK',
                    sourceKey: row.key,
                  },
                },
                create: {
                  source: 'CYCLETRACK',
                  sourceKey: row.key,
                  seenCount: 1,
                },
                update: {
                  lastSeenAt: now(),
                  seenCount: {
                    increment: 1,
                  },
                },
              });
              summary.misses++;
              continue;
            }
            if (!activeIds.has(schoolId)) continue;
            for (const [program, d] of [
              ['REG', row.reg],
              ['PHD', row.phd],
            ] as const) {
              const dates = {
                firstSecondaryOn: toDbDate(d.secondaryOn),
                firstInterviewOn: toDbDate(d.interviewOn),
                firstAcceptanceOn: toDbDate(d.acceptanceOn),
              };
              await prisma.medSchoolStats.upsert({
                where: {
                  schoolId_program_cycleYear_source_residence: {
                    schoolId,
                    program,
                    cycleYear: parsed.cycleYear,
                    source: 'CYCLETRACK',
                    residence: 'GLOBAL',
                  },
                },
                create: {
                  schoolId,
                  program,
                  cycleYear: parsed.cycleYear,
                  source: 'CYCLETRACK',
                  residence: 'GLOBAL',
                  ...dates,
                },
                update: dates,
              });
            }
          }
        } catch (e) {
          stats.firstDatesError = brief(e);
          log.warn(`cycletrack: first-dates failed: ${brief(e)}`);
        }

        for (let i = 0; i < targets.length; i++) {
          if (deps.shouldStop()) {
            stopped = true;
            break;
          }
          if (client.halted) {
            halted = true;
            break;
          }
          const target = targets[i]!;
          const page = probed.has(i) ? probed.get(i)! : await fetchPage(target.sourceKey);
          if (page === null) continue;
          try {
            const r = await ingestSchoolPage(prisma, target.schoolId, page);
            summary.created += r.created;
            summary.updated += r.updated;
            summary.deleted += r.deleted;
            ingested++;
            client.noteSuccess();
          } catch (e) {
            failed++;
            log.error(`cycletrack: ingest ${target.sourceKey} failed: ${brief(e)}`);
          }
        }
      }
    } catch (e) {
      if (e instanceof SourceHaltedError) {
        halted = true;
        error = brief(e);
      } else {
        throw e;
      }
    }

    if (halted && error === null) error = brief(client.lastFailure ?? 'source halted');
    const complete = !stopped && !halted;
    // 404/robots skips leave the walk complete: the stamp is still stored so an unchanged hour short-circuits.
    const clean = complete && failed === 0;
    const walkedAll = complete && failed === skippedKeys.length;
    // A reworded caption would otherwise parse every page "successfully" and write nothing.
    const noTables = !summary.skippedUnchanged && complete && parsedPages > 0 && zeroTablePages === parsedPages;
    if (noTables) {
      summary.status = 'PARTIAL';
      if (error === null) error = 'no tables parsed';
    } else if (summary.skippedUnchanged) {
      summary.status = 'OK';
    } else if (clean) {
      summary.status = 'OK';
      if (firstStamp !== null) stats.completedStamp = firstStamp;
    } else if (ingested === 0 && firstRequestFailed && !stopped) {
      summary.status = 'FAILED';
    } else {
      summary.status = 'PARTIAL';
    }
    if (!noTables && !clean && walkedAll && firstStamp !== null && summary.status === 'PARTIAL')
      stats.completedStamp = firstStamp;
    if (skippedKeys.length > 0) stats.skipped = skippedKeys.slice(0, 50);
    stats.zeroTablePages = zeroTablePages;
    stats.ingested = ingested;
    stats.failed = failed;
    if (stopped) stats.stopped = true;
    if (halted) stats.halted = true;
  } catch (e) {
    summary.status = 'FAILED';
    error = brief(e);
    log.error(`cycletrack: run failed: ${brief(e)}`);
  }

  summary.requests = client.requests;
  summary.durationMs = now().getTime() - t0;
  Object.assign(stats, {
    schools: summary.schools,
    created: summary.created,
    updated: summary.updated,
    deleted: summary.deleted,
    misses: summary.misses,
    requests: summary.requests,
    skippedUnchanged: summary.skippedUnchanged,
  });
  try {
    await prisma.medSourceRun.update({
      where: {
        id: run.id,
      },
      data: {
        status: summary.status,
        finishedAt: now(),
        stats,
        error,
      },
    });
  } catch (e) {
    log.error(`cycletrack: could not record run: ${brief(e)}`);
  }
  return summary;
}
