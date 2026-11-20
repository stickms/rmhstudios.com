/**
 * The `medschools.sdn-backfill` job: walk the flat multi-year archive forums once to list every prior-year
 * school thread, then process those threads newest cycle first, off-peak only, until the monthly backfill budget
 * (80% of the cap) is spent. Resumable: discovery keeps a `{ stage, forumNode, page }` cursor in
 * `MedSourceRun.stats`, and the thread stage keeps its position in the `MedSdnThread` rows themselves (each
 * thread has its own hash cursor and `repliesDone`), so a changed thread list can neither skip nor repeat one.
 *
 * Never throws. Nothing person-shaped is read, written or logged here; `stats` holds counters and thread ids only.
 */
import { isDeepseekPeak } from '@/lib/ai/deepseek-peak';
import { parseThreadTitle } from '../engine/sdn-title';
import {
  SdnPageError,
  assertPage,
  forumListingUrl,
  parseForumListing,
} from './adapters/sdn';
import { SourceHaltedError } from './http';
import {
  rollupEventCounts,
  type TouchedCell,
} from './rollup-events';
import {
  brief,
  closeStaleRuns,
  recordAliasMiss,
} from './run-support';
import type { SdnForumsFile } from './run-sdn-live';
import { SOURCES } from './sources';
import type { BudgetGate } from './sdn/budget';
import type { SdnAi } from './sdn/extract';
import {
  processThread,
  type ThreadDeps,
} from './sdn/process-thread';
import type {
  Logger,
  MedPrisma,
  MedSdnThreadRow,
} from './types';

export type SdnBackfillStage =
  | 'discover'
  | 'threads'
  | 'done';

export interface SdnBackfillCursor {
  stage: SdnBackfillStage;
  /** Position in `forums.archive`; informational, resume is keyed by `forumNode`. */
  forumIndex: number;
  /** The archive forum node being listed (stable if the forum list is reordered). */
  forumNode:
    | number
    | null;
  /** Next listing page to fetch for that forum. */
  page: number;
  /** Last thread walked to the end (informational; pending threads are selected from their own state). */
  lastThreadId:
    | number
    | null;
}

export interface SdnBackfillDeps {
  prisma: MedPrisma;
  host: import('./http').PoliteHost;
  ai: SdnAi;
  budget: BudgetGate;
  secret: string;
  forums: SdnForumsFile;
  shouldStop(): boolean;
  log: Logger;
  now?: () => Date;
  /** Listing and thread pages fetched per run (default 200). */
  maxPages?: number;
  /** Model calls per run (default 150). */
  maxLlmCalls?: number;
}

export interface SdnBackfillSummary {
  runId: string;
  status:
    | 'OK'
    | 'PARTIAL'
    | 'FAILED';
  cursor: SdnBackfillCursor;
  noop: boolean;
  listingPages: number;
  threadsDiscovered: number;
  pending: number;
  processed: number;
  pages: number;
  llmCalls: number;
  eventsCreated: number;
  questionsCreated: number;
  misses: number;
  aliasMissErrors: number;
  unlabelled: number;
  degreeMismatch: number;
  liveOverlap: number;
  threadsSkipped: number;
  threadsFailed: number;
  listingFailed: number;
  batchesDropped: number;
  scannedCount: number;
  filteredCount: number;
  extractFailed: number;
  rejected: number;
  cursorLost: number;
  rolledUp: number;
  rollupErrors: number;
  aiConfigured: boolean;
  budgetPaused: boolean;
  peakPaused: boolean;
  /** UTC `YYYY-MM` the monthly budget refused in; `sdnBackfillOwed` reads it. */
  pausedMonth:
    | string
    | null;
  capPaused: boolean;
  halted: boolean;
  requests: number;
  durationMs: number;
}

const DEFAULT_MAX_PAGES = 200;
const DEFAULT_MAX_LLM_CALLS = 150;
/** Safety bound on one forum's listing walk (the run page cap bounds each run anyway). */
const MAX_LISTING_PAGES = 5000;
const MAX_THREAD_FAILURES = 3;
const DAY_MS = 86_400_000;
const JOB =
  'sdn-backfill';

