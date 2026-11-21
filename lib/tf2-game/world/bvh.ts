/**
 * A static axis-aligned bounding-volume hierarchy over items with boxes
 * (displacement triangles, static-prop convex pieces). Built once at map load
 * (median split on the longest axis), queried per trace with a swept box:
 * each node's box is grown by the trace extents and slab-tested against the
 * segment, so long traces only visit nodes along their path. Queries
 * allocate nothing; the visitor is a callback the owner binds once.
 */

export class AabbBvh {
  readonly itemCount: number;
  /** min xyz / max xyz per node. */
  private readonly bounds: Float64Array;
  /** Internal: index of the right child (left is node + 1). Leaf: -1. */
  private readonly right: Int32Array;
  /** Leaf: first index into `order` and count. */
  private readonly first: Int32Array;
  private readonly count: Int32Array;
  /** Item ids in leaf order. */
  readonly order: Int32Array;
  private nodeCount = 0;
  private readonly stack = new Int32Array(128);

  /**
   * @param mins / maxs  xyz per item (3 * count each)
   * @param leafSize     items per leaf
   */
  constructor(mins: ArrayLike<number>, maxs: ArrayLike<number>, count: number, leafSize = 4) {
    this.itemCount = count;
    const maxNodes = 2 * count + 1; // a binary tree with ≥1 item per leaf
    this.bounds = new Float64Array(maxNodes * 6);
    this.right = new Int32Array(maxNodes);
    this.first = new Int32Array(maxNodes);
    this.count = new Int32Array(maxNodes);
    this.order = new Int32Array(count);
    for (let i = 0; i < count; i++) this.order[i] = i;
    if (count === 0) {
      this.nodeCount = 0;
      return;
    }
    const centroid = new Float64Array(count * 3);
    for (let i = 0; i < count * 3; i++) centroid[i] = (mins[i] + maxs[i]) * 0.5;
    this.build(mins, maxs, centroid, 0, count, leafSize);
  }

  private build(
    mins: ArrayLike<number>,
    maxs: ArrayLike<number>,
    centroid: Float64Array,
    start: number,
    end: number,
    leafSize: number,
  ): number {
    const node = this.nodeCount++;
    const b = this.bounds;
    const o = node * 6;
    b[o] = b[o + 1] = b[o + 2] = Infinity;
    b[o + 3] = b[o + 4] = b[o + 5] = -Infinity;
    let cminx = Infinity;
    let cminy = Infinity;
    let cminz = Infinity;
    let cmaxx = -Infinity;
    let cmaxy = -Infinity;
    let cmaxz = -Infinity;
    for (let i = start; i < end; i++) {
      const it = this.order[i];
      for (let k = 0; k < 3; k++) {
        if (mins[it * 3 + k] < b[o + k]) b[o + k] = mins[it * 3 + k];
        if (maxs[it * 3 + k] > b[o + 3 + k]) b[o + 3 + k] = maxs[it * 3 + k];
      }
      const cx = centroid[it * 3];
      const cy = centroid[it * 3 + 1];
      const cz = centroid[it * 3 + 2];
      if (cx < cminx) cminx = cx;
      if (cy < cminy) cminy = cy;
      if (cz < cminz) cminz = cz;
      if (cx > cmaxx) cmaxx = cx;
      if (cy > cmaxy) cmaxy = cy;
      if (cz > cmaxz) cmaxz = cz;
    }
    const n = end - start;
    if (n <= leafSize) {
      this.right[node] = -1;
      this.first[node] = start;
      this.count[node] = n;
      return node;
    }
    const ex = cmaxx - cminx;
    const ey = cmaxy - cminy;
    const ez = cmaxz - cminz;
    const axis = ex >= ey && ex >= ez ? 0 : ey >= ez ? 1 : 2;
    // Median split by centroid along the axis (sort the slice).
    const slice = Array.from(this.order.subarray(start, end));
    slice.sort((a, c) => centroid[a * 3 + axis] - centroid[c * 3 + axis]);
    this.order.set(slice, start);
    const mid = start + (n >> 1);
    this.build(mins, maxs, centroid, start, mid, leafSize);
    this.right[node] = this.build(mins, maxs, centroid, mid, end, leafSize);
    this.first[node] = 0;
    this.count[node] = 0;
    return node;
  }

  /**
   * Visits every item whose box, grown by `ext` (+eps), the segment
   * start → start + delta passes through. `visit` returns true to stop early.
   */
  query(
    sx: number,
    sy: number,
    sz: number,
    dx: number,
    dy: number,
    dz: number,
    ex: number,
    ey: number,
    ez: number,
    visit: (item: number) => boolean,
  ): void {
    if (this.nodeCount === 0) return;
    const b = this.bounds;
    const stack = this.stack;
    let sp = 0;
    stack[sp++] = 0;
    const idx = dx !== 0 ? 1 / dx : 0;
    const idy = dy !== 0 ? 1 / dy : 0;
    const idz = dz !== 0 ? 1 / dz : 0;
    while (sp > 0) {
      const node = stack[--sp];
      const o = node * 6;
      // Slab test of the segment against the grown node box.
      let tmin = 0;
      let tmax = 1;
      let lo = b[o] - ex;
      let hi = b[o + 3] + ex;
      if (dx === 0) {
        if (sx < lo || sx > hi) continue;
      } else {
        let t1 = (lo - sx) * idx;
        let t2 = (hi - sx) * idx;
        if (t1 > t2) {
          const t = t1;
          t1 = t2;
          t2 = t;
        }
        if (t1 > tmin) tmin = t1;
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) continue;
      }
      lo = b[o + 1] - ey;
      hi = b[o + 4] + ey;
      if (dy === 0) {
        if (sy < lo || sy > hi) continue;
      } else {
        let t1 = (lo - sy) * idy;
        let t2 = (hi - sy) * idy;
        if (t1 > t2) {
          const t = t1;
          t1 = t2;
          t2 = t;
        }
        if (t1 > tmin) tmin = t1;
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) continue;
      }
      lo = b[o + 2] - ez;
      hi = b[o + 5] + ez;
      if (dz === 0) {
        if (sz < lo || sz > hi) continue;
      } else {
        let t1 = (lo - sz) * idz;
        let t2 = (hi - sz) * idz;
        if (t1 > t2) {
          const t = t1;
          t1 = t2;
          t2 = t;
        }
        if (t1 > tmin) tmin = t1;
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) continue;
      }
      const r = this.right[node];
      if (r < 0) {
        const f = this.first[node];
        const c = this.count[node];
        for (let i = 0; i < c; i++) if (visit(this.order[f + i])) return;
      } else if (sp + 2 <= stack.length) {
        stack[sp++] = r;
        stack[sp++] = node + 1;
      }
    }
  }

  /** Visits every item whose box overlaps [mins, maxs]. */
  queryBox(
    minx: number,
    miny: number,
    minz: number,
    maxx: number,
    maxy: number,
    maxz: number,
    visit: (item: number) => boolean,
  ): void {
    const cx = (minx + maxx) * 0.5;
    const cy = (miny + maxy) * 0.5;
    const cz = (minz + maxz) * 0.5;
    this.query(cx, cy, cz, 0, 0, 0, maxx - cx, maxy - cy, maxz - cz, visit);
  }
}
