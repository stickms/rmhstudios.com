/**
 * Lights Out — various grid shapes. Clicking a cell toggles it and its neighbors.
 * Goal: turn all lights off.
 *
 * We generate solvable puzzles by starting from "all off" and simulating random clicks.
 * Generation is verified: we store the solution and only accept puzzles that solve correctly.
 */

import type { GridShape } from './shapes';

export type Grid = boolean[][];

/** Rectangular: cell (r,c) has neighbors (r±1,c), (r,c±1) */
const RECT_DIRS = [
    [0, 0],
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
];

/** Triangle (pyramid): row r has cells 0..r. Adjacent: up-left, up-right, left, right, down-left, down-right */
function getTriangleNeighbors(r: number, c: number, size: number): [number, number][] {
    const out: [number, number][] = [[r, c]];
    if (r > 0 && c > 0) out.push([r - 1, c - 1]);
    if (r > 0 && c <= r - 1) out.push([r - 1, c]);
    if (c > 0) out.push([r, c - 1]);
    if (c < r) out.push([r, c + 1]);
    if (r + 1 < size) out.push([r + 1, c]);
    if (r + 1 < size && c + 1 <= r + 1) out.push([r + 1, c + 1]);
    return out;
}

/** Get all cells as [r,c] for a shape (for solver iteration) */
function getAllCells(shape: GridShape): [number, number][] {
    const cells: [number, number][] = [];
    if (shape.type === 'rect') {
        for (let r = 0; r < shape.rows; r++)
            for (let c = 0; c < shape.cols; c++) cells.push([r, c]);
    } else {
        for (let r = 0; r < shape.size; r++)
            for (let c = 0; c <= r; c++) cells.push([r, c]);
    }
    return cells;
}

/** Apply a set of moves (cells to toggle) and return the resulting grid */
function applyMoves(shape: GridShape, grid: Grid, moves: [number, number][]): Grid {
    const next = grid.map((row) => [...row]);
    for (const [r, c] of moves) {
        if (shape.type === 'rect') toggleAtRect(next, r, c);
        else toggleAtTriangle(next, r, c);
    }
    return next;
}

export function createEmptyGrid(shape: GridShape): Grid {
    if (shape.type === 'rect') {
        return Array.from({ length: shape.rows }, () => Array(shape.cols).fill(false));
    }
    return Array.from({ length: shape.size }, (_, r) => Array(r + 1).fill(false));
}

function toggleAtRect(grid: Grid, r: number, c: number): void {
    const rows = grid.length;
    const cols = grid[0]?.length ?? 0;
    for (const [dr, dc] of RECT_DIRS) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
            grid[nr][nc] = !grid[nr][nc];
        }
    }
}

function toggleAtTriangle(grid: Grid, r: number, c: number): void {
    const size = grid.length;
    for (const [nr, nc] of getTriangleNeighbors(r, c, size)) {
        grid[nr][nc] = !grid[nr][nc];
    }
}

function getRandomCellRect(shape: { rows: number; cols: number }, random: () => number): [number, number] {
    const r = Math.floor(random() * shape.rows);
    const c = Math.floor(random() * shape.cols);
    return [r, c];
}

function getRandomCellTriangle(size: number, random: () => number): [number, number] {
    const r = Math.floor(random() * size);
    const c = Math.floor(random() * (r + 1));
    return [r, c];
}

/** Scale initial-moves count by total cell count. */
function getMoveRange(shape: GridShape): [number, number] {
    const cells =
        shape.type === 'rect'
            ? shape.rows * shape.cols
            : (shape.size * (shape.size + 1)) / 2;
    if (cells <= 6) return [2, 5];
    if (cells <= 9) return [3, 6];
    if (cells <= 12) return [4, 8];
    return [5, 10];
}

/**
 * Brute-force solver: try all subsets of cells. Returns a solution (min length) or null.
 * Feasible for up to ~15 cells (2^15 = 32k iterations).
 */
export function solvePuzzle(grid: Grid, shape: GridShape): [number, number][] | null {
    const cells = getAllCells(shape);
    const n = cells.length;
    const maxAttempts = Math.min(1 << n, 1 << 15);
    for (let mask = 0; mask < maxAttempts; mask++) {
        const moves: [number, number][] = [];
        for (let i = 0; i < n; i++) if (mask & (1 << i)) moves.push(cells[i]);
        const result = applyMoves(shape, grid.map((row) => [...row]), moves);
        if (isSolved(result)) return moves;
    }
    return null;
}

/**
 * Generate a solvable puzzle by recording moves from solved state.
 * Guarantees every puzzle has a solution. Verified with solver.
 */
export function generatePuzzle(random: () => number, shape: GridShape): Grid {
    const [minMoves, maxMoves] = getMoveRange(shape);
    const numMoves = minMoves + Math.floor(random() * (maxMoves - minMoves + 1));

    const grid = createEmptyGrid(shape);
    for (let i = 0; i < numMoves; i++) {
        const [r, c] =
            shape.type === 'rect'
                ? getRandomCellRect(shape, random)
                : getRandomCellTriangle(shape.size, random);
        if (shape.type === 'rect') toggleAtRect(grid, r, c);
        else toggleAtTriangle(grid, r, c);
    }

    const verify = solvePuzzle(grid, shape);
    if (!verify) {
        console.error('[LightsOut] Generated unsolvable puzzle — fallback to empty');
        return createEmptyGrid(shape);
    }
    return grid;
}

export function toggleCellInGrid(grid: Grid, r: number, c: number, shape: GridShape): Grid {
    const next = grid.map((row) => [...row]);
    if (shape.type === 'rect') {
        toggleAtRect(next, r, c);
    } else {
        toggleAtTriangle(next, r, c);
    }
    return next;
}

export function isSolved(grid: Grid): boolean {
    return grid.every((row) => row.every((cell) => !cell));
}
