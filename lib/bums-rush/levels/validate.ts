/**
 * Bum's Rush — loader-time assertions over an already-schema-valid `Level`.
 *
 * `schema.ts` catches shape mistakes (a typo'd key, a missing field, a value
 * of the wrong type). This file catches the mistakes that are only visible
 * once every field exists and has to make *sense together* — a contrast
 * ratio that was guessed rather than measured, a goal placed outside the
 * level it belongs to, a lever wired to a relay that never receives it. Both
 * are "loud failure at load time" in the same spirit as `lib/catalog/`; this
 * half just can't be expressed as a zod shape.
 *
 * Every `checkX` function returns the list of problems it found (empty = ok)
 * rather than throwing directly. That makes each one independently testable,
 * and it means `getLevelIssues` can hand an author *everything* wrong with a
 * level in one pass instead of a fix-rerun-fix loop — which is also exactly
 * what the dev-only level editor (design doc §6.5) wants to show live.
 * `validateLevel` is the throwing wrapper the loader actually calls.
 */

import { contrastRatio } from '@/lib/appearance/contrast';
import { PHYSICS } from '../constants';
import type { Level, Prop, Rect, Shape } from '../types';

/** How far `palette.contrastRatio` may drift from the measured value before
 *  it counts as "didn't actually measure it" rather than float rounding. */
const CONTRAST_DECLARATION_TOLERANCE = 0.05;

/** A prop with no authored footprint (no `size`) is still real estate a
 *  spawning player shouldn't land inside — this is the assumed radius for
 *  those kinds. It is deliberately generous (a little larger than
 *  `PHYSICS.HEAD_RADIUS`) rather than exact: the loader only needs to catch
 *  "someone put a crate directly on top of a spawn point", not model true
 *  per-prop collision geometry (that's the engine's job, not the schema's). */
const DEFAULT_PROP_FOOTPRINT_RADIUS = 40;

/** Bounding checkpoint-segment length, in seconds, before spacing is flagged.
 *  §6.7's target is 25-40s; the band here is wider because checkpoints are
 *  rarely spaced evenly in *time* even when they're spaced well in *feel* —
 *  this catches gross violations (a 3-minute segment, back-to-back
 *  checkpoints) without rejecting reasonable authoring choices near the
 *  target's edges. */
const CHECKPOINT_SEGMENT_MIN_S = 15;
const CHECKPOINT_SEGMENT_MAX_S = 50;
/** §6.7: "a level with no checkpoint may not exceed 45s of intended play." */
const NO_CHECKPOINT_MAX_S = 45;

/** §6.7: parSeconds = 1.35x a competent solo run, 1.5x a competent 2p run. */
const SOLO_PAR_MULTIPLIER = 1.35;
const COOP_PAR_MULTIPLIER = 1.5;

/** §17: "≤ 4 players, ≤ 120 total physics bodies per level (loader asserts)." */
const MAX_PHYSICS_BODIES = 120;

// ─── Geometry helpers (top-left rect convention — see schema.ts) ───────────

function rectFromXYWH(x: number, y: number, w: number, h: number): Rect {
  return { x, y, w, h };
}

function rectContains(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w &&
    inner.y + inner.h <= outer.y + outer.h
  );
}

