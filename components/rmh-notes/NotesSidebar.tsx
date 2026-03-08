'use client';

import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useNotesStore, NoteView } from '@/lib/store/useNotesStore';
import { useNotesDataStore } from '@/lib/store/useNotesDataStore';
import { NoteFolder, NoteTag, NoteReminder } from './types';
import { toast } from 'sonner';

const FOLDER_COLORS = ['#C17F3A', '#D95B3A', '#3D7A4F', '#5B8FD6', '#8B6FC0', '#E6A817'];

interface Props {
  folders: NoteFolder[];
  tags: NoteTag[];
  reminders: NoteReminder[];
  overdueCount: number;
  onFoldersChange: () => void;
  onTagsChange: () => void;
  onCreateNote: () => void;
}

export default function NotesSidebar({ folders, tags, reminders, overdueCount, onFoldersChange, onTagsChange, onCreateNote }: Props) {
  const { selectedView, setView, isDarkMode, setDarkMode } = useNotesStore();
  const dataStore = useNotesDataStore();
  const [addingFolder, setAddingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderColor, setNewFolderColor] = useState(FOLDER_COLORS[0]);
  const [expandedFolders, setExpandedFolders] = useState(true);
  const [expandedTags, setExpandedTags] = useState(true);
  const [addingTag, setAddingTag] = useState(false);
  const [newTagName, setNewTagName] = useState('');

  const upcomingCount = reminders.filter((r) => !r.isCompleted && new Date(r.dueAt) >= new Date()).length;

  const navItem = (view: NoteView, icon: string, label: string, badge?: number) => {
    const active = selectedView === view;
    return (
      <button
        key={view}
        onClick={() => setView(view)}
        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-left"
        style={{
          background: active ? 'var(--notes-sidebar-active)' : 'transparent',
          color: active ? 'var(--notes-accent)' : 'var(--notes-text-muted)',
        }}
        onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'var(--notes-sidebar-hover)'; }}
        onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
      >
        <span className="text-base w-5 text-center">{icon}</span>
        <span className="flex-1">{label}</span>
        {badge !== undefined && badge > 0 && (
          <span className="text-xs px-1.5 py-0.5 rounded-full font-semibold" style={{ background: 'var(--notes-accent)', color: 'var(--notes-accent-fg)' }}>
            {badge}
          </span>
        )}
      </button>
    );
  };

  const createFolder = () => {
    if (!newFolderName.trim()) return;
    dataStore.createFolder(newFolderName.trim(), newFolderColor);
    setNewFolderName('');
    setAddingFolder(false);
    onFoldersChange();
  };

  const createTag = () => {
    if (!newTagName.trim()) return;
    dataStore.createTag(newTagName.trim());
    setNewTagName('');
    setAddingTag(false);
    onTagsChange();
  };

  const deleteFolder = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Delete this folder? Notes inside will be moved to root.')) return;
    dataStore.deleteFolder(id);
    onFoldersChange();
    toast.success('Folder deleted');
  };

  const deleteTag = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    dataStore.deleteTag(id);
    onTagsChange();
    toast.success('Tag deleted');
  };

  return (
    <div
      className="flex flex-col h-full overflow-hidden"
      style={{ width: 220, background: 'var(--notes-sidebar-bg)', borderRight: '1px solid var(--notes-sidebar-border)', flexShrink: 0 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--notes-sidebar-border)' }}>
        <div className="flex items-center gap-2">
          <Link to="/secret" className="text-base hover:opacity-70 transition-opacity" title="Back to home" style={{ color: 'var(--notes-text-muted)' }}>←</Link>
          <span className="text-xl">📓</span>
          <span className="font-bold text-sm tracking-wide" style={{ color: 'var(--notes-text)' }}>RMHNotes</span>
        </div>
        <button
          onClick={() => setDarkMode(isDarkMode ? false : true)}
          className="text-base hover:opacity-70 transition-opacity"
          title="Toggle theme"
        >
          {isDarkMode ? '☀️' : '🌙'}
        </button>
      </div>

      {/* New Note Button */}
      <div className="px-3 py-3">
        <button
          onClick={() => onCreateNote()}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition-colors"
          style={{ background: 'var(--notes-accent)', color: 'var(--notes-accent-fg)' }}
        >
          <span>✦</span> New Note
          <kbd className="ml-auto text-xs opacity-60 font-normal">⌘N</kbd>
        </button>
      </div>

      {/* Nav */}
      <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-0.5">
        <SectionLabel>Library</SectionLabel>
        {navItem('all', '📄', 'All Notes')}
        {navItem('pinned', '📌', 'Pinned')}
        {navItem('favorites', '⭐', 'Favorites')}
        {navItem('recent', '🕐', 'Recently Viewed')}

        <SectionLabel className="mt-2">Reminders</SectionLabel>
        {navItem('reminders', '🔔', 'Upcoming', upcomingCount)}
        {navItem('overdue', '⚠️', 'Overdue', overdueCount)}
        {navItem('calendar', '📅', 'Calendar')}

        <SectionLabel className="mt-2">Views</SectionLabel>
        {navItem('mood', '🌈', 'Mood Journal')}
        {navItem('stats', '📊', 'Statistics')}

        <SectionLabel className="mt-2">Organize</SectionLabel>
        {navItem('archive', '📦', 'Archive')}
        {navItem('trash', '🗑️', 'Trash')}

        {/* Folders */}
        <div className="mt-2">
          <div className="w-full flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--notes-text-subtle)' }}>
            <button className="flex items-center gap-1.5 flex-1 min-w-0 transition-opacity hover:opacity-70" onClick={() => setExpandedFolders((v) => !v)}>
              <span>{expandedFolders ? '▾' : '▸'}</span>
              Folders
            </button>
            <button
              className="ml-auto hover:opacity-70 transition-opacity"
              onClick={() => setAddingFolder(true)}
              title="New folder"
            >＋</button>
          </div>

          {expandedFolders && (
            <div className="space-y-0.5">
              {folders.filter((f) => !f.parentId).map((folder) => (
                <FolderItem key={folder.id} folder={folder} onDelete={deleteFolder} />
              ))}
              {addingFolder && (
                <div className="px-3 py-2 space-y-2">
                  <input
                    autoFocus
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') createFolder(); if (e.key === 'Escape') setAddingFolder(false); }}
                    placeholder="Folder name..."
                    className="w-full text-xs px-2 py-1.5 rounded-md outline-none"
                    style={{ background: 'var(--notes-surface)', border: '1px solid var(--notes-border)', color: 'var(--notes-text)' }}
                  />
                  <div className="flex gap-1 flex-wrap">
                    {FOLDER_COLORS.map((c) => (
                      <button
                        key={c}
                        onClick={() => setNewFolderColor(c)}
                        className="w-4 h-4 rounded-full border-2 transition-all"
                        style={{ background: c, borderColor: newFolderColor === c ? 'var(--notes-text)' : 'transparent' }}
                      />
                    ))}
                  </div>
                  <div className="flex gap-1">
                    <button onClick={createFolder} className="text-xs px-2 py-1 rounded" style={{ background: 'var(--notes-accent)', color: 'var(--notes-accent-fg)' }}>Create</button>
                    <button onClick={() => setAddingFolder(false)} className="text-xs px-2 py-1 rounded" style={{ background: 'var(--notes-surface-2)', color: 'var(--notes-text-muted)' }}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Tags */}
        <div className="mt-2">
          <div className="w-full flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--notes-text-subtle)' }}>
            <button className="flex items-center gap-1.5 flex-1 min-w-0 transition-opacity hover:opacity-70" onClick={() => setExpandedTags((v) => !v)}>
              <span>{expandedTags ? '▾' : '▸'}</span>
              Tags
            </button>
            <button
              className="ml-auto hover:opacity-70 transition-opacity"
              onClick={() => setAddingTag(true)}
              title="New tag"
            >＋</button>
          </div>

          {expandedTags && (
            <div className="space-y-0.5">
              {tags.map((tag) => (
                <TagItem key={tag.id} tag={tag} onDelete={deleteTag} />
              ))}
              {addingTag && (
                <div className="px-3 py-2">
                  <input
                    autoFocus
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') createTag(); if (e.key === 'Escape') setAddingTag(false); }}
                    placeholder="Tag name..."
                    className="w-full text-xs px-2 py-1.5 rounded-md outline-none"
                    style={{ background: 'var(--notes-surface)', border: '1px solid var(--notes-border)', color: 'var(--notes-text)' }}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SectionLabel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`px-3 pt-1 pb-0.5 text-xs font-semibold tracking-widest uppercase ${className}`} style={{ color: 'var(--notes-text-subtle)' }}>
      {children}
    </div>
  );
}

function FolderItem({ folder, onDelete }: { folder: NoteFolder; onDelete: (id: string, e: React.MouseEvent) => void }) {
  const { selectedView, setView } = useNotesStore();
  const active = selectedView === `folder:${folder.id}`;
  return (
    <button
      onClick={() => setView(`folder:${folder.id}`)}
      className="group w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors text-left"
      style={{
        background: active ? 'var(--notes-sidebar-active)' : 'transparent',
        color: active ? 'var(--notes-accent)' : 'var(--notes-text-muted)',
      }}
      onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'var(--notes-sidebar-hover)'; }}
      onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
    >
      <span className="text-xs" style={{ color: folder.color ?? 'var(--notes-text-muted)' }}>📁</span>
      <span className="flex-1 truncate text-xs">{folder.name}</span>
      {folder._count !== undefined && <span className="text-xs opacity-50">{folder._count.notes}</span>}
      <span role="button" tabIndex={0} onClick={(e) => onDelete(folder.id, e)} onKeyDown={(e) => { if (e.key === 'Enter') onDelete(folder.id, e as unknown as React.MouseEvent); }} className="opacity-0 group-hover:opacity-60 hover:opacity-100! text-xs cursor-pointer" title="Delete folder">✕</span>
    </button>
  );
}

function TagItem({ tag, onDelete }: { tag: NoteTag; onDelete: (id: string, e: React.MouseEvent) => void }) {
  const { selectedView, setView } = useNotesStore();
  const active = selectedView === `tag:${tag.id}`;
  return (
    <button
      onClick={() => setView(`tag:${tag.id}`)}
      className="group w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors text-left"
      style={{
        background: active ? 'var(--notes-sidebar-active)' : 'transparent',
        color: active ? 'var(--notes-accent)' : 'var(--notes-text-muted)',
      }}
      onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'var(--notes-sidebar-hover)'; }}
      onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
    >
      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: tag.color ?? 'var(--notes-text-subtle)' }} />
      <span className="flex-1 truncate text-xs">{tag.name}</span>
      {tag._count !== undefined && <span className="text-xs opacity-50">{tag._count.notes}</span>}
      <span role="button" tabIndex={0} onClick={(e) => onDelete(tag.id, e)} onKeyDown={(e) => { if (e.key === 'Enter') onDelete(tag.id, e as unknown as React.MouseEvent); }} className="opacity-0 group-hover:opacity-60 hover:opacity-100! text-xs cursor-pointer" title="Delete tag">✕</span>
    </button>
  );
}
