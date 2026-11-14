// =============================================================================
// ALTAIR SOLO -- headless replay and verification of a single-player run
// =============================================================================
// Inputs are split by trust, as for co-op (verify/verify-coop.ts):
//   TRUSTED (the server issued them at run start and still holds them): seed, class, double time,
//     the meta-upgrade loadout, and how much WALL CLOCK passed between issue and submission.
//   UNTRUSTED (from the browser): the log and the result it claims.
// The log is replayed through the same SoloRun the browser played; the claim must equal the replay;
// and what a caller may persist is `verified`, which is built only from the replay.
// =============================================================================

import { runExclusive } from '../verify/replay';
import {
  SIM_VERSION,
  logSimVersion,
} from '../sim-version';
import { STEPS_PER_SECOND } from '../verify/run-log';
import {
  SoloRun,
  type SoloResult,
} from './solo-run';
import {
  checkLoadout,
  checkSoloLog,
  type SoloLoadout,
  type SoloLog,
} from './solo-log';

export interface TrustedSoloSetup {
  seed: number;
  classId: string;
  doubleTime: boolean;
  loadout: SoloLoadout;
  /** Server-measured milliseconds between issuing the run and receiving its log. */
  wallMs: number;
}

export interface ClaimedSoloResult {
  victory: boolean;
  kills: number;
  level: number;
  finalCoins: number;
}

export type SoloFailure =
  | 'invalid_log'
  | 'setup_mismatch'
  /** Played on other rules than the server runs now (a deploy landed mid-run): cannot be replayed, not cheating. */
  | 'stale_sim'
  | 'too_long_for_wall_clock'
  | 'illegal_event'
  | 'stalled'
  | 'end_mismatch'
  | 'step_mismatch'
  | 'timeout'
  | 'claim_mismatch'
  | 'error';

export type SoloVerifyOutcome =
  | {
      ok: true;
      verified: SoloResult;
    }
  | {
      ok: false;
      reason: SoloFailure;
      detail: string;
    };

export interface SoloReplayOptions {
  timeoutMs?: number;
  chunkSteps?: number;
  now?: () => number;
}

export const DEFAULT_SOLO_TIMEOUT_MS = 120_000;
const DEFAULT_CHUNK = 1500;
/** Slack on the wall-clock bound: network latency to the server and timer granularity. */
const WALL_SLACK_SECONDS = 10;
const WALL_SLACK_FACTOR = 1.1;

const yieldToLoop =
  () =>
    new Promise<void>(
      (
        resolve,
      ) =>
        setImmediate(
          resolve,
        ),
    );

type ReplayOutcome =
  | {
      ok: true;
      result: SoloResult;
    }
  | {
      ok: false;
      reason: SoloFailure;
      detail: string;
    };

/** Replay a log. Serialised: the run store and the engine's module state are process-global. */
export function replaySoloRun(
  rawLog: unknown,
  opts: SoloReplayOptions = {},
): Promise<ReplayOutcome> {
  return runExclusive(
    () =>
      replayNow(
        rawLog,
        opts,
      ),
  );
}

async function replayNow(
  rawLog: unknown,
  opts: SoloReplayOptions,
): Promise<ReplayOutcome> {
  const checked =
    checkSoloLog(
      rawLog,
    );
  if (
    !checked.ok
  )
    return {
      ok: false,
      reason:
        'invalid_log',
      detail:
        checked.reason,
    };
  const log =
    rawLog as SoloLog;
  const events =
    checked.events;
  const now =
    opts.now ??
    Date.now;
  const timeoutMs =
    opts.timeoutMs ??
    DEFAULT_SOLO_TIMEOUT_MS;
  const deadline =
    now() +
    timeoutMs;
  const chunk =
    opts.chunkSteps ??
    DEFAULT_CHUNK;

  try {
    const run =
      new SoloRun(
        {
          setup:
            {
              seed: log.seed,
              classId:
                log.classId,
              doubleTime:
                log.doubleTime,
              loadout:
                log.loadout,
            },
          viewport:
            {
              w: log.vw,
              h: log.vh,
            },
        },
      );
    let e = 0;
    const applyDue =
      ():
        | string
        | null => {
        while (
          e <
            events.length &&
          events[
            e
          ]
            .tick <=
            run.tick
        ) {
          if (
            !run.apply(
              events[
                e
              ],
            )
          )
            return `event ${e} (type ${events[e].type}) is not legal at step ${run.tick}`;
          e++;
        }
        return null;
      };

    while (
      run.tick <
        log.steps &&
      run.ended ===
        null
    ) {
      const stop =
        Math.min(
          log.steps,
          run.tick +
            chunk,
        );
      while (
        run.tick <
          stop &&
        run.ended ===
          null
      ) {
        const bad =
          applyDue();
        if (
          bad
        )
          return {
            ok: false,
            reason:
              'illegal_event',
            detail:
              bad,
          };
        if (
          !run.step()
        ) {
          return {
            ok: false,
            reason:
              'stalled',
            detail: `the run cannot advance at step ${run.tick} (picker open with no pick logged)`,
          };
        }
      }
      if (
        now() >
        deadline
      ) {
        return {
          ok: false,
          reason:
            'timeout',
          detail: `replay exceeded ${timeoutMs} ms at step ${run.tick}`,
        };
      }
      await yieldToLoop();
    }
    // Events at the very last step (a final pick) still apply; none may be left over.
    if (
      run.ended ===
      null
    ) {
      const bad =
        applyDue();
      if (
        bad
      )
        return {
          ok: false,
          reason:
            'illegal_event',
          detail:
            bad,
        };
    }
    if (
      e !==
      events.length
    ) {
      return {
        ok: false,
        reason:
          'illegal_event',
        detail: `${events.length - e} events fall after the run ended`,
      };
    }
    if (
      run.tick !==
      log.steps
    ) {
      return {
        ok: false,
        reason:
          'step_mismatch',
        detail: `the run ended at step ${run.tick}, the log says ${log.steps}`,
      };
    }
    const ended =
      run.ended ??
      'quit';
    if (
      ended !==
      log.end
    ) {
      return {
        ok: false,
        reason:
          'end_mismatch',
        detail: `the log says it ended '${log.end}', the replay ended '${ended}'`,
      };
    }
    return {
      ok: true,
      result:
        run.result(),
    };
  } catch (err) {
    return {
      ok: false,
      reason:
        'error',
      detail:
        err instanceof
        Error
          ? err.message
          : String(
              err,
            ),
    };
  }
}

