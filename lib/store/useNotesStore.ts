'use client';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type NoteView =
  | 'all' | 'pinned' | 'favorites' | 'recent' | 'archive' | 'trash'
  | 'reminders' | 'overdue' | 'calendar' | 'stats' | 'mood'
  | `folder:${string}` | `tag:${string}`;

export interface NotesUIState {
  // Navigation
  selectedView: NoteView;
  selectedNoteId: string | null;
  sidebarOpen: boolean;

  // Panels/Modals
  searchOpen: boolean;
  quickCaptureOpen: boolean;
  readingMode: boolean;
  markdownMode: boolean;

  // Theme
  isDarkMode: boolean | null; // null = system preference

  // Recently viewed
  recentNoteIds: string[];

  // Actions
  setView: (view: NoteView) => void;
  selectNote: (id: string | null) => void;
  pushRecent: (id: string) => void;
  toggleSidebar: () => void;
  toggleSearch: () => void;
  toggleQuickCapture: () => void;
  toggleReadingMode: () => void;
  toggleMarkdownMode: () => void;
  setDarkMode: (val: boolean | null) => void;
}

export const useNotesStore = create<NotesUIState>()(
  persist(
    (set) => ({
      selectedView: 'all',
      selectedNoteId: null,
      sidebarOpen: true,
      searchOpen: false,
      quickCaptureOpen: false,
      readingMode: false,
      markdownMode: false,
      isDarkMode: null,
      recentNoteIds: [],

      setView: (view) => set({ selectedView: view, selectedNoteId: null }),
      selectNote: (id) =>
        set((s) => ({
          selectedNoteId: id,
          recentNoteIds: id
            ? [id, ...s.recentNoteIds.filter((r) => r !== id)].slice(0, 10)
            : s.recentNoteIds,
          readingMode: false,
        })),
      pushRecent: (id) =>
        set((s) => ({
          recentNoteIds: [id, ...s.recentNoteIds.filter((r) => r !== id)].slice(0, 10),
        })),
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      toggleSearch: () => set((s) => ({ searchOpen: !s.searchOpen })),
      toggleQuickCapture: () => set((s) => ({ quickCaptureOpen: !s.quickCaptureOpen })),
      toggleReadingMode: () => set((s) => ({ readingMode: !s.readingMode })),
      toggleMarkdownMode: () => set((s) => ({ markdownMode: !s.markdownMode })),
      setDarkMode: (val) => set({ isDarkMode: val }),
    }),
    { name: 'rmh-notes-ui', partialize: (s) => ({ isDarkMode: s.isDarkMode, sidebarOpen: s.sidebarOpen, recentNoteIds: s.recentNoteIds }) }
  )
);
