import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SlidesStoreState {
  selectedSlideId: string | null;
  selectedElementId: string | null;
  isEditingText: boolean;
  zoom: number;
  showProperties: boolean;
  showSlidePanel: boolean;
  presenterMode: boolean;
  darkMode: boolean;

  setSelectedSlideId: (id: string | null) => void;
  setSelectedElementId: (id: string | null) => void;
  setIsEditingText: (editing: boolean) => void;
  setZoom: (zoom: number) => void;
  setShowProperties: (show: boolean) => void;
  setShowSlidePanel: (show: boolean) => void;
  setPresenterMode: (mode: boolean) => void;
  setDarkMode: (dark: boolean) => void;
}

export const useSlidesStore = create<SlidesStoreState>()(
  persist(
    (set) => ({
      selectedSlideId: null,
      selectedElementId: null,
      isEditingText: false,
      zoom: 100,
      showProperties: true,
      showSlidePanel: true,
      presenterMode: false,
      darkMode: true,

      setSelectedSlideId: (id) => set({ selectedSlideId: id, selectedElementId: null, isEditingText: false }),
      setSelectedElementId: (id) => set({ selectedElementId: id, isEditingText: false }),
      setIsEditingText: (editing) => set({ isEditingText: editing }),
      setZoom: (zoom) => set({ zoom: Math.max(50, Math.min(200, zoom)) }),
      setShowProperties: (show) => set({ showProperties: show }),
      setShowSlidePanel: (show) => set({ showSlidePanel: show }),
      setPresenterMode: (mode) => set({ presenterMode: mode }),
      setDarkMode: (dark) => set({ darkMode: dark }),
    }),
    {
      name: 'rmh-slides-store',
      partialize: (state) => ({
        zoom: state.zoom,
        showProperties: state.showProperties,
        showSlidePanel: state.showSlidePanel,
        darkMode: state.darkMode,
      }),
    }
  )
);
