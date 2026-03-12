/**
 * Grid shapes for Lights Out — rectangular, triangular, and custom masked shapes.
 * Each day gets a different shape from the seed.
 */

export type GridShape =
    | { type: 'rect'; rows: number; cols: number }
    | { type: 'triangle'; size: number }
    | { type: 'custom'; rows: number; cols: number; mask: boolean[][]; label: string };

/** Helper to create a mask from a visual string pattern (# = active, . = inactive) */
function maskFrom(pattern: string[]): boolean[][] {
    return pattern.map((row) => [...row].map((ch) => ch === '#'));
}

// Diamond 5×5 — 13 active cells
const DIAMOND_MASK = maskFrom([
    '..#..',
    '.###.',
    '#####',
    '.###.',
    '..#..',
]);

// Plus 5×5 — 9 active cells
const PLUS_MASK = maskFrom([
    '..#..',
    '..#..',
    '#####',
    '..#..',
    '..#..',
]);

// H-shape 5×3 — 11 active cells
const H_MASK = maskFrom([
    '#.#',
    '#.#',
    '###',
    '#.#',
    '#.#',
]);

// Ring 4×4 — 12 active cells
const RING_MASK = maskFrom([
    '####',
    '#..#',
    '#..#',
    '####',
]);

// Arrow 5×5 — 11 active cells
const ARROW_MASK = maskFrom([
    '..#..',
    '.###.',
    '#####',
    '..#..',
    '..#..',
]);

// U-shape 4×3 — 10 active cells
const U_MASK = maskFrom([
    '#.#',
    '#.#',
    '#.#',
    '###',
]);

// Butterfly 5×5 — 13 active cells
const BUTTERFLY_MASK = maskFrom([
    '#...#',
    '##.##',
    '..#..',
    '##.##',
    '#...#',
]);

// T-shape 4×5 — 9 active cells
const T_MASK = maskFrom([
    '#####',
    '..#..',
    '..#..',
    '..#..',
]);

/** All shapes that can appear. Seed picks one. */
const SHAPES: GridShape[] = [
    // Classic rectangles
    { type: 'rect', rows: 3, cols: 3 },
    { type: 'rect', rows: 3, cols: 4 },
    { type: 'rect', rows: 4, cols: 3 },
    { type: 'rect', rows: 4, cols: 4 },
    { type: 'rect', rows: 3, cols: 5 },
    { type: 'rect', rows: 5, cols: 3 },
    // Triangles
    { type: 'triangle', size: 4 },  // 10 cells
    { type: 'triangle', size: 5 },  // 15 cells
    // Custom shapes
    { type: 'custom', rows: 5, cols: 5, mask: DIAMOND_MASK, label: '◇ Diamond' },
    { type: 'custom', rows: 5, cols: 5, mask: PLUS_MASK, label: '✚ Plus' },
    { type: 'custom', rows: 5, cols: 3, mask: H_MASK, label: 'H-Shape' },
    { type: 'custom', rows: 4, cols: 4, mask: RING_MASK, label: '◻ Ring' },
    { type: 'custom', rows: 5, cols: 5, mask: ARROW_MASK, label: '↑ Arrow' },
    { type: 'custom', rows: 4, cols: 3, mask: U_MASK, label: 'U-Shape' },
    { type: 'custom', rows: 5, cols: 5, mask: BUTTERFLY_MASK, label: '⦿ Butterfly' },
    { type: 'custom', rows: 4, cols: 5, mask: T_MASK, label: 'T-Shape' },
];

export function getDailyShape(seed: number): GridShape {
    return SHAPES[seed % SHAPES.length];
}

export function getShapeLabel(shape: GridShape): string {
    if (shape.type === 'rect') return `${shape.rows}×${shape.cols}`;
    if (shape.type === 'triangle') return `△${shape.size}`;
    return shape.label;
}

/** Count active cells in a shape */
export function getCellCount(shape: GridShape): number {
    if (shape.type === 'rect') return shape.rows * shape.cols;
    if (shape.type === 'triangle') return (shape.size * (shape.size + 1)) / 2;
    return shape.mask.reduce((sum, row) => sum + row.filter(Boolean).length, 0);
}

/** Check if a cell is active for the given shape */
export function isActiveCell(shape: GridShape, r: number, c: number): boolean {
    if (shape.type === 'custom') return shape.mask[r]?.[c] ?? false;
    if (shape.type === 'rect') return r >= 0 && r < shape.rows && c >= 0 && c < shape.cols;
    return r >= 0 && r < shape.size && c >= 0 && c <= r;
}
