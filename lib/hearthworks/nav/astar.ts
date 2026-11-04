import type { World } from '../world';
import { adjacentMove, gapMove, walkable, type Blocker, type MoveKind } from './passable';

export interface PathStep {
  x: number;
  z: number;
  kind: MoveKind;
}

export interface PathResult {
  steps: PathStep[];
  cost: number;
}

export interface PathOptions {
  /** Stop once within this many tiles (Chebyshev) of the goal — to reach a stall's counter, not its middle. */
  stopWithin?: number;
  /** Give up after expanding this many tiles. */
  maxExpansions?: number;
  /** Temporary obstacles. */
  blocked?: Blocker;
}

const DIRS8: readonly (readonly [number, number])[] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
  [1, -1],
  [1, 1],
  [-1, 1],
  [-1, -1],
];
const GAPS: readonly (readonly [number, number])[] = [
  [0, -2],
  [2, 0],
  [0, 2],
  [-2, 0],
];

/** A min-heap over (f, h, index) — all three, so ties break the same way on every machine. */
class Heap {
  private f: number[] = [];
  private h: number[] = [];
  private n: number[] = [];
  get size() {
    return this.n.length;
  }
  private less(a: number, b: number) {
    return this.f[a] < this.f[b] || (this.f[a] === this.f[b] && (this.h[a] < this.h[b] || (this.h[a] === this.h[b] && this.n[a] < this.n[b])));
  }
  private swap(a: number, b: number) {
    [this.f[a], this.f[b]] = [this.f[b], this.f[a]];
    [this.h[a], this.h[b]] = [this.h[b], this.h[a]];
    [this.n[a], this.n[b]] = [this.n[b], this.n[a]];
  }
  push(f: number, h: number, n: number) {
    this.f.push(f);
    this.h.push(h);
    this.n.push(n);
    let i = this.n.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(i, p)) break;
      this.swap(i, p);
      i = p;
    }
  }
  pop(): number {
    const top = this.n[0];
    const last = this.n.length - 1;
    this.swap(0, last);
    this.f.pop();
    this.h.pop();
    this.n.pop();
    let i = 0;
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let m = i;
      if (l < this.n.length && this.less(l, m)) m = l;
      if (r < this.n.length && this.less(r, m)) m = r;
      if (m === i) break;
      this.swap(i, m);
      i = m;
    }
    return top;
  }
}

/** Octile distance: the cost of the cheapest possible route on an open flat map. */
const octile = (dx: number, dz: number) => {
  const a = Math.abs(dx);
  const b = Math.abs(dz);
  return Math.max(a, b) + (Math.SQRT2 - 1) * Math.min(a, b);
};

/**
 * Cheapest route from one tile to another under the movement rules in `passable.ts` (walks, one-block jumps, falls,
 * gap jumps), or null if there is none. Deterministic: the same world and arguments give the same path on every
 * replica, which the lockstep multiplayer depends on.
 */
export function findPath(
  world: World,
  from: { x: number; z: number },
  to: { x: number; z: number },
  opts: PathOptions = {},
): PathResult | null {
  const n = world.size;
  const sx = Math.round(from.x);
  const sz = Math.round(from.z);
  const gx = Math.round(to.x);
  const gz = Math.round(to.z);
  const within = opts.stopWithin ?? 0;
  const max = opts.maxExpansions ?? 6000;
  const inMap = (x: number, z: number) => x >= 0 && z >= 0 && x < n && z < n;
  if (!inMap(sx, sz) || !inMap(gx, gz)) return null;
  // Starting on a blocked tile is allowed (someone built around them); the goal must be reachable if exact.
  if (within === 0 && !walkable(world, gx, gz, opts.blocked)) return null;

  const g = new Float64Array(n * n).fill(Infinity);
  const parent = new Int32Array(n * n).fill(-1);
  const kind = new Uint8Array(n * n);
  const closed = new Uint8Array(n * n);
  const start = sz * n + sx;
  g[start] = 0;
  const heap = new Heap();
  const h0 = octile(gx - sx, gz - sz);
  heap.push(h0, h0, start);
  const KINDS: MoveKind[] = ['walk', 'jump', 'fall'];
  const kindCode = { walk: 0, jump: 1, fall: 2 } as const;

  let expansions = 0;
  while (heap.size > 0) {
    const cur = heap.pop();
    if (closed[cur]) continue;
    closed[cur] = 1;
    const cx = cur % n;
    const cz = (cur - cx) / n;
    if (Math.max(Math.abs(cx - gx), Math.abs(cz - gz)) <= within) {
      const steps: PathStep[] = [];
      for (let i = cur; i !== start; i = parent[i]) {
        const x = i % n;
        steps.push({ x, z: (i - x) / n, kind: KINDS[kind[i]] });
      }
      steps.reverse();
      return { steps, cost: g[cur] };
    }
    if (++expansions > max) return null;
    const relax = (nx: number, nz: number, move: { kind: MoveKind; cost: number } | null) => {
      if (!move) return;
      const ni = nz * n + nx;
      if (closed[ni]) return;
      const ng = g[cur] + move.cost;
      if (ng < g[ni]) {
        g[ni] = ng;
        parent[ni] = cur;
        kind[ni] = kindCode[move.kind];
        const h = octile(gx - nx, gz - nz);
        heap.push(ng + h, h, ni);
      }
    };
    for (const [dx, dz] of DIRS8) {
      const nx = cx + dx;
      const nz = cz + dz;
      if (inMap(nx, nz)) relax(nx, nz, adjacentMove(world, cx, cz, nx, nz, opts.blocked));
    }
    for (const [dx, dz] of GAPS) {
      const nx = cx + dx;
      const nz = cz + dz;
      if (inMap(nx, nz)) relax(nx, nz, gapMove(world, cx, cz, nx, nz, opts.blocked));
    }
  }
  return null;
}
