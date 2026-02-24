'use client';

import { useState, useRef, useCallback } from 'react';
import { useNotesStore } from '@/lib/store/useNotesStore';
import { Note, NoteFolder, NoteTag, NOTE_COLORS } from './types';
import NoteCard from './NoteCard';
import { toast } from 'sonner';

interface Props {
  notes: Note[];
  loading: boolean;
  selectedNoteId: string | null;
  onSelect: (id: string) => void;
  onCreateNote: (overrides?: { folderId?: string; templateId?: string }) => void;
  onUpdateNote: (note: Note) => void;
  onDeleteNote: (id: string) => void;
  onRefresh: () => void;
  folders: NoteFolder[];
  tags: NoteTag[];
}

type SortBy = 'updated' | 'created' | 'title' | 'manual';

export default function NotesList({ notes, loading, selectedNoteId, onSelect, onCreateNote, onUpdateNote, onDeleteNote, onRefresh, folders, tags }: Props) {
  const { selectedView, setView, toggleSearch, sidebarOpen, toggleSidebar } = useNotesStore();
  const [sortBy, setSortBy] = useState<SortBy>('updated');
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const dragNoteId = useRef<string | null>(null);
  const [showSortMenu, setShowSortMenu] = useState(false);

  const viewLabel = () => {
    if (selectedView === 'all') return 'All Notes';
    if (selectedView === 'pinned') return 'Pinned';
    if (selectedView === 'favorites') return 'Favorites';
    if (selectedView === 'recent') return 'Recently Viewed';
    if (selectedView === 'archive') return 'Archive';
    if (selectedView === 'trash') return 'Trash';
    if (selectedView === 'reminders') return 'Upcoming Reminders';
    if (selectedView === 'overdue') return 'Overdue Reminders';
    if (selectedView === 'calendar') return 'Calendar';
    if (selectedView === 'stats') return 'Statistics';
    if (selectedView === 'mood') return 'Mood Journal';
    if (selectedView.startsWith('folder:')) {
      const id = selectedView.slice(7);
      return folders.find((f) => f.id === id)?.name ?? 'Folder';
    }
    if (selectedView.startsWith('tag:')) {
      const id = selectedView.slice(4);
      return `#${tags.find((t) => t.id === id)?.name ?? 'Tag'}`;
    }
    return 'Notes';
  };

  const sorted = [...notes].sort((a, b) => {
    if (sortBy === 'updated') return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    if (sortBy === 'created') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    if (sortBy === 'title') return a.title.localeCompare(b.title);
    if (sortBy === 'manual') return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
    return 0;
  });

  // Drag-and-drop reordering
  const handleDragStart = (id: string) => { dragNoteId.current = id; };
  const handleDragOver = (e: React.DragEvent, id: string) => { e.preventDefault(); setDragOverId(id); };
  const handleDrop = async (targetId: string) => {
    setDragOverId(null);
    const fromId = dragNoteId.current;
    if (!fromId || fromId === targetId) return;
    const fromIdx = sorted.findIndex((n) => n.id === fromId);
    const toIdx = sorted.findIndex((n) => n.id === targetId);
    if (fromIdx < 0 || toIdx < 0) return;
    // Update sortOrders
    const reordered = [...sorted];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    await Promise.all(
      reordered.map((n, i) =>
        fetch(`/api/rmh-notes/notes/${n.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sortOrder: i }),
        })
      )
    );
    onRefresh();
    setSortBy('manual');
    dragNoteId.current = null;
  };

  const quickAction = useCallback(async (note: Note, action: string) => {
    const patches: Partial<Note> = {};
    if (action === 'pin') patches.isPinned = !note.isPinned;
    if (action === 'fav') patches.isFavorite = !note.isFavorite;
    if (action === 'archive') patches.isArchived = !note.isArchived;
    if (action === 'trash') patches.isDeleted = true;
    if (action === 'restore') { patches.isDeleted = false; patches.isArchived = false; }
    if (action === 'delete') {
      const res = await fetch(`/api/rmh-notes/notes/${note.id}`, { method: 'DELETE' });
      if (res.ok) { onDeleteNote(note.id); toast.success('Note deleted permanently'); }
      return;
    }

    const res = await fetch(`/api/rmh-notes/notes/${note.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patches),
    });
    if (res.ok) {
      const { note: updated } = await res.json();
      if (patches.isDeleted || patches.isArchived) {
        onDeleteNote(note.id);
        toast.success(patches.isDeleted ? 'Moved to trash' : 'Archived');
      } else {
        onUpdateNote(updated);
      }
    }
  }, [onDeleteNote, onUpdateNote]);

  const duplicateNote = useCallback(async (id: string) => {
    const res = await fetch(`/api/rmh-notes/notes/${id}/duplicate`, { method: 'POST' });
    if (res.ok) {
      const { note } = await res.json();
      onUpdateNote(note); // will be added by refresh
      onRefresh();
      toast.success('Note duplicated');
    }
  }, [onRefresh, onUpdateNote]);

  const randomNote = () => {
    if (notes.length === 0) return;
    const rand = notes[Math.floor(Math.random() * notes.length)];
    onSelect(rand.id);
  };

  const isSpecialView = ['reminders', 'overdue', 'calendar', 'stats', 'mood'].includes(selectedView);

  return (
    <div
      className="flex flex-col h-full overflow-hidden"
      style={{ width: 280, background: 'var(--notes-surface)', borderRight: '1px solid var(--notes-border)', flexShrink: 0 }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5" style={{ borderBottom: '1px solid var(--notes-border)' }}>
        {/* Hamburger */}
        <button onClick={toggleSidebar} className="text-lg opacity-50 hover:opacity-80 transition-opacity" title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}>
          {sidebarOpen ? '◀' : '▶'}
        </button>
        <h2 className="font-bold text-sm flex-1 truncate" style={{ color: 'var(--notes-text)' }}>{viewLabel()}</h2>

        {/* Search */}
        <button onClick={toggleSearch} title="Search (⌘K)" className="opacity-50 hover:opacity-80 transition-opacity text-sm">🔍</button>

        {/* Sort */}
        {!isSpecialView && (
          <div className="relative">
            <button onClick={() => setShowSortMenu((v) => !v)} className="opacity-50 hover:opacity-80 transition-opacity text-sm" title="Sort">⇅</button>
            {showSortMenu && (
              <div className="absolute right-0 top-7 z-50 rounded-xl shadow-lg overflow-hidden text-sm w-40" style={{ background: 'var(--notes-surface)', border: '1px solid var(--notes-border)' }}>
                {(['updated', 'created', 'title', 'manual'] as SortBy[]).map((s) => (
                  <button
                    key={s}
                    onClick={() => { setSortBy(s); setShowSortMenu(false); }}
                    className="w-full text-left px-4 py-2.5 transition-colors"
                    style={{ background: sortBy === s ? 'var(--notes-surface-2)' : 'transparent', color: sortBy === s ? 'var(--notes-accent)' : 'var(--notes-text-muted)' }}
                  >
                    {s === 'updated' ? 'Last modified' : s === 'created' ? 'Date created' : s === 'title' ? 'Title A–Z' : 'Custom order'}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Random note */}
        {!isSpecialView && notes.length > 0 && (
          <button onClick={randomNote} className="opacity-50 hover:opacity-80 transition-opacity text-sm" title="Surprise me 🎲">🎲</button>
        )}

        {/* Create */}
        {!isSpecialView && (
          <button onClick={() => onCreateNote()} className="opacity-50 hover:opacity-80 transition-opacity text-base" title="New note (⌘N)">✦</button>
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto" onClick={() => setShowSortMenu(false)}>
        {loading ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="rounded-xl p-3 animate-pulse" style={{ background: 'var(--notes-surface-2)', height: 72 }} />
            ))}
          </div>
        ) : sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 p-6" style={{ color: 'var(--notes-text-subtle)' }}>
            <span className="text-4xl opacity-40">📭</span>
            <p className="text-sm text-center">No notes here yet</p>
            {!isSpecialView && (
              <button onClick={() => onCreateNote()} className="text-sm font-semibold px-3 py-1.5 rounded-lg" style={{ background: 'var(--notes-accent)', color: 'var(--notes-accent-fg)' }}>
                Create one
              </button>
            )}
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {sorted.map((note) => (
              <div
                key={note.id}
                draggable
                onDragStart={() => handleDragStart(note.id)}
                onDragOver={(e) => handleDragOver(e, note.id)}
                onDragLeave={() => setDragOverId(null)}
                onDrop={() => handleDrop(note.id)}
                style={{ borderTop: dragOverId === note.id ? '2px solid var(--notes-accent)' : '2px solid transparent' }}
              >
                <NoteCard
                  note={note}
                  selected={selectedNoteId === note.id}
                  onClick={() => onSelect(note.id)}
                  onQuickAction={quickAction}
                  onDuplicate={duplicateNote}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-2 text-xs" style={{ color: 'var(--notes-text-subtle)', borderTop: '1px solid var(--notes-border)' }}>
        {notes.length} note{notes.length !== 1 ? 's' : ''}
      </div>
    </div>
  );
}
