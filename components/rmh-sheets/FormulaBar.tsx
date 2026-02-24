'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSheetsStore } from '@/lib/store/useSheetsStore';
import { formatCellRef, cellKey, isFormula } from '@/lib/rmh-sheets/cell-utils';
import { evaluateFormula } from '@/lib/rmh-sheets/formula-engine';
import type { CellData, SheetData } from './types';

interface Props {
  activeSheet: SheetData | null;
  updateCell: (row: number, col: number, data: CellData) => void;
}

export default function FormulaBar({ activeSheet, updateCell }: Props) {
  const { activeCell, isEditing, editValue, setEditValue, startEditing, stopEditing } = useSheetsStore();
  const [localValue, setLocalValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync from active cell
  useEffect(() => {
    if (!activeCell || !activeSheet) {
      setLocalValue('');
      return;
    }
    const key = cellKey(activeCell.row, activeCell.col);
    const cell = activeSheet.cells[key];
    const val = cell?.formula || cell?.value || '';
    setLocalValue(val);
  }, [activeCell, activeSheet]);

  // Sync from editing state
  useEffect(() => {
    if (isEditing) {
      setLocalValue(editValue);
    }
  }, [isEditing, editValue]);

  const handleSubmit = useCallback(() => {
    if (!activeCell || !activeSheet) return;

    const value = localValue;
    let cellData: CellData;

    if (isFormula(value)) {
      const getCellData = (r: number, c: number) => activeSheet.cells[cellKey(r, c)];
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
    const existing = activeSheet.cells[existingKey];
    if (existing?.style) {
      cellData.style = existing.style;
    }

    updateCell(activeCell.row, activeCell.col, cellData);
    stopEditing();
  }, [activeCell, activeSheet, localValue, updateCell, stopEditing]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      // Revert
      if (activeCell && activeSheet) {
        const key = cellKey(activeCell.row, activeCell.col);
        const cell = activeSheet.cells[key];
        setLocalValue(cell?.formula || cell?.value || '');
      }
      stopEditing();
    }
  }, [handleSubmit, stopEditing, activeCell, activeSheet]);

  const handleFocus = useCallback(() => {
    startEditing(localValue);
  }, [localValue, startEditing]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalValue(e.target.value);
    setEditValue(e.target.value);
  }, [setEditValue]);

  const cellRef = activeCell ? formatCellRef(activeCell.row, activeCell.col) : '';

  return (
    <div className="sheets-formula-bar">
      <div className="sheets-formula-bar-ref">
        {cellRef}
      </div>
      <div style={{ width: 1, height: 20, background: 'var(--sheets-border)', flexShrink: 0 }} />
      <input
        ref={inputRef}
        className="sheets-formula-bar-input"
        value={localValue}
        onChange={handleChange}
        onFocus={handleFocus}
        onKeyDown={handleKeyDown}
        onBlur={handleSubmit}
        placeholder="Enter value or formula..."
        spellCheck={false}
      />
    </div>
  );
}
