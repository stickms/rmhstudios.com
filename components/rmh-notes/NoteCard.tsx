'use client';

import { useState, useRef, useEffect } from 'react';
import { Note, NOTE_COLORS } from './types';

interface Props {
  note: Note;
  selected: boolean;
  onClick: () => void;
  onQuickAction: (note: Note, action: string) => void;
  onDuplicate: (id: string) => void;
}

function getPreviewText(content: string): string {
  try {
    const doc = JSON.parse(content);
    const texts: string[] = [];
    const extract = (nodes: Array<Record<string, unknown>>) => {
      for (const node of nodes) {
        if (node.type === 'text') texts.push(node.text as string);
        if (node.content) extract(node.content as Array<Record<string, unknown>>);
        if (texts.join('').length > 120) return;
      }
    };
    if (doc.content) extract(doc.content);
    return texts.join('').slice(0, 120);
  } catch {
    return '';
  }
}

export default function NoteCard({ note, selected, onClick, onQuickAction, onDuplicate }: Props) {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const preview = getPreviewText(note.content);
  const colorEntry = NOTE_COLORS.find((c) => c.id === note.color);

  const relativeTime = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d`;
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    document.addEventListener('click', close, { once: true });
    return () => document.removeEventListener('click', close);
  }, [contextMenu]);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const bg = colorEntry?.bg;
  const hasReminder = note.reminders.length > 0;
  const reminderDue = hasReminder ? new Date(note.reminders[0].dueAt) : null;
  const isOverdue = reminderDue && reminderDue < new Date();

  return (
    <>
      <div
        className="relative rounded-xl px-3 py-2.5 cursor-pointer transition-all"
        style={{
          background: selected
            ? 'var(--notes-sidebar-active)'
            : bg ?? 'transparent',
          border: `1px solid ${selected ? 'var(--notes-accent)' : 'transparent'}`,
          outline: selected ? `2px solid var(--notes-accent)` : 'none',
          outlineOffset: -1,
        }}
        onClick={onClick}
        onContextMenu={handleContextMenu}
        onMouseEnter={(e) => { if (!selected) (e.currentTarget as HTMLElement).style.background = bg ?? 'var(--notes-sidebar-hover)'; }}
        onMouseLeave={(e) => { if (!selected) (e.currentTarget as HTMLElement).style.background = bg ?? 'transparent'; }}
      >
        {/* Top row: title + badges */}
        <div className="flex items-start gap-1.5">
          {note.isLocked && <span className="text-xs mt-0.5" title="Locked">🔒</span>}
          <span className="font-semibold text-sm flex-1 truncate" style={{ color: 'var(--notes-text)' }}>
            {note.title || 'Untitled'}
          </span>
          <div className="flex items-center gap-1 flex-shrink-0">
            {note.isPinned && <span className="text-xs" title="Pinned" style={{ color: 'var(--notes-pin-color)' }}>📌</span>}
            {note.isFavorite && <span className="text-xs" style={{ color: 'var(--notes-fav-color)' }}>⭐</span>}
          </div>
        </div>

        {/* Preview */}
        {preview && (
          <p className="text-xs mt-1 line-clamp-2" style={{ color: 'var(--notes-text-muted)' }}>
            {preview}
          </p>
        )}

        {/* Bottom row */}
        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
          <span className="text-xs" style={{ color: 'var(--notes-text-subtle)' }}>{relativeTime(note.updatedAt)}</span>
          {note.tags.slice(0, 3).map(({ tag }) => (
            <span key={tag.id} className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: 'var(--notes-tag-bg)', color: 'var(--notes-tag-text)', border: '1px solid var(--notes-tag-border)' }}>
              {tag.name}
            </span>
          ))}
          {hasReminder && (
            <span className="text-xs" style={{ color: isOverdue ? 'var(--notes-danger)' : 'var(--notes-text-subtle)' }} title={reminderDue?.toLocaleString()}>
              {isOverdue ? '⚠️' : '🔔'}
            </span>
          )}
          {note.wordCount > 0 && (
            <span className="text-xs ml-auto" style={{ color: 'var(--notes-text-subtle)' }}>{note.wordCount}w</span>
          )}
        </div>
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          note={note}
          onAction={(action) => {
            setContextMenu(null);
            if (action === 'duplicate') onDuplicate(note.id);
            else onQuickAction(note, action);
          }}
          onClose={() => setContextMenu(null)}
          ref={menuRef}
        />
      )}
    </>
  );
}

import React from 'react';

const ContextMenu = React.forwardRef<HTMLDivElement, {
  x: number; y: number; note: Note;
  onAction: (a: string) => void;
  onClose: () => void;
}>(({ x, y, note, onAction }, ref) => {
  const items = [
    { action: 'pin', label: note.isPinned ? '📌 Unpin' : '📌 Pin' },
    { action: 'fav', label: note.isFavorite ? '⭐ Unfavorite' : '⭐ Favorite' },
    { action: 'duplicate', label: '📋 Duplicate' },
    { action: 'archive', label: note.isArchived ? '📤 Unarchive' : '📦 Archive' },
    null,
    { action: note.isDeleted ? 'delete' : 'trash', label: note.isDeleted ? '🗑️ Delete permanently' : '🗑️ Move to trash', danger: true },
  ];

  // Keep menu within viewport
  const adjustedX = Math.min(x, window.innerWidth - 180);
  const adjustedY = Math.min(y, window.innerHeight - 250);

  return (
    <div
      ref={ref}
      className="fixed z-50 rounded-xl shadow-lg overflow-hidden text-sm py-1 w-44"
      style={{ left: adjustedX, top: adjustedY, background: 'var(--notes-surface)', border: '1px solid var(--notes-border)' }}
      onClick={(e) => e.stopPropagation()}
    >
      {items.map((item, i) =>
        item === null ? (
          <div key={i} style={{ height: 1, background: 'var(--notes-border)', margin: '4px 8px' }} />
        ) : (
          <button
            key={item.action}
            onClick={() => onAction(item.action)}
            className="w-full text-left px-4 py-2 transition-colors"
            style={{
              color: item.danger ? 'var(--notes-danger)' : 'var(--notes-text-muted)',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--notes-surface-2)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            {item.label}
          </button>
        )
      )}
    </div>
  );
});
ContextMenu.displayName = 'ContextMenu';
