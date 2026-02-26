export interface CellStyle {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  textColor?: string;
  bgColor?: string;
  fontSize?: number;
  format?: CellFormat;
  alignment?: 'left' | 'center' | 'right';
  borders?: {
    top?: boolean;
    right?: boolean;
    bottom?: boolean;
    left?: boolean;
  };
}

export type CellFormat = 'auto' | 'number' | 'currency' | 'percent' | 'date' | 'text';

export interface CellData {
  value: string;
  formula?: string;
  computedValue?: string | number | boolean;
  style?: CellStyle;
}

export interface SheetData {
  id: string;
  name: string;
  cells: Record<string, CellData>; // key format: "row:col"
  colWidths: Record<string, number>;
  rowHeights: Record<string, number>;
  frozenRows: number;
  frozenCols: number;
}

export interface SpreadsheetState {
  sheets: SheetData[];
  activeSheetId: string;
}

export interface CellAddress {
  row: number;
  col: number;
}

export interface CellRange {
  start: CellAddress;
  end: CellAddress;
}

export interface FormulaResult {
  value: string | number | boolean;
  error?: string;
}

export interface ClipboardData {
  cells: Record<string, CellData>;
  range: CellRange;
}
