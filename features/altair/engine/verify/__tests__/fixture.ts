// Shared fixture: a real HostSim run recorded by its own RunRecorder (the code path the host's
// browser uses), plus the claim the host would report and the hub-trusted setup.
import { HostSim } from '../../engine/multiplayer/host-sim';
import type {
  ClaimedCoopResult,
  TrustedCoopSetup,
} from '../verify-coop';
import type { RunLog } from '../run-log';

export const SEED = 123456789;
export const ROSTER =
  [
    {
      id: 'alice',
      classId:
        'knight',
      slot: 0,
    },
    {
      id: 'bob',
      classId:
        'ranger',
      slot: 1,
    },
  ];
export const JOINER =
  {
    id: 'cara',
    classId:
      'arcanist',
    slot: 2,
  };

export interface Recorded {
  log: RunLog;
  claim: ClaimedCoopResult;
  trusted: TrustedCoopSetup;
}

/** Play a real run: walk for a while (picks, a drop-in, a leave), then idle until the team is dead. */
export function playHonestRun(): Recorded {
  const sim =
    new HostSim(
      {
        players:
          ROSTER.map(
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
        seed: SEED,
      },
    );
  let joined = false;
  for (
    let i = 0;
    i <
      40_000 &&
    sim.status ===
      'playing';
    i++
  ) {
    const walking =
      i <
      1500;
    for (const id of sim.playerIds()) {
      const k =
        id.charCodeAt(
          0,
        );
      if (
        walking
      )
        sim.setInput(
          id,
          Math.cos(
            Math.floor(
              i /
                40,
            ) +
              k,
          ),
          Math.sin(
            Math.floor(
              i /
                40,
            ) +
              k *
                2,
          ),
        );
      else
        sim.setInput(
          id,
          0,
          0,
        );
      const pending =
        sim.getPendingLevelUp(
          id,
        );
      if (
        pending
      )
        sim.chooseUpgrade(
          id,
          (i +
            k) %
            pending
              .choices
              .length,
        );
    }
    if (
      i ===
        500 &&
      !joined
    ) {
      joined = true;
      sim.addPlayer(
        {
          playerId:
            JOINER.id,
          classId:
            JOINER.classId,
          slot: JOINER.slot,
        },
      );
    }
    if (
      i ===
      1000
    )
      sim.removePlayer(
        'cara',
      );
    sim.step();
  }
  const log =
    sim.getRunLog();
  const stats =
    sim.getPlayerStats();
  const claim: ClaimedCoopResult =
    {
      victory:
        sim.status ===
        'victory',
      sharedKills:
        sim
          .world
          .sharedKills,
      bossesDefeated:
        [
          ...sim.bossesDefeated,
        ],
      players:
        stats.map(
          (
            s,
          ) => ({
            userId:
              s.playerId,
            level:
              s.level,
            kills:
              s.kills,
            coins:
              s.coins,
            revivesGiven:
              s.revivesGiven,
            revivesReceived:
              s.revivesReceived,
            wasDowned:
              s.wasDowned,
            wasAliveAtEnd:
              s.wasAliveAtEnd,
          }),
        ),
    };
  const trusted: TrustedCoopSetup =
    {
      seed: SEED,
      doubleTime: false,
      roster:
        ROSTER,
      joins:
        [
          JOINER,
        ],
      wallMs:
        (log.steps /
          60) *
          1000 +
        2000,
    };
  return {
    log,
    claim,
    trusted,
  };
}
