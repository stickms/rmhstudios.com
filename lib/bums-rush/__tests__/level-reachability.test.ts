/**
 * Can you actually get from the spawn to the goal?
 *
 * Nothing else asks. `validate.ts` checks contrast, spawn counts, goal-in-bounds,
 * prop overlap, dangling signals, body budget and checkpoint spacing — every one
 * of which a completely unplayable level passes. `w4-03` shipped through all of
 * them with its goal stranded 700px out over a void hazard: the author's notes
 * described a "goal-side pier" that was never placed, and no gate could see it.
 * This is the gate that can.
 *
 * ## What it models
 *
 * A graph of everything a hand can catch — grabbable geometry (sampled along
 * its edges, because a hand catches a ledge anywhere along it), assist beams,
 * and the grabbable props, including a rope's far end, a swing's arc and a
 * moving platform's whole path. Then a BFS from every spawn, where an edge
 * exists if the hop is within one swing: 420px of carry plus 118px of arm
 * (`PHYSICS.ARM_REACH_PX`), the generous end of the range §3.6 measures.
 *
 * Two things the naive version got wrong, both of which produced false alarms
 * before they were fixed, and both of which are load-bearing:
 *
 *   - **Falling is free.** A drop is survivable up to `DEATH_SPEED` and levels
 *     use exactly that, so a downward move only has to clear the horizontal gap.
 *   - **A sized prop is a surface, not a point.** `w2-02` bridges a 900px gap
 *     with a 900px conveyor; sampling only its origin made a deliberate
 *     crossing read as a dead end.
 *   - **A launcher is a teleport.** A `popCannon` or `trampoline` exists
 *     precisely to cross what a swing cannot, at a distance the author picks,
 *     so standing on one reaches everything.
 *
 * ## What it does NOT model, deliberately
 *
 * Physics is the real arbiter and this is a graph. It does not simulate a swing
 * arc, a door opening on its signal (a closed door is just another anchor), a
 * crate being carried somewhere to weigh down a plate, or whether a gap is
 * *pleasant*. It is a floor, not a proof: it catches the level with nothing in
 * the void, which is the failure no human notices in review and no other gate
 * can see.
 */

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { PHYSICS } from '../constants';
import type { Level, Prop, Shape, Vec2 } from '../types';

const LEVELS_DIR = join(process.cwd(), 'data', 'bums-rush', 'levels');

/** A good swing carries 300–420px (§3.6); add the arm and take the generous end. */
const SWING = 420 + PHYSICS.ARM_REACH_PX;

/** Below this drop a move is "level"; past it, gravity does the work. */
const FALL_THRESHOLD = 60;

const GRABBABLE_PROPS = new Set<Prop['kind']>([
  'crate',
  'swing',
  'rope',
  'platformMoving',
  'platformFalling',
  'skiLift',
  'trampoline',
  'lever',
  'door',
  'conveyor',
  'popCannon',
]);

const LAUNCHERS = new Set<Prop['kind']>(['popCannon', 'trampoline']);

function sampleShape(shape: Shape, out: Vec2[]): void {
  if (shape.kind === 'rect') {
    const n = Math.max(2, Math.ceil(shape.w / 200));
    for (let i = 0; i <= n; i++) out.push({ x: shape.x + (shape.w * i) / n, y: shape.y });
    out.push({ x: shape.x, y: shape.y + shape.h });
    out.push({ x: shape.x + shape.w, y: shape.y + shape.h });
  } else if (shape.kind === 'circle') {
    out.push({ x: shape.x, y: shape.y });
  } else if (shape.kind === 'poly') {
    for (const p of shape.points) out.push({ x: shape.x + p.x, y: shape.y + p.y });
  } else {
    for (const p of shape.points) out.push({ x: p.x, y: p.y });
  }
}

function anchorsOf(level: Level): Vec2[] {
  const out: Vec2[] = [];
  for (const g of level.geometry) if (g.grabbable !== false) sampleShape(g.shape, out);
  for (const beam of level.assistBeams) sampleShape(beam, out);

  for (const prop of level.props) {
    if (!GRABBABLE_PROPS.has(prop.kind)) continue;
    const size = 'size' in prop ? (prop.size as Vec2 | undefined) : undefined;
    if (size && size.x > 0) {
      const n = Math.max(2, Math.ceil(size.x / 200));
      for (let i = 0; i <= n; i++) out.push({ x: prop.at.x + (size.x * i) / n, y: prop.at.y });
    } else {
      out.push({ x: prop.at.x, y: prop.at.y });
    }
    if (prop.kind === 'swing') out.push({ x: prop.at.x, y: prop.at.y + prop.length });
    if (prop.kind === 'rope') out.push({ x: prop.at.x, y: prop.at.y + prop.segments * 20 });
    if (prop.kind === 'platformMoving' || prop.kind === 'skiLift') {
      for (const q of prop.path) out.push({ x: q.x, y: q.y });
    }
  }
  return out;
}

