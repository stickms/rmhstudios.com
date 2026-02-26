'use client';

import { useCallback, useState, useRef, useEffect } from 'react';
import {
  Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight,
  PaintBucket, Plus, Grid3X3, Square,
} from 'lucide-react';
import { useSheetsStore } from '@/lib/store/useSheetsStore';
import { cellKey, normalizeRange, expandRange } from '@/lib/rmh-sheets/cell-utils';
import type { CellData, CellStyle, SheetData, CellFormat } from './types';

interface Props {
  activeSheet: SheetData | null;
  updateCell: (row: number, col: number, data: CellData) => void;
  updateCells: (updates: Record<string, CellData>) => void;
}

const TEXT_COLORS = [
  '#ffffff', '#e8eaf0', '#9ca0b0', '#ef4444', '#f97316', '#eab308',
  '#22c55e', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#000000',
  '#f87171', '#fb923c', '#facc15', '#4ade80', '#34d399', '#60a5fa',
  '#a78bfa', '#f472b6', '#fca5a5', '#fdba74', '#fde047', '#86efac',
];

const BG_COLORS = [
  'transparent', '#1c1e28', '#2a2d3a', '#7f1d1d', '#78350f', '#713f12',
  '#14532d', '#064e3b', '#1e3a5f', '#3b0764', '#831843', '#991b1b',
  '#9a3412', '#854d0e', '#166534', '#065f46', '#1e40af', '#5b21b6',
  '#9d174d', '#dc2626', '#ea580c', '#ca8a04', '#16a34a', '#059669',
];

const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36];

const FORMAT_OPTIONS: { value: CellFormat; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'number', label: 'Number' },
  { value: 'currency', label: 'Currency' },
  { value: 'percent', label: 'Percent' },
  { value: 'date', label: 'Date' },
  { value: 'text', label: 'Text' },
];

