'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { Plus } from 'lucide-react';
import type { SheetData } from './types';

interface Props {
  sheets: SheetData[];
  activeSheetId: string;
  onSwitch: (sheetId: string) => void;
  onAdd: () => void;
  onRename: (sheetId: string, name: string) => void;
  onDelete: (sheetId: string) => void;
  onDuplicate: (sheetId: string) => void;
}

interface ContextMenuState {
  x: number;
  y: number;
  sheetId: string;
}

export default function SheetTabs({ sheets, activeSheetId, onSwitch, onAdd, onRename, onDelete, onDuplicate }: Props) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => setContextMenu(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [contextMenu]);

  // Focus rename input
  useEffect(() => {
    if (renamingId) renameInputRef.current?.focus();
  }, [renamingId]);

  const handleContextMenu = useCallback((e: React.MouseEvent, sheetId: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, sheetId });
  }, []);

  const handleDoubleClick = useCallback((sheetId: string, name: string) => {
    setRenamingId(sheetId);
    setRenameValue(name);
  }, []);

  const handleRenameSubmit = useCallback(() => {
    if (renamingId && renameValue.trim()) {
      onRename(renamingId, renameValue.trim());
    }
    setRenamingId(null);
  }, [renamingId, renameValue, onRename]);

  return (
    <>
      <div className="sheets-tabs">
        {sheets.map((sheet) => (
          <div key={sheet.id} className="relative">
            {renamingId === sheet.id ? (
              <input
                ref={renameInputRef}
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={handleRenameSubmit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRenameSubmit();
                  if (e.key === 'Escape') setRenamingId(null);
                }}
                className="bg-white/10 text-white text-xs rounded px-2 py-1 outline-none border border-white/20 min-w-[60px]"
                style={{ margin: '2px 0' }}
              />
            ) : (
              <button
                className={`sheets-tab ${sheet.id === activeSheetId ? 'active' : ''}`}
                onClick={() => onSwitch(sheet.id)}
                onDoubleClick={() => handleDoubleClick(sheet.id, sheet.name)}
                onContextMenu={(e) => handleContextMenu(e, sheet.id)}
              >
                {sheet.name}
              </button>
            )}
          </div>
        ))}

        <button className="sheets-tab-add" onClick={onAdd} title="Add Sheet">
          <Plus size={14} />
        </button>
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="sheets-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y - 120 }}
        >
          <button
            className="sheets-context-menu-item"
            onClick={() => {
              const sheet = sheets.find((s) => s.id === contextMenu.sheetId);
              if (sheet) handleDoubleClick(contextMenu.sheetId, sheet.name);
              setContextMenu(null);
            }}
          >
            Rename
          </button>
          <button
            className="sheets-context-menu-item"
            onClick={() => { onDuplicate(contextMenu.sheetId); setContextMenu(null); }}
          >
            Duplicate
          </button>
          {sheets.length > 1 && (
            <>
              <div className="sheets-context-menu-separator" />
              <button
                className="sheets-context-menu-item danger"
                onClick={() => { onDelete(contextMenu.sheetId); setContextMenu(null); }}
              >
                Delete
              </button>
            </>
          )}
        </div>
      )}
    </>
  );
}