function centreOf(shape: Shape): Vec2 {
  if (shape.kind === 'rect') return { x: shape.x + shape.w / 2, y: shape.y + shape.h / 2 };
  if (shape.kind === 'circle') return { x: shape.x, y: shape.y };
  if (shape.kind === 'poly') return { x: shape.x, y: shape.y };
  return { x: shape.points[0].x, y: shape.points[0].y };
}

function goalIsReachable(level: Level): boolean {
  const nodes: Vec2[] = [...level.spawn, ...anchorsOf(level), centreOf(level.goal.shape)];
  const goalIdx = nodes.length - 1;

  const launchers = level.props.filter((p) => LAUNCHERS.has(p.kind)).map((p) => p.at);

  const seen = new Set<number>(level.spawn.map((_, i) => i));
  const queue: number[] = level.spawn.map((_, i) => i);

  while (queue.length) {
    const i = queue.shift() as number;
    const onLauncher = launchers.some(
      (L) => Math.hypot(L.x - nodes[i].x, L.y - nodes[i].y) <= SWING,
    );
    for (let j = 0; j < nodes.length; j++) {
      if (seen.has(j)) continue;
      const dx = Math.abs(nodes[i].x - nodes[j].x);
      const dy = nodes[j].y - nodes[i].y;
      const reachable =
        onLauncher || (dy > FALL_THRESHOLD ? dx <= SWING : Math.hypot(dx, dy) <= SWING);
      if (reachable) {
        seen.add(j);
        queue.push(j);
      }
    }
  }
  return seen.has(goalIdx);
}

const levelFiles: { id: string; level: Level }[] = readdirSync(LEVELS_DIR)
  .filter((d) => statSync(join(LEVELS_DIR, d)).isDirectory())
  .flatMap((dir) =>
    readdirSync(join(LEVELS_DIR, dir))
      .filter((f) => f.endsWith('.json'))
      .map((f) => {
        const level = JSON.parse(readFileSync(join(LEVELS_DIR, dir, f), 'utf-8')) as Level;
        return { id: level.id, level };
      }),
  )
  .sort((a, b) => a.id.localeCompare(b.id));

/**
 * Is there solid ground under the goal?
 *
 * Strictly stronger than reachability where it matters, and it earns its place:
 * `w4-06`'s goal sat 300px past the last pier — inside one swing, so the graph
 * above called it reachable — with nothing under it to land on. Reaching a goal
 * and being able to *stop* at one are different questions, and a goal hanging
 * in the air over a void is the second failure this class produces.
 */
function goalHasGround(level: Level): boolean {
  const goal = level.goal.shape;
  if (goal.kind !== 'rect') return true; // only rect goals make this checkable
  const left = goal.x;
  const right = goal.x + goal.w;
  const bottom = goal.y + goal.h;

  return level.geometry.some((g) => {
    if (g.shape.kind !== 'rect') return false;
    const gl = g.shape.x;
    const gr = g.shape.x + g.shape.w;
    const overlaps = gr > left && gl < right;
    // The surface must be at or below the goal, and close enough to be the
    // thing you land on rather than a floor two screens down.
    const drop = g.shape.y - bottom;
    return overlaps && drop >= -goal.h && drop <= 400;
  });
}

describe("Bum's Rush — every level can actually be finished", () => {
  it('found levels to check', () => {
    expect(levelFiles.length).toBeGreaterThan(0);
  });

  it.each(levelFiles.map((l) => l.id))('%s has ground under its goal', (id) => {
    const entry = levelFiles.find((l) => l.id === id);
    expect(
      goalHasGround(entry!.level),
      `${id}: the goal has no platform beneath it — it hangs in the air. Reaching a ` +
        'goal and being able to stop at one are different questions.',
    ).toBe(true);
  });

  it.each(levelFiles.map((l) => l.id))('%s has a route from spawn to goal', (id) => {
    const entry = levelFiles.find((l) => l.id === id);
    expect(
      goalIsReachable(entry!.level),
      `${id}: no chain of grabbable things gets from a spawn to the goal within one ` +
        `swing (${SWING}px). Either a platform/prop is missing, or the crossing needs ` +
        'an assist beam. If the route genuinely uses something this graph cannot see, ' +
        'widen the model in this file rather than deleting the case.',
    ).toBe(true);
  });
});
