/**
 * The `medschools.admit-live` job: poll Admit's recent-updates feed, resolve each unseen event's program
 * (MD vs MD-PhD) with one profile lookup per distinct author, store the anonymous event and roll the touched
 * days up into `MedCycleCount` (spec §4a).
 *
 * Never throws. The author handle never leaves `client.programOf`; nothing person-shaped reaches a write or a
 * log line, and `MedSourceRun.stats` holds counters only.
 */
import {
  createAdmitClient,
  flagToProgram,
} from './adapters/admit';
import {
  SourceHaltedError,
  type PoliteHost,
} from './http';
import {
  brief,
  closeStaleRuns,
  recordAliasMiss,
} from './run-support';
import {
  rollupEventCounts,
  type TouchedCell,
} from './rollup-events';
import type { MedProgram } from '../engine/types';
import type {
  Logger,
  MedPrisma,
} from './types';

export interface AdmitLiveDeps {
  prisma: MedPrisma;
  host: PoliteHost;
  secret: string;
  shouldStop(): boolean;
  log: Logger;
  now?: () => Date;
  /** Distinct profile lookups allowed per run (default 120). */
  maxLookups?: number;
}

export interface AdmitLiveSummary {
  runId: string;
  status:
    | 'OK'
    | 'PARTIAL'
    | 'FAILED';
  fetched: number;
  created: number;
  alreadyStored: number;
  deferred: number;
  programNull: number;
  misses: number;
  unknownStatus: number;
  badDate: number;
  /** Feed rows dropped for failing validation (e.g. a null school slug). */
  malformedRows: number;
  /** Alias-miss writes that failed; the run carried on. */
  aliasMissErrors: number;
  lookups: number;
  rolledUp: number;
  requests: number;
  durationMs: number;
}

const DEFAULT_MAX_LOOKUPS = 120;

