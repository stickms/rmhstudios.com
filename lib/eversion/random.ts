/**
 * Which projection this navigation uses (spec §5.1, §1.1-4). OWNER: T11.
 *
 * A fixed setting resolves to itself. `random` draws uniformly from the five
 * projections EXCLUDING the previous draw, which is kept in `sessionStorage`
 * under `LAST_PROJECTION_KEY` (read and write wrapped in try/catch; a throwing
 * or absent storage falls back to a module variable, so the "never the same
 * twice" rule holds within a page-load even in a private window).
 *
 * The same projection serves wrap and unwrap of one navigation.
 */
import { LAST_PROJECTION_KEY } from './constants';
import { PROJECTION_IDS, type NavTransition, type ProjectionId } from './types';

/** Fallback when `sessionStorage` is absent or throws (private windows, sandboxed frames). */
let lastDraw: ProjectionId | null = null;

function isProjectionId(value: unknown): value is ProjectionId {
  return typeof value === 'string' && (PROJECTION_IDS as readonly string[]).includes(value);
}

function readLast(): ProjectionId | null {
  try {
    const stored = globalThis.sessionStorage?.getItem(LAST_PROJECTION_KEY);
    if (isProjectionId(stored)) return stored;
  } catch {
    /* storage unavailable: use the module variable */
  }
  return lastDraw;
}

function writeLast(id: ProjectionId): void {
  lastDraw = id;
  try {
    globalThis.sessionStorage?.setItem(LAST_PROJECTION_KEY, id);
  } catch {
    /* the module variable above still enforces the rule within this page-load */
  }
}

/**
 * Resolve the visitor's setting to the projection to draw. `rng` returns
 * `[0, 1)` and is injectable so the χ² uniformity test (spec §11.1 test 23)
 * can be deterministic.
 */
export function resolveProjection(
  setting: NavTransition,
  rng: () => number = Math.random,
): ProjectionId {
  if (setting !== 'random') return setting;
  const last = readLast();
  const pool = last ? PROJECTION_IDS.filter((id) => id !== last) : PROJECTION_IDS;
  // Clamp so an injected rng that returns exactly 1 cannot index past the end.
  const pick = pool[Math.min(Math.floor(rng() * pool.length), pool.length - 1)]!;
  writeLast(pick);
  return pick;
}

/** Forget the previous draw (tests only). */
export function resetLastProjection(): void {
  lastDraw = null;
  try {
    globalThis.sessionStorage?.removeItem(LAST_PROJECTION_KEY);
  } catch {
    /* nothing to forget */
  }
}
