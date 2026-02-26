import { create } from 'zustand';
import type { CellAddress, CellRange, CellStyle } from '@/components/rmh-sheets/types';

interface SheetsStoreState {
  activeCell: CellAddress | null;
  selectionRange: CellRange | null;
  activeSheetId: string;
  zoom: number;
  isEditing: boolean;
  editValue: string;
  clipboardRange: CellRange | null;
  formatPainter: CellStyle | null;

  setActiveCell: (cell: CellAddress | null) => void;
  setSelectionRange: (range: CellRange | null) => void;
  setActiveSheetId: (id: string) => void;
  setZoom: (zoom: number) => void;
  setIsEditing: (editing: boolean) => void;
  setEditValue: (value: string) => void;
  setClipboardRange: (range: CellRange | null) => void;
  setFormatPainter: (style: CellStyle | null) => void;
  startEditing: (value: string) => void;
  stopEditing: () => void;
}

export const useSheetsStore = create<SheetsStoreState>()((set) => ({
  activeCell: { row: 0, col: 0 },
  selectionRange: null,
  activeSheetId: '',
  zoom: 100,
  isEditing: false,
  editValue: '',
  clipboardRange: null,
  formatPainter: null,

  setActiveCell: (cell) => set({ activeCell: cell }),
  setSelectionRange: (range) => set({ selectionRange: range }),
  setActiveSheetId: (id) => set({ activeSheetId: id }),
  setZoom: (zoom) => set({ zoom: Math.max(50, Math.min(200, zoom)) }),
  setIsEditing: (editing) => set({ isEditing: editing }),
  setEditValue: (value) => set({ editValue: value }),
  setClipboardRange: (range) => set({ clipboardRange: range }),
  setFormatPainter: (style) => set({ formatPainter: style }),
  startEditing: (value) => set({ isEditing: true, editValue: value }),
  stopEditing: () => set({ isEditing: false, editValue: '' }),
}));
