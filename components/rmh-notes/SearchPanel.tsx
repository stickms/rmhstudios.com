'use client';

import { useState, useEffect, useRef } from 'react';
import { useNotesDataStore } from '@/lib/store/useNotesDataStore';
import { Note, NoteFolder, NoteTag } from './types';

interface Props {
  onSelect: (id: string) => void;
  onClose: () => void;
  tags: NoteTag[];
  folders: NoteFolder[];
}

export default function SearchPanel({ onSelect, onClose, tags, folders }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Note[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedTagId, setSelectedTagId] = useState<string>('');
  const [selectedFolderId, setSelectedFolderId] = useState<string>('');
  const [hasReminder, setHasReminder] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const searchNotes = useNotesDataStore((s) => s.searchNotes);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(doSearch, 300);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, selectedTagId, selectedFolderId, hasReminder]);

  const doSearch = () => {
    if (!query && !selectedTagId && !selectedFolderId && !hasReminder) { setResults([]); return; }
    setLoading(true);
    const found = searchNotes(query, {
      tagId: selectedTagId || undefined,
      folderId: selectedFolderId || undefined,
      hasReminder: hasReminder || undefined,
    });
    setResults(found);
    setLoading(false);
  };

  const getPreview = (content: string) => {
    try {
      const doc = JSON.parse(content);
      const texts: string[] = [];
      const extract = (nodes: Array<Record<string, unknown>>) => {
        for (const n of nodes) {
          if (n.type === 'text') texts.push(n.text as string);
          if (n.content) extract(n.content as Array<Record<string, unknown>>);
          if (texts.join('').length > 100) return;
        }
      };
      if (doc.content) extract(doc.content);
      return texts.join('').slice(0, 100);
    } catch { return ''; }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4"
      style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden"
        style={{ background: 'var(--notes-surface)', border: '1px solid var(--notes-border)', maxHeight: '70vh', display: 'flex', flexDirection: 'column' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: '1px solid var(--notes-border)' }}>
          <span className="text-lg opacity-40">🔍</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search notes..."
            className="flex-1 text-base bg-transparent outline-none"
            style={{ color: 'var(--notes-text)' }}
          />
          <button onClick={onClose} className="text-sm opacity-40 hover:opacity-70" style={{ color: 'var(--notes-text)' }}>✕</button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 px-4 py-2 flex-wrap" style={{ borderBottom: '1px solid var(--notes-border)', background: 'var(--notes-surface-2)' }}>
          <select
            value={selectedTagId}
            onChange={(e) => setSelectedTagId(e.target.value)}
            className="text-xs px-2 py-1 rounded-lg outline-none"
            style={{ background: 'var(--notes-surface)', border: '1px solid var(--notes-border)', color: 'var(--notes-text-muted)' }}
          >
            <option value="">All tags</option>
            {tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <select
            value={selectedFolderId}
            onChange={(e) => setSelectedFolderId(e.target.value)}
            className="text-xs px-2 py-1 rounded-lg outline-none"
            style={{ background: 'var(--notes-surface)', border: '1px solid var(--notes-border)', color: 'var(--notes-text-muted)' }}
          >
            <option value="">All folders</option>
            {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
          <label className="flex items-center gap-1.5 text-xs cursor-pointer" style={{ color: 'var(--notes-text-muted)' }}>
            <input type="checkbox" checked={hasReminder} onChange={(e) => setHasReminder(e.target.checked)} className="accent-amber-500" />
            Has reminder
          </label>
        </div>

        {/* Results */}
        <div className="overflow-y-auto flex-1">
          {loading ? (
            <div className="text-center py-8" style={{ color: 'var(--notes-text-muted)' }}>Searching...</div>
          ) : results.length === 0 && (query || selectedTagId || selectedFolderId || hasReminder) ? (
            <div className="text-center py-8">
              <p className="text-3xl mb-2">🔍</p>
              <p className="text-sm" style={{ color: 'var(--notes-text-muted)' }}>No notes found</p>
            </div>
          ) : (
            <div className="py-2">
              {results.map((note) => (
                <button
                  key={note.id}
                  onClick={() => onSelect(note.id)}
                  className="w-full text-left px-4 py-3 transition-colors"
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--notes-surface-2)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <div className="flex items-center gap-2">
                    {note.isLocked && <span className="text-xs">🔒</span>}
                    <span className="font-semibold text-sm flex-1 truncate" style={{ color: 'var(--notes-text)' }}>{note.title || 'Untitled'}</span>
                    <span className="text-xs" style={{ color: 'var(--notes-text-subtle)' }}>
                      {new Date(note.updatedAt).toLocaleDateString()}
                    </span>
                  </div>
                  {getPreview(note.content) && (
                    <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--notes-text-muted)' }}>{getPreview(note.content)}</p>
                  )}
                  <div className="flex gap-1 mt-1 flex-wrap">
                    {note.folder && <span className="text-xs" style={{ color: 'var(--notes-text-subtle)' }}>📁 {note.folder.name}</span>}
                    {note.tags.slice(0, 3).map(({ tag }) => (
                      <span key={tag.id} className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: 'var(--notes-tag-bg)', color: 'var(--notes-tag-text)' }}>{tag.name}</span>
                    ))}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="px-4 py-2 text-xs" style={{ borderTop: '1px solid var(--notes-border)', color: 'var(--notes-text-subtle)' }}>
          Press <kbd className="px-1.5 py-0.5 rounded mx-0.5" style={{ background: 'var(--notes-surface-2)', border: '1px solid var(--notes-border)' }}>Esc</kbd> to close
        </div>
      </div>
    </div>
  );
}
