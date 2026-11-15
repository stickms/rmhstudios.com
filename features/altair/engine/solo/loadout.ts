// The meta-upgrade levels that change how a solo run PLAYS or PAYS, in one shape that the browser
// (to start a run) and the server (to issue one and to verify it) both derive from the saved upgrades.
//
// History: this module used to look the upgrades up as 'reroll', 'greed', ... while META_UPGRADES (and
// every save) names them 'meta_reroll', 'meta_greed', ..., so every level read 0 and the purchases did
// nothing, and the stat upgrades (Vitality, Might, ...) never reached the sim at all. The ids are now the
// real ones and the stat bonuses ride in `loadout.stats`. Old logs stay valid: their loadouts (all zero,
// no `stats`) are part of the log and of the issued run row, and replay exactly as they were recorded.

import { META_UPGRADES } from '../data/meta-upgrades';
import { heatModifiers } from '../data/heat';
import {
  META_STAT_KEYS,
  type SoloLoadout,
} from './solo-log';

/** First-ever clear of a class pays this once per class, from the server (features/altair/engine/solo/persist.server.ts). */
export const FIRST_CLEAR_BONUS = 200;

/** The payout multiplier arithmetic, shared by the results screen, the meta save and the server. */
export function finalCoinsFor(
  runCoins: number,
  greedLevel: number,
  doubleTime: boolean,
  heat = 0,
): number {
  // At Heat 0 the extra factor is exactly 1, so the payout is what it always was.
  return Math.floor(
    runCoins *
      (1 +
        greedLevel *
          0.1) *
      (doubleTime
        ? 1.5
        : 1) *
      heatModifiers(
        heat,
      )
        .payout,
  );
}

const STAT_KEYS =
  new Set<string>(
    META_STAT_KEYS,
  );
const round =
  (
    n: number,
  ) =>
    Math.round(
      n *
        1e6,
    ) /
    1e6;

export function loadoutFromUpgrades(
  upgrades:
    | Record<
        string,
        number
      >
    | null
    | undefined,
): SoloLoadout {
  const lvl =
    (
      id: string,
    ) => {
      const v =
        upgrades?.[
          id
        ];
      const max =
        META_UPGRADES.find(
          (
            u,
          ) =>
            u.id ===
            id,
        )
          ?.maxLevel ??
        0;
      return typeof v ===
        'number' &&
        Number.isInteger(
          v,
        ) &&
        v >
          0
        ? Math.min(
            v,
            max,
          )
        : 0;
    };

  const stats: Record<
    string,
    number
  > =
    {};
  for (const def of META_UPGRADES) {
    const level =
      lvl(
        def.id,
      );
    if (
      level ===
      0
    )
      continue;
    for (const [
      stat,
      perLevel,
    ] of Object.entries(
      def.effectPerLevel,
    )) {
      if (
        STAT_KEYS.has(
          stat,
        )
      )
        stats[
          stat
        ] =
          round(
            (stats[
              stat
            ] ??
              0) +
              perLevel *
                level,
          );
    }
  }

  return {
    rerolls:
      lvl(
        'meta_reroll',
      ),
    banishes:
      lvl(
        'meta_banish',
      ),
    revival:
      lvl(
        'meta_revival',
      ),
    extraChoice:
      lvl(
        'meta_extra_choice',
      ) >
      0,
    catalystAffinity:
      lvl(
        'meta_catalyst_affinity',
      ),
    greed:
      lvl(
        'meta_greed',
      ),
    ...(Object.keys(
      stats,
    )
      .length >
    0
      ? {
          stats,
        }
      : {}),
  };
}
