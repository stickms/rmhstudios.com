import { describe, expect, it } from 'vitest';
import { createSeededRng } from '@/lib/lights-out/seed';
import { SHAPES, getCellCount, type GridShape } from '@/lib/lights-out/shapes';
import { createEmptyGrid, isSolved, toggleCellInGrid, type Grid } from '@/lib/lights-out/lights-out';
import { activeCells, nullSpaceBasis, pressFootprint, solveMinimum, type Press } from '@/lib/lights-out/solve';

/**
 * The brute force `solvePuzzle` used to be (every subset of presses, fewest wins), without its 2^15 cap. Each subset's
 * effect is built once per shape from its footprints, so a board is then one scan of the table.
 */
function bruteTable(shape: GridShape) {
  const cells = activeCells(shape);
  const n = cells.length;
  const index = new Map(cells.map(([r, c], i) => [`${r},${c}`, i] as const));
  const foot = cells.map(([r, c]) => {
    let bits = 0;
    for (const [fr, fc] of pressFootprint(shape, r, c)) bits |= 1 << index.get(`${fr},${fc}`)!;
    return bits;
  });
  const effect = new Int32Array(1 << n);
  const weight = new Uint8Array(1 << n);
  for (let mask = 1; mask < 1 << n; mask++) {
    const low = 31 - Math.clz32(mask & -mask);
    effect[mask] = effect[mask & (mask - 1)]! ^ foot[low]!;
    weight[mask] = weight[mask & (mask - 1)]! + 1;
  }
  return (grid: Grid): number | null => {
    let lit = 0;
    cells.forEach(([r, c], i) => {
      if (grid[r]![c]) lit |= 1 << i;
    });
    let best: number | null = null;
    for (let mask = 0; mask < 1 << n; mask++) {
      if (effect[mask] === lit && (best === null || weight[mask]! < best)) best = weight[mask]!;
    }
    return best;
  };
}

/** A random board, lit cell by cell (so about half of these are unsolvable on shapes with a null space). */
function randomLit(shape: GridShape, rand: () => number): Grid {
  const grid = createEmptyGrid(shape);
  for (const [r, c] of activeCells(shape)) grid[r]![c] = rand() < 0.5;
  return grid;
}

/** A solvable board: random presses from the solved board. */
function randomSolvable(shape: GridShape, rand: () => number): Grid {
  let grid = createEmptyGrid(shape);
  for (const [r, c] of activeCells(shape)) if (rand() < 0.4) grid = toggleCellInGrid(grid, r, c, shape);
  return grid;
}

function applyAll(shape: GridShape, grid: Grid, presses: readonly Press[]): Grid {
  return presses.reduce((g, [r, c]) => toggleCellInGrid(g, r, c, shape), grid);
}

const allShapes: GridShape[] = [
  ...SHAPES,
  { type: 'rect', rows: 5, cols: 5 },
  { type: 'rect', rows: 7, cols: 7 },
  { type: 'rect', rows: 3, cols: 7 },
  { type: 'rect', rows: 6, cols: 6 },
];

describe('the solver footprint matches the game', () => {
  it('flips the same cells as toggleCellInGrid on every shape', () => {
    for (const shape of allShapes) {
      for (const [r, c] of activeCells(shape)) {
        const flipped = toggleCellInGrid(createEmptyGrid(shape), r, c, shape);
        const lit = activeCells(shape).filter(([fr, fc]) => flipped[fr]![fc]);
        const mine = pressFootprint(shape, r, c);
        expect(mine.map((p) => p.join(',')).sort()).toEqual(lit.map((p) => p.join(',')).sort());
      }
    }
  });

  it('lists exactly the shape’s active cells', () => {
    for (const shape of allShapes) expect(activeCells(shape)).toHaveLength(getCellCount(shape));
  });
});

