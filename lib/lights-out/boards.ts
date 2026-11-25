/**
 * Member-made Lights Out boards — the pure half: which shapes are allowed, how a board is stored, what a board must
 * be to be published, and how a press sequence is replayed against it. No database and no zod here (the client
 * imports this); the schemas are in `boards-schema.ts` and the database half is `boards.server.ts`.
 *
 * A board is a shape plus the lit cells, stored as a row-major string of `0`/`1` over the shape's active cells. Every
 * number the server records (the optimum, a member's move count) comes from `solve.ts` and `replayPresses`, never
 * from the client.
 */

import type { Grid } from './lights-out';
import { createEmptyGrid, isSolved, toggleCellInGrid } from './lights-out';
import type { GridShape } from './shapes';
import { SHAPES, getCellCount, getShapeLabel, isActiveCell } from './shapes';
import { MAX_REPLAY_MOVES } from './replay-log';
import { activeCells, solveMinimum, type Press } from './solve';

/** A maker board is solvable in at least this many presses. */
export const MIN_BOARD_MOVES = 3;
export const MIN_RECT_SIDE = 3;
export const MAX_RECT_SIDE = 7;
export const MAX_TITLE_LENGTH = 60;
/** New boards a member may publish in 24 hours, and in all. */
export const MAX_BOARDS_PER_DAY = 10;
export const MAX_BOARDS_PER_MEMBER = 200;
export const PAGE_SIZE = 25;
export const FEWEST_LIST_SIZE = 10;
/** The longest press sequence the solve endpoint replays (the replay schema's bound). */
export const MAX_PRESSES = MAX_REPLAY_MOVES;

/**
 * A shape as it is stored and sent: a rectangle, a triangle, or one of the daily's masked shapes by its label (the
 * mask is looked up in `SHAPES`, so it is never taken from the client).
 */
export type StoredShape =
  { type: 'rect'; rows: number; cols: number } | { type: 'triangle'; size: number } | { type: 'custom'; label: string };

const DAILY_TRIANGLES = new Set(
  SHAPES.filter((s): s is Extract<GridShape, { type: 'triangle' }> => s.type === 'triangle').map((s) => s.size),
);
const DAILY_CUSTOM = new Map(
  SHAPES.filter((s): s is Extract<GridShape, { type: 'custom' }> => s.type === 'custom').map((s) => [s.label, s]),
);

const isInt = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n);

/**
 * The shape an untrusted value names, or null when it is not allowed: a rectangle from 3x3 to 7x7, a daily triangle,
 * or a daily masked shape. Anything else (another size, an unknown label, extra fields on a custom mask) is refused.
 */
export function isAllowedShape(input: unknown): GridShape | null {
  if (typeof input !== 'object' || input === null) return null;
  const o = input as Record<string, unknown>;
  if (o.type === 'rect') {
    const { rows, cols } = o;
    if (!isInt(rows) || !isInt(cols)) return null;
    if (rows < MIN_RECT_SIDE || rows > MAX_RECT_SIDE || cols < MIN_RECT_SIDE || cols > MAX_RECT_SIDE) return null;
    return { type: 'rect', rows, cols };
  }
  if (o.type === 'triangle') {
    return isInt(o.size) && DAILY_TRIANGLES.has(o.size) ? { type: 'triangle', size: o.size } : null;
  }
  if (o.type === 'custom') {
    return typeof o.label === 'string' ? (DAILY_CUSTOM.get(o.label) ?? null) : null;
  }
  return null;
}

/** The compact form of a shape for storage. */
export function toStoredShape(shape: GridShape): StoredShape {
  if (shape.type === 'rect') return { type: 'rect', rows: shape.rows, cols: shape.cols };
  if (shape.type === 'triangle') return { type: 'triangle', size: shape.size };
  return { type: 'custom', label: shape.label };
}

/** Every shape the maker offers besides the rectangles: the daily's triangles and masked shapes. */
export function dailyShapeChoices(): StoredShape[] {
  return SHAPES.filter((s) => s.type !== 'rect').map(toStoredShape);
}

/** A short name for a stored shape, for a board's row. */
export function shapeName(shape: GridShape): string {
  return getShapeLabel(shape);
}

/** The lit cells as a row-major string of `0`/`1` over the shape's active cells. */
export function encodeCells(grid: Grid, shape: GridShape): string {
  return activeCells(shape)
    .map(([r, c]) => (grid[r]?.[c] ? '1' : '0'))
    .join('');
}

/** The board a stored string describes, or null when its length or characters do not fit the shape. */
export function decodeCells(cells: string, shape: GridShape): Grid | null {
  const active = activeCells(shape);
  if (cells.length !== active.length || !/^[01]+$/.test(cells)) return null;
  const grid = createEmptyGrid(shape);
  active.forEach(([r, c], i) => {
    const row = grid[r];
    if (row) row[c] = cells[i] === '1';
  });
  return grid;
}