/** Compare a claim with the replay. Returns the differences (empty = identical). */
export function diffSoloClaim(
  claim: ClaimedSoloResult,
  replay: SoloResult,
): string[] {
  const diffs: string[] =
    [];
  const want =
    (
      name: string,
      got: unknown,
      expected: unknown,
    ) => {
      if (
        got !==
        expected
      )
        diffs.push(
          `${name}: claimed ${String(got)}, replay ${String(expected)}`,
        );
    };
  want(
    'victory',
    claim.victory,
    replay.status ===
      'victory',
  );
  want(
    'kills',
    claim.kills,
    replay.kills,
  );
  want(
    'level',
    claim.level,
    replay.level,
  );
  want(
    'finalCoins',
    claim.finalCoins,
    replay.finalCoins,
  );
  return diffs;
}

export async function verifySoloRun(
  trusted: TrustedSoloSetup,
  log: unknown,
  claim: ClaimedSoloResult | null,
  opts: SoloReplayOptions = {},
): Promise<SoloVerifyOutcome> {
  // Cheap checks first, before any simulation is paid for.
  if (
    !log ||
    typeof log !==
      'object'
  )
    return {
      ok: false,
      reason:
        'invalid_log',
      detail:
        'no log',
    };
  const l =
    log as Partial<SoloLog>;
  if (
    l.seed !==
    trusted.seed
  )
    return {
      ok: false,
      reason:
        'setup_mismatch',
      detail:
        'log was recorded with another seed',
    };
  if (
    l.classId !==
    trusted.classId
  )
    return {
      ok: false,
      reason:
        'setup_mismatch',
      detail:
        'class differs',
    };
  if (
    l.doubleTime !==
    trusted.doubleTime
  )
    return {
      ok: false,
      reason:
        'setup_mismatch',
      detail:
        'doubleTime differs',
    };
  if (
    !checkLoadout(
      l.loadout,
    ) ||
    JSON.stringify(
      canonicalLoadout(
        l.loadout,
      ),
    ) !==
      JSON.stringify(
        canonicalLoadout(
          trusted.loadout,
        ),
      )
  ) {
    return {
      ok: false,
      reason:
        'setup_mismatch',
      detail:
        'loadout differs from the one the server issued',
    };
  }
  // After the setup checks, so only a log that matches the run the server issued gets the benign verdict.
  const playedOn =
    logSimVersion(
      l,
    );
  if (
    playedOn !==
    SIM_VERSION
  ) {
    return {
      ok: false,
      reason:
        'stale_sim',
      detail: `played on sim ${playedOn}, the server runs sim ${SIM_VERSION}`,
    };
  }
  if (
    typeof l.steps ===
    'number'
  ) {
    const seconds =
      l.steps /
      STEPS_PER_SECOND;
    if (
      seconds >
      (trusted.wallMs /
        1000) *
        WALL_SLACK_FACTOR +
        WALL_SLACK_SECONDS
    ) {
      return {
        ok: false,
        reason:
          'too_long_for_wall_clock',
        detail: `${seconds.toFixed(1)} s of sim in ${(trusted.wallMs / 1000).toFixed(1)} s of wall clock`,
      };
    }
  }

  const out =
    await replaySoloRun(
      log,
      opts,
    );
  if (
    !out.ok
  )
    return out;
  if (
    claim
  ) {
    const diffs =
      diffSoloClaim(
        claim,
        out.result,
      );
    if (
      diffs.length >
      0
    )
      return {
        ok: false,
        reason:
          'claim_mismatch',
        detail:
          diffs.join(
            '; ',
          ),
      };
  }
  return {
    ok: true,
    verified:
      out.result,
  };
}

/** Key order is part of the comparison above, so compare through one canonical shape. */
export function canonicalLoadout(
  l: SoloLoadout,
): SoloLoadout {
  const keys =
    l.stats
      ? Object.keys(
          l.stats,
        ).sort()
      : [];
  return {
    rerolls:
      l.rerolls,
    banishes:
      l.banishes,
    revival:
      l.revival,
    extraChoice:
      l.extraChoice,
    catalystAffinity:
      l.catalystAffinity,
    greed:
      l.greed,
    // Present only when non-empty, so a legacy loadout (no stats) keeps its exact old shape.
    ...(keys.length >
    0
      ? {
          stats:
            Object.fromEntries(
              keys.map(
                (
                  k,
                ) => [
                  k,
                  l
                    .stats![
                    k
                  ],
                ],
              ),
            ),
        }
      : {}),
    // Present only above Heat 0, for the same reason: a standard run keeps its exact old shape.
    ...(l.heat
      ? {
          heat: l.heat,
        }
      : {}),
  };
}