const FRESH_CURSOR: SdnBackfillCursor =
  {
    stage:
      'discover',
    forumIndex: 0,
    forumNode:
      null,
    page: 1,
    lastThreadId:
      null,
  };

/** A stored cursor, tolerantly read; anything unreadable restarts discovery (upserts make that safe). */
function readCursor(
  stats: unknown,
): SdnBackfillCursor | null {
  if (
    stats ===
      null ||
    typeof stats !==
      'object'
  )
    return null;
  const c =
    (
      stats as {
        cursor?: unknown;
      }
    )
      .cursor;
  if (
    c ===
      null ||
    typeof c !==
      'object'
  )
    return null;
  const o =
    c as Record<
      string,
      unknown
    >;
  const stage =
    o.stage;
  if (
    stage !==
      'discover' &&
    stage !==
      'threads' &&
    stage !==
      'done'
  )
    return null;
  const int =
    (
      v: unknown,
      min: number,
      dflt: number,
    ): number =>
      typeof v ===
        'number' &&
      Number.isInteger(
        v,
      ) &&
      v >=
        min
        ? v
        : dflt;
  return {
    stage,
    forumIndex:
      int(
        o.forumIndex,
        0,
        0,
      ),
    forumNode:
      typeof o.forumNode ===
      'number'
        ? o.forumNode
        : null,
    page: int(
      o.page,
      1,
      1,
    ),
    lastThreadId:
      typeof o.lastThreadId ===
      'number'
        ? o.lastThreadId
        : null,
  };
}

