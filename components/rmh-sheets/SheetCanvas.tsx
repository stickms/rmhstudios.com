'use client';

import { useRef, useCallback, useMemo, useState, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useSheetsStore } from '@/lib/store/useSheetsStore';
import {
  colToLetter, cellKey, formatCellValue, isFormula,
  normalizeRange, expandRange,
} from '@/lib/rmh-sheets/cell-utils';
import { evaluateFormula } from '@/lib/rmh-sheets/formula-engine';
import { cellsToTSV, parseTSV, createClipboardData, applyClipboardData } from '@/lib/rmh-sheets/clipboard';
import { isCellInRange, isCellActive, moveActiveCell, selectRowRange, selectColumnRange } from '@/lib/rmh-sheets/selection';
import type { CellData, SheetData } from './types';
import CellEditor from './CellEditor';

const DEFAULT_COL_WIDTH = 100;
const DEFAULT_ROW_HEIGHT = 28;
const HEADER_WIDTH = 46;
const HEADER_HEIGHT = 28;
const TOTAL_ROWS = 200;
const TOTAL_COLS = 26;

interface Props {
  sheet: SheetData;
  updateCell: (row: number, col: number, data: CellData) => void;
  updateCells: (updates: Record<string, CellData>) => void;
  deleteCells: (keys: string[]) => void;
  updateColWidth: (col: number, width: number) => void;
  updateRowHeight: (row: number, height: number) => void;
  version: number;
}

