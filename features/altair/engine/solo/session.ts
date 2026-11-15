// The identity of the solo run that is being played: where its seed and loadout come from.
//
// Today the browser mints the seed (cryptographically random) and derives the loadout from its own
// saved upgrades. When the server issues runs (POST /api/altair/run/start) it hands the session its
// seed, id and loadout through setSoloSession() before the run begins, and GameScreen picks them up
// here without caring where they came from.

import type { SoloLoadout } from './solo-log';

export interface SoloSession {
  /** Server-issued run id; null for a run the server knows nothing about (offline, old flow). */
  runId:
    | string
    | null;
  seed: number;
  loadout: SoloLoadout;
}

let pending: SoloSession | null =
  null;
let current: SoloSession | null =
  null;

/** Stage the session the next run will use (consumed by beginSoloSession). */
export function setSoloSession(
  s: SoloSession | null,
): void {
  pending =
    s;
}

export function randomSeed(): number {
  const c =
    (
      globalThis as {
        crypto?: Crypto;
      }
    )
      .crypto;
  if (
    c?.getRandomValues
  )
    return c.getRandomValues(
      new Uint32Array(
        1,
      ),
    )[0];
  return Math.floor(
    Math.random() *
      0x100000000,
  );
}

/** A run starts: take the staged session, or make a local one. */
export function beginSoloSession(
  fallbackLoadout: SoloLoadout,
): SoloSession {
  current =
    pending ?? {
      runId:
        null,
      seed: randomSeed(),
      loadout:
        fallbackLoadout,
    };
  pending =
    null;
  return current;
}

export function getSoloSession(): SoloSession | null {
  return current;
}

/** The run being played (set by GameScreen), so the page that finishes it can read its log and result. */
export interface ActiveRun {
  toLog: (
    end?:
      | 'dead'
      | 'victory'
      | 'quit',
  ) => import('./solo-log').SoloLog;
  result: () => import('./solo-run').SoloResult;
  ended:
    | 'dead'
    | 'victory'
    | 'quit'
    | null;
}
let active: ActiveRun | null =
  null;
export function setActiveRun(
  r: ActiveRun | null,
): void {
  active =
    r;
}
export function getActiveRun(): ActiveRun | null {
  return active;
}
/** Forget the finished run so it cannot be submitted twice. */
export function clearSoloSession(): void {
  current =
    null;
  active =
    null;
}
