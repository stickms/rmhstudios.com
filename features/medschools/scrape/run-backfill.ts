/**
 * Resumable CycleTrack backfill (rulings R13, R14).
 *
 * Walks every active school's CYCLETRACK alias in key order. Per school it
 * reads the normal school page (every cycle the page carries) and
 * `summary.json` for `reg`, plus `phd` when the page has a PhD section, and
 * ingests the page's tables plus any summary table for a (program, cycle) the
 * page did not provide. REG and PHD stay separate.
 *
 * The cursor lives in `MedSourceRun.stats.cursor` and is written after every
 * school, so a kill loses at most one page. A school that fails is skipped
 * and listed in `stats.skipped`; at the end of the walk each skipped key is
 * retried once. Never throws.
 */
import { normalizeSchoolKey } from '../engine/names';
import {
  parseSchoolPage,
  parseSummaryJson,
  schoolUrl,
  summaryUrl,
  UnexpectedPageError,
  type ParsedSchoolPage,
  type ParsedTable,
} from './adapters/cycletrack';
import {
  SourceHaltedError,
  type PoliteClient,
  type PoliteHost,
} from './http';
import { ingestSchoolPage } from './ingest-page';
import type { RunSummary } from './run-cycletrack';
import { brief } from './run-support';
import { SOURCES } from './sources';
import type {
  Logger,
  MedPrisma,
} from './types';

export type BackfillStage =
  | 'cycletrack'
  | 'done';
export interface BackfillCursor {
  stage: BackfillStage;
  index: number;
}

export interface BackfillDeps {
  prisma: MedPrisma;
  cycletrack: PoliteHost;
  shouldStop(): boolean;
  log: Logger;
  now?: () => Date;
}

type Outcome =
  | 'ok'
  | 'missing'
  | 'failed';

const JOB =
  'backfill';
const MAX_LISTED = 50;

const readStats =
  (
    stats: unknown,
  ) => {
    const s =
      (stats ??
        {}) as {
        cursor?: Partial<BackfillCursor>;
        skipped?: unknown;
        retried?: unknown;
      };
    const strings =
      (
        v: unknown,
      ): string[] =>
        Array.isArray(
          v,
        )
          ? v.filter(
              (
                x,
              ): x is string =>
                typeof x ===
                'string',
            )
          : [];
    const index =
      typeof s
        .cursor
        ?.index ===
        'number' &&
      s
        .cursor
        .index >=
        0
        ? s
            .cursor
            .index
        : 0;
    const cursor: BackfillCursor =
      {
        stage:
          s
            .cursor
            ?.stage ===
          'done'
            ? 'done'
            : 'cycletrack',
        index,
      };
    return {
      cursor,
      skipped:
        strings(
          s.skipped,
        ),
      retried:
        strings(
          s.retried,
        ),
    };
  };

/** True when no backfill has run to completion; hourly counts never mask an interrupted backfill (R3). */
export async function needsBackfill(
  prisma: MedPrisma,
): Promise<boolean> {
  const latest =
    await prisma.medSourceRun.findFirst(
      {
        where:
          {
            source:
              'CYCLETRACK',
            job: JOB,
          },
        orderBy:
          {
            startedAt:
              'desc',
          },
      },
    );
  return (
    latest ===
      null ||
    readStats(
      latest.stats,
    )
      .cursor
      .stage !==
      'done'
  );
}

export async function runBackfill(
  deps: BackfillDeps,
  opts: {
    trigger:
      | 'CRON'
      | 'MANUAL'
      | 'BOOTSTRAP';
  },
): Promise<
  RunSummary & {
    cursor: BackfillCursor;
  }
