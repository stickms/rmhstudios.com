'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import DocumentHeader from '@/components/rmh-utils/DocumentHeader';
import { useDocumentStore } from '@/lib/store/useDocumentStore';
import { useSheetsStore } from '@/lib/store/useSheetsStore';
import type { DocumentInfo } from '@/lib/rmh-utils/types';
import type { CellData, SheetData } from './types';
import { cellKey } from '@/lib/rmh-sheets/cell-utils';
import FormulaBar from './FormulaBar';
import SheetToolbar from './SheetToolbar';
import SheetCanvas from './SheetCanvas';
import SheetTabs from './SheetTabs';

const ACCENT = '#10b981';

interface Props {
  document: DocumentInfo;
  onBack: () => void;
  onRename: (title: string) => void;
  onToggleFavorite: () => void;
}

interface SheetsContent {
  sheetOrder: string[];
  sheets: Record<string, SheetData>;
}

export default function SheetsEditor({ document: doc, onBack, onRename, onToggleFavorite }: Props) {
  const [sheets, setSheets] = useState<SheetData[]>([]);
  const [version, setVersion] = useState(0);
  const initializedRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { activeSheetId, setActiveSheetId } = useSheetsStore();
  const { getDocument, updateDocument } = useDocumentStore();

  // Save sheets data to store (debounced)
  const saveToStore = useCallback((sheetsData: SheetData[]) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const sheetsMap: Record<string, SheetData> = {};
      const order: string[] = [];
      sheetsData.forEach((s) => {
        sheetsMap[s.id] = s;
        order.push(s.id);
      });
      const content: SheetsContent = { sheetOrder: order, sheets: sheetsMap };
      updateDocument(doc.id, { content: JSON.stringify(content) });
    }, 300);
  }, [doc.id, updateDocument]);

  // Load from store on mount
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const storedDoc = getDocument(doc.id);
    let loadedSheets: SheetData[] = [];

    if (storedDoc?.content) {
      try {
        const parsed: SheetsContent = JSON.parse(storedDoc.content);
        const order = parsed.sheetOrder || [];
        loadedSheets = order
          .map((id) => parsed.sheets[id])
          .filter(Boolean);
      } catch {
        // Invalid content, start fresh
      }
    }

    // Initialize default sheet if empty
    if (loadedSheets.length === 0) {
      loadedSheets = [{
        id: 'sheet-1',
        name: 'Sheet 1',
        cells: {},
        colWidths: {},
        rowHeights: {},
        frozenRows: 0,
        frozenCols: 0,
      }];
    }

    setSheets(loadedSheets);

    if (loadedSheets.length > 0) {
      const firstId = loadedSheets[0].id;
      if (!activeSheetId || !loadedSheets.some((s) => s.id === activeSheetId)) {
        setActiveSheetId(firstId);
      }
    }
  }, [doc.id, getDocument, activeSheetId, setActiveSheetId]);

  // Cleanup save timer
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  // Get current active sheet
  const activeSheet = sheets.find((s) => s.id === activeSheetId) || sheets[0] || null;

  // Helper to update sheets and save
  const updateSheets = useCallback((newSheets: SheetData[]) => {
    setSheets(newSheets);
    setVersion((v) => v + 1);
    saveToStore(newSheets);
  }, [saveToStore]);

  // Cell update handler
  const updateCell = useCallback((row: number, col: number, data: CellData) => {
    if (!activeSheetId) return;
    const key = cellKey(row, col);
    const newSheets = sheets.map((s) => {
      if (s.id !== activeSheetId) return s;
      return { ...s, cells: { ...s.cells, [key]: { value: data.value, formula: data.formula, computedValue: data.computedValue, style: data.style } } };
    });
    updateSheets(newSheets);
  }, [sheets, activeSheetId, updateSheets]);

  // Batch update cells
  const updateCells = useCallback((updates: Record<string, CellData>) => {
    if (!activeSheetId) return;
    const newSheets = sheets.map((s) => {
      if (s.id !== activeSheetId) return s;
      const newCells = { ...s.cells };
      for (const [key, data] of Object.entries(updates)) {
        newCells[key] = { value: data.value, formula: data.formula, computedValue: data.computedValue, style: data.style };
      }
      return { ...s, cells: newCells };
    });
    updateSheets(newSheets);
  }, [sheets, activeSheetId, updateSheets]);

  // Delete cells
  const deleteCells = useCallback((keys: string[]) => {
    if (!activeSheetId) return;
    const newSheets = sheets.map((s) => {
      if (s.id !== activeSheetId) return s;
      const newCells = { ...s.cells };
      for (const key of keys) {
        delete newCells[key];
      }
      return { ...s, cells: newCells };
    });
    updateSheets(newSheets);
  }, [sheets, activeSheetId, updateSheets]);

  // Column width update
  const updateColWidth = useCallback((col: number, width: number) => {
    if (!activeSheetId) return;
    const newSheets = sheets.map((s) => {
      if (s.id !== activeSheetId) return s;
      return { ...s, colWidths: { ...s.colWidths, [String(col)]: width } };
    });
    updateSheets(newSheets);
  }, [sheets, activeSheetId, updateSheets]);

  // Row height update
  const updateRowHeight = useCallback((row: number, height: number) => {
    if (!activeSheetId) return;
    const newSheets = sheets.map((s) => {
      if (s.id !== activeSheetId) return s;
      return { ...s, rowHeights: { ...s.rowHeights, [String(row)]: height } };
    });
    updateSheets(newSheets);
  }, [sheets, activeSheetId, updateSheets]);

  // Sheet tab management
  const addSheet = useCallback(() => {
    const sheetNum = sheets.length + 1;
    const sheetId = `sheet-${Date.now()}`;
    const newSheet: SheetData = {
      id: sheetId,
      name: `Sheet ${sheetNum}`,
      cells: {},
      colWidths: {},
      rowHeights: {},
      frozenRows: 0,
      frozenCols: 0,
    };
    updateSheets([...sheets, newSheet]);
    setActiveSheetId(sheetId);
  }, [sheets, updateSheets, setActiveSheetId]);

  const renameSheet = useCallback((sheetId: string, name: string) => {
    const newSheets = sheets.map((s) =>
      s.id === sheetId ? { ...s, name } : s
    );
    updateSheets(newSheets);
  }, [sheets, updateSheets]);

  const deleteSheet = useCallback((sheetId: string) => {
    if (sheets.length <= 1) return;
    const newSheets = sheets.filter((s) => s.id !== sheetId);
    updateSheets(newSheets);
    if (activeSheetId === sheetId) {
      setActiveSheetId(newSheets[0].id);
    }
  }, [sheets, activeSheetId, updateSheets, setActiveSheetId]);

  const duplicateSheet = useCallback((sheetId: string) => {
    const src = sheets.find((s) => s.id === sheetId);
    if (!src) return;
    const newId = `sheet-${Date.now()}`;
    const newSheet: SheetData = {
      ...src,
      id: newId,
      name: `${src.name} (Copy)`,
      cells: { ...src.cells },
      colWidths: { ...src.colWidths },
      rowHeights: { ...src.rowHeights },
    };
    const idx = sheets.indexOf(src);
    const newSheets = [...sheets];
    newSheets.splice(idx + 1, 0, newSheet);
    updateSheets(newSheets);
    setActiveSheetId(newId);
  }, [sheets, updateSheets, setActiveSheetId]);

  const switchSheet = useCallback((sheetId: string) => {
    setActiveSheetId(sheetId);
  }, [setActiveSheetId]);

  return (
    <>
      <DocumentHeader
        title={doc.title}
        isFavorite={doc.isFavorite}
        onBack={onBack}
        onRename={onRename}
        onToggleFavorite={onToggleFavorite}
        accentColor={ACCENT}
      />

      <SheetToolbar
        activeSheet={activeSheet}
        updateCell={updateCell}
        updateCells={updateCells}
      />

      <FormulaBar
        activeSheet={activeSheet}
        updateCell={updateCell}
      />

      <div className="flex-1 overflow-hidden">
        {activeSheet && (
          <SheetCanvas
            sheet={activeSheet}
            updateCell={updateCell}
            updateCells={updateCells}
            deleteCells={deleteCells}
            updateColWidth={updateColWidth}
            updateRowHeight={updateRowHeight}
            version={version}
          />
        )}
      </div>

      <SheetTabs
        sheets={sheets}
        activeSheetId={activeSheetId}
        onSwitch={switchSheet}
        onAdd={addSheet}
        onRename={renameSheet}
        onDelete={deleteSheet}
        onDuplicate={duplicateSheet}
      />
    </>
  );
}
