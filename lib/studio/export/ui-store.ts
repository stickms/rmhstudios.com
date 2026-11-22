/** Which export dialog is open. A tiny store so the project menu, the Ctrl+E keybind and the challenge panel share it. */
import { create } from 'zustand';

interface ExportUiState {
  exportOpen: boolean;
  importOpen: boolean;
  openExport: () => void;
  closeExport: () => void;
  openImport: () => void;
  closeImport: () => void;
}

export const useExportUi = create<ExportUiState>((set) => ({
  exportOpen: false,
  importOpen: false,
  openExport: () =>
    set({
      exportOpen: true,
    }),
  closeExport: () =>
    set({
      exportOpen: false,
    }),
  openImport: () =>
    set({
      importOpen: true,
    }),
  closeImport: () =>
    set({
      importOpen: false,
    }),
}));
