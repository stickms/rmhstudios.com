// =============================================================================
// ALTAIR VERIFY -- Co-op run verification
// =============================================================================
// Inputs are split by trust:
//   TRUSTED (set by the hub, which the host cannot influence): seed, doubleTime, who was in the
//     match with which class and slot, who dropped in, and how much wall-clock time the hub saw.
//   UNTRUSTED (from the host's browser): the run log and the result it claims.
// The log is replayed through HostSim; the claim must equal the replay; and what the caller may
// persist is `verified`, which is built only from the replay and the trusted roster.
// =============================================================================

import {
  replayRun,
  type ReplayOptions,
  type ReplayResult,
} from './replay';
import {
  STEPS_PER_SECOND,
  type LogPlayer,
  type RunLog,
} from './run-log';
import {
  SIM_VERSION,
  logSimVersion,
} from '../sim-version';

export interface TrustedCoopSetup {
  seed: number;
  doubleTime: boolean;
  /** Players present at the start, from the hub's lobby. */
  roster: LogPlayer[];
  /** Everyone the hub let drop in (a log may only add players from this list). */
  joins: LogPlayer[];
  /** Hub-measured milliseconds between the match starting and the host reporting the end. */
  wallMs: number;
}

export interface ClaimedCoopPlayer {
  userId: string;
  level: number;
  kills: number;
  coins: number;
  revivesGiven: number;
  revivesReceived: number;
  wasDowned: boolean;
  wasAliveAtEnd: boolean;
}

export interface ClaimedCoopResult {
  victory: boolean;
  sharedKills: number;
  bossesDefeated: string[];
  players: ClaimedCoopPlayer[];
}

export interface VerifiedCoopPlayer {
  userId: string;
  classId: string;
  slot: number;
  level: number;
  kills: number;
  coins: number;
  timeSurvived: number;
  revivesGiven: number;
  revivesReceived: number;
  wasDowned: boolean;
  wasAliveAtEnd: boolean;
}

export interface VerifiedCoopRun {
  victory: boolean;
  /** Game-clock seconds. */
  gameTime: number;
  steps: number;
  sharedKills: number;
  bossesDefeated: string[];
  players: VerifiedCoopPlayer[];
}

export type VerifyFailure =
  | 'invalid_log'
  | 'setup_mismatch'
  /** Played on other rules than the server runs now (a deploy landed mid-match): cannot be replayed, not cheating. */
  | 'stale_sim'
  | 'too_long_for_wall_clock'
  | 'incomplete'
  | 'timeout'
  | 'step_mismatch'
  | 'claim_mismatch'
  | 'error';

export type VerifyOutcome =
  | {
      ok: true;
      verified: VerifiedCoopRun;
    }
  | {
      ok: false;
      reason: VerifyFailure;
      detail: string;
    };

/** Slack on the wall-clock bound: network latency to the hub and timer granularity. */
const WALL_SLACK_SECONDS = 10;
const WALL_SLACK_FACTOR = 1.1;

const samePlayer =
  (
    a: LogPlayer,
    b: LogPlayer,
  ) =>
    a.id ===
      b.id &&
    a.classId ===
      b.classId &&
    a.slot ===
      b.slot;

function sameRoster(
  log: LogPlayer[],
  trusted: LogPlayer[],
): boolean {
  if (
    log.length !==
    trusted.length
  )
    return false;
  return trusted.every(
    (
      t,
    ) =>
      log.some(
        (
          l,
        ) =>
          samePlayer(
            l,
            t,
          ),
      ),
  );
}

