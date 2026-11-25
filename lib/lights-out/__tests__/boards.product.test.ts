import { describe, expect, it } from 'vitest';
import { createSeededRng } from '@/lib/lights-out/seed';
import { SHAPES, type GridShape } from '@/lib/lights-out/shapes';
import { createEmptyGrid, toggleCellInGrid, type Grid } from '@/lib/lights-out/lights-out';
import { solveMinimum } from '@/lib/lights-out/solve';
import {
  MIN_BOARD_MOVES,
  checkPublish,
  dailyShapeChoices,
  decodeCells,
  encodeCells,
  isAllowedShape,
  replayPresses,
  scrambleBoard,
  toStoredShape,
} from '@/lib/lights-out/boards';

function pressAll(shape: GridShape, presses: [number, number][]): Grid {
  return presses.reduce((g, [r, c]) => toggleCellInGrid(g, r, c, shape), createEmptyGrid(shape));
}

describe('shape validation', () => {
  it('accepts every daily shape, by its stored form', () => {
    for (const shape of SHAPES.filter((s) => s.type !== 'rect')) {
      const allowed = isAllowedShape(toStoredShape(shape));
      expect(allowed).not.toBeNull();
      // A custom mask is looked up, never taken from the client.
      expect(allowed).toEqual(shape);
    }
    expect(dailyShapeChoices().length).toBe(SHAPES.filter((s) => s.type !== 'rect').length);
  });

  it('accepts every rectangle from 3x3 to 7x7', () => {
    for (let rows = 3; rows <= 7; rows++)
      for (let cols = 3; cols <= 7; cols++)
        expect(isAllowedShape({ type: 'rect', rows, cols })).toEqual({ type: 'rect', rows, cols });
  });

  it('refuses everything else', () => {
    const refused: unknown[] = [
      null,
      undefined,
      'rect',
      42,
      {},
      { type: 'rect', rows: 2, cols: 5 },
      { type: 'rect', rows: 5, cols: 8 },
      { type: 'rect', rows: 3.5, cols: 4 },
      { type: 'rect', rows: '5', cols: 5 },
      { type: 'triangle', size: 3 },
      { type: 'triangle', size: 6 },
      { type: 'custom', label: 'Nonsense' },
      { type: 'custom', mask: [[true]], rows: 1, cols: 1, label: 'x' },
      { type: 'hexagon', size: 4 },
    ];
    for (const input of refused) expect(isAllowedShape(input), JSON.stringify(input)).toBeNull();
  });
});

describe('cell encoding', () => {
  it('round-trips on every shape', () => {
    const shapes: GridShape[] = [...SHAPES, { type: 'rect', rows: 7, cols: 7 }, { type: 'rect', rows: 3, cols: 6 }];
    for (const shape of shapes) {
      const rand = createSeededRng(99);
      const grid = createEmptyGrid(shape);
      for (let r = 0; r < grid.length; r++)
        for (let c = 0; c < grid[r]!.length; c++) {
          const active = shape.type !== 'custom' || shape.mask[r]![c];
          grid[r]![c] = Boolean(active) && rand() < 0.5;
        }
      const text = encodeCells(grid, shape);
      expect(text).toMatch(/^[01]+$/);
      expect(text.length).toBeLessThanOrEqual(64);
      expect(decodeCells(text, shape)).toEqual(grid);
    }
  });

  it('refuses a string of the wrong length or with other characters', () => {
    const shape: GridShape = { type: 'rect', rows: 3, cols: 3 };
    expect(decodeCells('01010', shape)).toBeNull();
    expect(decodeCells('01010101x', shape)).toBeNull();
    expect(decodeCells('', shape)).toBeNull();
    expect(decodeCells('010101010', shape)).not.toBeNull();
  });
});

