/**
 * Lights Out — the exact minimum-press solver.
 *
 * Pressing a cell flips it and its neighbours, so the presses that clear a board are the solutions of a linear
 * system over GF(2): `A x = b`, where column j of `A` is the footprint of cell j and `b` is the lit cells. Gaussian
 * elimination (Gauss-Jordan, rows as bit sets) either finds the system inconsistent (the board cannot be solved) or
 * gives one solution plus a basis of the null space; every other solution is that one plus a combination of the basis,
 * and the fewest presses is the lightest of those `2^k` vectors. The null space is enumerated, so the answer is exact
 * for any shape whose null space is within {@link MAX_NULL_SPACE_BITS}. (5x5 has two free presses, 7x7 has nine.)
 *
 * This replaces the brute force over press subsets that `solvePuzzle` used to run, which looked only at the first 15
 * cells and so was wrong above that. The footprint rule is written out here, not read from `lights-out.ts`, because
 * that module delegates to this one; `solve.product.test.ts` checks the two agree on every allowed shape.
 */

import type { GridShape } from './shapes';
import { isActiveCell } from './shapes';

/** A board of lit (true) and dark cells, indexed `[row][col]`. The same shape as `Grid` in `lights-out.ts`. */
export type SolveGrid = boolean[][];

export type Press = [number, number];

/** The solver refuses a shape whose null space has more than `2^16` vectors; no allowed shape comes close. */
export const MAX_NULL_SPACE_BITS = 16;

const RECT_DIRS: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

/** The rows and columns of the box a shape sits in. A triangle of size n sits in an n by n box. */
function boxOf(shape: GridShape): { rows: number; cols: number } {
  if (shape.type === 'triangle') return { rows: shape.size, cols: shape.size };
  return { rows: shape.rows, cols: shape.cols };
}

