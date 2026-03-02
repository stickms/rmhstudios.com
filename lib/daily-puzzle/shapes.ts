/**
 * Grid shapes for Lights Out — rectangular and triangular.
 * Each day gets a different shape from the seed.
 */

export type GridShape =
    | { type: 'rect'; rows: number; cols: number }
    | { type: 'triangle'; size: number }; // size = rows, total cells = 1+2+...+size

/** All shapes that can appear. Seed picks one. */
const SHAPES: GridShape[] = [
    { type: 'rect', rows: 2, cols: 3 },
    { type: 'rect', rows: 3, cols: 2 },
    { type: 'rect', rows: 3, cols: 3 },
    { type: 'rect', rows: 3, cols: 4 },
    { type: 'rect', rows: 4, cols: 3 },
    { type: 'rect', rows: 4, cols: 4 },
    { type: 'rect', rows: 2, cols: 4 },
    { type: 'rect', rows: 4, cols: 2 },
    { type: 'triangle', size: 4 },  // 10 cells
    { type: 'triangle', size: 5 },  // 15 cells
];

export function getDailyShape(seed: number): GridShape {
    return SHAPES[seed % SHAPES.length];
}

export function getShapeLabel(shape: GridShape): string {
    if (shape.type === 'rect') {
        return `${shape.rows}×${shape.cols}`;
    }
    return `△${shape.size}`;
}