export async function runSdnBackfill(
  deps: SdnBackfillDeps,
  opts: {
    trigger:
      | 'CRON'
      | 'MANUAL'
      | 'BOOTSTRAP';
    rediscover?: boolean;
  },
): Promise<SdnBackfillSummary> {
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
  const t0 =
    now().getTime();
  const summary: SdnBackfillSummary =
    {
      runId:
        '',
      status:
        'FAILED',
      cursor:
        {
          ...FRESH_CURSOR,
        },
      noop: false,
      listingPages: 0,
      threadsDiscovered: 0,
      pending: 0,
      processed: 0,
      pages: 0,
      llmCalls: 0,
      eventsCreated: 0,
      questionsCreated: 0,
      misses: 0,
      aliasMissErrors: 0,
      unlabelled: 0,
      degreeMismatch: 0,
      liveOverlap: 0,
      threadsSkipped: 0,
      threadsFailed: 0,
      listingFailed: 0,
      batchesDropped: 0,
      scannedCount: 0,
      filteredCount: 0,
      extractFailed: 0,
      rejected: 0,
      cursorLost: 0,
      rolledUp: 0,
      rollupErrors: 0,
      aiConfigured: true,
      budgetPaused: false,
      peakPaused: false,
      pausedMonth:
        null,
      capPaused: false,
      halted: false,
      requests: 0,
      durationMs: 0,
    };
  const finish =
    (): SdnBackfillSummary => {
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
      'sdn-backfill: MEDSCHOOLS_DEDUPE_SECRET is missing or shorter than 16 characters; run skipped',
    );
    return finish();
  }

  await closeStaleRuns(
    prisma,
    'SDN',
    JOB,
    now,
    log,
  );

  // The newest run that carries a cursor decides where to resume (a crashed run keeps what it persisted).
  let cursor: SdnBackfillCursor =
    {
      ...FRESH_CURSOR,
    };
  try {
    const recent =
      await prisma.medSourceRun.findMany(
        {
          where:
            {
              source:
                'SDN',
              job: JOB,
            },
          orderBy:
            {
              startedAt:
                'desc',
            },
          take: 20,
        },
      );
    for (const r of recent) {
      const c =
        readCursor(
          r.stats,
        );
      if (
        c
      ) {
        cursor =
          c;
        break;
      }
    }
  } catch (e) {
    log.error(
      `sdn-backfill: could not read the last run: ${brief(e)}`,
    );
    return finish();
  }
  if (
    opts.rediscover &&
    opts.trigger ===
      'MANUAL'
  )
    cursor =
      {
        ...FRESH_CURSOR,
      };
  summary.cursor =
    cursor;

  let run: {
    id: string;
  };
  try {
    run =
      await prisma.medSourceRun.create(
        {
          data: {
            source:
              'SDN',
            job: JOB,
            trigger:
              opts.trigger,
            status:
              'RUNNING',
            startedAt:
              now(),
          },
        },
      );
  } catch (e) {
    log.error(
      `sdn-backfill: could not open run: ${brief(e)}`,
    );
    return finish();
  }
  summary.runId =
    run.id;

  const session =
    host.session(
      {
        spacingMs:
          SOURCES
            .SDN_FORUMS
            .backfillSpacingMs,
      },
    );
  let error:
    | string
    | null =
    null;
  let incomplete = false;
  const state =
    {
      pages: 0,
      llmCalls: 0,
    };
  const maxPages =
    deps.maxPages ??
    DEFAULT_MAX_PAGES;
  const maxLlmCalls =
    deps.maxLlmCalls ??
    DEFAULT_MAX_LLM_CALLS;

  const statsNow =
    (): Record<
      string,
      unknown
    > => {
      const {
        runId:
          _id,
        status:
          _s,
        cursor:
          _c,
        ...counters
      } = summary;
      return {
        ...counters,
        cursor,
      };
    };
  const persistStats =
    async (): Promise<void> => {
      summary.pages =
        state.pages;
      summary.llmCalls =
        state.llmCalls;
      summary.requests =
        session.requests;
      try {
        await prisma.medSourceRun.update(
          {
            where:
              {
                id: run.id,
              },
            data: {
              stats:
                statsNow(),
            },
          },
        );
      } catch (e) {
        log.error(
          `sdn-backfill: could not record cursor: ${brief(e)}`,
        );
      }
    };
  const close =
    async (
      status: SdnBackfillSummary['status'],
    ): Promise<SdnBackfillSummary> => {
      summary.status =
        status;
      summary.cursor =
        cursor;
      summary.pages =
        state.pages;
      summary.llmCalls =
        state.llmCalls;
      summary.requests =
        session.requests;
      finish();
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
                statsNow(),
              error,
            },
          },
        );
      } catch (e) {
        log.error(
          `sdn-backfill: could not close run: ${brief(e)}`,
        );
      }
      log.info(
        `sdn-backfill: ${status} stage=${cursor.stage} listing=${summary.listingPages} pending=${summary.pending} processed=${summary.processed} pages=${summary.pages} calls=${summary.llmCalls} events=${summary.eventsCreated}`,
      );
      return finish();
    };

  try {
    // A completed backfill is a recorded no-op on later cron fires.
    if (
      cursor.stage ===
      'done'
    ) {
      summary.noop = true;
      return await close(
        'OK',
      );
    }

    if (
      !deps.ai.configured()
    ) {
      summary.aiConfigured = false;
      return await close(
        'PARTIAL',
      );
    }

    // Off-peak only (Q6): the gate the thread processor sees refuses at peak, and the run checks peak before
    // every page it fetches, so a peak tick makes no request at all.
    let peakHit = false;
    const atPeak =
      (): boolean => {
        if (
          isDeepseekPeak(
            now(),
          )
        ) {
          peakHit = true;
          return true;
        }
        return false;
      };
    const gate: BudgetGate =
      {
        async allow(
          kind,
        ) {
          if (
            atPeak()
          )
            return false;
          return deps.budget.allow(
            kind,
          );
        },
      };
    const stopPeak =
      async (): Promise<SdnBackfillSummary> => {
        summary.peakPaused = true;
        return await close(
          'PARTIAL',
        );
      };

    // ---- Stage discover: list every archive forum.
    if (
      cursor.stage ===
      'discover'
    ) {
      const archive =
        deps
          .forums
          .archive;
      const aliases =
        await prisma.medSchoolAlias.findMany(
          {
            where:
              {
                source:
                  'SDN',
              },
          },
        );
      const schoolIdByStem =
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
      const schools =
        new Map(
          (
            await prisma.medSchool.findMany()
          ).map(
            (
              s,
            ) => [
              s.id,
              s,
            ],
          ),
        );
      const known =
        new Map<
          number,
          MedSdnThreadRow
        >(
          (
            await prisma.medSdnThread.findMany()
          ).map(
            (
              t,
            ) => [
              t.threadId,
              t,
            ],
          ),
        );
      const missed =
        new Set<string>();

      let index = 0;
      if (
        cursor.forumNode !==
        null
      ) {
        const at =
          archive.findIndex(
            (
              f,
            ) =>
              f.node ===
              cursor.forumNode,
          );
        // A forum that left the list restarts the walk; upserts make that harmless.
        index =
          at ===
          -1
            ? 0
            : at;
      }
      let page =
        index ===
          0 &&
        cursor.forumNode ===
          null
          ? 1
          : cursor.page;
      if (
        cursor.forumNode !==
          null &&
        !archive.some(
          (
            f,
          ) =>
            f.node ===
            cursor.forumNode,
        )
      )
        page = 1;

      for (
        ;
        index <
        archive.length;
        index++,
          page = 1
      ) {
        const forum =
          archive[
            index
          ]!;
        for (
          ;
          page <=
          MAX_LISTING_PAGES;
          page++
        ) {
          if (
            deps.shouldStop()
          ) {
            incomplete = true;
            return await close(
              'PARTIAL',
            );
          }
          if (
            atPeak()
          )
            return await stopPeak();
          if (
            state.pages >=
            maxPages
          ) {
            summary.capPaused = true;
            incomplete = true;
            return await close(
              'PARTIAL',
            );
          }
          state.pages++;
          let listing: ReturnType<
            typeof parseForumListing
          >;
          try {
            const res =
              await session.get(
                forumListingUrl(
                  forum.node,
                  page,
                ),
              );
            const body =
              assertPage(
                res,
                session,
                'sdn archive listing',
              );
            try {
              listing =
                parseForumListing(
                  body,
                );
            } catch (e) {
              if (
                e instanceof
                SdnPageError
              )
                session.noteFailure(
                  'sdn archive listing: unparseable',
                );
              throw e;
            }
            session.noteSuccess();
          } catch (e) {
            if (
              e instanceof
                SourceHaltedError ||
              session.halted
            ) {
              summary.halted = true;
              error =
                brief(
                  session.lastFailure ??
                    'source halted',
                );
              return await close(
                'FAILED',
              );
            }
            // The cursor stays on this page, so the next run retries it.
            summary.listingFailed++;
            log.warn(
              `sdn-backfill: listing page failed (${e instanceof SdnPageError ? 'page' : 'error'})`,
            );
            incomplete = true;
            return await close(
              'PARTIAL',
            );
          }
          summary.listingPages++;

          for (const t of listing.threads) {
            const parsed =
              parseThreadTitle(
                t.title,
              );
            if (
              !parsed
            ) {
              summary.unlabelled++;
              continue;
            }
            const schoolId =
              schoolIdByStem.get(
                parsed.stem,
              );
            if (
              schoolId ===
              undefined
            ) {
              if (
                !missed.has(
                  parsed.stem,
                )
              ) {
                missed.add(
                  parsed.stem,
                );
                try {
                  if (
                    await recordAliasMiss(
                      prisma,
                      'SDN',
                      parsed.stem,
                      now,
                    )
                  )
                    summary.misses++;
                } catch (e) {
                  summary.aliasMissErrors++;
                  log.warn(
                    `sdn-backfill: alias miss write failed: ${brief(e)}`,
                  );
                }
              }
              continue;
            }
            const school =
              schools.get(
                schoolId,
              );
            if (
              !school ||
              !school.active
            )
              continue;
            if (
              school.degree !==
              forum.degree
            ) {
              summary.degreeMismatch++;
              continue;
            }
            const prior =
              known.get(
                t.threadId,
              );
            if (
              prior &&
              !prior.archive
            ) {
              summary.liveOverlap++;
              continue;
            }
            const fields =
              {
                slug: t.slug,
                schoolId,
                cycleYear:
                  parsed.cycleYear,
                degree:
                  forum.degree,
                archive: true,
              };
            const row =
              await prisma.medSdnThread.upsert(
                {
                  where:
                    {
                      threadId:
                        t.threadId,
                    },
                  create:
                    {
                      threadId:
                        t.threadId,
                      ...fields,
                      repliesSeen:
                        t.replies ??
                        0,
                      repliesDone:
                        -1,
                      lastActivityAt:
                        t.lastActivityAt,
                      cursorPage: 1,
                      cursorPostHash:
                        null,
                      postsProcessed: 0,
                    },
                  // Cursor fields are never part of a rediscovery update; an unknown count ("1K") leaves it alone.
                  update:
                    {
                      ...fields,
                      ...(t.replies !==
                      null
                        ? {
                            repliesSeen:
                              t.replies,
                          }
                        : {}),
                      ...(t.lastActivityAt
                        ? {
                            lastActivityAt:
                              t.lastActivityAt,
                          }
                        : {}),
                    },
                },
              );
            known.set(
              t.threadId,
              row,
            );
            summary.threadsDiscovered++;
          }

          const last =
            !listing.hasNext;
          cursor =
            last
              ? index +
                  1 <
                archive.length
                ? {
                    ...cursor,
                    stage:
                      'discover',
                    forumIndex:
                      index +
                      1,
                    forumNode:
                      archive[
                        index +
                          1
                      ]!
                        .node,
                    page: 1,
                  }
                : {
                    ...cursor,
                    stage:
                      'threads',
                    forumIndex:
                      archive.length,
                    forumNode:
                      null,
                    page: 1,
                  }
              : {
                  ...cursor,
                  stage:
                    'discover',
                  forumIndex:
                    index,
                  forumNode:
                    forum.node,
                  page:
                    page +
                    1,
                };
          await persistStats();
          if (
            last
          )
            break;
        }
      }
      if (
        cursor.stage ===
        'discover'
      ) {
        // Walked off the end without a final page (empty archive list).
        cursor =
          {
            ...cursor,
            stage:
              'threads',
            forumNode:
              null,
            page: 1,
          };
        await persistStats();
      }
    }

    // ---- Stage threads: newest cycle first.
    const tdeps: ThreadDeps =
      {
        prisma,
        client:
          session,
        ai: deps.ai,
        budget:
          gate,
        kind: 'backfill',
        secret:
          deps.secret,
        now,
        log,
        limits:
          {
            maxPages,
            maxLlmCalls,
          },
        state,
        shouldStop:
          deps.shouldStop,
      };
    const parkedCutoff =
      now().getTime() -
      DAY_MS;
    const rows =
      await prisma.medSdnThread.findMany(
        {
          where:
            {
              archive: true,
            },
        },
      );
    const pending =
      rows
        .filter(
          (
            t,
          ) =>
            t.archive &&
            t.repliesDone !==
              t.repliesSeen &&
            (!t.parkedAt ||
              t.parkedAt.getTime() <=
                parkedCutoff),
        )
        .sort(
          (
            a,
            b,
          ) =>
            b.cycleYear -
              a.cycleYear ||
            a.threadId -
              b.threadId,
        );
    summary.pending =
      pending.length;

    const rollup =
      async (
        cells: TouchedCell[],
      ): Promise<void> => {
        if (
          cells.length ===
          0
        )
          return;
        try {
          summary.rolledUp +=
            await rollupEventCounts(
              prisma,
              {
                source:
                  'SDN',
                touched:
                  cells,
              },
            );
        } catch (e) {
          summary.rollupErrors++;
          incomplete = true;
          log.error(
            `sdn-backfill: roll-up failed: ${brief(e)}`,
          );
        }
      };
    const mark =
      async (
        threadId: number,
        data: Record<
          string,
          unknown
        >,
      ): Promise<void> => {
        try {
          await prisma.medSdnThread.update(
            {
              where:
                {
                  threadId,
                },
              data,
            },
          );
        } catch (e) {
          log.warn(
            `sdn-backfill: could not update thread state: ${brief(e)}`,
          );
        }
      };

    let stopped = false;
    for (const thread of pending) {
      if (
        deps.shouldStop()
      ) {
        stopped = true;
        break;
      }
      // Before any request for this thread: peak, the page cap, the call cap and the money budget.
      if (
        atPeak()
      )
        return await stopPeak();
      if (
        state.pages >=
          maxPages ||
        state.llmCalls >=
          maxLlmCalls
      ) {
        summary.capPaused = true;
        stopped = true;
        break;
      }
      if (
        !(await gate.allow(
          'backfill',
        ))
      ) {
        if (
          peakHit
        )
          return await stopPeak();
        summary.budgetPaused = true;
        summary.pausedMonth =
          now()
            .toISOString()
            .slice(
              0,
              7,
            );
        stopped = true;
        break;
      }

      const res =
        await processThread(
          tdeps,
          thread,
        );
      summary.eventsCreated +=
        res.eventsCreated;
      summary.questionsCreated +=
        res.questionsCreated;
      const c =
        res.counters;
      summary.batchesDropped +=
        c.batchesDropped;
      summary.scannedCount +=
        c.scannedCount;
      summary.filteredCount +=
        c.filteredCount;
      summary.extractFailed +=
        c.extractFailed;
      summary.rejected +=
        c.rejected;
      summary.cursorLost +=
        c.cursorLost;
      await rollup(
        res.touched,
      );

      if (
        res.outcome ===
        'caught-up'
      ) {
        summary.processed++;
        cursor =
          {
            ...cursor,
            stage:
              'threads',
            lastThreadId:
              thread.threadId,
          };
        if (
          thread.parkedAt ||
          (thread.failCount ??
            0) >
            0
        )
          await mark(
            thread.threadId,
            {
              parkedAt:
                null,
              failCount: 0,
            },
          );
        await persistStats();
        continue;
      }
      incomplete = true;
      if (
        res.outcome ===
        'skipped'
      ) {
        // Gone (404): parked with its cursor untouched; retried once the park is over 24 h old.
        summary.threadsSkipped++;
        await mark(
          thread.threadId,
          {
            parkedAt:
              now(),
          },
        );
        await persistStats();
        continue;
      }
      if (
        res.outcome ===
        'failed'
      ) {
        summary.threadsFailed++;
        const fails =
          (thread.failCount ??
            0) +
          1;
        await mark(
          thread.threadId,
          {
            failCount:
              fails,
            ...(fails >=
            MAX_THREAD_FAILURES
              ? {
                  parkedAt:
                    now(),
                }
              : {}),
          },
        );
        await persistStats();
        continue;
      }
      if (
        res.outcome ===
        'halted'
      ) {
        summary.halted = true;
        error =
          brief(
            session.lastFailure ??
              'source halted',
          );
        return await close(
          'FAILED',
        );
      }
      if (
        res.outcome ===
        'paused-budget'
      ) {
        if (
          peakHit
        )
          return await stopPeak();
        summary.budgetPaused = true;
        summary.pausedMonth =
          now()
            .toISOString()
            .slice(
              0,
              7,
            );
      } else if (
        res.outcome ===
        'paused-cap'
      ) {
        summary.capPaused = true;
      } else if (
        res.outcome ===
        'ai-unavailable'
      ) {
        summary.aiConfigured = false;
      }
      // stopped, ai-unavailable and the pauses end the walk; the thread keeps its stored cursor.
      stopped = true;
      break;
    }

    if (
      stopped ||
      incomplete
    ) {
      incomplete = true;
      await persistStats();
      return await close(
        'PARTIAL',
      );
    }
    cursor =
      {
        ...cursor,
        stage:
          'done',
      };
    return await close(
      'OK',
    );
  } catch (e) {
    error =
      brief(
        e,
      );
    log.error(
      `sdn-backfill: run failed: ${error}`,
    );
    return await close(
      'FAILED',
    );
  }
}