export default function SheetToolbar({ activeSheet, updateCell, updateCells }: Props) {
  const { activeCell, selectionRange } = useSheetsStore();
  const [showTextColor, setShowTextColor] = useState(false);
  const [showBgColor, setShowBgColor] = useState(false);
  const textColorRef = useRef<HTMLDivElement>(null);
  const bgColorRef = useRef<HTMLDivElement>(null);

  // Close color pickers on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (textColorRef.current && !textColorRef.current.contains(e.target as Node)) setShowTextColor(false);
      if (bgColorRef.current && !bgColorRef.current.contains(e.target as Node)) setShowBgColor(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Get the current active cell's style
  const getCurrentStyle = useCallback((): CellStyle => {
    if (!activeCell || !activeSheet) return {};
    const key = cellKey(activeCell.row, activeCell.col);
    return activeSheet.cells[key]?.style || {};
  }, [activeCell, activeSheet]);

  // Get all cells in current selection (active cell + range)
  const getSelectedKeys = useCallback((): string[] => {
    if (!activeCell) return [];
    if (selectionRange) {
      const norm = normalizeRange(selectionRange);
      return expandRange(norm).map((a) => cellKey(a.row, a.col));
    }
    return [cellKey(activeCell.row, activeCell.col)];
  }, [activeCell, selectionRange]);

  // Apply a style change to all selected cells
  const applyStyle = useCallback((stylePatch: Partial<CellStyle>) => {
    if (!activeSheet) return;
    const keys = getSelectedKeys();
    if (keys.length === 0) return;

    const updates: Record<string, CellData> = {};
    for (const key of keys) {
      const existing = activeSheet.cells[key] || { value: '' };
      updates[key] = {
        ...existing,
        style: { ...existing.style, ...stylePatch },
      };
    }
    updateCells(updates);
  }, [activeSheet, getSelectedKeys, updateCells]);

  const toggleBold = useCallback(() => {
    const current = getCurrentStyle();
    applyStyle({ bold: !current.bold });
  }, [getCurrentStyle, applyStyle]);

  const toggleItalic = useCallback(() => {
    const current = getCurrentStyle();
    applyStyle({ italic: !current.italic });
  }, [getCurrentStyle, applyStyle]);

  const toggleUnderline = useCallback(() => {
    const current = getCurrentStyle();
    applyStyle({ underline: !current.underline });
  }, [getCurrentStyle, applyStyle]);

  const setAlignment = useCallback((alignment: 'left' | 'center' | 'right') => {
    applyStyle({ alignment });
  }, [applyStyle]);

  const setTextColor = useCallback((color: string) => {
    applyStyle({ textColor: color });
    setShowTextColor(false);
  }, [applyStyle]);

  const setBgColor = useCallback((color: string) => {
    applyStyle({ bgColor: color === 'transparent' ? undefined : color });
    setShowBgColor(false);
  }, [applyStyle]);

  const setFontSize = useCallback((size: number) => {
    applyStyle({ fontSize: size });
  }, [applyStyle]);

  const setFormat = useCallback((format: CellFormat) => {
    applyStyle({ format });
  }, [applyStyle]);

  const setBorders = useCallback((type: 'all' | 'none' | 'outside') => {
    if (type === 'none') {
      applyStyle({ borders: undefined });
    } else if (type === 'all') {
      applyStyle({ borders: { top: true, right: true, bottom: true, left: true } });
    } else {
      applyStyle({ borders: { top: true, right: true, bottom: true, left: true } });
    }
  }, [applyStyle]);

  // Insert/Delete Row/Column
  const insertRow = useCallback(() => {
    if (!activeCell || !activeSheet) return;
    // Shift all cells below down by 1
    const updates: Record<string, CellData> = {};
    const toDelete: string[] = [];
    const insertAt = activeCell.row;

    for (const [key, cell] of Object.entries(activeSheet.cells)) {
      const [r, c] = key.split(':').map(Number);
      if (r >= insertAt) {
        toDelete.push(key);
        updates[cellKey(r + 1, c)] = cell;
      }
    }

    // We can't easily delete and re-insert atomically with the current API,
    // so we just update the shifted cells
    updateCells(updates);
  }, [activeCell, activeSheet, updateCells]);

  const insertCol = useCallback(() => {
    if (!activeCell || !activeSheet) return;
    const updates: Record<string, CellData> = {};
    const insertAt = activeCell.col;

    for (const [key, cell] of Object.entries(activeSheet.cells)) {
      const [r, c] = key.split(':').map(Number);
      if (c >= insertAt) {
        updates[cellKey(r, c + 1)] = cell;
      }
    }

    updateCells(updates);
  }, [activeCell, activeSheet, updateCells]);

  const currentStyle = getCurrentStyle();

  return (
    <div className="sheets-toolbar">
      {/* Font Size */}
      <select
        className="sheets-toolbar-select"
        value={currentStyle.fontSize || 13}
        onChange={(e) => setFontSize(parseInt(e.target.value))}
      >
        {FONT_SIZES.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>

      <div className="sheets-toolbar-separator" />

      {/* Bold / Italic / Underline */}
      <button className={`sheets-toolbar-btn ${currentStyle.bold ? 'active' : ''}`} onClick={toggleBold} title="Bold (Ctrl+B)">
        <Bold size={14} />
      </button>
      <button className={`sheets-toolbar-btn ${currentStyle.italic ? 'active' : ''}`} onClick={toggleItalic} title="Italic (Ctrl+I)">
        <Italic size={14} />
      </button>
      <button className={`sheets-toolbar-btn ${currentStyle.underline ? 'active' : ''}`} onClick={toggleUnderline} title="Underline (Ctrl+U)">
        <Underline size={14} />
      </button>

      <div className="sheets-toolbar-separator" />

      {/* Text Color */}
      <div className="relative" ref={textColorRef}>
        <button
          className="sheets-toolbar-btn"
          onClick={() => setShowTextColor(!showTextColor)}
          title="Text Color"
        >
          <div className="flex flex-col items-center">
            <span style={{ fontSize: 14, fontWeight: 700 }}>A</span>
            <div style={{ width: 14, height: 3, background: currentStyle.textColor || '#e8eaf0', borderRadius: 1, marginTop: -2 }} />
          </div>
        </button>
        {showTextColor && (
          <div className="absolute top-full left-0 z-50 mt-1 bg-zinc-900 border border-white/10 rounded-lg p-2 shadow-xl" style={{ boxShadow: 'var(--sheets-shadow-lg)' }}>
            <div className="sheets-color-picker">
              {TEXT_COLORS.map((color) => (
                <button
                  key={color}
                  className="sheets-color-swatch"
                  style={{ background: color }}
                  onClick={() => setTextColor(color)}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Background Color */}
      <div className="relative" ref={bgColorRef}>
        <button
          className="sheets-toolbar-btn"
          onClick={() => setShowBgColor(!showBgColor)}
          title="Background Color"
        >
          <PaintBucket size={14} />
        </button>
        {showBgColor && (
          <div className="absolute top-full left-0 z-50 mt-1 bg-zinc-900 border border-white/10 rounded-lg p-2 shadow-xl" style={{ boxShadow: 'var(--sheets-shadow-lg)' }}>
            <div className="sheets-color-picker">
              {BG_COLORS.map((color) => (
                <button
                  key={color}
                  className="sheets-color-swatch"
                  style={{ background: color === 'transparent' ? 'repeating-conic-gradient(#444 0% 25%, transparent 0% 50%) 50% / 12px 12px' : color }}
                  onClick={() => setBgColor(color)}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="sheets-toolbar-separator" />

      {/* Alignment */}
      <button className={`sheets-toolbar-btn ${currentStyle.alignment === 'left' || !currentStyle.alignment ? 'active' : ''}`} onClick={() => setAlignment('left')} title="Align Left">
        <AlignLeft size={14} />
      </button>
      <button className={`sheets-toolbar-btn ${currentStyle.alignment === 'center' ? 'active' : ''}`} onClick={() => setAlignment('center')} title="Align Center">
        <AlignCenter size={14} />
      </button>
      <button className={`sheets-toolbar-btn ${currentStyle.alignment === 'right' ? 'active' : ''}`} onClick={() => setAlignment('right')} title="Align Right">
        <AlignRight size={14} />
      </button>

      <div className="sheets-toolbar-separator" />

      {/* Number Format */}
      <select
        className="sheets-toolbar-select"
        value={currentStyle.format || 'auto'}
        onChange={(e) => setFormat(e.target.value as CellFormat)}
      >
        {FORMAT_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>

      <div className="sheets-toolbar-separator" />

      {/* Borders */}
      <button className="sheets-toolbar-btn" onClick={() => setBorders('all')} title="All Borders">
        <Grid3X3 size={14} />
      </button>
      <button className="sheets-toolbar-btn" onClick={() => setBorders('none')} title="No Borders">
        <Square size={14} />
      </button>

      <div className="sheets-toolbar-separator" />

      {/* Insert Row/Col */}
      <button className="sheets-toolbar-btn" onClick={insertRow} title="Insert Row">
        <div className="flex items-center gap-0.5">
          <Plus size={10} />
          <span style={{ fontSize: 10 }}>Row</span>
        </div>
      </button>
      <button className="sheets-toolbar-btn" onClick={insertCol} title="Insert Column" style={{ width: 'auto', padding: '0 6px' }}>
        <div className="flex items-center gap-0.5">
          <Plus size={10} />
          <span style={{ fontSize: 10 }}>Col</span>
        </div>
      </button>
    </div>
  );
}
