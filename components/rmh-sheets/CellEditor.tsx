'use client';

import { useRef, useEffect, useCallback } from 'react';
import { useSheetsStore } from '@/lib/store/useSheetsStore';
import { cellKey, isFormula } from '@/lib/rmh-sheets/cell-utils';
import { evaluateFormula } from '@/lib/rmh-sheets/formula-engine';
import type { CellData, SheetData } from './types';

interface Props {
  sheet: SheetData;
  updateCell: (row: number, col: number, data: CellData) => void;
  left: number;
  top: number;
  width: number;
  height: number;
}

export default function CellEditor({ sheet, updateCell, left, top, width, height }: Props) {
  const { activeCell, editValue, setEditValue, stopEditing } = useSheetsStore();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = useCallback(() => {
    if (!activeCell) return;

    const value = editValue;
    let cellData: CellData;

    if (isFormula(value)) {
      const getCellData = (r: number, c: number) => sheet.cells[cellKey(r, c)];
      const evaluateCell = (r: number, c: number): string | number | boolean => {
        const cd = getCellData(r, c);
        if (!cd) return '';
        if (cd.formula) {
          const result = evaluateFormula(cd.formula, getCellData, evaluateCell);
          return result.error ? result.error : result.value;
        }
        return cd.value;
      };

      const result = evaluateFormula(value, getCellData, evaluateCell);
      cellData = {
        value: String(result.error ? result.error : result.value),
        formula: value,
        computedValue: result.error ? result.error : result.value,
      };
    } else {
      cellData = { value };
    }

    // Preserve existing style
    const existingKey = cellKey(activeCell.row, activeCell.col);
    const existing = sheet.cells[existingKey];
    if (existing?.style) {
      cellData.style = existing.style;
    }

    updateCell(activeCell.row, activeCell.col, cellData);
    stopEditing();
  }, [activeCell, editValue, sheet, updateCell, stopEditing]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      stopEditing();
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      handleSubmit();
    }
    // Stop propagation so the grid doesn't handle these keys
    e.stopPropagation();
  }, [handleSubmit, stopEditing]);

  return (
    <input
      ref={inputRef}
      className="sheets-cell-editor"
      style={{
        left,
        top,
        width: Math.max(width, 100),
        height,
      }}
      value={editValue}
      onChange={(e) => setEditValue(e.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={handleSubmit}
      spellCheck={false}
    />
  );
}
