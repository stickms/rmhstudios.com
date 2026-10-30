/**
 * The path follower's wall slide (path.ts): a move clipping a wall the nav areas hide turns along the wall
 * at full speed instead of grinding into it; head on, against a slope, or in the open it is left alone.
 */
import { describe, expect, it } from 'vitest';
import type { GameWorld } from '../sim/world';
import { newMoveIntent, PathFollower } from './path';

/** A world whose collision answers every hull trace with one plane (or nothing). */
function worldWithWall(normal: { x: number; y: number; z: number } | null): GameWorld {
  return {
    curtime: 0,
    mapCollision: {
      traceHull: (_a: unknown, _b: unknown, _mn: unknown, _mx: unknown, _mask: number, _f: unknown, out: Record<string, unknown>) => {
        Object.assign(out, { fraction: normal ? 0.3 : 1, startSolid: false, plane: { normal: normal ?? { x: 0, y: 0, z: 0 } } });
        return out;
      },
    },
  } as unknown as GameWorld;
}

function slide(normal: { x: number; y: number; z: number } | null, dirX: number, dirY: number) {
  const f = new PathFollower();
  const out = newMoveIntent();
  const l = Math.hypot(dirX, dirY);
  out.dirX = dirX / l;
  out.dirY = dirY / l;
  out.speed = 1;
  (f as unknown as { slideAlongWalls(w: GameWorld, p: { x: number; y: number; z: number }, o: typeof out): void }).slideAlongWalls(
    worldWithWall(normal),
    { x: 0, y: 0, z: 0 },
    out,
  );
  return out;
}

describe('path follower wall slide', () => {
  it('turns a move that clips a wall along it, at full speed, the way it leans', () => {
    const o = slide({ x: 0, y: 1, z: 0 }, 0.1, -1);
    expect(o.dirX).toBeCloseTo(1);
    expect(o.dirY).toBeCloseTo(0);
    expect(slide({ x: 0, y: 1, z: 0 }, -0.3, -1).dirX).toBeCloseTo(-1);
  });

  it('leaves a head-on move, a slope, a wall behind and open ground alone', () => {
    expect(slide({ x: 0, y: 1, z: 0 }, 0, -1).dirY).toBeCloseTo(-1);
    expect(slide({ x: 0, y: 0.5, z: 0.866 }, 0.1, -1).dirY).toBeLessThan(-0.9);
    expect(slide({ x: 0, y: -1, z: 0 }, 0.1, -1).dirY).toBeLessThan(-0.9);
    expect(slide(null, 0.1, -1).dirY).toBeLessThan(-0.9);
  });
});
