/**
 * Server-side Plinko: picks a target bin uniformly at random,
 * then trial-searches for a starting x where the shared physics
 * naturally lands the ball in that bin.
 */

import {
  simulateFull,
  CANVAS_W,
  BALL_RADIUS,
  NUM_BINS,
} from './plinko-physics';
import { mulberry32 } from '@/lib/core/rng';

export interface PlinkoResult {
  startX: number;
  landedBin: number; // 0-4
}

const MAX_RANDOM_TRIALS = 200;
const SWEEP_POINTS = 1000;

export function simulatePlinko(
  seed: number,
): PlinkoResult {
  const rng =
    mulberry32(
      seed,
    );

  // Pick target bin uniformly (0-4) — each bin has exactly 20% chance
  const targetBin =
    Math.floor(
      rng() *
        NUM_BINS,
    );

  const minX =
    BALL_RADIUS;
  const maxX =
    CANVAS_W -
    BALL_RADIUS;

  // Phase 1: random search — fast, works for all bins
  for (
    let i = 0;
    i <
    MAX_RANDOM_TRIALS;
    i++
  ) {
    const candidateX =
      minX +
      rng() *
        (maxX -
          minX);
    const {
      landedBin,
    } =
      simulateFull(
        candidateX,
      );
    if (
      landedBin ===
      targetBin
    ) {
      return {
        startX:
          candidateX,
        landedBin:
          targetBin,
      };
    }
  }

  // Phase 2: exhaustive sweep — safety net, should essentially never run
  for (
    let i = 0;
    i <
    SWEEP_POINTS;
    i++
  ) {
    const candidateX =
      minX +
      (i /
        (SWEEP_POINTS -
          1)) *
        (maxX -
          minX);
    const {
      landedBin,
    } =
      simulateFull(
        candidateX,
      );
    if (
      landedBin ===
      targetBin
    ) {
      return {
        startX:
          candidateX,
        landedBin:
          targetBin,
      };
    }
  }

  // Ultimate fallback (bug in peg layout if reached)
  console.error(
    `Plinko: could not find startX for bin ${targetBin}`,
  );
  const fallbackX =
    ((targetBin +
      0.5) /
      NUM_BINS) *
    CANVAS_W;
  return {
    startX:
      fallbackX,
    landedBin:
      targetBin,
  };
}
