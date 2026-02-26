import type { CellData, CellRange, ClipboardData } from '@/components/rmh-sheets/types';
import { cellKey, normalizeRange } from './cell-utils';

/**
 * Copy the selected range of cells as TSV for system clipboard.
 */
export function cellsToTSV(
  cells: Record<string, CellData>,
  range: CellRange
): string {
  const norm = normalizeRange(range);
  const rows: string[] = [];

  for (let r = norm.start.row; r <= norm.end.row; r++) {
    const cols: string[] = [];
    for (let c = norm.start.col; c <= norm.end.col; c++) {
      const cell = cells[cellKey(r, c)];
      const displayValue = cell?.computedValue !== undefined ? String(cell.computedValue) : (cell?.value ?? '');
      cols.push(displayValue);
    }
    rows.push(cols.join('\t'));
  }

  return rows.join('\n');
}

/**
 * Parse TSV string (from clipboard) into a 2D array of values.
 */
export function parseTSV(tsv: string): string[][] {
  return tsv.split('\n').map((row) => row.split('\t'));
}

/**
 * Create internal clipboard data for format-preserving paste.
 */
export function createClipboardData(
  cells: Record<string, CellData>,
  range: CellRange
): ClipboardData {
  const norm = normalizeRange(range);
  const clipCells: Record<string, CellData> = {};

  for (let r = norm.start.row; r <= norm.end.row; r++) {
    for (let c = norm.start.col; c <= norm.end.col; c++) {
      const key = cellKey(r, c);
      const cell = cells[key];
      if (cell) {
        // Store with relative key (offset from start)
        const relKey = cellKey(r - norm.start.row, c - norm.start.col);
        clipCells[relKey] = { ...cell };
      }
    }
  }

  return { cells: clipCells, range: norm };
}

/**
 * Apply internal clipboard data at a target position.
 * Returns the cells that should be updated.
 */
export function applyClipboardData(
  clipData: ClipboardData,
  targetRow: number,
  targetCol: number
): Record<string, CellData> {
  const result: Record<string, CellData> = {};

  for (const [relKey, cell] of Object.entries(clipData.cells)) {
    const [relRow, relCol] = relKey.split(':').map(Number);
    const key = cellKey(targetRow + relRow, targetCol + relCol);
    result[key] = { ...cell };
  }

  return result;
}