/** Every active cell, row by row. */
export function activeCells(shape: GridShape): Press[] {
  const { rows, cols } = boxOf(shape);
  const out: Press[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (isActiveCell(shape, r, c)) out.push([r, c]);
  return out;
}

/** The cells one press flips (the cell itself and its neighbours), active cells only. */
export function pressFootprint(shape: GridShape, r: number, c: number): Press[] {
  if (shape.type === 'triangle') {
    const size = shape.size;
    // Row r has cells 0..r: up-left, up-right, left, right, down-left and down-right neighbours.
    const out: Press[] = [[r, c]];
    if (r > 0 && c > 0) out.push([r - 1, c - 1]);
    if (r > 0 && c <= r - 1) out.push([r - 1, c]);
    if (c > 0) out.push([r, c - 1]);
    if (c < r) out.push([r, c + 1]);
    if (r + 1 < size) out.push([r + 1, c]);
    if (r + 1 < size && c + 1 <= r + 1) out.push([r + 1, c + 1]);
    return out;
  }
  const out: Press[] = [];
  for (const [dr, dc] of RECT_DIRS) {
    const nr = r + dr;
    const nc = c + dc;
    if (isActiveCell(shape, nr, nc)) out.push([nr, nc]);
  }
  return out;
}

function popcount(x: bigint): number {
  let n = 0;
  let lo = Number(x & 0xffffffffn);
  let hi = Number(x >> 32n);
  while (lo) {
    lo &= lo - 1;
    n++;
  }
  while (hi) {
    hi &= hi - 1;
    n++;
  }
  return n;
}

interface Reduced {
  /** One solution of `A x = b` (free presses 0), as a bit set over the active cells. */
  particular: bigint;
  /** A basis of the null space: press sets that change nothing. */
  basis: bigint[];
}

/** Gauss-Jordan over GF(2). Row i is the equation for active cell i; the bit `n` is the right-hand side. */
function reduce(shape: GridShape, cells: Press[], lit: (r: number, c: number) => boolean): Reduced | null {
  const n = cells.length;
  const index = new Map<number, number>();
  const { cols } = boxOf(shape);
  cells.forEach(([r, c], i) => index.set(r * cols + c, i));

  const rows: bigint[] = new Array<bigint>(n).fill(0n);
  cells.forEach(([r, c], j) => {
    // Pressing cell j flips these cells, so column j of the matrix has a 1 in each of their rows.
    for (const [fr, fc] of pressFootprint(shape, r, c)) {
      const i = index.get(fr * cols + fc);
      if (i !== undefined) rows[i] = (rows[i] ?? 0n) ^ (1n << BigInt(j));
    }
  });
  cells.forEach(([r, c], i) => {
    if (lit(r, c)) rows[i] = (rows[i] ?? 0n) ^ (1n << BigInt(n));
  });

  const pivotOfColumn = new Map<number, number>();
  let rank = 0;
  for (let col = 0; col < n; col++) {
    const bit = 1n << BigInt(col);
    let found = -1;
    for (let i = rank; i < n; i++) {
      if ((rows[i] ?? 0n) & bit) {
        found = i;
        break;
      }
    }
    if (found < 0) continue;
    const pivotRow = rows[found] ?? 0n;
    rows[found] = rows[rank] ?? 0n;
    rows[rank] = pivotRow;
    for (let i = 0; i < n; i++) {
      if (i !== rank && (rows[i] ?? 0n) & bit) rows[i] = (rows[i] ?? 0n) ^ pivotRow;
    }
    pivotOfColumn.set(col, rank);
    rank++;
  }

  const rhs = 1n << BigInt(n);
  // A zero row with a 1 on the right is `0 = 1`: the board has no solution.
  for (let i = rank; i < n; i++) if ((rows[i] ?? 0n) & rhs) return null;

  let particular = 0n;
  for (const [col, row] of pivotOfColumn) if ((rows[row] ?? 0n) & rhs) particular |= 1n << BigInt(col);

  const basis: bigint[] = [];
  for (let free = 0; free < n; free++) {
    if (pivotOfColumn.has(free)) continue;
    const freeBit = 1n << BigInt(free);
    let v = freeBit;
    for (const [col, row] of pivotOfColumn) if ((rows[row] ?? 0n) & freeBit) v |= 1n << BigInt(col);
    basis.push(v);
  }
  return { particular, basis };
}

/** The null space as press sets (each a list of cells): presses that, together, change nothing. */
export function nullSpaceBasis(shape: GridShape): Press[][] {
  const cells = activeCells(shape);
  const reduced = reduce(shape, cells, () => false);
  if (!reduced) return [];
  return reduced.basis.map((v) => cells.filter((_, i) => (v >> BigInt(i)) & 1n));
}

/**
 * The fewest presses that turn every light off, or null when the board cannot be solved (or the shape's null space is
 * past {@link MAX_NULL_SPACE_BITS}). A dark board answers `[]`. Which of several equal-length solutions is returned
 * is not specified; the length is.
 */
export function solveMinimum(grid: SolveGrid, shape: GridShape): Press[] | null {
  const cells = activeCells(shape);
  const reduced = reduce(shape, cells, (r, c) => grid[r]?.[c] === true);
  if (!reduced || reduced.basis.length > MAX_NULL_SPACE_BITS) return null;

  let best = reduced.particular;
  let bestWeight = popcount(best);
  // Gray code: each step adds one basis vector, so the whole null space is visited once.
  let current = reduced.particular;
  const total = 1 << reduced.basis.length;
  for (let step = 1; step < total; step++) {
    const flip = reduced.basis[31 - Math.clz32(step & -step)];
    if (flip === undefined) continue;
    current ^= flip;
    const weight = popcount(current);
    if (weight < bestWeight) {
      best = current;
      bestWeight = weight;
    }
  }

  return cells.filter((_, i) => (best >> BigInt(i)) & 1n);
}

/** The minimum move count, or null when the board cannot be solved. */
export function minimumMoves(grid: SolveGrid, shape: GridShape): number | null {
  const solution = solveMinimum(grid, shape);
  return solution ? solution.length : null;
}