describe('publish checks', () => {
  const five: GridShape = { type: 'rect', rows: 5, cols: 5 };

  it('refuses an already dark board', () => {
    expect(checkPublish(createEmptyGrid(five), five)).toMatchObject({ ok: false, reason: 'dark' });
  });

  it('refuses an unsolvable board', () => {
    const lone = createEmptyGrid(five);
    lone[0]![0] = true;
    expect(checkPublish(lone, five)).toMatchObject({ ok: false, reason: 'unsolvable', optimalMoves: null });
  });

  it('refuses a board solvable in fewer than three moves', () => {
    expect(checkPublish(pressAll(five, [[2, 2]]), five)).toMatchObject({
      ok: false,
      reason: 'too-easy',
      optimalMoves: 1,
    });
    expect(
      checkPublish(
        pressAll(five, [
          [0, 0],
          [4, 4],
        ]),
        five,
      ),
    ).toMatchObject({ ok: false, reason: 'too-easy' });
  });

  it('accepts a board of three presses and reports the exact optimum', () => {
    const grid = pressAll(five, [
      [0, 0],
      [2, 2],
      [4, 4],
    ]);
    const res = checkPublish(grid, five);
    expect(res).toEqual({ ok: true, optimalMoves: solveMinimum(grid, five)!.length });
    expect(res.optimalMoves).toBeGreaterThanOrEqual(MIN_BOARD_MOVES);
  });

  it('the optimum can be below the number of presses used to make the board', () => {
    // Pressing every cell of a 5x5 and then the quiet patterns' cells cancel: the solver, not the press count, decides.
    const grid = pressAll(five, [
      [1, 0],
      [0, 1],
      [1, 1],
      [2, 0],
      [0, 2],
    ]);
    const res = checkPublish(grid, five);
    expect(res.optimalMoves).toBe(solveMinimum(grid, five)!.length);
  });
});

describe('replayPresses', () => {
  const shape: GridShape = { type: 'rect', rows: 5, cols: 5 };
  const presses: [number, number][] = [
    [0, 0],
    [2, 2],
    [4, 4],
    [1, 3],
  ];
  const board = pressAll(shape, presses);

  it('counts a sequence that turns every light off', () => {
    expect(replayPresses(shape, board, presses)).toEqual({ solved: true, moves: 4 });
    // Order does not matter: presses commute.
    expect(replayPresses(shape, board, [...presses].reverse())).toEqual({ solved: true, moves: 4 });
  });

  it('counts a longer sequence by its length, not by the optimum', () => {
    const padded: [number, number][] = [...presses, [3, 3], [3, 3]];
    expect(replayPresses(shape, board, padded)).toEqual({ solved: true, moves: 6 });
  });

  it('refuses a sequence that leaves a light on', () => {
    expect(replayPresses(shape, board, presses.slice(1))).toEqual({ solved: false, moves: 0 });
    expect(replayPresses(shape, board, [[4, 0]])).toEqual({ solved: false, moves: 0 });
  });

  it('refuses an empty sequence, an out-of-range press and an inactive cell', () => {
    expect(replayPresses(shape, board, [])).toEqual({ solved: false, moves: 0 });
    expect(replayPresses(shape, board, [...presses, [9, 9]])).toEqual({ solved: false, moves: 0 });
    expect(replayPresses(shape, board, [...presses, [-1, 0]])).toEqual({ solved: false, moves: 0 });
    const plus = SHAPES.find((s) => s.type === 'custom' && s.label.includes('Plus'))!;
    expect(replayPresses(plus, createEmptyGrid(plus), [[0, 0]])).toEqual({ solved: false, moves: 0 });
  });

  it('refuses a sequence past the replay bound', () => {
    const long: [number, number][] = Array.from({ length: 2_002 }, () => [0, 0]);
    expect(replayPresses(shape, createEmptyGrid(shape), long)).toEqual({ solved: false, moves: 0 });
  });
});

describe('scrambleBoard', () => {
  it('always passes the publish check, over 500 seeds spread across shapes', () => {
    const shapes: GridShape[] = [
      ...SHAPES,
      { type: 'rect', rows: 5, cols: 5 },
      { type: 'rect', rows: 7, cols: 7 },
      { type: 'rect', rows: 6, cols: 4 },
    ];
    for (let seed = 1; seed <= 500; seed++) {
      const shape = shapes[seed % shapes.length]!;
      const grid = scrambleBoard(shape, createSeededRng(seed));
      const check = checkPublish(grid, shape);
      expect(check.ok, `seed ${seed}`).toBe(true);
      expect(solveMinimum(grid, shape), `seed ${seed}`).not.toBeNull();
    }
  });
});