function pointInRect(p: { x: number; y: number }, r: Rect): boolean {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

function pointInCircle(p: { x: number; y: number }, c: { x: number; y: number; r: number }): boolean {
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  return dx * dx + dy * dy <= c.r * c.r;
}

/** Axis-aligned bounding box of any authored `Shape`, in the top-left convention. */
function shapeBounds(shape: Shape): Rect {
  switch (shape.kind) {
    case 'rect':
      return rectFromXYWH(shape.x, shape.y, shape.w, shape.h);
    case 'circle':
      return rectFromXYWH(shape.x - shape.r, shape.y - shape.r, shape.r * 2, shape.r * 2);
    case 'poly': {
      // Points are local offsets from (x, y) — see schema.ts's shapeSchema comment.
      const xs = shape.points.map((p) => shape.x + p.x);
      const ys = shape.points.map((p) => shape.y + p.y);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      return rectFromXYWH(minX, minY, maxX - minX, maxY - minY);
    }
    case 'chain': {
      const half = shape.thickness / 2;
      const xs = shape.points.map((p) => p.x);
      const ys = shape.points.map((p) => p.y);
      const minX = Math.min(...xs) - half;
      const maxX = Math.max(...xs) + half;
      const minY = Math.min(...ys) - half;
      const maxY = Math.max(...ys) + half;
      return rectFromXYWH(minX, minY, maxX - minX, maxY - minY);
    }
  }
}

/** A prop's approximate footprint at rest, for the spawn-overlap check only —
 *  not a physics-accurate collision shape (see `DEFAULT_PROP_FOOTPRINT_RADIUS`). */
function propFootprint(prop: Prop): { rect: Rect } | { circle: { x: number; y: number; r: number } } {
  if ('size' in prop) {
    return { rect: rectFromXYWH(prop.at.x, prop.at.y, prop.size.x, prop.size.y) };
  }
  return { circle: { x: prop.at.x, y: prop.at.y, r: DEFAULT_PROP_FOOTPRINT_RADIUS } };
}

// ─── Individual checks ───────────────────────────────────────────────────────

/** Computed WCAG contrast of the level's ink/paper pair must clear 7:1
 *  (§2.8), and the authored `contrastRatio` must be the number that was
 *  actually measured, not a guess — using the shared
 *  `lib/appearance/contrast.ts` WCAG relative-luminance implementation
 *  rather than a second copy of the same math (lib/CLAUDE.md's "one way to
 *  do each thing"). */
export function checkContrast(level: Level): string[] {
  const issues: string[] = [];
  let measured: number;
  try {
    measured = contrastRatio(level.palette.ink, level.palette.paper);
  } catch (cause) {
    issues.push(`palette ink/paper: could not compute contrast (${String(cause)})`);
    return issues;
  }
  if (measured < 7) {
    issues.push(
      `palette ink/paper contrast is ${measured.toFixed(2)}:1, below the 7:1 floor (§2.8)`,
    );
  }
  if (Math.abs(measured - level.palette.contrastRatio) > CONTRAST_DECLARATION_TOLERANCE) {
    issues.push(
      `palette.contrastRatio (${level.palette.contrastRatio}) does not match the measured ratio ` +
        `(${measured.toFixed(2)}) — it must be the computed value, not a guess`,
    );
  }
  return issues;
}

/** Every seat that can join must have somewhere to spawn. */
export function checkSpawnCount(level: Level): string[] {
  if (level.spawn.length < level.minPlayers) {
    return [
      `spawn has ${level.spawn.length} point(s) but minPlayers is ${level.minPlayers} — ` +
        `every seat needs a spawn point`,
    ];
  }
  return [];
}

/** The goal must be reachable within the level's own bounds. */
export function checkGoalInBounds(level: Level): string[] {
  const goalBounds = shapeBounds(level.goal.shape);
  if (!rectContains(level.bounds, goalBounds)) {
    return [`goal shape (${level.goal.shape.kind}) is not fully inside level bounds`];
  }
  return [];
}

/** A player spawning on top of a crate, a rope anchor, etc. is stuck or dead
 *  before input is even possible. */
export function checkPropSpawnOverlap(level: Level): string[] {
  const issues: string[] = [];
  for (const prop of level.props) {
    const footprint = propFootprint(prop);
    for (let i = 0; i < level.spawn.length; i++) {
      const spawn = level.spawn[i];
      const overlaps =
        'rect' in footprint ? pointInRect(spawn, footprint.rect) : pointInCircle(spawn, footprint.circle);
      if (overlaps) {
        issues.push(`prop "${prop.id}" (${prop.kind}) overlaps spawn point ${i} (${spawn.x}, ${spawn.y})`);
      }
    }
  }
  return issues;
}

/** Every id an objective points at (a relic, a pose outline, a recipe plate)
 *  must actually be placed in the level, or the objective can never score. */
export function checkObjectiveReferences(level: Level): string[] {
  const issues: string[] = [];
  const relicIds = new Set(level.props.filter((p) => p.kind === 'relic').map((p) => p.relicId));
  const poseIds = new Set(level.props.filter((p) => p.kind === 'poseOutline').map((p) => p.poseId));
  const recipeIds = new Set(level.props.filter((p) => p.kind === 'plate').map((p) => p.recipeId));
  const propInstanceIds = new Set(level.props.map((p) => p.id));

  for (const objective of level.objectives) {
    switch (objective.kind) {
      case 'haul':
        for (const relicId of objective.relicIds) {
          if (!relicIds.has(relicId)) {
            issues.push(
              `objective "${objective.id}" (haul) references relicId "${relicId}" with no matching relic prop`,
            );
          }
        }
        break;
      case 'pose':
        if (!poseIds.has(objective.poseId)) {
          issues.push(
            `objective "${objective.id}" (pose) references poseId "${objective.poseId}" with no matching poseOutline prop`,
          );
        }
        break;
      case 'recipe':
        if (!recipeIds.has(objective.recipeId)) {
          issues.push(
            `objective "${objective.id}" (recipe) references recipeId "${objective.recipeId}" with no matching plate prop`,
          );
        }
        break;
      case 'snapshot':
        if (objective.predicate.nearPropId && !propInstanceIds.has(objective.predicate.nearPropId)) {
          issues.push(
            `objective "${objective.id}" (snapshot) references nearPropId "${objective.predicate.nearPropId}" with no matching prop`,
          );
        }
        break;
      case 'clock':
      case 'flawless':
        break;
    }
  }
  return issues;
}

/**
 * Every `signalRelay` input, and every `door`'s consuming signal, must be
 * produced by *something* (a `lever`, a `button`, or another relay's `out`)
 * — otherwise the puzzle it is wired into can never be solved. Scoped to
 * relays and doors (the two consumer kinds in the current catalog) rather
 * than a generic "every signal id anywhere", so a producer with no consumer
 * yet (a lever an author hasn't wired up) is not flagged as an error.
 */
export function checkSignalProducers(level: Level): string[] {
  const produced = new Set<string>();
  for (const prop of level.props) {
    if (prop.kind === 'lever' || prop.kind === 'button') produced.add(prop.signal);
    if (prop.kind === 'signalRelay') produced.add(prop.out);
  }

  const issues: string[] = [];
  for (const prop of level.props) {
    if (prop.kind === 'signalRelay') {
      for (const input of prop.inputs) {
        if (!produced.has(input)) {
          issues.push(`signalRelay "${prop.id}" input "${input}" has no producer (lever/button/relay)`);
        }
      }
    }
    if (prop.kind === 'door' && !produced.has(prop.signal)) {
      issues.push(`door "${prop.id}" signal "${prop.signal}" has no producer (lever/button/relay)`);
    }
  }
  return issues;
}

/** Approximate matter.js body count per prop kind, for the budget check
 *  below. Deliberately conservative (rounds up) — see the module doc. */
function estimatePropBodies(prop: Prop): number {
  switch (prop.kind) {
    case 'rope':
      return prop.segments;
    case 'skiLift':
      return prop.chairs;
    case 'fan':
    case 'magnet':
    case 'zeroG':
    case 'poseOutline':
    case 'rescueDrone':
    case 'signalRelay':
      // Fields/volumes/logic/summoned — no persistent body of their own.
      return 0;
    default:
      return 1;
  }
}

function estimateHazardBodies(hazard: Level['hazards'][number]): number {
  // Only kinematic/rotating hazards need a real body; the rest are sensor
  // volumes over existing (already-counted) geometry.
  return hazard.kind === 'saw' || hazard.kind === 'crusher' ? 1 : 0;
}

/** §17: "≤ 4 players, ≤ 120 total physics bodies per level (loader asserts)."
 *  Actor bodies (head + 2 arms x ARM_SEGMENTS + 2 hands, per seat) are derived
 *  from `PHYSICS` rather than hardcoded, so this stays correct if the arm
 *  model ever changes segment count. */
export function checkBodyBudget(level: Level): string[] {
  const bodiesPerActor = 1 + PHYSICS.ARM_SEGMENTS * 2 + 2;
  const actorBodies = level.maxPlayers * bodiesPerActor;
  const geometryBodies = level.geometry.length;
  const propBodies = level.props.reduce((sum, p) => sum + estimatePropBodies(p), 0);
  const hazardBodies = level.hazards.reduce((sum, h) => sum + estimateHazardBodies(h), 0);
  const total = actorBodies + geometryBodies + propBodies + hazardBodies;

  if (total > MAX_PHYSICS_BODIES) {
    return [
      `estimated physics body count is ${total} (actors ${actorBodies} + geometry ${geometryBodies} + ` +
        `props ${propBodies} + hazards ${hazardBodies}), over the ${MAX_PHYSICS_BODIES} cap (§17)`,
    ];
  }
  return [];
}

/**
 * Checkpoint density, estimated from `parSeconds` rather than a real
 * traversal simulation (the loader has no way to run the physics sim ahead
 * of time). §6.7's formula is inverted to recover a "competent run" time,
 * which is then divided evenly across the spawn->checkpoint->...->goal
 * segments. This is a proxy, not a simulation — see `CHECKPOINT_SEGMENT_*`.
 */
export function checkCheckpointSpacing(level: Level): string[] {
  const multiplier = level.minPlayers >= 2 ? COOP_PAR_MULTIPLIER : SOLO_PAR_MULTIPLIER;
  const competentRunSeconds = level.parSeconds / multiplier;

  if (level.checkpoints.length === 0) {
    if (competentRunSeconds > NO_CHECKPOINT_MAX_S) {
      return [
        `no checkpoints, but the estimated run is ${competentRunSeconds.toFixed(1)}s — ` +
          `§6.7 caps a checkpoint-free level at ${NO_CHECKPOINT_MAX_S}s`,
      ];
    }
    return [];
  }

  const segments = level.checkpoints.length + 1;
  const avgSegmentSeconds = competentRunSeconds / segments;
  if (avgSegmentSeconds < CHECKPOINT_SEGMENT_MIN_S || avgSegmentSeconds > CHECKPOINT_SEGMENT_MAX_S) {
    return [
      `${level.checkpoints.length} checkpoint(s) split the estimated ${competentRunSeconds.toFixed(1)}s run ` +
        `into ${segments} segments averaging ${avgSegmentSeconds.toFixed(1)}s each, outside the ` +
        `${CHECKPOINT_SEGMENT_MIN_S}-${CHECKPOINT_SEGMENT_MAX_S}s sane band (§6.7 targets 25-40s)`,
    ];
  }
  return [];
}

/**
 * §2.8: laser gates must cycle at or above a 700ms period so the hazard
 * itself can never be the site's first flashing-content violation. Not on
 * the prompt's required list, but directly enforces a binding, testable
 * accessibility commitment (§2.8) using data this same file already parses.
 */
export function checkLaserFlashSafety(level: Level): string[] {
  const issues: string[] = [];
  for (const hazard of level.hazards) {
    if (hazard.kind !== 'laser') continue;
    const period = hazard.onMs + hazard.offMs;
    if (period < 700) {
      issues.push(`laser hazard "${hazard.id}" cycles every ${period}ms, below the 700ms flash-safety floor (§2.8)`);
    }
  }
  return issues;
}

const ALL_CHECKS: ((level: Level) => string[])[] = [
  checkContrast,
  checkSpawnCount,
  checkGoalInBounds,
  checkPropSpawnOverlap,
  checkObjectiveReferences,
  checkSignalProducers,
  checkBodyBudget,
  checkCheckpointSpacing,
  checkLaserFlashSafety,
];

/** Every problem `validateLevel` would reject on, without throwing — the
 *  primitive the dev-only level editor (§6.5) shows live. */
export function getLevelIssues(level: Level): string[] {
  return ALL_CHECKS.flatMap((check) => check(level));
}

/** The loader's actual gate: throws with every problem found, so an author
 *  fixes a level in one pass instead of a fix-rerun-fix loop. */
export function validateLevel(level: Level): void {
  const issues = getLevelIssues(level);
  if (issues.length > 0) {
    throw new Error(`Level "${level.id}" failed validation:\n - ${issues.join('\n - ')}`);
  }
}
