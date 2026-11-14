// ============================================================
// GameEvent → ImpactEvent: what the sim reports, translated into what the bus needs.
//
// The sim's events name where a blow landed, not who threw it (a block names only the defender, a KO
// only the victim), and have no direction. The director supplies the missing pieces from where the
// fighters stand now. Pure, so the mapping is tested without a renderer.
// ============================================================
import type { GameEvent } from '@/lib/kowloon-knockout/game/fighters/types';
import type { ImpactEvent } from './impact';

export interface FighterPos {
  seat: number;
  x: number;
  z: number;
  alive: boolean;
}

/** Damage a block event stands for (the sim does not report it): a solid middle-of-the-range punch. */
export const BLOCK_POWER = 9;
/** Damage a knockout stands for: the biggest thing the game shows. */
export const KO_POWER = 34;

const bySeat =
  (
    fs: readonly FighterPos[],
    seat: number,
  ) =>
    fs.find(
      (
        f,
      ) =>
        f.seat ===
        seat,
    );

/** The living fighter nearest to (x, z) other than `seat` — the one who must have thrown it. */
export function nearestOther(
  fs: readonly FighterPos[],
  seat: number,
  x: number,
  z: number,
): FighterPos | null {
  let best: FighterPos | null =
    null;
  let bestD =
    Infinity;
  for (const f of fs) {
    if (
      f.seat ===
        seat ||
      !f.alive
    )
      continue;
    const d =
      Math.hypot(
        f.x -
          x,
        f.z -
          z,
      );
    if (
      d <
      bestD
    ) {
      bestD =
        d;
      best =
        f;
    }
  }
  return best;
}

/** Unit vector (ground plane) pointing from a to b; (0, 1) when they coincide. */
export function unitDir(
  ax: number,
  az: number,
  bx: number,
  bz: number,
): {
  dirX: number;
  dirZ: number;
} {
  const dx =
    bx -
    ax;
  const dz =
    bz -
    az;
  const len =
    Math.hypot(
      dx,
      dz,
    );
  return len <
    1e-6
    ? {
        dirX: 0,
        dirZ: 1,
      }
    : {
        dirX:
          dx /
          len,
        dirZ:
          dz /
          len,
      };
}

/** The impact a sim event stands for, or null for events that are not impacts (combo text). */
export function toImpactEvent(
  e: GameEvent,
  fighters: readonly FighterPos[],
): ImpactEvent | null {
  switch (
    e.kind
  ) {
    case 'hit': {
      const atk =
        bySeat(
          fighters,
          e.seat,
        );
      const vic =
        bySeat(
          fighters,
          e.targetSeat,
        );
      const dir =
        atk
          ? unitDir(
              atk.x,
              atk.z,
              vic?.x ??
                e.x,
              vic?.z ??
                e.z,
            )
          : {
              dirX: 0,
              dirZ: 1,
            };
      return {
        kind: 'hit',
        victim:
          e.targetSeat,
        attacker:
          e.seat,
        power:
          e.power,
        x: e.x,
        y: e.y,
        z: e.z,
        color:
          e.color,
        ...dir,
      };
    }
    case 'block': {
      const atk =
        nearestOther(
          fighters,
          e.seat,
          e.x,
          e.z,
        );
      const dir =
        atk
          ? unitDir(
              atk.x,
              atk.z,
              e.x,
              e.z,
            )
          : {
              dirX: 0,
              dirZ: 1,
            };
      return {
        kind: 'block',
        victim:
          e.seat,
        attacker:
          atk?.seat ??
          null,
        power:
          BLOCK_POWER,
        x: e.x,
        y: e.y,
        z: e.z,
        ...dir,
      };
    }
    case 'ko': {
      const atk =
        nearestOther(
          fighters,
          e.seat,
          e.x,
          e.z,
        );
      const dir =
        atk
          ? unitDir(
              atk.x,
              atk.z,
              e.x,
              e.z,
            )
          : {
              dirX: 0,
              dirZ: 1,
            };
      return {
        kind: 'ko',
        victim:
          e.seat,
        attacker:
          atk?.seat ??
          null,
        power:
          KO_POWER,
        x: e.x,
        y: 1.1,
        z: e.z,
        ...dir,
      };
    }
    default:
      return null;
  }
}