describe('exact solver against brute force (shapes of 15 cells or fewer)', () => {
  const small = SHAPES.filter((s) => getCellCount(s) <= 15);

  it('has the daily shapes to compare', () => {
    expect(small.length).toBeGreaterThanOrEqual(14);
  });

  for (const shape of small) {
    const name =
      shape.type === 'custom'
        ? shape.label
        : shape.type === 'rect'
          ? `${shape.rows}x${shape.cols}`
          : `triangle ${shape.size}`;
    it(`agrees with brute force on ${name} over 200 seeds`, () => {
      const brute = bruteTable(shape);
      for (let seed = 1; seed <= 200; seed++) {
        const rand = createSeededRng(seed * 7919);
        const grid = seed % 2 ? randomLit(shape, rand) : randomSolvable(shape, rand);
        const exact = solveMinimum(grid, shape);
        const expected = brute(grid);
        expect(exact === null ? null : exact.length, `seed ${seed}`).toBe(expected);
        if (exact) expect(isSolved(applyAll(shape, grid, exact), shape)).toBe(true);
      }
    });
  }
});

describe('5x5 and 7x7', () => {
  const five: GridShape = { type: 'rect', rows: 5, cols: 5 };
  const seven: GridShape = { type: 'rect', rows: 7, cols: 7 };

  const sevenFive: GridShape = { type: 'rect', rows: 7, cols: 5 };

  it('5x5 has a null space of size 4 (two free presses), 7x5 of size 16, and 7x7 only the empty one', () => {
    expect(nullSpaceBasis(five)).toHaveLength(2);
    expect(nullSpaceBasis(sevenFive)).toHaveLength(4);
    expect(nullSpaceBasis(seven)).toHaveLength(0);
  });

  /** Independent minimum: enumerate every null-space combination on top of one solution. */
  function independentMinimum(shape: GridShape, grid: Grid): number {
    const solution = solveMinimum(grid, shape)!;
    const key = (p: Press) => p[0] * 100 + p[1];
    const basis = nullSpaceBasis(shape);
    let best = Infinity;
    for (let mask = 0; mask < 1 << basis.length; mask++) {
      const set = new Set(solution.map(key));
      basis.forEach((vec, i) => {
        if (mask & (1 << i)) {
          for (const p of vec) {
            if (set.has(key(p))) set.delete(key(p));
            else set.add(key(p));
          }
        }
      });
      best = Math.min(best, set.size);
    }
    return best;
  }

  for (const [name, shape] of [
    ['5x5', five],
    ['7x5', sevenFive],
    ['7x7', seven],
  ] as const) {
    it(`${name}: the answer clears the board and no shorter one exists`, () => {
      for (let seed = 1; seed <= 60; seed++) {
        const grid = randomSolvable(shape, createSeededRng(seed * 104729));
        const solution = solveMinimum(grid, shape);
        expect(solution, `seed ${seed}`).not.toBeNull();
        expect(isSolved(applyAll(shape, grid, solution!), shape)).toBe(true);
        expect(solution!.length).toBe(independentMinimum(shape, grid));
        // Every null-space vector, added to the board, leaves it unchanged (they are real null vectors).
        for (const vec of nullSpaceBasis(shape)) expect(applyAll(shape, grid, vec)).toEqual(grid);
      }
    });
  }

  it('a board made by one corner press needs one press', () => {
    const grid = toggleCellInGrid(createEmptyGrid(five), 0, 0, five);
    expect(solveMinimum(grid, five)).toHaveLength(1);
  });

  it('a dark board needs no presses', () => {
    expect(solveMinimum(createEmptyGrid(five), five)).toEqual([]);
  });

  it('answers null for a board outside the press space', () => {
    // 5x5 has rank 23 of 25, so a quarter of all boards are reachable: random draws find unsolvable ones.
    let unsolvable = 0;
    for (let seed = 1; seed <= 50; seed++) {
      const grid = randomLit(five, createSeededRng(seed));
      const solution = solveMinimum(grid, five);
      if (solution === null) unsolvable++;
      else expect(isSolved(applyAll(five, grid, solution), five)).toBe(true);
    }
    expect(unsolvable).toBeGreaterThan(0);
    // A single lit corner is not reachable on 5x5 (it is not orthogonal to the null space's quiet patterns).
    const lone = createEmptyGrid(five);
    lone[0]![0] = true;
    expect(solveMinimum(lone, five)).toBeNull();
  });

  it('solves a 7x7 board in under 50 ms (fastest of five runs)', () => {
    const grid = randomSolvable(seven, createSeededRng(12345));
    let fastest = Infinity;
    for (let run = 0; run < 5; run++) {
      const start = performance.now();
      solveMinimum(grid, seven);
      fastest = Math.min(fastest, performance.now() - start);
    }
    expect(fastest).toBeLessThan(50);
  });
});
