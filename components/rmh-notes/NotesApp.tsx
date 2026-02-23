'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useNotesStore } from '@/lib/store/useNotesStore';
import dynamic from 'next/dynamic';
import { Note, NoteFolder, NoteTag, NoteReminder } from './types';
import { toast } from 'sonner';

// Always-visible panels: static imports are fine (lightweight)
import NotesSidebar from './NotesSidebar';
import NotesList from './NotesList';

// Heavy / conditional components: dynamically imported to keep initial bundle small
const NoteEditor = dynamic(() => import('./NoteEditor'), { ssr: false });
const SearchPanel = dynamic(() => import('./SearchPanel'), { ssr: false });
const QuickCaptureModal = dynamic(() => import('./QuickCaptureModal'), { ssr: false });
const StatsPanel = dynamic(() => import('./StatsPanel'), { ssr: false });
const CalendarPanel = dynamic(() => import('./CalendarPanel'), { ssr: false });
const MoodPanel = dynamic(() => import('./MoodPanel'), { ssr: false });

export default function NotesApp() {
  const { isDarkMode, selectedView, selectedNoteId, sidebarOpen, searchOpen, quickCaptureOpen, toggleSearch, toggleQuickCapture, selectNote } = useNotesStore();

  // Determine effective dark mode
  const [systemDark, setSystemDark] = useState(false);
  const effectiveDark = isDarkMode === null ? systemDark : isDarkMode;

  const [notes, setNotes] = useState<Note[]>([]);
  const [folders, setFolders] = useState<NoteFolder[]>([]);
  const [tags, setTags] = useState<NoteTag[]>([]);
  const [reminders, setReminders] = useState<NoteReminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [authed, setAuthed] = useState<boolean | null>(null);

  const appRef = useRef<HTMLDivElement>(null);

  // System dark mode
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    setSystemDark(mq.matches);
    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Check auth
  useEffect(() => {
    fetch('/api/rmh-notes/notes').then((r) => {
      if (r.status === 401) setAuthed(false);
      else setAuthed(true);
    });
  }, []);

  // Load folders + tags once
  const loadMeta = useCallback(async () => {
    const [fRes, tRes] = await Promise.all([
      fetch('/api/rmh-notes/folders'),
      fetch('/api/rmh-notes/tags'),
    ]);
    if (fRes.ok) setFolders((await fRes.json()).folders);
    if (tRes.ok) setTags((await tRes.json()).tags);
  }, []);

  // Load notes based on current view
  const loadNotes = useCallback(async () => {
    const { recentNoteIds } = useNotesStore.getState();
    // Special views that don't need API fetching
    if (['stats', 'calendar', 'reminders', 'overdue', 'mood'].includes(selectedView)) {
      setLoading(false);
      return;
    }
    // Recently viewed: fetch specific note IDs
    if (selectedView === 'recent') {
      if (recentNoteIds.length === 0) { setNotes([]); setLoading(false); return; }
      setLoading(true);
      const res = await fetch('/api/rmh-notes/notes?view=all');
      if (res.ok) {
        const all: Note[] = (await res.json()).notes;
        const ordered = recentNoteIds.map((id) => all.find((n) => n.id === id)).filter(Boolean) as Note[];
        setNotes(ordered);
      }
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      let url = '/api/rmh-notes/notes?';
      if (selectedView === 'archive') url += 'view=archive';
      else if (selectedView === 'trash') url += 'view=trash';
      else if (selectedView === 'pinned') url += 'view=pinned';
      else if (selectedView === 'favorites') url += 'view=favorites';
      else if (selectedView.startsWith('folder:')) url += `folderId=${selectedView.slice(7)}`;
      else if (selectedView.startsWith('tag:')) url += `tagId=${selectedView.slice(4)}`;
      else url += 'view=all';
      const res = await fetch(url);
      if (res.ok) setNotes((await res.json()).notes);
    } finally {
      setLoading(false);
    }
  }, [selectedView]);

  // Load reminders (upcoming + overdue count)
  const loadReminders = useCallback(async () => {
    const res = await fetch('/api/rmh-notes/reminders?view=all');
    if (res.ok) setReminders((await res.json()).reminders);
  }, []);

  useEffect(() => {
    if (authed) { loadMeta(); loadReminders(); }
  }, [authed, loadMeta, loadReminders]);

  useEffect(() => {
    if (authed) loadNotes();
  }, [authed, loadNotes, selectedView]);

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
          toast('🌙 Evening Reflection', {
            description: 'What did you accomplish today?',
            duration: 8000,
            action: {
              label: 'Write it down',
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

  const createNote = useCallback(async (overrides?: Partial<{ title: string; folderId: string; templateId: string }>) => {
    const folderId = selectedView.startsWith('folder:') ? selectedView.slice(7) : undefined;
    const res = await fetch('/api/rmh-notes/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folderId, ...overrides }),
    });
    if (res.ok) {
      const { note } = await res.json();
      setNotes((prev) => [note, ...prev]);
      selectNote(note.id);
    }
  }, [selectedView, selectNote]);

  const updateNote = useCallback((updated: Note) => {
    setNotes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
  }, []);

  const deleteNote = useCallback((id: string) => {
    setNotes((prev) => prev.filter((n) => n.id !== id));
    if (selectedNoteId === id) selectNote(null);
  }, [selectedNoteId, selectNote]);

  const refreshAll = useCallback(() => {
    loadNotes();
    loadMeta();
    loadReminders();
  }, [loadNotes, loadMeta, loadReminders]);

  if (authed === false) {
    return (
      <div className="notes-theme flex items-center justify-center h-screen" style={{ background: 'var(--notes-bg)', color: 'var(--notes-text)' }}>
        <div className="text-center space-y-4">
          <div className="text-5xl">📓</div>
          <h1 className="text-2xl font-bold">RMHNotes</h1>
          <p style={{ color: 'var(--notes-text-muted)' }}>Please sign in to access your notes.</p>
          <a href="/login" className="inline-block px-5 py-2.5 rounded-lg font-semibold text-sm" style={{ background: 'var(--notes-accent)', color: 'var(--notes-accent-fg)' }}>
            Sign in
          </a>
        </div>
      </div>
    );
  }

  const selectedNote = notes.find((n) => n.id === selectedNoteId) ?? null;

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
          onFoldersChange={loadMeta}
          onTagsChange={loadMeta}
          onCreateNote={createNote}
          overdueCount={reminders.filter((r) => !r.isCompleted && new Date(r.dueAt) < new Date()).length}
        />
      )}

      {/* Note List */}
      <NotesList
        notes={notes}
        loading={loading}
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
      </div>

      {/* Overlays */}
      {searchOpen && (
        <SearchPanel
          onSelect={(id) => { selectNote(id); toggleSearch(); }}
          onClose={toggleSearch}
          tags={tags}
          folders={folders}
        />
      )}
      {quickCaptureOpen && (
        <QuickCaptureModal
          onSave={async (title, content) => {
            const res = await fetch('/api/rmh-notes/notes', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ title, content }),
            });
            if (res.ok) {
              const { note } = await res.json();
              setNotes((prev) => [note, ...prev]);
              toast.success('Note captured!');
            }
            toggleQuickCapture();
          }}
          onClose={toggleQuickCapture}
        />
      )}
    </div>
  );
}

function EmptyEditorState({ onCreateNote }: { onCreateNote: () => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8" style={{ background: 'var(--notes-surface)', color: 'var(--notes-text-muted)' }}>
      <div className="text-7xl opacity-30 select-none">📝</div>
      <p className="text-lg font-medium" style={{ color: 'var(--notes-text-muted)' }}>Select a note or create a new one</p>
      <button
        onClick={() => onCreateNote()}
        className="flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm transition-colors"
        style={{ background: 'var(--notes-accent)', color: 'var(--notes-accent-fg)' }}
      >
        ✦ New Note
      </button>
      <p className="text-xs" style={{ color: 'var(--notes-text-subtle)' }}>
        <kbd className="px-1.5 py-0.5 rounded text-xs" style={{ background: 'var(--notes-surface-2)', border: '1px solid var(--notes-border)' }}>⌘K</kbd> to search &nbsp;·&nbsp;
        <kbd className="px-1.5 py-0.5 rounded text-xs" style={{ background: 'var(--notes-surface-2)', border: '1px solid var(--notes-border)' }}>⌘⇧N</kbd> to quick capture
      </p>
    </div>
  );
}
