import type { CellAddress, CellRange } from '@/components/rmh-sheets/types';
import { normalizeRange } from './cell-utils';

/**
 * Check if a cell address is within a range.
 */
export function isCellInRange(cell: CellAddress, range: CellRange): boolean {
  const norm = normalizeRange(range);
  return (
    cell.row >= norm.start.row &&
    cell.row <= norm.end.row &&
    cell.col >= norm.start.col &&
    cell.col <= norm.end.col
  );
}

/**
 * Check if a cell is the active cell (exact match).
 */
export function isCellActive(cell: CellAddress, activeCell: CellAddress | null): boolean {
  if (!activeCell) return false;
  return cell.row === activeCell.row && cell.col === activeCell.col;
}

/**
 * Get a "select all" range given total rows and cols.
 */
export function selectAllRange(totalRows: number, totalCols: number): CellRange {
  return {
    start: { row: 0, col: 0 },
    end: { row: totalRows - 1, col: totalCols - 1 },
  };
}

/**
 * Get a "select row" range.
 */
export function selectRowRange(row: number, totalCols: number): CellRange {
  return {
    start: { row, col: 0 },
    end: { row, col: totalCols - 1 },
  };
}

/**
 * Get a "select column" range.
 */
export function selectColumnRange(col: number, totalRows: number): CellRange {
  return {
    start: { row: 0, col },
    end: { row: totalRows - 1, col },
  };
}

/**
 * Move the active cell in a direction, clamped to bounds.
 */
export function moveActiveCell(
  current: CellAddress,
  direction: 'up' | 'down' | 'left' | 'right',
  maxRow: number,
  maxCol: number
): CellAddress {
  const { row, col } = current;
  switch (direction) {
    case 'up': return { row: Math.max(0, row - 1), col };
    case 'down': return { row: Math.min(maxRow - 1, row + 1), col };
    case 'left': return { row, col: Math.max(0, col - 1) };
    case 'right': return { row, col: Math.min(maxCol - 1, col + 1) };
  }
}
