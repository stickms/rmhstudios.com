import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { DocumentType } from '@/lib/rmh-utils/types';

export interface StoredDocument {
  id: string;
  type: DocumentType;
  title: string;
  content: string; // JSON string for app-specific content
  isFavorite: boolean;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
}

interface DocumentStoreState {
  // Document data
  documents: StoredDocument[];

  // UI preferences
  sortBy: 'updatedAt' | 'createdAt' | 'title';
  sortDir: 'asc' | 'desc';
  viewMode: 'grid' | 'list';
  searchQuery: string;
  showDeleted: boolean;
  showFavoritesOnly: boolean;

  // UI setters
  setSortBy: (sortBy: 'updatedAt' | 'createdAt' | 'title') => void;
  setSortDir: (sortDir: 'asc' | 'desc') => void;
  setViewMode: (viewMode: 'grid' | 'list') => void;
  setSearchQuery: (query: string) => void;
  setShowDeleted: (show: boolean) => void;
  setShowFavoritesOnly: (show: boolean) => void;

  // Document CRUD
  createDocument: (type: DocumentType, title: string) => StoredDocument;
  getDocument: (id: string) => StoredDocument | undefined;
  getDocumentsByType: (type: DocumentType) => StoredDocument[];
  updateDocument: (id: string, updates: Partial<Pick<StoredDocument, 'title' | 'content' | 'isFavorite' | 'isDeleted'>>) => StoredDocument | undefined;
  deleteDocument: (id: string) => void;
  renameDocument: (id: string, title: string) => StoredDocument | undefined;
  toggleFavorite: (id: string) => StoredDocument | undefined;
  softDeleteDocument: (id: string) => void;
}

export const useDocumentStore = create<DocumentStoreState>()(
  persist(
    (set, get) => ({
      documents: [],

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

      createDocument: (type, title) => {
        const now = new Date().toISOString();
        const doc: StoredDocument = {
          id: `${type.toLowerCase()}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
          type,
          title,
          content: '',
          isFavorite: false,
          isDeleted: false,
          createdAt: now,
          updatedAt: now,
        };
        set((state) => ({ documents: [doc, ...state.documents] }));
        return doc;
      },

      getDocument: (id) => {
        return get().documents.find((d) => d.id === id);
      },

      getDocumentsByType: (type) => {
        return get().documents.filter((d) => d.type === type && !d.isDeleted);
      },

      updateDocument: (id, updates) => {
        let updated: StoredDocument | undefined;
        set((state) => ({
          documents: state.documents.map((d) => {
            if (d.id === id) {
              updated = { ...d, ...updates, updatedAt: new Date().toISOString() };
              return updated;
            }
            return d;
          }),
        }));
        return updated;
      },

      deleteDocument: (id) => {
        set((state) => ({
          documents: state.documents.filter((d) => d.id !== id),
        }));
      },

      renameDocument: (id, title) => {
        return get().updateDocument(id, { title });
      },

      toggleFavorite: (id) => {
        const doc = get().documents.find((d) => d.id === id);
        if (!doc) return undefined;
        return get().updateDocument(id, { isFavorite: !doc.isFavorite });
      },

      softDeleteDocument: (id) => {
        get().updateDocument(id, { isDeleted: true });
      },
    }),
    {
      name: 'rmh-document-store',
    }
  )
);
