export interface GridOptions {
  cellW?: number;
  cellH?: number;
  gapX?: number;
  gapY?: number;
  maxPerRow?: number;
}

export interface GridResult {
  positions: [number, number][];
  cellW: number;
  cellH: number;
  perRow: number;
  rows: number;
}

/**
 * Lays out `count` equal cells in a centered grid (origin at the grid center,
 * row 0 at the top). `perRow` is chosen to fit `areaW`, clamped to
 * [1, maxPerRow]. Returns each cell's [x, y] center in local units.
 */
export function gridLayout(count: number, areaW: number, opts: GridOptions = {}): GridResult {
  const cellW = opts.cellW ?? 2;
  const cellH = opts.cellH ?? 1;
  const gapX = opts.gapX ?? 0.2;
  const gapY = opts.gapY ?? 0.2;
  const maxPerRow = opts.maxPerRow ?? count;

  const fit = Math.floor((areaW + gapX) / (cellW + gapX));
  const perRow = Math.max(1, Math.min(maxPerRow, count, isFinite(fit) ? fit : 1));
  const rows = Math.ceil(count / perRow);
  const stepX = cellW + gapX;
  const stepY = cellH + gapY;

  const positions: [number, number][] = [];
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / perRow);
    const inRow = Math.min(perRow, count - row * perRow);
    const col = i % perRow;
    const x = (col - (inRow - 1) / 2) * stepX;
    const y = ((rows - 1) / 2 - row) * stepY;
    positions.push([x, y]);
  }
  return { positions, cellW, cellH, perRow, rows };
}
