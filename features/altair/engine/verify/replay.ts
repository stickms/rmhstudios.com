// =============================================================================
// ALTAIR VERIFY -- Headless replay of a co-op run
// =============================================================================
// Feeds a run log back through the SAME HostSim the host's browser ran and reads off
// the authoritative result. Pure engine code: no DB, no sockets, no DOM (so it runs in
// the jobs worker and in tests). Cost is bounded three ways: the log is validated first
// (checkRunLog caps steps and events), the replay yields to the event loop between
// chunks, and a wall-clock deadline aborts it.
//
// One replay at a time per process: the engine keeps a little module-level state (path
// cache, merge timers) and the random source is process-wide while a sim call runs, so
// two interleaved replays would corrupt each other. runExclusive() serialises them.
// =============================================================================

import {
  HostSim,
  type HostPlayerStats,
} from '../engine/multiplayer/host-sim';
import {
  checkRunLog,
  EV_INPUT,
  EV_JOIN,
  EV_LEAVE,
  EV_PICK,
  type DecodedEvent,
  type RunLog,
} from './run-log';

export interface ReplayResult {
  status:
    | 'victory'
    | 'defeat'
    | 'incomplete';
  steps: number;
  /** Game-clock seconds at the end. */
  gameTime: number;
  sharedKills: number;
  bossesDefeated: string[];
  players: HostPlayerStats[];
}

export type ReplayOutcome =
  | {
      ok: true;
      result: ReplayResult;
    }
  | {
      ok: false;
      reason:
        | 'invalid_log'
        | 'timeout'
        | 'step_mismatch'
        | 'error';
      detail: string;
    };

export interface ReplayOptions {
  /** Wall-clock budget in ms (default 120 s). */
  timeoutMs?: number;
  /** Steps simulated between yields to the event loop. */
  chunkSteps?: number;
  now?: () => number;
}

export const DEFAULT_REPLAY_TIMEOUT_MS = 120_000;
const DEFAULT_CHUNK = 1500;

let tail: Promise<unknown> =
  Promise.resolve();

/** Run fn after every earlier call has settled (a failure does not poison the chain). */
export function runExclusive<
  T,
>(
  fn: () => Promise<T>,
): Promise<T> {
  const next =
    tail.then(
      fn,
      fn,
    );
  tail =
    next.catch(
      () =>
        undefined,
    );
  return next;
}

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

export function replayRun(
  rawLog: unknown,
  opts: ReplayOptions = {},
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
  opts: ReplayOptions,
): Promise<ReplayOutcome> {
  const checked =
    checkRunLog(
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
    rawLog as RunLog;
  const events =
    checked.events;
  const now =
    opts.now ??
    Date.now;
  const deadline =
    now() +
    (opts.timeoutMs ??
      DEFAULT_REPLAY_TIMEOUT_MS);
  const chunk =
    opts.chunkSteps ??
    DEFAULT_CHUNK;

  try {
    const sim =
      new HostSim(
        {
          players:
            log.roster.map(
              (
                p,
              ) => ({
                playerId:
                  p.id,
                classId:
                  p.classId,
                slot: p.slot,
              }),
            ),
          doubleTime:
            log.doubleTime,
          seed: log.seed,
        },
      );
    // player index -> id, in the same order the recorder numbered them
    const ids: string[] =
      log.roster.map(
        (
          p,
        ) =>
          p.id,
      );
    for (const j of log.joins)
      ids.push(
        j.id,
      );

    let e = 0;
    const apply =
      (
        ev: DecodedEvent,
      ) => {
        switch (
          ev.type
        ) {
          case EV_INPUT:
            sim.setQuantisedInput(
              ids[
                ev
                  .player
              ],
              ev.dx,
              ev.dy,
            );
            break;
          case EV_PICK:
            sim.chooseUpgrade(
              ids[
                ev
                  .player
              ],
              ev.choice,
            );
            break;
          case EV_JOIN: {
            const j =
              log
                .joins[
                ev
                  .join
              ];
            sim.addPlayer(
              {
                playerId:
                  j.id,
                classId:
                  j.classId,
                slot: j.slot,
              },
            );
            break;
          }
          case EV_LEAVE:
            sim.removePlayer(
              ids[
                ev
                  .player
              ],
            );
            break;
        }
      };

    while (
      sim.tick <
        log.steps &&
      sim.status ===
        'playing'
    ) {
      const stop =
        Math.min(
          log.steps,
          sim.tick +
            chunk,
        );
      while (
        sim.tick <
          stop &&
        sim.status ===
          'playing'
      ) {
        while (
          e <
            events.length &&
          events[
            e
          ]
            .tick <=
            sim.tick
        )
          apply(
            events[
              e++
            ],
          );
        sim.step();
      }
      if (
        now() >
        deadline
      ) {
        return {
          ok: false,
          reason:
            'timeout',
          detail: `replay exceeded ${opts.timeoutMs ?? DEFAULT_REPLAY_TIMEOUT_MS} ms at step ${sim.tick}`,
        };
      }
      await yieldToLoop();
    }
    // The log must end exactly where the sim ended; a log claiming more steps than the sim ran
    // (it was already over) or fewer than it needed is not a faithful record.
    if (
      sim.tick !==
      log.steps
    ) {
      return {
        ok: false,
        reason:
          'step_mismatch',
        detail: `sim ended at step ${sim.tick}, log says ${log.steps}`,
      };
    }
    return {
      ok: true,
      result:
        {
          status:
            sim.status ===
            'playing'
              ? 'incomplete'
              : sim.status,
          steps:
            sim.tick,
          gameTime:
            sim
              .world
              .time,
          sharedKills:
            sim
              .world
              .sharedKills,
          bossesDefeated:
            [
              ...sim.bossesDefeated,
            ],
          players:
            sim.getPlayerStats(),
        },
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