/** Compare a claim with the replay. Returns the list of differences (empty = identical). */
export function diffClaim(
  claim: ClaimedCoopResult,
  replay: ReplayResult,
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
    'sharedKills',
    claim.sharedKills,
    replay.sharedKills,
  );
  const claimedBosses =
    [
      ...claim.bossesDefeated,
    ]
      .sort()
      .join(
        ',',
      );
  const replayBosses =
    [
      ...replay.bossesDefeated,
    ]
      .sort()
      .join(
        ',',
      );
  want(
    'bossesDefeated',
    claimedBosses,
    replayBosses,
  );
  want(
    'players',
    claim
      .players
      .length,
    replay
      .players
      .length,
  );
  for (const r of replay.players) {
    const c =
      claim.players.find(
        (
          p,
        ) =>
          p.userId ===
          r.playerId,
      );
    if (
      !c
    ) {
      diffs.push(
        `player ${r.playerId}: missing from claim`,
      );
      continue;
    }
    want(
      `${r.playerId}.level`,
      c.level,
      r.level,
    );
    want(
      `${r.playerId}.kills`,
      c.kills,
      r.kills,
    );
    want(
      `${r.playerId}.coins`,
      c.coins,
      r.coins,
    );
    want(
      `${r.playerId}.revivesGiven`,
      c.revivesGiven,
      r.revivesGiven,
    );
    want(
      `${r.playerId}.revivesReceived`,
      c.revivesReceived,
      r.revivesReceived,
    );
    want(
      `${r.playerId}.wasDowned`,
      c.wasDowned,
      r.wasDowned,
    );
    want(
      `${r.playerId}.wasAliveAtEnd`,
      c.wasAliveAtEnd,
      r.wasAliveAtEnd,
    );
  }
  return diffs;
}

export async function verifyCoopRun(
  trusted: TrustedCoopSetup,
  log: unknown,
  claim: ClaimedCoopResult,
  opts: ReplayOptions = {},
): Promise<VerifyOutcome> {
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
    log as Partial<RunLog>;
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
    !Array.isArray(
      l.roster,
    ) ||
    !sameRoster(
      l.roster,
      trusted.roster,
    )
  ) {
    return {
      ok: false,
      reason:
        'setup_mismatch',
      detail:
        'roster differs from the hub lobby',
    };
  }
  if (
    !Array.isArray(
      l.joins,
    ) ||
    !l.joins.every(
      (
        j,
      ) =>
        trusted.joins.some(
          (
            t,
          ) =>
            samePlayer(
              j,
              t,
            ),
        ),
    )
  ) {
    return {
      ok: false,
      reason:
        'setup_mismatch',
      detail:
        'log has a drop-in the hub never admitted',
    };
  }
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
    await replayRun(
      log,
      opts,
    );
  if (
    !out.ok
  )
    return {
      ok: false,
      reason:
        out.reason,
      detail:
        out.detail,
    };
  const replay =
    out.result;
  if (
    replay.status ===
    'incomplete'
  ) {
    return {
      ok: false,
      reason:
        'incomplete',
      detail:
        'the log ends while the run is still going',
    };
  }

  const diffs =
    diffClaim(
      claim,
      replay,
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
        diffs
          .slice(
            0,
            8,
          )
          .join(
            '; ',
          ),
    };

  const roster =
    [
      ...trusted.roster,
      ...trusted.joins,
    ];
  return {
    ok: true,
    verified:
      {
        victory:
          replay.status ===
          'victory',
        gameTime:
          replay.gameTime,
        steps:
          replay.steps,
        sharedKills:
          replay.sharedKills,
        bossesDefeated:
          replay.bossesDefeated,
        players:
          replay.players.map(
            (
              p,
            ) => ({
              userId:
                p.playerId,
              classId:
                roster.find(
                  (
                    r,
                  ) =>
                    r.id ===
                    p.playerId,
                )
                  ?.classId ??
                p.classId,
              slot: p.slot,
              level:
                p.level,
              kills:
                p.kills,
              coins:
                p.coins,
              timeSurvived:
                p.timeSurvived,
              revivesGiven:
                p.revivesGiven,
              revivesReceived:
                p.revivesReceived,
              wasDowned:
                p.wasDowned,
              wasAliveAtEnd:
                p.wasAliveAtEnd,
            }),
          ),
      },
  };
}
