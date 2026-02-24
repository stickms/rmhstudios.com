import type { CellAddress, CellRange } from '@/components/rmh-sheets/types';

/**
 * Convert a zero-based column index to a letter (0 -> "A", 25 -> "Z", 26 -> "AA").
 */
export function colToLetter(col: number): string {
  let letter = '';
  let c = col;
  while (c >= 0) {
    letter = String.fromCharCode((c % 26) + 65) + letter;
    c = Math.floor(c / 26) - 1;
  }
  return letter;
}

/**
 * Convert a column letter to a zero-based index ("A" -> 0, "Z" -> 25, "AA" -> 26).
 */
export function letterToCol(letter: string): number {
  let col = 0;
  const upper = letter.toUpperCase();
  for (let i = 0; i < upper.length; i++) {
    col = col * 26 + (upper.charCodeAt(i) - 64);
  }
  return col - 1;
}

/**
 * Parse a cell reference like "A1" or "$A$1" into a CellAddress { row, col }.
 */
export function parseCellRef(ref: string): CellAddress | null {
  const match = ref.replace(/\$/g, '').match(/^([A-Za-z]+)(\d+)$/);
  if (!match) return null;
  const col = letterToCol(match[1]);
  const row = parseInt(match[2], 10) - 1; // zero-based
  if (row < 0 || col < 0) return null;
  return { row, col };
}

/**
 * Format a CellAddress to a string like "A1".
 */
export function formatCellRef(row: number, col: number): string {
  return `${colToLetter(col)}${row + 1}`;
}

/**
 * Make a cell key for storing in the data map: "row:col".
 */
export function cellKey(row: number, col: number): string {
  return `${row}:${col}`;
}

/**
 * Parse a cell key "row:col" back to { row, col }.
 */
export function parseCellKey(key: string): CellAddress {
  const [r, c] = key.split(':').map(Number);
  return { row: r, col: c };
}

/**
 * Parse a range like "A1:B5" to a CellRange.
 */
export function parseRange(range: string): CellRange | null {
  const parts = range.split(':');
  if (parts.length !== 2) return null;
  const start = parseCellRef(parts[0]);
  const end = parseCellRef(parts[1]);
  if (!start || !end) return null;
  return { start, end };
}

/**
 * Expand a CellRange to an array of all cell addresses within it.
 */
export function expandRange(range: CellRange): CellAddress[] {
  const addresses: CellAddress[] = [];
  const minRow = Math.min(range.start.row, range.end.row);
  const maxRow = Math.max(range.start.row, range.end.row);
  const minCol = Math.min(range.start.col, range.end.col);
  const maxCol = Math.max(range.start.col, range.end.col);
  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      addresses.push({ row, col });
    }
  }
  return addresses;
}

/**
 * Normalize a range so start is always top-left and end is bottom-right.
 */
export function normalizeRange(range: CellRange): CellRange {
  return {
    start: {
      row: Math.min(range.start.row, range.end.row),
      col: Math.min(range.start.col, range.end.col),
    },
    end: {
      row: Math.max(range.start.row, range.end.row),
      col: Math.max(range.start.col, range.end.col),
    },
  };
}

/**
 * Check if a value string starts with "=" indicating a formula.
 */
export function isFormula(value: string): boolean {
  return typeof value === 'string' && value.startsWith('=');
}

/**
 * Format a cell value for display based on its format type.
 */
export function formatCellValue(value: string | number | boolean | undefined, format?: string): string {
  if (value === undefined || value === null || value === '') return '';

  const num = typeof value === 'number' ? value : parseFloat(String(value));

  if (format === 'currency' && !isNaN(num)) {
    return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  if (format === 'percent' && !isNaN(num)) {
    return `${(num * 100).toFixed(2)}%`;
  }
  if (format === 'number' && !isNaN(num)) {
    return num.toLocaleString('en-US');
  }
  if (format === 'date') {
    const d = new Date(value as string | number);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString();
    }
  }

  return String(value);
}