> {
  const {
    prisma,
    log,
  } =
    deps;
  const now =
    deps.now ??
    (() =>
      new Date());
  const t0 =
    now().getTime();
  const summary: RunSummary & {
    cursor: BackfillCursor;
  } =
    {
      runId:
        '',
      status:
        'FAILED',
      schools: 0,
      skippedUnchanged: false,
      created: 0,
      updated: 0,
      deleted: 0,
      misses: 0,
      requests: 0,
      durationMs: 0,
      cursor:
        {
          stage:
            'cycletrack',
          index: 0,
        },
    };
  const finish =
    () => {
      summary.durationMs =
        now().getTime() -
        t0;
      return summary;
    };

  let runId: string;
  let resumed =
    readStats(
      null,
    );
  try {
    const prev =
      await prisma.medSourceRun.findFirst(
        {
          where:
            {
              source:
                'CYCLETRACK',
              job: JOB,
            },
          orderBy:
            {
              startedAt:
                'desc',
            },
        },
      );
    if (
      prev
    ) {
      resumed =
        readStats(
          prev.stats,
        );
      if (
        prev.status ===
        'RUNNING'
      ) {
        // The queue is exclusive, so a RUNNING row at start is a crashed predecessor.
        await prisma.medSourceRun.update(
          {
            where:
              {
                id: prev.id,
              },
            data: {
              status:
                'FAILED',
              finishedAt:
                now(),
              error:
                'interrupted',
            },
          },
        );
        log.warn(
          'backfill: previous run was interrupted; resuming from its cursor',
        );
      }
    }
    runId =
      (
        await prisma.medSourceRun.create(
          {
            data: {
              source:
                'CYCLETRACK',
              job: JOB,
              trigger:
                opts.trigger,
              status:
                'RUNNING',
            },
          },
        )
      )
        .id;
  } catch (e) {
    log.error(
      `backfill: could not open run: ${brief(e)}`,
    );
    summary.cursor =
      resumed.cursor;
    return finish();
  }
  summary.runId =
    runId;

  let cursor =
    resumed.cursor;
  const skipped =
    new Set(
      resumed.skipped,
    );
  const retried =
    new Set(
      resumed.retried,
    );
  let ingested = 0;
  let failed = 0;
  let stopped = false;
  let halted = false;
  let error:
    | string
    | null =
    null;
  let client: PoliteClient | null =
    null;

  const statsNow =
    (): Record<
      string,
      unknown
    > => ({
      cursor,
      skipped:
        [
          ...skipped,
        ].slice(
          0,
          MAX_LISTED,
        ),
      skippedCount:
        skipped.size,
      retried:
        [
          ...retried,
        ],
      schools:
        summary.schools,
      ingested,
      failed,
      created:
        summary.created,
      updated:
        summary.updated,
      deleted:
        summary.deleted,
      requests:
        client?.requests ??
        0,
      ...(stopped
        ? {
            stopped: true,
          }
        : {}),
      ...(halted
        ? {
            halted: true,
          }
        : {}),
    });
  const persist =
    async (
      data: Record<
        string,
        unknown
      >,
    ) => {
      try {
        await prisma.medSourceRun.update(
          {
            where:
              {
                id: runId,
              },
            data,
          },
        );
      } catch (e) {
        log.error(
          `backfill: could not record run: ${brief(e)}`,
        );
      }
    };

  try {
    if (
      cursor.stage ===
      'done'
    ) {
      // A completed backfill is a recorded no-op, so the yearly safety-net cron costs nothing.
      summary.status =
        'OK';
      summary.cursor =
        cursor;
      await persist(
        {
          status:
            'OK',
          finishedAt:
            now(),
          stats:
            {
              ...statsNow(),
              noop: true,
            },
          error:
            null,
        },
      );
      return finish();
    }

    const aliases =
      await prisma.medSchoolAlias.findMany(
        {
          where:
            {
              source:
                'CYCLETRACK',
            },
        },
      );
    const activeIds =
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
    const targets =
      aliases
        .filter(
          (
            a,
          ) =>
            activeIds.has(
              a.schoolId,
            ),
        )
        .sort(
          (
            a,
            b,
          ) =>
            a.sourceKey <
            b.sourceKey
              ? -1
              : a.sourceKey >
                  b.sourceKey
                ? 1
                : 0,
        );
    summary.schools =
      targets.length;
    const schoolIdByKey =
      new Map(
        targets.map(
          (
            t,
          ) => [
            t.sourceKey,
            t.schoolId,
          ],
        ),
      );
    const session =
      deps.cycletrack.session(
        {
          spacingMs:
            SOURCES
              .CYCLETRACK
              .backfillSpacingMs,
        },
      );
    client =
      session;

    const getSummary =
      async (
        key: string,
        program:
          | 'reg'
          | 'phd',
      ): Promise<
        ParsedTable[]
      > => {
        const res =
          await session.get(
            summaryUrl(
              key,
              program,
            ),
          );
        if (
          !res.ok
        ) {
          // No summary is no extra data; the school page already carries what it shows.
          log.warn(
            `backfill: ${key} summary ${program} unavailable (HTTP ${res.status})`,
          );
          return [];
        }
        let json: unknown;
        try {
          json =
            JSON.parse(
              res.body,
            );
        } catch {
          throw new UnexpectedPageError(
            `summary.json for ${key} is not JSON`,
          );
        }
        const tables =
          parseSummaryJson(
            json,
            program,
          );
        session.noteSuccess();
        return tables;
      };

    const processSchool =
      async (
        key: string,
        schoolId: string,
      ): Promise<Outcome> => {
        try {
          const res =
            await session.get(
              schoolUrl(
                key,
              ),
            );
          if (
            !res.ok
          ) {
            if (
              res.status ===
              404
            )
              return 'missing';
            log.warn(
              `backfill: ${key} unavailable (HTTP ${res.status})`,
            );
            return 'failed';
          }
          const page =
            parseSchoolPage(
              res.body,
              normalizeSchoolKey(
                key,
              ),
            );
          session.noteSuccess();
          const extra: ParsedTable[] =
            [
              ...(await getSummary(
                key,
                'reg',
              )),
            ];
          if (
            page.tables.some(
              (
                t,
              ) =>
                t.program ===
                'PHD',
            )
          )
            extra.push(
              ...(await getSummary(
                key,
                'phd',
              )),
            );
          const have =
            new Set(
              page.tables.map(
                (
                  t,
                ) =>
                  `${t.program}:${t.cycleYear}`,
              ),
            );
          const added =
            extra.filter(
              (
                t,
              ) =>
                !have.has(
                  `${t.program}:${t.cycleYear}`,
                ),
            );
          const merged: ParsedSchoolPage =
            {
              sourceStamp:
                page.sourceStamp,
              tables:
                [
                  ...page.tables,
                  ...added,
                ],
              counts:
                [
                  ...page.counts,
                  ...added.flatMap(
                    (
                      t,
                    ) =>
                      t.counts,
                  ),
                ],
            };
          const r =
            await ingestSchoolPage(
              prisma,
              schoolId,
              merged,
            );
          summary.created +=
            r.created;
          summary.updated +=
            r.updated;
          summary.deleted +=
            r.deleted;
          ingested++;
          return 'ok';
        } catch (e) {
          if (
            e instanceof
            SourceHaltedError
          )
            throw e;
          if (
            e instanceof
            UnexpectedPageError
          ) {
            session.noteFailure(
              'unexpected page',
            );
            log.warn(
              `backfill: ${key} unexpected page: ${brief(e)}`,
            );
          } else {
            log.error(
              `backfill: ${key} failed: ${brief(e)}`,
            );
          }
          return 'failed';
        }
      };

    try {
      for (
        let i =
          cursor.index;
        i <
        targets.length;
        i++
      ) {
        if (
          deps.shouldStop()
        ) {
          stopped = true;
          break;
        }
        if (
          session.halted
        ) {
          halted = true;
          break;
        }
        const target =
          targets[
            i
          ]!;
        const outcome =
          await processSchool(
            target.sourceKey,
            target.schoolId,
          );
        if (
          outcome ===
          'failed'
        )
          failed++;
        if (
          outcome ===
            'failed' &&
          session.halted
        ) {
          halted = true; // the cursor stays on the failing school, so the next run resumes there
          break;
        }
        if (
          outcome !==
          'ok'
        )
          skipped.add(
            target.sourceKey,
          );
        cursor =
          {
            stage:
              'cycletrack',
            index:
              i +
              1,
          };
        await persist(
          {
            stats:
              statsNow(),
          },
        );
      }

      if (
        !stopped &&
        !halted
      ) {
        // Retry each skipped school once (R5).
        for (const key of [
          ...skipped,
        ].filter(
          (
            k,
          ) =>
            !retried.has(
              k,
            ),
        )) {
          if (
            deps.shouldStop()
          ) {
            stopped = true;
            break;
          }
          if (
            session.halted
          ) {
            halted = true;
            break;
          }
          const outcome =
            await processSchool(
              key,
              schoolIdByKey.get(
                key,
              ) ??
                '',
            );
          if (
            outcome ===
              'failed' &&
            session.halted
          ) {
            halted = true;
            break;
          }
          retried.add(
            key,
          );
          if (
            outcome ===
            'ok'
          )
            skipped.delete(
              key,
            );
          await persist(
            {
              stats:
                statsNow(),
            },
          );
        }
      }
    } catch (e) {
      if (
        !(
          e instanceof
          SourceHaltedError
        )
      )
        throw e;
      halted = true;
      error =
        brief(
          e,
        );
    }

    if (
      halted &&
      error ===
        null
    )
      error =
        brief(
          session.lastFailure ??
            'source halted',
        );
    if (
      !stopped &&
      !halted
    ) {
      cursor =
        {
          stage:
            'done',
          index:
            targets.length,
        };
      summary.status =
        'OK';
    } else {
      summary.status =
        'PARTIAL';
    }
  } catch (e) {
    summary.status =
      'FAILED';
    error =
      brief(
        e,
      );
    log.error(
      `backfill: run failed: ${brief(e)}`,
    );
  }

  summary.cursor =
    cursor;
  summary.requests =
    client?.requests ??
    0;
  await persist(
    {
      status:
        summary.status,
      finishedAt:
        now(),
      stats:
        statsNow(),
      error,
    },
  );
  return finish();
}
