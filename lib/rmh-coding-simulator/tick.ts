/**
 * RMH Coding Simulator — the per-frame simulation step.
 *
 * `applyTick` advances the world by `dt` seconds: it banks generator output,
 * ages active buffs, and runs the golden-commit spawn/despawn clock. It is a
 * pure function of (state, dt) and returns a partial state for the store to
 * merge — no side effects, so it's trivially testable.
 */

import type { GameState, ActiveBuff, GoldenCommit } from './types';
import { totalCps, goldenFreqMultiplier } from './engine';

/** Random spawn gap (seconds) for golden commits, before frequency upgrades. */
const GOLDEN_MIN_GAP = 60;
const GOLDEN_MAX_GAP = 180;
/** How long a golden commit lingers on screen before despawning. */
export const GOLDEN_LIFETIME = 11;

let goldenSeq = 0;
function nextGoldenGap(s: GameState): number {
  const base = GOLDEN_MIN_GAP + Math.random() * (GOLDEN_MAX_GAP - GOLDEN_MIN_GAP);
  return base / goldenFreqMultiplier(s);
}

function spawnGolden(): GoldenCommit {
  return {
    uid: `g${++goldenSeq}-${Date.now()}`,
    // Keep it inside a comfortable central band of the playfield.
    x: 8 + Math.random() * 80,
    y: 14 + Math.random() * 64,
    life: GOLDEN_LIFETIME,
  };
}

export function applyTick(s: GameState, dt: number): Partial<GameState> {
  if (dt <= 0) return {};

  // ── Production ──
  const earned = totalCps(s) * dt;
  const loc = s.loc + earned;
  const lifetimeLoc = s.lifetimeLoc + earned;
  const totalLoc = s.totalLoc + earned;

  // ── Buffs age out ──
  let buffs = s.activeBuffs;
  if (buffs.length) {
    buffs = buffs
      .map((b): ActiveBuff => ({ ...b, remaining: b.remaining - dt }))
      .filter((b) => b.remaining > 0);
  }

  // ── Golden commit clock ──
  let golden = s.golden;
  let goldenTimer = s.goldenTimer;

  if (golden) {
    const life = golden.life - dt;
    golden = life > 0 ? { ...golden, life } : null;
  }

  if (!golden) {
    goldenTimer -= dt;
    if (goldenTimer <= 0) {
      golden = spawnGolden();
      goldenTimer = nextGoldenGap(s);
    }
  }

  return {
    loc,
    lifetimeLoc,
    totalLoc,
    activeBuffs: buffs,
    golden,
    goldenTimer,
    playtime: s.playtime + dt,
  };
}

/** Initial spawn gap for a fresh state / after a reset. */
export function initialGoldenTimer(s: GameState): number {
  return nextGoldenGap(s);
}
