/**
 * kd-tree over brush AABBs (architecture.md §3.2). Axial splits only; a brush is listed in every
 * leaf it overlaps (traces de-duplicate with `brushCheck`). Splits are placed on brush bounds, so
 * cells line up with brushes and leaf contents stay exact for box volumes.
 */

export interface KdBounds {
  mins: [number, number, number];
  maxs: [number, number, number];
}

export interface KdLeaf extends KdBounds {
  leaf: true;
  /** Item indices. */
  items: number[];
}

export interface KdSplit extends KdBounds {
  leaf: false;
  axis: 0 | 1 | 2;
  dist: number;
  /** Coordinate >= dist. */
  front: KdNode;
  /** Coordinate < dist. */
  back: KdNode;
}

export type KdNode = KdLeaf | KdSplit;

export const KD_MAX_LEAF = 8;
const MAX_DEPTH = 64;
const CANDIDATES = 7;

/**
 * @param bmin xyz per item
 * @param bmax xyz per item
 * @param ids the items to place
 * @param bounds the root cell
 */
export function buildKd(
  bmin: ArrayLike<number>,
  bmax: ArrayLike<number>,
  ids: number[],
  bounds: KdBounds,
  maxLeaf = KD_MAX_LEAF,
  /** Items (e.g. water volumes) whose bounds always become cell boundaries, so a leaf is inside them or outside. */
  force?: ArrayLike<number>,
): KdNode {
  return build(bmin, bmax, ids, bounds, maxLeaf, 0, force);
}

function build(
  bmin: ArrayLike<number>,
  bmax: ArrayLike<number>,
  ids: number[],
  cell: KdBounds,
  maxLeaf: number,
  depth: number,
  force?: ArrayLike<number>,
): KdNode {
  const leaf = (): KdLeaf => ({ leaf: true, items: ids, mins: cell.mins, maxs: cell.maxs });
  const n = ids.length;
  if (depth >= MAX_DEPTH) return leaf();

  let bestAxis = -1;
  let bestDist = 0;
  let bestCost = Infinity;
  let forcedHit = false;
  if (force) {
    forced: for (let k = 0; k < n; k++) {
      const id = ids[k];
      if (!force[id]) continue;
      for (let axis = 0; axis < 3; axis++) {
        for (const v of [bmin[id * 3 + axis], bmax[id * 3 + axis]]) {
          if (v > cell.mins[axis] + 1e-6 && v < cell.maxs[axis] - 1e-6) {
            bestAxis = axis;
            bestDist = v;
            forcedHit = true;
            break forced;
          }
        }
      }
    }
  }
  if (!forcedHit && n <= maxLeaf) return leaf();
  for (let axis = 0; axis < 3 && !forcedHit; axis++) {
    const lo = cell.mins[axis];
    const hi = cell.maxs[axis];
    const vals: number[] = [];
    for (let k = 0; k < n; k++) {
      const a = bmin[ids[k] * 3 + axis];
      const b = bmax[ids[k] * 3 + axis];
      if (a > lo + 1e-6 && a < hi - 1e-6) vals.push(a);
      if (b > lo + 1e-6 && b < hi - 1e-6) vals.push(b);
    }
    if (vals.length === 0) continue;
    vals.sort((x, y) => x - y);
    const cands: number[] = [];
    for (let q = 1; q <= CANDIDATES; q++) {
      const v = vals[Math.min(vals.length - 1, Math.floor((vals.length * q) / (CANDIDATES + 1)))];
      if (cands[cands.length - 1] !== v) cands.push(v);
    }
    for (const d of cands) {
      let l = 0; // overlaps the back half (coordinate < d)
      let r = 0; // overlaps the front half (coordinate > d)
      for (let k = 0; k < n; k++) {
        if (bmin[ids[k] * 3 + axis] < d) l++;
        if (bmax[ids[k] * 3 + axis] > d) r++;
      }
      if (Math.max(l, r) >= n) continue; // no progress
      const cost = l + r + Math.abs(l - r);
      if (cost < bestCost) {
        bestCost = cost;
        bestAxis = axis;
        bestDist = d;
      }
    }
  }
  if (bestAxis < 0) return leaf();

  const frontIds: number[] = [];
  const backIds: number[] = [];
  for (let k = 0; k < n; k++) {
    const id = ids[k];
    if (bmax[id * 3 + bestAxis] > bestDist) frontIds.push(id);
    if (bmin[id * 3 + bestAxis] < bestDist) backIds.push(id);
  }
  const frontCell: KdBounds = { mins: [...cell.mins], maxs: [...cell.maxs] };
  frontCell.mins[bestAxis] = bestDist;
  const backCell: KdBounds = { mins: [...cell.mins], maxs: [...cell.maxs] };
  backCell.maxs[bestAxis] = bestDist;
  return {
    leaf: false,
    axis: bestAxis as 0 | 1 | 2,
    dist: bestDist,
    mins: cell.mins,
    maxs: cell.maxs,
    front: build(bmin, bmax, frontIds, frontCell, maxLeaf, depth + 1, force),
    back: build(bmin, bmax, backIds, backCell, maxLeaf, depth + 1, force),
  };
}

export function countLeaves(node: KdNode): number {
  return node.leaf ? 1 : countLeaves(node.front) + countLeaves(node.back);
}