export type PublishRefusal = 'unsolvable' | 'dark' | 'too-easy';

export type PublishCheck =
  { ok: true; optimalMoves: number } | { ok: false; reason: PublishRefusal; optimalMoves: number | null };

/**
 * What a board must be to be published: lit, solvable, and not solvable in fewer than {@link MIN_BOARD_MOVES}
 * presses. `optimalMoves` is the exact minimum (null when unsolvable); the maker shows it live and the server runs
 * the same check before it stores anything.
 */
export function checkPublish(grid: Grid, shape: GridShape): PublishCheck {
  if (isSolved(grid, shape)) return { ok: false, reason: 'dark', optimalMoves: 0 };
  const solution = solveMinimum(grid, shape);
  if (!solution) return { ok: false, reason: 'unsolvable', optimalMoves: null };
  if (solution.length < MIN_BOARD_MOVES) return { ok: false, reason: 'too-easy', optimalMoves: solution.length };
  return { ok: true, optimalMoves: solution.length };
}

export interface ReplayResult {
  /** True when the sequence is legal on this board and ends with every light off. */
  solved: boolean;
  /** The number of presses, which is what a solve records. 0 when the sequence is not legal. */
  moves: number;
}

/**
 * Replay a press sequence on a board, as `verifyLightsOut` (`lib/game/replay.ts`) does for the daily: a press on an
 * inactive or out-of-range cell is impossible in real play, so the sequence is refused; otherwise it counts only if
 * the board ends dark. The server records `moves` only when `solved`.
 */
export function replayPresses(shape: GridShape, grid: Grid, presses: readonly Press[]): ReplayResult {
  if (presses.length === 0 || presses.length > MAX_PRESSES) return { solved: false, moves: 0 };
  let board = grid;
  for (const [r, c] of presses) {
    if (!isInt(r) || !isInt(c) || !isActiveCell(shape, r, c)) return { solved: false, moves: 0 };
    board = toggleCellInGrid(board, r, c, shape);
  }
  return isSolved(board, shape) ? { solved: true, moves: presses.length } : { solved: false, moves: 0 };
}

/**
 * A random board that passes {@link checkPublish}: presses from the solved board, so it is always solvable, retried
 * until the exact solver says it needs at least {@link MIN_BOARD_MOVES}. `random` returns [0, 1).
 */
export function scrambleBoard(shape: GridShape, random: () => number = Math.random): Grid {
  const cells = activeCells(shape);
  const n = cells.length;
  const high = Math.max(MIN_BOARD_MOVES, Math.min(n, Math.ceil(n / 2)));
  for (let attempt = 0; attempt < 60; attempt++) {
    const count = MIN_BOARD_MOVES + Math.floor(random() * (high - MIN_BOARD_MOVES + 1));
    const pool = cells.slice();
    let grid = createEmptyGrid(shape);
    for (let k = 0; k < count && pool.length; k++) {
      const [cell] = pool.splice(Math.floor(random() * pool.length), 1);
      if (cell) grid = toggleCellInGrid(grid, cell[0], cell[1], shape);
    }
    if (checkPublish(grid, shape).ok) return grid;
  }
  // Practically unreachable: sweep triples of neighbouring cells until one is hard enough.
  for (let i = 0; i + 2 < n; i++) {
    let grid = createEmptyGrid(shape);
    for (const cell of [cells[i], cells[i + 1], cells[(i + Math.floor(n / 2)) % n]]) {
      if (cell) grid = toggleCellInGrid(grid, cell[0], cell[1], shape);
    }
    if (checkPublish(grid, shape).ok) return grid;
  }
  return createEmptyGrid(shape);
}

/** How many lights are on, for the maker's count. */
export function litCount(grid: Grid, shape: GridShape): number {
  return activeCells(shape).filter(([r, c]) => grid[r]?.[c]).length;
}

/** The active-cell count of a shape (the length of a stored `cells` string). */
export function cellCountOf(shape: GridShape): number {
  return getCellCount(shape);
}

/* ------------------------------ views (shared by the contract and the pages) ------------------------------ */

export interface BoardSummary {
  id: string;
  title: string;
  author: { name: string; handle: string | null };
  shape: StoredShape;
  optimalMoves: number;
  plays: number;
  solves: number;
  createdAt: string;
}

export interface FewestMovesRow {
  rank: number;
  name: string;
  handle: string | null;
  moves: number;
  solvedAt: string;
}

export interface BoardView extends BoardSummary {
  cells: string;
  isAuthor: boolean;
  /** The caller's own record on this board, or null when they have not played it. */
  mine: { bestMoves: number | null; solvedAt: string | null } | null;
  /** The ten fewest-move solvers, with board privacy and blocks applied. */
  fewest: FewestMovesRow[];
}

export type BoardTab = 'recent' | 'played' | 'mine';
