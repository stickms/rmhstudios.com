'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import * as Y from 'yjs';
import DocumentHeader from '@/components/rmh-utils/DocumentHeader';
import ShareDialog from '@/components/rmh-utils/ShareDialog';
import { useCollaboration } from '@/lib/rmh-utils/useCollaboration';
import { useSheetsStore } from '@/lib/store/useSheetsStore';
import type { DocumentInfo, CollaboratorInfo, CollaboratorRole } from '@/lib/rmh-utils/types';
import type { CellData, SheetData } from './types';
import { cellKey } from '@/lib/rmh-sheets/cell-utils';
import FormulaBar from './FormulaBar';
import SheetToolbar from './SheetToolbar';
import SheetCanvas from './SheetCanvas';
import SheetTabs from './SheetTabs';

const ACCENT = '#10b981';

interface Props {
  document: DocumentInfo;
  user: { id: string; name: string | null; image: string | null };
  sessionToken: string;
  onBack: () => void;
  onRename: (title: string) => void;
  onToggleFavorite: () => void;
}

export default function SheetsEditor({ document: doc, user, sessionToken, onBack, onRename, onToggleFavorite }: Props) {
  const [shareOpen, setShareOpen] = useState(false);
  const [collaboratorsList, setCollaboratorsList] = useState<CollaboratorInfo[]>(doc.collaborators || []);
  const [sheets, setSheets] = useState<SheetData[]>([]);
  const [version, setVersion] = useState(0); // force re-render counter
  const initializedRef = useRef(false);

  const { activeSheetId, setActiveSheetId } = useSheetsStore();

  const { yDoc, connected, collaborators } = useCollaboration({
    documentId: doc.id,
    roomPrefix: 'sheet',
    user,
    sessionToken,
  });

  // Initialize default sheet on new document
  useEffect(() => {
    if (!yDoc || initializedRef.current) return;

    const sheetsMap = yDoc.getMap('sheets');
    const metaMap = yDoc.getMap('meta');

    // Check if already has sheets
    if (sheetsMap.size === 0) {
      // Create default sheet
      yDoc.transact(() => {
        const sheetId = 'sheet-1';
        const sheetYMap = new Y.Map();
        sheetYMap.set('name', 'Sheet 1');
        sheetYMap.set('cells', new Y.Map());
        sheetYMap.set('colWidths', new Y.Map());
        sheetYMap.set('rowHeights', new Y.Map());
        sheetYMap.set('frozenRows', 0);
        sheetYMap.set('frozenCols', 0);
        sheetsMap.set(sheetId, sheetYMap);

        metaMap.set('activeSheetId', sheetId);
        metaMap.set('sheetOrder', [sheetId]);
      });
    }

    // Sync from Y.js state to local state
    const syncSheets = () => {
      const sheetOrder = (metaMap.get('sheetOrder') as string[]) || [];
      const loadedSheets: SheetData[] = [];

      for (const sheetId of sheetOrder) {
        const sheetYMap = sheetsMap.get(sheetId) as Y.Map<unknown> | undefined;
        if (!sheetYMap) continue;

        const cellsYMap = sheetYMap.get('cells') as Y.Map<unknown> | undefined;
        const colWidthsYMap = sheetYMap.get('colWidths') as Y.Map<number> | undefined;
        const rowHeightsYMap = sheetYMap.get('rowHeights') as Y.Map<number> | undefined;

        const cells: Record<string, CellData> = {};
        if (cellsYMap) {
          cellsYMap.forEach((val, key) => {
            if (val && typeof val === 'object') {
              cells[key] = val as CellData;
            }
          });
        }

        const colWidths: Record<string, number> = {};
        if (colWidthsYMap) {
          colWidthsYMap.forEach((val, key) => { colWidths[key] = val; });
        }

        const rowHeights: Record<string, number> = {};
        if (rowHeightsYMap) {
          rowHeightsYMap.forEach((val, key) => { rowHeights[key] = val; });
        }

        loadedSheets.push({
          id: sheetId,
          name: (sheetYMap.get('name') as string) || 'Sheet',
          cells,
          colWidths,
          rowHeights,
          frozenRows: (sheetYMap.get('frozenRows') as number) || 0,
          frozenCols: (sheetYMap.get('frozenCols') as number) || 0,
        });
      }

      // If no sheet order but sheetsMap has entries, build from sheetsMap
      if (loadedSheets.length === 0 && sheetsMap.size > 0) {
        sheetsMap.forEach((val, key) => {
          const sheetYMap = val as Y.Map<unknown>;
          loadedSheets.push({
            id: key,
            name: (sheetYMap.get('name') as string) || 'Sheet',
            cells: {},
            colWidths: {},
            rowHeights: {},
            frozenRows: 0,
            frozenCols: 0,
          });
        });
      }

      setSheets(loadedSheets);

      const activeId = metaMap.get('activeSheetId') as string | undefined;
      if (activeId && loadedSheets.some((s) => s.id === activeId)) {
        setActiveSheetId(activeId);
      } else if (loadedSheets.length > 0) {
        setActiveSheetId(loadedSheets[0].id);
      }
    };

    syncSheets();

    // Observe deep changes on sheets map
    const observer = () => {
      syncSheets();
      setVersion((v) => v + 1);
    };

    sheetsMap.observeDeep(observer);
    metaMap.observe(observer);
    initializedRef.current = true;

    return () => {
      sheetsMap.unobserveDeep(observer);
      metaMap.unobserve(observer);
    };
  }, [yDoc, setActiveSheetId]);

  // Get current active sheet
  const activeSheet = sheets.find((s) => s.id === activeSheetId) || sheets[0] || null;

  // Cell update handler — writes to Y.js
  const updateCell = useCallback((row: number, col: number, data: CellData) => {
    if (!yDoc || !activeSheetId) return;
    const sheetsMap = yDoc.getMap('sheets');
    const sheetYMap = sheetsMap.get(activeSheetId) as Y.Map<unknown> | undefined;
    if (!sheetYMap) return;
    const cellsYMap = sheetYMap.get('cells') as Y.Map<unknown>;
    if (!cellsYMap) return;

    yDoc.transact(() => {
      const key = cellKey(row, col);
      // Store as a plain object (Y.js will serialize)
      cellsYMap.set(key, { value: data.value, formula: data.formula, computedValue: data.computedValue, style: data.style });
    });
  }, [yDoc, activeSheetId]);

  // Batch update cells
  const updateCells = useCallback((updates: Record<string, CellData>) => {
    if (!yDoc || !activeSheetId) return;
    const sheetsMap = yDoc.getMap('sheets');
    const sheetYMap = sheetsMap.get(activeSheetId) as Y.Map<unknown> | undefined;
    if (!sheetYMap) return;
    const cellsYMap = sheetYMap.get('cells') as Y.Map<unknown>;
    if (!cellsYMap) return;

    yDoc.transact(() => {
      for (const [key, data] of Object.entries(updates)) {
        cellsYMap.set(key, { value: data.value, formula: data.formula, computedValue: data.computedValue, style: data.style });
      }
    });
  }, [yDoc, activeSheetId]);

  // Delete cells
  const deleteCells = useCallback((keys: string[]) => {
    if (!yDoc || !activeSheetId) return;
    const sheetsMap = yDoc.getMap('sheets');
    const sheetYMap = sheetsMap.get(activeSheetId) as Y.Map<unknown> | undefined;
    if (!sheetYMap) return;
    const cellsYMap = sheetYMap.get('cells') as Y.Map<unknown>;
    if (!cellsYMap) return;

    yDoc.transact(() => {
      for (const key of keys) {
        cellsYMap.delete(key);
      }
    });
  }, [yDoc, activeSheetId]);

  // Column width update
  const updateColWidth = useCallback((col: number, width: number) => {
    if (!yDoc || !activeSheetId) return;
    const sheetsMap = yDoc.getMap('sheets');
    const sheetYMap = sheetsMap.get(activeSheetId) as Y.Map<unknown> | undefined;
    if (!sheetYMap) return;
    const colWidthsYMap = sheetYMap.get('colWidths') as Y.Map<number>;
    if (!colWidthsYMap) return;
    yDoc.transact(() => {
      colWidthsYMap.set(String(col), width);
    });
  }, [yDoc, activeSheetId]);

  // Row height update
  const updateRowHeight = useCallback((row: number, height: number) => {
    if (!yDoc || !activeSheetId) return;
    const sheetsMap = yDoc.getMap('sheets');
    const sheetYMap = sheetsMap.get(activeSheetId) as Y.Map<unknown> | undefined;
    if (!sheetYMap) return;
    const rowHeightsYMap = sheetYMap.get('rowHeights') as Y.Map<number>;
    if (!rowHeightsYMap) return;
    yDoc.transact(() => {
      rowHeightsYMap.set(String(row), height);
    });
  }, [yDoc, activeSheetId]);

  // Sheet tab management
  const addSheet = useCallback(() => {
    if (!yDoc) return;
    const sheetsMap = yDoc.getMap('sheets');
    const metaMap = yDoc.getMap('meta');
    const sheetOrder = (metaMap.get('sheetOrder') as string[]) || [];
    const sheetNum = sheetOrder.length + 1;
    const sheetId = `sheet-${Date.now()}`;

    yDoc.transact(() => {
      const sheetYMap = new Y.Map();
      sheetYMap.set('name', `Sheet ${sheetNum}`);
      sheetYMap.set('cells', new Y.Map());
      sheetYMap.set('colWidths', new Y.Map());
      sheetYMap.set('rowHeights', new Y.Map());
      sheetYMap.set('frozenRows', 0);
      sheetYMap.set('frozenCols', 0);
      sheetsMap.set(sheetId, sheetYMap);
      metaMap.set('sheetOrder', [...sheetOrder, sheetId]);
      metaMap.set('activeSheetId', sheetId);
    });
  }, [yDoc]);

  const renameSheet = useCallback((sheetId: string, name: string) => {
    if (!yDoc) return;
    const sheetsMap = yDoc.getMap('sheets');
    const sheetYMap = sheetsMap.get(sheetId) as Y.Map<unknown> | undefined;
    if (!sheetYMap) return;
    yDoc.transact(() => {
      sheetYMap.set('name', name);
    });
  }, [yDoc]);

  const deleteSheet = useCallback((sheetId: string) => {
    if (!yDoc) return;
    const sheetsMap = yDoc.getMap('sheets');
    const metaMap = yDoc.getMap('meta');
    const sheetOrder = (metaMap.get('sheetOrder') as string[]) || [];
    if (sheetOrder.length <= 1) return; // Cannot delete last sheet

    const newOrder = sheetOrder.filter((id) => id !== sheetId);
    yDoc.transact(() => {
      sheetsMap.delete(sheetId);
      metaMap.set('sheetOrder', newOrder);
      if (activeSheetId === sheetId) {
        metaMap.set('activeSheetId', newOrder[0]);
      }
    });
  }, [yDoc, activeSheetId]);

  const duplicateSheet = useCallback((sheetId: string) => {
    if (!yDoc) return;
    const sheetsMap = yDoc.getMap('sheets');
    const metaMap = yDoc.getMap('meta');
    const sheetOrder = (metaMap.get('sheetOrder') as string[]) || [];
    const srcYMap = sheetsMap.get(sheetId) as Y.Map<unknown> | undefined;
    if (!srcYMap) return;

    const newId = `sheet-${Date.now()}`;
    const srcName = (srcYMap.get('name') as string) || 'Sheet';

    yDoc.transact(() => {
      const newYMap = new Y.Map();
      newYMap.set('name', `${srcName} (Copy)`);
      newYMap.set('cells', new Y.Map());
      newYMap.set('colWidths', new Y.Map());
      newYMap.set('rowHeights', new Y.Map());
      newYMap.set('frozenRows', (srcYMap.get('frozenRows') as number) || 0);
      newYMap.set('frozenCols', (srcYMap.get('frozenCols') as number) || 0);

      // Copy cells
      const srcCells = srcYMap.get('cells') as Y.Map<unknown> | undefined;
      const newCells = newYMap.get('cells') as Y.Map<unknown>;
      if (srcCells) {
        srcCells.forEach((val, key) => {
          newCells.set(key, val);
        });
      }

      sheetsMap.set(newId, newYMap);

      const idx = sheetOrder.indexOf(sheetId);
      const newOrder = [...sheetOrder];
      newOrder.splice(idx + 1, 0, newId);
      metaMap.set('sheetOrder', newOrder);
      metaMap.set('activeSheetId', newId);
    });
  }, [yDoc]);

  const switchSheet = useCallback((sheetId: string) => {
    if (!yDoc) return;
    const metaMap = yDoc.getMap('meta');
    metaMap.set('activeSheetId', sheetId);
    setActiveSheetId(sheetId);
  }, [yDoc, setActiveSheetId]);

  // Share dialog handlers
  const handleAddCollaborator = useCallback(async (username: string, role: CollaboratorRole): Promise<boolean> => {
    const res = await fetch(`/api/rmh-utils/documents/${doc.id}/collaborators`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, role }),
    });
    if (res.ok) {
      const colRes = await fetch(`/api/rmh-utils/documents/${doc.id}/collaborators`);
      if (colRes.ok) {
        const data = await colRes.json();
        setCollaboratorsList(data.collaborators || []);
      }
      return true;
    }
    return false;
  }, [doc.id]);

  const handleRemoveCollaborator = useCallback(async (userId: string) => {
    await fetch(`/api/rmh-utils/documents/${doc.id}/collaborators?userId=${userId}`, { method: 'DELETE' });
    setCollaboratorsList((prev) => prev.filter((c) => c.userId !== userId));
  }, [doc.id]);

  return (
    <>
      <DocumentHeader
        title={doc.title}
        isFavorite={doc.isFavorite}
        connected={connected}
        collaborators={collaborators}
        onBack={onBack}
        onRename={onRename}
        onToggleFavorite={onToggleFavorite}
        onShare={() => setShareOpen(true)}
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

      <ShareDialog
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        documentId={doc.id}
        collaborators={collaboratorsList}
        ownerName={doc.user.name || 'Owner'}
        onAdd={handleAddCollaborator}
        onRemove={handleRemoveCollaborator}
        accentColor={ACCENT}
      />
    </>
  );
}
