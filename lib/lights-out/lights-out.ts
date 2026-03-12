/**
 * Lights Out — various grid shapes. Clicking a cell toggles it and its neighbors.
 * Goal: turn all lights off.
 *
 * We generate solvable puzzles by selecting unique random cells from the solved state.
 * Since each cell is toggled at most once during generation, the optimal solution
 * is exactly the set of cells used to create the puzzle.
 */

import type { GridShape } from './shapes';
import { isActiveCell } from './shapes';

export type Grid = boolean[][];

/** Rectangular / custom: cell (r,c) has neighbors (r±1,c), (r,c±1) */
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

/** Get all active cells as [r,c] for a shape */
function getAllCells(shape: GridShape): [number, number][] {
    const cells: [number, number][] = [];
    if (shape.type === 'rect') {
        for (let r = 0; r < shape.rows; r++)
            for (let c = 0; c < shape.cols; c++) cells.push([r, c]);
    } else if (shape.type === 'triangle') {
        for (let r = 0; r < shape.size; r++)
            for (let c = 0; c <= r; c++) cells.push([r, c]);
    } else {
        // custom
        for (let r = 0; r < shape.rows; r++)
            for (let c = 0; c < shape.cols; c++)
                if (shape.mask[r][c]) cells.push([r, c]);
    }
    return cells;
}

export function createEmptyGrid(shape: GridShape): Grid {
    if (shape.type === 'rect') {
        return Array.from({ length: shape.rows }, () => Array(shape.cols).fill(false));
    }
    if (shape.type === 'triangle') {
        return Array.from({ length: shape.size }, (_, r) => Array(r + 1).fill(false));
    }
    // custom: full rect grid, inactive cells stay false
    return Array.from({ length: shape.rows }, () => Array(shape.cols).fill(false));
}

function toggleAtRect(grid: Grid, r: number, c: number, shape: GridShape): void {
    const rows = grid.length;
    const cols = grid[0]?.length ?? 0;
    for (const [dr, dc] of RECT_DIRS) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
            if (!isActiveCell(shape, nr, nc)) continue;
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

/** Apply a set of moves and return the resulting grid */
function applyMoves(shape: GridShape, grid: Grid, moves: [number, number][]): Grid {
    const next = grid.map((row) => [...row]);
    for (const [r, c] of moves) {
        if (shape.type === 'triangle') toggleAtTriangle(next, r, c);
        else toggleAtRect(next, r, c, shape);
    }
    return next;
}

export function isSolved(grid: Grid, shape: GridShape): boolean {
    if (shape.type === 'custom') {
        return grid.every((row, r) =>
            row.every((cell, c) => !isActiveCell(shape, r, c) || !cell)
        );
    }
    return grid.every((row) => row.every((cell) => !cell));
}

/**
 * Brute-force solver: try all subsets of cells. Returns a minimum-length solution or null.
 * Feasible for up to ~15 cells (2^15 = 32k iterations).
 */
export function solvePuzzle(grid: Grid, shape: GridShape): [number, number][] | null {
    const cells = getAllCells(shape);
    const n = cells.length;
    const maxMask = Math.min(1 << n, 1 << 15);
    let best: [number, number][] | null = null;
    for (let mask = 1; mask < maxMask; mask++) {
        const moves: [number, number][] = [];
        for (let i = 0; i < n; i++) if (mask & (1 << i)) moves.push(cells[i]);
        if (best && moves.length >= best.length) continue; // prune
        const result = applyMoves(shape, grid.map((row) => [...row]), moves);
        if (isSolved(result, shape)) best = moves;
    }
    return best;
}

/** Get the optimal (minimum) move count for a grid */
export function getOptimalMoves(grid: Grid, shape: GridShape): number | null {
    const solution = solvePuzzle(grid, shape);
    return solution ? solution.length : null;
}

/**
 * Fisher-Yates shuffle using seeded RNG
 */
function shuffle<T>(arr: T[], random: () => number): T[] {
    const out = [...arr];
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
}

/**
 * Generate a solvable puzzle by selecting UNIQUE random cells to toggle.
 * Since each cell is toggled at most once, the optimal solution equals the
 * number of cells selected. This prevents trivial/already-solved puzzles.
 */
export function generatePuzzle(random: () => number, shape: GridShape): Grid {
    const cells = getAllCells(shape);
    const n = cells.length;

    // Scale difficulty by grid size
    const minMoves = n <= 6 ? 2 : n <= 9 ? 3 : n <= 12 ? 4 : 5;
    const maxMoves = n <= 6 ? 4 : n <= 9 ? 5 : n <= 12 ? 7 : 8;

    for (let attempt = 0; attempt < 100; attempt++) {
        const numMoves = minMoves + Math.floor(random() * (maxMoves - minMoves + 1));
        const shuffled = shuffle(cells, random);
        const selected = shuffled.slice(0, numMoves);

        const grid = createEmptyGrid(shape);
        for (const [r, c] of selected) {
            if (shape.type === 'triangle') toggleAtTriangle(grid, r, c);
            else toggleAtRect(grid, r, c, shape);
        }

        // Must not be already solved
        if (isSolved(grid, shape)) continue;

        // Verify solvable and solution requires at least minMoves
        const solution = solvePuzzle(grid, shape);
        if (!solution || solution.length < minMoves) continue;

        return grid;
    }

    // Fallback: guaranteed non-trivial — toggle first minMoves cells
    const grid = createEmptyGrid(shape);
    for (let i = 0; i < Math.min(minMoves, cells.length); i++) {
        const [r, c] = cells[i];
        if (shape.type === 'triangle') toggleAtTriangle(grid, r, c);
        else toggleAtRect(grid, r, c, shape);
    }
    return grid;
}

export function toggleCellInGrid(grid: Grid, r: number, c: number, shape: GridShape): Grid {
    const next = grid.map((row) => [...row]);
    if (shape.type === 'triangle') {
        toggleAtTriangle(next, r, c);
    } else {
        toggleAtRect(next, r, c, shape);
    }
    return next;
}