export async function runAdmitLive(
  deps: AdmitLiveDeps,
  opts: {
    trigger:
      | 'CRON'
      | 'MANUAL'
      | 'BOOTSTRAP';
  },
): Promise<AdmitLiveSummary> {
  const {
    prisma,
    host,
    log,
  } =
    deps;
  const now =
    deps.now ??
    (() =>
      new Date());
  const maxLookups =
    deps.maxLookups ??
    DEFAULT_MAX_LOOKUPS;
  const t0 =
    now().getTime();
  const summary: AdmitLiveSummary =
    {
      runId:
        '',
      status:
        'FAILED',
      fetched: 0,
      created: 0,
      alreadyStored: 0,
      deferred: 0,
      programNull: 0,
      misses: 0,
      unknownStatus: 0,
      badDate: 0,
      malformedRows: 0,
      aliasMissErrors: 0,
      lookups: 0,
      rolledUp: 0,
      requests: 0,
      durationMs: 0,
    };
  const finish =
    (): AdmitLiveSummary => {
      summary.durationMs =
        now().getTime() -
        t0;
      return summary;
    };

  if (
    deps
      .secret
      .length <
    16
  ) {
    log.error(
      'admit-live: MEDSCHOOLS_DEDUPE_SECRET is missing or shorter than 16 characters; run skipped',
    );
    return finish();
  }

  await closeStaleRuns(
    prisma,
    'ADMIT',
    'admit-live',
    now,
    log,
  );

  let run: {
    id: string;
  };
  try {
    run =
      await prisma.medSourceRun.create(
        {
          data: {
            source:
              'ADMIT',
            job: 'admit-live',
            trigger:
              opts.trigger,
            status:
              'RUNNING',
          },
        },
      );
  } catch (e) {
    log.error(
      `admit-live: could not open run: ${brief(e)}`,
    );
    return finish();
  }
  summary.runId =
    run.id;

  const session =
    host.session();
  const client =
    createAdmitClient(
      session,
      {
        secret:
          deps.secret,
        now,
      },
    );
  let error:
    | string
    | null =
    null;
  let incomplete = false;

  try {
    const {
      items,
      skipped,
    } =
      await client.fetchFeed();
    summary.fetched =
      items.length;
    summary.unknownStatus =
      skipped.unknownStatus;
    summary.badDate =
      skipped.badDate;
    summary.malformedRows =
      skipped.malformedRows;

    const aliases =
      await prisma.medSchoolAlias.findMany(
        {
          where:
            {
              source:
                'ADMIT',
            },
        },
      );
    const active =
      new Set(
        (
          await prisma.medSchool.findMany(
            {
              where:
                {
                  active: true,
                },
            },
          )
        ).map(
          (
            s,
          ) =>
            s.id,
        ),
      );
    const schoolBySlug =
      new Map(
        aliases.map(
          (
            a,
          ) => [
            a.sourceKey,
            a.schoolId,
          ],
        ),
      );

    // Resolve schools; an unknown slug is skipped and recorded once per run (D8: not when ignored).
    const missed =
      new Set<string>();
    const resolved: Array<{
      item: (typeof items)[number];
      schoolId: string;
    }> =
      [];
    const seenHashes =
      new Set<string>();
    for (const item of items) {
      const slug =
        item
          .event
          .schoolKey;
      const schoolId =
        schoolBySlug.get(
          slug,
        );
      if (
        schoolId ===
        undefined
      ) {
        if (
          !missed.has(
            slug,
          )
        ) {
          missed.add(
            slug,
          );
          try {
            if (
              await recordAliasMiss(
                prisma,
                'ADMIT',
                slug,
                now,
              )
            )
              summary.misses++;
          } catch (e) {
            // A failed miss write must not abort the feed: the event is skipped as before.
            summary.aliasMissErrors++;
            log.warn(
              `admit-live: alias miss write failed: ${brief(e)}`,
            );
          }
        }
        continue;
      }
      if (
        !active.has(
          schoolId,
        )
      )
        continue;
      if (
        seenHashes.has(
          item
            .event
            .dedupeHash,
        )
      )
        continue;
      seenHashes.add(
        item
          .event
          .dedupeHash,
      );
      resolved.push(
        {
          item,
          schoolId,
        },
      );
    }

    // Stored events are read back with their labels: their cells are rolled up again, so a roll-up that failed
    // after an earlier insert is repaired by the next run.
    const stored =
      new Map<
        string,
        {
          schoolId: string;
          program: MedProgram | null;
          cycleYear: number;
          occurredAt: Date;
        }
      >();
    if (
      resolved.length >
      0
    ) {
      const found =
        await prisma.medCycleEvent.findMany(
          {
            where:
              {
                dedupeHash:
                  {
                    in: resolved.map(
                      (
                        r,
                      ) =>
                        r
                          .item
                          .event
                          .dedupeHash,
                    ),
                  },
              },
            select:
              {
                dedupeHash: true,
                schoolId: true,
                program: true,
                cycleYear: true,
                occurredAt: true,
              },
          },
        );
      for (const e of found)
        stored.set(
          e.dedupeHash,
          e,
        );
    }

    const rows: Array<
      Record<
        string,
        unknown
      >
    > =
      [];
    const touched: TouchedCell[] =
      [];
    let stop = false;
    for (const {
      item,
      schoolId,
    } of resolved) {
      const ev =
        item.event;
      const prior =
        stored.get(
          ev.dedupeHash,
        );
      if (
        prior
      ) {
        summary.alreadyStored++;
        if (
          prior.program !==
          null
        )
          touched.push(
            {
              schoolId:
                prior.schoolId,
              program:
                prior.program,
              cycleYear:
                prior.cycleYear,
              date: prior.occurredAt
                .toISOString()
                .slice(
                  0,
                  10,
                ),
            },
          );
        continue;
      }
      if (
        stop ||
        deps.shouldStop() ||
        session.halted
      ) {
        stop = true;
        summary.deferred++;
        continue;
      }
      if (
        !client.isCached(
          item.lookup,
        ) &&
        client.lookups >=
          maxLookups
      ) {
        summary.deferred++;
        continue;
      }
      let flag;
      try {
        flag =
          await client.programOf(
            item.lookup,
          );
      } catch (e) {
        if (
          !(
            e instanceof
            SourceHaltedError
          )
        )
          throw e;
        stop = true;
        summary.deferred++;
        continue;
      }
      if (
        flag ===
        'FAILED'
      ) {
        summary.deferred++;
        continue;
      }
      const program =
        flagToProgram(
          flag,
        );
      if (
        program ===
        null
      )
        summary.programNull++;
      rows.push(
        {
          schoolId,
          cycleYear:
            ev.cycleYear,
          program,
          eventType:
            ev.eventType,
          occurredAt:
            ev.occurredAt,
          source:
            ev.source,
          dedupeHash:
            ev.dedupeHash,
          inState:
            null,
        },
      );
      if (
        program !==
        null
      ) {
        touched.push(
          {
            schoolId,
            program,
            cycleYear:
              ev.cycleYear,
            date: ev.occurredAt
              .toISOString()
              .slice(
                0,
                10,
              ),
          },
        );
      }
    }
    summary.lookups =
      client.lookups;
    if (
      summary.deferred >
        0 ||
      client.lookupsStopped
    )
      incomplete = true;

    if (
      rows.length >
      0
    ) {
      const res =
        await prisma.medCycleEvent.createMany(
          {
            data: rows,
            skipDuplicates: true,
          },
        );
      summary.created =
        res.count;
    }
    // Diffing against the stored counts makes unchanged cells a no-op, so this is safe on every run.
    if (
      touched.length >
      0
    )
      summary.rolledUp =
        await rollupEventCounts(
          prisma,
          {
            source:
              'ADMIT',
            touched,
          },
        );
    if (
      stop &&
      session.halted
    )
      error =
        brief(
          session.lastFailure ??
            'source halted',
        );
  } catch (e) {
    error =
      brief(
        e,
      );
    log.error(
      `admit-live: run failed: ${error}`,
    );
    summary.lookups =
      client.lookups;
    return await close(
      'FAILED',
    );
  }
  return await close(
    incomplete
      ? 'PARTIAL'
      : 'OK',
  );

  async function close(
    status: AdmitLiveSummary['status'],
  ): Promise<AdmitLiveSummary> {
    summary.status =
      status;
    summary.requests =
      session.requests;
    finish();
    const {
      runId:
        _id,
      status:
        _s,
      ...counters
    } = summary;
    try {
      await prisma.medSourceRun.update(
        {
          where:
            {
              id: run.id,
            },
          data: {
            status,
            finishedAt:
              now(),
            stats:
              counters,
            error,
          },
        },
      );
    } catch (e) {
      log.error(
        `admit-live: could not close run: ${brief(e)}`,
      );
    }
    log.info(
      `admit-live: ${status} fetched=${summary.fetched} created=${summary.created} stored=${summary.alreadyStored} deferred=${summary.deferred} lookups=${summary.lookups} rolledUp=${summary.rolledUp}`,
    );
    return finish();
  }
}