export default function SheetCanvas({ sheet, updateCell, updateCells, deleteCells, updateColWidth, updateRowHeight, version }: Props) {
  // `version` triggers re-renders on Y.js document changes
  void version;
  const containerRef = useRef<HTMLDivElement>(null);
  const {
    activeCell, selectionRange, isEditing,
    setActiveCell, setSelectionRange,
    startEditing,
  } = useSheetsStore();

  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ row: number; col: number } | null>(null);
  const [resizingCol, setResizingCol] = useState<number | null>(null);
  const [resizingRow, setResizingRow] = useState<number | null>(null);
  const [resizeStart, setResizeStart] = useState<number>(0);
  const [resizeOriginal, setResizeOriginal] = useState<number>(0);
  const clipboardDataRef = useRef<ReturnType<typeof createClipboardData> | null>(null);

  const getColWidth = useCallback((col: number) => {
    return sheet.colWidths[String(col)] || DEFAULT_COL_WIDTH;
  }, [sheet.colWidths]);

  const getRowHeight = useCallback((row: number) => {
    return sheet.rowHeights[String(row)] || DEFAULT_ROW_HEIGHT;
  }, [sheet.rowHeights]);

  // Row virtualizer
  const rowVirtualizer = useVirtualizer({
    count: TOTAL_ROWS,
    getScrollElement: () => containerRef.current,
    estimateSize: (i) => getRowHeight(i),
    overscan: 5,
  });

  // Column virtualizer
  const colVirtualizer = useVirtualizer({
    horizontal: true,
    count: TOTAL_COLS,
    getScrollElement: () => containerRef.current,
    estimateSize: (i) => getColWidth(i),
    overscan: 3,
  });

  // Evaluate a cell value (resolving formulas)
  const evaluateCellValue = useCallback((row: number, col: number): string | number | boolean => {
    const key = cellKey(row, col);
    const cell = sheet.cells[key];
    if (!cell) return '';
    if (cell.computedValue !== undefined) return cell.computedValue;
    if (cell.formula && isFormula(cell.formula)) {
      const getCellData = (r: number, c: number) => sheet.cells[cellKey(r, c)];
      const evalCell = (r: number, c: number): string | number | boolean => {
        const cd = getCellData(r, c);
        if (!cd) return '';
        if (cd.computedValue !== undefined) return cd.computedValue;
        if (cd.formula) {
          const result = evaluateFormula(cd.formula, getCellData, evalCell);
          return result.error ? result.error : result.value;
        }
        return cd.value;
      };
      const result = evaluateFormula(cell.formula, getCellData, evalCell);
      return result.error ? result.error : result.value;
    }
    return cell.value;
  }, [sheet.cells]);

  // Get display value for a cell
  const getCellDisplay = useCallback((row: number, col: number): string => {
    const val = evaluateCellValue(row, col);
    const key = cellKey(row, col);
    const cell = sheet.cells[key];
    const format = cell?.style?.format;
    return formatCellValue(val, format);
  }, [evaluateCellValue, sheet.cells]);

  // Handle cell click
  const handleCellClick = useCallback((row: number, col: number, e: React.MouseEvent) => {
    if (isEditing) {
      // Commit current edit first — the CellEditor onBlur handles this
    }

    if (e.shiftKey && activeCell) {
      // Extend selection
      setSelectionRange({ start: activeCell, end: { row, col } });
    } else {
      setActiveCell({ row, col });
      setSelectionRange(null);
    }
  }, [activeCell, isEditing, setActiveCell, setSelectionRange]);

  // Handle cell double click — start editing
  const handleCellDoubleClick = useCallback((row: number, col: number) => {
    const key = cellKey(row, col);
    const cell = sheet.cells[key];
    const val = cell?.formula || cell?.value || '';
    setActiveCell({ row, col });
    startEditing(val);
  }, [sheet.cells, setActiveCell, startEditing]);

  // Handle mouse down for drag selection
  const handleCellMouseDown = useCallback((row: number, col: number, e: React.MouseEvent) => {
    if (e.button !== 0) return; // Left click only
    if (e.detail >= 2) return; // Don't handle on double click

    setDragStart({ row, col });
    setIsDragging(true);

    if (!e.shiftKey) {
      setActiveCell({ row, col });
      setSelectionRange(null);
    }
  }, [setActiveCell, setSelectionRange]);

  // Handle mouse move for drag selection
  useEffect(() => {
    if (!isDragging || !dragStart) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const scrollLeft = containerRef.current.scrollLeft;
      const scrollTop = containerRef.current.scrollTop;
      const x = e.clientX - rect.left + scrollLeft - HEADER_WIDTH;
      const y = e.clientY - rect.top + scrollTop - HEADER_HEIGHT;

      // Find the column
      let col = 0;
      let accX = 0;
      for (let c = 0; c < TOTAL_COLS; c++) {
        const w = getColWidth(c);
        if (accX + w > x) { col = c; break; }
        accX += w;
        if (c === TOTAL_COLS - 1) col = c;
      }

      // Find the row
      let row = 0;
      let accY = 0;
      for (let r = 0; r < TOTAL_ROWS; r++) {
        const h = getRowHeight(r);
        if (accY + h > y) { row = r; break; }
        accY += h;
        if (r === TOTAL_ROWS - 1) row = r;
      }

      setSelectionRange({ start: dragStart, end: { row, col } });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setDragStart(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragStart, getColWidth, getRowHeight, setSelectionRange]);

  // Column resize
  useEffect(() => {
    if (resizingCol === null) return;

    const handleMouseMove = (e: MouseEvent) => {
      const diff = e.clientX - resizeStart;
      const newWidth = Math.max(40, resizeOriginal + diff);
      updateColWidth(resizingCol, newWidth);
    };

    const handleMouseUp = () => {
      setResizingCol(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizingCol, resizeStart, resizeOriginal, updateColWidth]);

  // Row resize
  useEffect(() => {
    if (resizingRow === null) return;

    const handleMouseMove = (e: MouseEvent) => {
      const diff = e.clientY - resizeStart;
      const newHeight = Math.max(20, resizeOriginal + diff);
      updateRowHeight(resizingRow, newHeight);
    };

    const handleMouseUp = () => {
      setResizingRow(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizingRow, resizeStart, resizeOriginal, updateRowHeight]);

  // Keyboard navigation and shortcuts
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (isEditing) return; // Let cell editor handle keys

    const meta = e.metaKey || e.ctrlKey;

    // Arrow keys — navigate
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      if (!activeCell) return;
      const dir = e.key === 'ArrowUp' ? 'up' : e.key === 'ArrowDown' ? 'down' : e.key === 'ArrowLeft' ? 'left' : 'right';
      const newCell = moveActiveCell(activeCell, dir, TOTAL_ROWS, TOTAL_COLS);
      if (e.shiftKey) {
        setSelectionRange({
          start: selectionRange?.start || activeCell,
          end: newCell,
        });
      } else {
        setSelectionRange(null);
      }
      setActiveCell(newCell);
      return;
    }

    // Tab — move right
    if (e.key === 'Tab') {
      e.preventDefault();
      if (!activeCell) return;
      const dir = e.shiftKey ? 'left' : 'right';
      const newCell = moveActiveCell(activeCell, dir, TOTAL_ROWS, TOTAL_COLS);
      setActiveCell(newCell);
      setSelectionRange(null);
      return;
    }

    // Enter — move down or start editing
    if (e.key === 'Enter') {
      e.preventDefault();
      if (!activeCell) return;
      const newCell = moveActiveCell(activeCell, 'down', TOTAL_ROWS, TOTAL_COLS);
      setActiveCell(newCell);
      setSelectionRange(null);
      return;
    }

    // Delete/Backspace — clear cells
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      if (selectionRange) {
        const norm = normalizeRange(selectionRange);
        const cells = expandRange(norm);
        deleteCells(cells.map((c) => cellKey(c.row, c.col)));
      } else if (activeCell) {
        deleteCells([cellKey(activeCell.row, activeCell.col)]);
      }
      return;
    }

    // Ctrl+B — Bold
    if (meta && e.key === 'b') {
      e.preventDefault();
      if (!activeCell) return;
      const key = cellKey(activeCell.row, activeCell.col);
      const cell = sheet.cells[key] || { value: '' };
      const newStyle = { ...cell.style, bold: !cell.style?.bold };
      updateCell(activeCell.row, activeCell.col, { ...cell, style: newStyle });
      return;
    }

    // Ctrl+I — Italic
    if (meta && e.key === 'i') {
      e.preventDefault();
      if (!activeCell) return;
      const key = cellKey(activeCell.row, activeCell.col);
      const cell = sheet.cells[key] || { value: '' };
      const newStyle = { ...cell.style, italic: !cell.style?.italic };
      updateCell(activeCell.row, activeCell.col, { ...cell, style: newStyle });
      return;
    }

    // Ctrl+C — Copy
    if (meta && e.key === 'c') {
      const range = selectionRange || (activeCell ? { start: activeCell, end: activeCell } : null);
      if (!range) return;
      const tsv = cellsToTSV(sheet.cells, range);
      navigator.clipboard.writeText(tsv).catch(() => {});
      clipboardDataRef.current = createClipboardData(sheet.cells, range);
      return;
    }

    // Ctrl+V — Paste
    if (meta && e.key === 'v') {
      if (!activeCell) return;

      // Try internal paste first
      if (clipboardDataRef.current) {
        const pastedCells = applyClipboardData(clipboardDataRef.current, activeCell.row, activeCell.col);
        updateCells(pastedCells);
        return;
      }

      // Fall back to system clipboard
      navigator.clipboard.readText().then((text) => {
        if (!text.trim()) return;
        const rows = parseTSV(text);
        const updates: Record<string, CellData> = {};
        for (let r = 0; r < rows.length; r++) {
          for (let c = 0; c < rows[r].length; c++) {
            const key = cellKey(activeCell.row + r, activeCell.col + c);
            updates[key] = { value: rows[r][c] };
          }
        }
        updateCells(updates);
      }).catch(() => {});
      return;
    }

    // Ctrl+A — Select all
    if (meta && e.key === 'a') {
      e.preventDefault();
      setSelectionRange({ start: { row: 0, col: 0 }, end: { row: TOTAL_ROWS - 1, col: TOTAL_COLS - 1 } });
      return;
    }

    // F2 — Start editing
    if (e.key === 'F2') {
      e.preventDefault();
      if (!activeCell) return;
      const key = cellKey(activeCell.row, activeCell.col);
      const cell = sheet.cells[key];
      startEditing(cell?.formula || cell?.value || '');
      return;
    }

    // Typing starts editing
    if (e.key.length === 1 && !meta && !e.altKey) {
      if (!activeCell) return;
      startEditing(e.key);
      return;
    }
  }, [
    isEditing, activeCell, selectionRange, sheet.cells,
    setActiveCell, setSelectionRange, startEditing, deleteCells,
    updateCell, updateCells,
  ]);

  // Calculate column header positions for rendering
  const virtualRows = rowVirtualizer.getVirtualItems();
  const virtualCols = colVirtualizer.getVirtualItems();

  // Calculate the position of the active cell for the editor overlay
  const editorPosition = useMemo(() => {
    if (!activeCell || !isEditing) return null;

    let left = HEADER_WIDTH;
    for (let c = 0; c < activeCell.col; c++) {
      left += getColWidth(c);
    }

    let top = HEADER_HEIGHT;
    for (let r = 0; r < activeCell.row; r++) {
      top += getRowHeight(r);
    }

    // Subtract scroll position
    if (containerRef.current) {
      left -= containerRef.current.scrollLeft;
      top -= containerRef.current.scrollTop;
    }

    return {
      left,
      top,
      width: getColWidth(activeCell.col),
      height: getRowHeight(activeCell.row),
    };
  }, [activeCell, isEditing, getColWidth, getRowHeight]);

  const totalWidth = useMemo(() => {
    let w = 0;
    for (let c = 0; c < TOTAL_COLS; c++) w += getColWidth(c);
    return w;
  }, [getColWidth]);

  const totalHeight = useMemo(() => {
    let h = 0;
    for (let r = 0; r < TOTAL_ROWS; r++) h += getRowHeight(r);
    return h;
  }, [getRowHeight]);

  return (
    <div
      ref={containerRef}
      className="sheets-grid"
      style={{ width: '100%', height: '100%', position: 'relative' }}
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      {/* Scrollable area */}
      <div
        style={{
          width: totalWidth + HEADER_WIDTH,
          height: totalHeight + HEADER_HEIGHT,
          position: 'relative',
        }}
      >
        {/* Corner cell */}
        <div
          className="sheets-col-header"
          style={{
            position: 'sticky',
            left: 0,
            top: 0,
            width: HEADER_WIDTH,
            height: HEADER_HEIGHT,
            zIndex: 20,
            borderRight: '1px solid var(--sheets-grid-line)',
            borderBottom: '1px solid var(--sheets-grid-line)',
          }}
          onClick={() => {
            setSelectionRange({ start: { row: 0, col: 0 }, end: { row: TOTAL_ROWS - 1, col: TOTAL_COLS - 1 } });
          }}
        />

        {/* Column Headers */}
        {virtualCols.map((virtualCol) => {
          const colIdx = virtualCol.index;
          const isSelected = activeCell?.col === colIdx ||
            (selectionRange && (() => {
              const norm = normalizeRange(selectionRange);
              return colIdx >= norm.start.col && colIdx <= norm.end.col;
            })());

          return (
            <div
              key={`col-${colIdx}`}
              className={`sheets-col-header ${isSelected ? 'selected' : ''}`}
              style={{
                position: 'absolute',
                left: virtualCol.start + HEADER_WIDTH,
                top: 0,
                width: virtualCol.size,
                height: HEADER_HEIGHT,
                zIndex: 10,
              }}
              onClick={() => {
                setActiveCell({ row: 0, col: colIdx });
                setSelectionRange(selectColumnRange(colIdx, TOTAL_ROWS));
              }}
            >
              {colToLetter(colIdx)}
              {/* Resize handle */}
              <div
                className="sheets-resize-handle sheets-resize-handle-col"
                onMouseDown={(e) => {
                  e.stopPropagation();
                  setResizingCol(colIdx);
                  setResizeStart(e.clientX);
                  setResizeOriginal(getColWidth(colIdx));
                }}
              />
            </div>
          );
        })}

        {/* Row Headers */}
        {virtualRows.map((virtualRow) => {
          const rowIdx = virtualRow.index;
          const isSelected = activeCell?.row === rowIdx ||
            (selectionRange && (() => {
              const norm = normalizeRange(selectionRange);
              return rowIdx >= norm.start.row && rowIdx <= norm.end.row;
            })());

          return (
            <div
              key={`row-${rowIdx}`}
              className={`sheets-row-header ${isSelected ? 'selected' : ''}`}
              style={{
                position: 'absolute',
                left: 0,
                top: virtualRow.start + HEADER_HEIGHT,
                width: HEADER_WIDTH,
                height: virtualRow.size,
                zIndex: 10,
              }}
              onClick={() => {
                setActiveCell({ row: rowIdx, col: 0 });
                setSelectionRange(selectRowRange(rowIdx, TOTAL_COLS));
              }}
            >
              {rowIdx + 1}
              {/* Resize handle */}
              <div
                className="sheets-resize-handle sheets-resize-handle-row"
                onMouseDown={(e) => {
                  e.stopPropagation();
                  setResizingRow(rowIdx);
                  setResizeStart(e.clientY);
                  setResizeOriginal(getRowHeight(rowIdx));
                }}
              />
            </div>
          );
        })}

        {/* Grid cells */}
        {virtualRows.map((virtualRow) =>
          virtualCols.map((virtualCol) => {
            const rowIdx = virtualRow.index;
            const colIdx = virtualCol.index;
            const key = cellKey(rowIdx, colIdx);
            const cell = sheet.cells[key];
            const isActive = isCellActive({ row: rowIdx, col: colIdx }, activeCell);
            const isInSelection = selectionRange ? isCellInRange({ row: rowIdx, col: colIdx }, selectionRange) : false;
            const display = getCellDisplay(rowIdx, colIdx);

            const style = cell?.style;
            const cellStyle: React.CSSProperties = {
              position: 'absolute',
              left: virtualCol.start + HEADER_WIDTH,
              top: virtualRow.start + HEADER_HEIGHT,
              width: virtualCol.size,
              height: virtualRow.size,
              fontWeight: style?.bold ? 700 : undefined,
              fontStyle: style?.italic ? 'italic' : undefined,
              textDecoration: style?.underline ? 'underline' : undefined,
              color: style?.textColor || undefined,
              backgroundColor: style?.bgColor || undefined,
              textAlign: style?.alignment || 'left',
              fontSize: style?.fontSize || undefined,
              justifyContent: style?.alignment === 'center' ? 'center' : style?.alignment === 'right' ? 'flex-end' : 'flex-start',
              borderTop: style?.borders?.top ? '1px solid var(--sheets-text-subtle)' : undefined,
              borderRight: style?.borders?.right ? '1px solid var(--sheets-text-subtle)' : undefined,
              borderBottom: style?.borders?.bottom ? '1px solid var(--sheets-text-subtle)' : undefined,
              borderLeft: style?.borders?.left ? '1px solid var(--sheets-text-subtle)' : undefined,
            };

            return (
              <div
                key={`${rowIdx}:${colIdx}`}
                className={`sheets-cell ${isActive ? 'active' : ''} ${isInSelection ? 'selected' : ''}`}
                style={cellStyle}
                onClick={(e) => handleCellClick(rowIdx, colIdx, e)}
                onDoubleClick={() => handleCellDoubleClick(rowIdx, colIdx)}
                onMouseDown={(e) => handleCellMouseDown(rowIdx, colIdx, e)}
              >
                {display}
              </div>
            );
          })
        )}
      </div>

      {/* Cell Editor Overlay */}
      {isEditing && editorPosition && (
        <CellEditor
          sheet={sheet}
          updateCell={updateCell}
          left={editorPosition.left}
          top={editorPosition.top}
          width={editorPosition.width}
          height={editorPosition.height}
        />
      )}
    </div>
  );
}
