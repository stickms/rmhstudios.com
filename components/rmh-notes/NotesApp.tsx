'use client';

import { useEffect, useRef, useState, useCallback, lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { useNotesStore } from '@/lib/store/useNotesStore';
import { useNotesDataStore } from '@/lib/store/useNotesDataStore';
import { Note } from './types';
import { toast } from 'sonner';

// Always-visible panels: static imports are fine (lightweight)
import NotesSidebar from './NotesSidebar';
import NotesList from './NotesList';

// Heavy / conditional components: lazily imported to keep initial bundle small
const NoteEditor = lazy(() => import('./NoteEditor'));
const SearchPanel = lazy(() => import('./SearchPanel'));
const QuickCaptureModal = lazy(() => import('./QuickCaptureModal'));
const StatsPanel = lazy(() => import('./StatsPanel'));
const CalendarPanel = lazy(() => import('./CalendarPanel'));
const MoodPanel = lazy(() => import('./MoodPanel'));

export default function NotesApp() {
  const { t } = useTranslation("c-rmh-notes");
  const { isDarkMode, selectedView, selectedNoteId, sidebarOpen, searchOpen, quickCaptureOpen, toggleSearch, toggleQuickCapture, selectNote } = useNotesStore();

  const dataStore = useNotesDataStore();

  // Wait for client mount to avoid hydration mismatch (persisted stores differ server vs client)
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Determine effective dark mode
  const [systemDark, setSystemDark] = useState(false);
  const effectiveDark = isDarkMode === null ? systemDark : isDarkMode;

  const appRef = useRef<HTMLDivElement>(null);

  // Derive data from store
  const { recentNoteIds } = useNotesStore.getState();
  const notes = dataStore.getFilteredNotes(selectedView, recentNoteIds);
  const folders = dataStore.folders;
  const tags = dataStore.tags;
  const reminders = dataStore.reminders;

  // System dark mode
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    setSystemDark(mq.matches);
    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      // Ctrl/Cmd + Shift + N → Quick Capture
      if (meta && e.shiftKey && e.key === 'n') { e.preventDefault(); toggleQuickCapture(); }
      // Ctrl/Cmd + K → Search
      if (meta && e.key === 'k') { e.preventDefault(); toggleSearch(); }
      // Escape → close overlays
      if (e.key === 'Escape') {
        if (searchOpen) toggleSearch();
        if (quickCaptureOpen) toggleQuickCapture();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [searchOpen, quickCaptureOpen, toggleSearch, toggleQuickCapture]);

  // Evening reflection prompt (after 8 PM)
  useEffect(() => {
    const checkReflection = () => {
      const hour = new Date().getHours();
      if (hour >= 20 && !sessionStorage.getItem('notes-reflection-shown')) {
        sessionStorage.setItem('notes-reflection-shown', '1');
        setTimeout(() => {
          toast('🌙 ' + t("evening-reflection", { defaultValue: "Evening Reflection" }), {
            description: t("evening-reflection-desc", { defaultValue: "What did you accomplish today?" }),
            duration: 8000,
            action: {
              label: t("write-it-down", { defaultValue: "Write it down" }),
              onClick: () => {
                createNote({ title: `🌙 Reflection – ${new Date().toLocaleDateString()}` });
              },
            },
          });
        }, 3000);
      }
    };
    checkReflection();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const createNote = useCallback((overrides?: Partial<{ title: string; folderId: string; templateId: string }>) => {
    const folderId = selectedView.startsWith('folder:') ? selectedView.slice(7) : undefined;
    const note = dataStore.createNote({ folderId, ...overrides });
    selectNote(note.id);
  }, [selectedView, selectNote, dataStore]);

  const updateNote = useCallback((updated: Note) => {
    dataStore.updateNote(updated.id, updated);
  }, [dataStore]);

  const deleteNote = useCallback((id: string) => {
    if (selectedNoteId === id) selectNote(null);
  }, [selectedNoteId, selectNote]);

  const refreshAll = useCallback(() => {
    // No-op: data is reactive from the store
  }, []);

  const selectedNote = notes.find((n) => n.id === selectedNoteId) ?? null;

  if (!mounted) {
    return (
      <div className="notes-theme flex h-screen items-center justify-center" style={{ background: 'var(--notes-bg)', color: 'var(--notes-text)' }}>
        <div className="animate-pulse text-sm opacity-50">{t("loading-notes", { defaultValue: "Loading notes..." })}</div>
      </div>
    );
  }

  return (
    <div
      ref={appRef}
      className={`notes-theme${effectiveDark ? ' dark' : ''} flex h-screen overflow-hidden select-none`}
      style={{ background: 'var(--notes-bg)', color: 'var(--notes-text)', fontFamily: 'var(--notes-font)' }}
    >
      {/* Sidebar */}
      {sidebarOpen && (
        <NotesSidebar
          folders={folders}
          tags={tags}
          reminders={reminders}
          onFoldersChange={refreshAll}
          onTagsChange={refreshAll}
          onCreateNote={createNote}
          overdueCount={reminders.filter((r) => !r.isCompleted && new Date(r.dueAt) < new Date()).length}
        />
      )}

      {/* Note List */}
      <NotesList
        notes={notes}
        loading={false}
        selectedNoteId={selectedNoteId}
        onSelect={selectNote}
        onCreateNote={createNote}
        onUpdateNote={updateNote}
        onDeleteNote={deleteNote}
        onRefresh={refreshAll}
        folders={folders}
        tags={tags}
      />

      {/* Editor / Special Views */}
      <div className="flex-1 flex flex-col min-w-0" style={{ borderLeft: '1px solid var(--notes-border)' }}>
        <Suspense fallback={null}>
          {selectedView === 'stats' ? (
            <StatsPanel />
          ) : selectedView === 'calendar' || selectedView === 'reminders' || selectedView === 'overdue' ? (
            <CalendarPanel onSelectNote={(id) => { selectNote(id); useNotesStore.getState().setView('all'); }} />
          ) : selectedView === 'mood' ? (
            <MoodPanel />
          ) : selectedNote ? (
            <NoteEditor
              note={selectedNote}
              onUpdate={updateNote}
              onDelete={deleteNote}
              onRefresh={refreshAll}
              tags={tags}
              folders={folders}
            />
          ) : (
            <EmptyEditorState onCreateNote={createNote} />
          )}
        </Suspense>
      </div>

      {/* Overlays */}
      {searchOpen && (
        <Suspense fallback={null}>
          <SearchPanel
            onSelect={(id) => { selectNote(id); toggleSearch(); }}
            onClose={toggleSearch}
            tags={tags}
            folders={folders}
          />
        </Suspense>
      )}
      {quickCaptureOpen && (
        <Suspense fallback={null}>
          <QuickCaptureModal
            onSave={async (title, content) => {
              dataStore.createNote({ title, content });
              toast.success(t("note-captured", { defaultValue: "Note captured!" }));
              toggleQuickCapture();
            }}
            onClose={toggleQuickCapture}
          />
        </Suspense>
      )}
    </div>
  );
}

function EmptyEditorState({ onCreateNote }: { onCreateNote: () => void }) {
  const { t } = useTranslation("c-rmh-notes");
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8" style={{ background: 'var(--notes-surface)', color: 'var(--notes-text-muted)' }}>
      <div className="text-7xl opacity-30 select-none">📝</div>
      <p className="text-lg font-medium" style={{ color: 'var(--notes-text-muted)' }}>{t("select-or-create", { defaultValue: "Select a note or create a new one" })}</p>
      <button
        onClick={() => onCreateNote()}
        className="flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm transition-colors"
        style={{ background: 'var(--notes-accent)', color: 'var(--notes-accent-fg)' }}
      >
        ✦ {t("new-note", { defaultValue: "New Note" })}
      </button>
      <p className="text-xs" style={{ color: 'var(--notes-text-subtle)' }}>
        <kbd className="px-1.5 py-0.5 rounded text-xs" style={{ background: 'var(--notes-surface-2)', border: '1px solid var(--notes-border)' }}>⌘K</kbd> {t("to-search", { defaultValue: "to search" })} &nbsp;·&nbsp;
        <kbd className="px-1.5 py-0.5 rounded text-xs" style={{ background: 'var(--notes-surface-2)', border: '1px solid var(--notes-border)' }}>⌘⇧N</kbd> {t("to-quick-capture", { defaultValue: "to quick capture" })}
      </p>
    </div>
  );
}
