import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { DocumentType } from '@/lib/rmh-utils/types';

interface DocumentStoreState {
  sortBy: 'updatedAt' | 'createdAt' | 'title';
  sortDir: 'asc' | 'desc';
  viewMode: 'grid' | 'list';
  searchQuery: string;
  showDeleted: boolean;
  showFavoritesOnly: boolean;

  setSortBy: (sortBy: 'updatedAt' | 'createdAt' | 'title') => void;
  setSortDir: (sortDir: 'asc' | 'desc') => void;
  setViewMode: (viewMode: 'grid' | 'list') => void;
  setSearchQuery: (query: string) => void;
  setShowDeleted: (show: boolean) => void;
  setShowFavoritesOnly: (show: boolean) => void;
}

export const useDocumentStore = create<DocumentStoreState>()(
  persist(
    (set) => ({
      sortBy: 'updatedAt',
      sortDir: 'desc',
      viewMode: 'grid',
      searchQuery: '',
      showDeleted: false,
      showFavoritesOnly: false,

      setSortBy: (sortBy) => set({ sortBy }),
      setSortDir: (sortDir) => set({ sortDir }),
      setViewMode: (viewMode) => set({ viewMode }),
      setSearchQuery: (query) => set({ searchQuery: query }),
      setShowDeleted: (show) => set({ showDeleted: show }),
      setShowFavoritesOnly: (show) => set({ showFavoritesOnly: show }),
    }),
    {
      name: 'rmh-document-store',
      partialize: (state) => ({
        sortBy: state.sortBy,
        sortDir: state.sortDir,
        viewMode: state.viewMode,
      }),
    }
  )
);
