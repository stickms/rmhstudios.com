import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface DocsStoreState {
  zoom: number;
  sidebarVisible: boolean;
  findReplaceVisible: boolean;
  readingMode: boolean;
  darkMode: boolean | null; // null = follow system

  setZoom: (zoom: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  toggleSidebar: () => void;
  setSidebarVisible: (visible: boolean) => void;
  toggleFindReplace: () => void;
  setFindReplaceVisible: (visible: boolean) => void;
  toggleReadingMode: () => void;
  setReadingMode: (reading: boolean) => void;
  toggleDarkMode: () => void;
  setDarkMode: (dark: boolean | null) => void;
}

export const useDocsStore = create<DocsStoreState>()(
  persist(
    (set, get) => ({
      zoom: 100,
      sidebarVisible: true,
      findReplaceVisible: false,
      readingMode: false,
      darkMode: null,

      setZoom: (zoom) => set({ zoom: Math.max(50, Math.min(200, zoom)) }),
      zoomIn: () => set({ zoom: Math.min(200, get().zoom + 10) }),
      zoomOut: () => set({ zoom: Math.max(50, get().zoom - 10) }),
      resetZoom: () => set({ zoom: 100 }),
      toggleSidebar: () => set({ sidebarVisible: !get().sidebarVisible }),
      setSidebarVisible: (visible) => set({ sidebarVisible: visible }),
      toggleFindReplace: () => set({ findReplaceVisible: !get().findReplaceVisible }),
      setFindReplaceVisible: (visible) => set({ findReplaceVisible: visible }),
      toggleReadingMode: () => set({ readingMode: !get().readingMode }),
      setReadingMode: (reading) => set({ readingMode: reading }),
      toggleDarkMode: () => {
        const current = get().darkMode;
        if (current === null) set({ darkMode: true });
        else if (current === true) set({ darkMode: false });
        else set({ darkMode: null });
      },
      setDarkMode: (dark) => set({ darkMode: dark }),
    }),
    {
      name: 'rmh-docs-store',
      partialize: (state) => ({
        zoom: state.zoom,
        sidebarVisible: state.sidebarVisible,
        readingMode: state.readingMode,
        darkMode: state.darkMode,
      }),
    }
  )
);
