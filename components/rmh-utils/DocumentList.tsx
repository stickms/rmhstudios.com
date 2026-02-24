'use client';

import { useState, useCallback } from 'react';
import { FileText, Sheet, Presentation, Plus, Star, Trash2, Search, LayoutGrid, List, MoreHorizontal, Clock, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useDocumentStore } from '@/lib/store/useDocumentStore';
import type { DocumentInfo, DocumentType } from '@/lib/rmh-utils/types';

interface Props {
  documents: DocumentInfo[];
  docType: DocumentType;
  onOpen: (doc: DocumentInfo) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
  onFavorite: (id: string, fav: boolean) => void;
  onRename: (id: string, title: string) => void;
  accentColor: string;
  accentHover: string;
}

const typeIcons: Record<DocumentType, typeof FileText> = {
  DOC: FileText,
  SHEET: Sheet,
  SLIDE: Presentation,
};

const typeLabels: Record<DocumentType, string> = {
  DOC: 'Document',
  SHEET: 'Spreadsheet',
  SLIDE: 'Presentation',
};

export default function DocumentList({ documents, docType, onOpen, onCreate, onDelete, onFavorite, onRename, accentColor, accentHover }: Props) {
  const { viewMode, setViewMode, searchQuery, setSearchQuery, sortBy, setSortBy, showFavoritesOnly, setShowFavoritesOnly } = useDocumentStore();
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const Icon = typeIcons[docType];
  const label = typeLabels[docType];

  const filtered = documents
    .filter((d) => {
      if (showFavoritesOnly && !d.isFavorite) return false;
      if (searchQuery && !d.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'title') return a.title.localeCompare(b.title);
      return new Date(b[sortBy]).getTime() - new Date(a[sortBy]).getTime();
    });

  const handleRenameSubmit = useCallback((id: string) => {
    if (renameValue.trim()) onRename(id, renameValue.trim());
    setRenamingId(null);
  }, [renameValue, onRename]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHrs = Math.floor(diffMins / 60);
    if (diffHrs < 24) return `${diffHrs}h ago`;
    const diffDays = Math.floor(diffHrs / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-white/40 hover:text-white/70 transition-colors p-1">
            <ArrowLeft size={18} />
          </Link>
          <h1 className="text-xl font-bold text-white">My {label}s</h1>
          <span className="text-sm text-white/40">{filtered.length}</span>
        </div>
        <button
          onClick={onCreate}
          className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-colors text-white"
          style={{ background: accentColor }}
          onMouseEnter={(e) => (e.currentTarget.style.background = accentHover)}
          onMouseLeave={(e) => (e.currentTarget.style.background = accentColor)}
        >
          <Plus size={16} />
          New {label}
        </button>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-white/5">
        <div className="flex items-center gap-2 flex-1 bg-white/5 rounded-lg px-3 py-2">
          <Search size={14} className="text-white/30" />
          <input
            type="text"
            placeholder={`Search ${label.toLowerCase()}s...`}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-transparent text-sm text-white placeholder-white/30 outline-none flex-1"
          />
        </div>
        <button
          onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
          className={`p-2 rounded-lg transition-colors ${showFavoritesOnly ? 'bg-yellow-500/20 text-yellow-400' : 'text-white/40 hover:text-white/60 hover:bg-white/5'}`}
        >
          <Star size={16} />
        </button>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as 'updatedAt' | 'createdAt' | 'title')}
          className="bg-white/5 text-sm text-white/60 rounded-lg px-2 py-2 border-none outline-none cursor-pointer"
        >
          <option value="updatedAt">Last modified</option>
          <option value="createdAt">Created</option>
          <option value="title">Name</option>
        </select>
        <div className="flex items-center bg-white/5 rounded-lg">
          <button
            onClick={() => setViewMode('grid')}
            className={`p-2 rounded-l-lg transition-colors ${viewMode === 'grid' ? 'bg-white/10 text-white' : 'text-white/40'}`}
          >
            <LayoutGrid size={14} />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`p-2 rounded-r-lg transition-colors ${viewMode === 'list' ? 'bg-white/10 text-white' : 'text-white/40'}`}
          >
            <List size={14} />
          </button>
        </div>
      </div>

      {/* Document Grid/List */}
      <div className="flex-1 overflow-y-auto p-6">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-white/30 gap-4">
            <Icon size={48} strokeWidth={1} />
            <p className="text-lg">{searchQuery ? 'No matching documents' : `No ${label.toLowerCase()}s yet`}</p>
            {!searchQuery && (
              <button
                onClick={onCreate}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors"
                style={{ background: accentColor }}
              >
                <Plus size={14} />
                Create your first {label.toLowerCase()}
              </button>
            )}
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
            {filtered.map((doc) => (
              <div
                key={doc.id}
                className="group relative bg-white/5 hover:bg-white/8 border border-white/10 hover:border-white/20 rounded-xl p-4 cursor-pointer transition-all"
                onClick={() => onOpen(doc)}
              >
                {/* Favorite star */}
                <button
                  onClick={(e) => { e.stopPropagation(); onFavorite(doc.id, !doc.isFavorite); }}
                  className={`absolute top-3 right-3 transition-opacity ${doc.isFavorite ? 'text-yellow-400 opacity-100' : 'text-white/20 opacity-0 group-hover:opacity-100'}`}
                >
                  <Star size={14} fill={doc.isFavorite ? 'currentColor' : 'none'} />
                </button>

                {/* Icon */}
                <div className="w-12 h-12 rounded-lg flex items-center justify-center mb-3" style={{ background: `${accentColor}22` }}>
                  <Icon size={24} style={{ color: accentColor }} />
                </div>

                {/* Title */}
                {renamingId === doc.id ? (
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={() => handleRenameSubmit(doc.id)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleRenameSubmit(doc.id); if (e.key === 'Escape') setRenamingId(null); }}
                    onClick={(e) => e.stopPropagation()}
                    className="bg-white/10 text-white text-sm rounded px-2 py-1 outline-none w-full mb-2"
                  />
                ) : (
                  <h3 className="text-sm font-medium text-white truncate mb-1">{doc.title}</h3>
                )}

                <div className="flex items-center gap-1 text-xs text-white/30">
                  <Clock size={10} />
                  <span>{formatDate(doc.updatedAt)}</span>
                </div>

                {/* Context menu trigger */}
                <button
                  onClick={(e) => { e.stopPropagation(); setMenuOpenId(menuOpenId === doc.id ? null : doc.id); }}
                  className="absolute bottom-3 right-3 text-white/20 opacity-0 group-hover:opacity-100 transition-opacity hover:text-white/50"
                >
                  <MoreHorizontal size={14} />
                </button>

                {/* Context menu */}
                {menuOpenId === doc.id && (
                  <div
                    className="absolute bottom-10 right-3 bg-zinc-900 border border-white/10 rounded-lg py-1 z-50 min-w-[140px] shadow-xl"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      className="w-full text-left px-3 py-1.5 text-sm text-white/70 hover:bg-white/10 transition-colors"
                      onClick={() => { setRenamingId(doc.id); setRenameValue(doc.title); setMenuOpenId(null); }}
                    >
                      Rename
                    </button>
                    <button
                      className="w-full text-left px-3 py-1.5 text-sm text-white/70 hover:bg-white/10 transition-colors"
                      onClick={() => { onFavorite(doc.id, !doc.isFavorite); setMenuOpenId(null); }}
                    >
                      {doc.isFavorite ? 'Unfavorite' : 'Favorite'}
                    </button>
                    <button
                      className="w-full text-left px-3 py-1.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                      onClick={() => { onDelete(doc.id); setMenuOpenId(null); }}
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {filtered.map((doc) => (
              <div
                key={doc.id}
                className="group flex items-center gap-3 px-4 py-3 hover:bg-white/5 rounded-lg cursor-pointer transition-colors"
                onClick={() => onOpen(doc)}
              >
                <Icon size={18} style={{ color: accentColor }} className="shrink-0" />
                {renamingId === doc.id ? (
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={() => handleRenameSubmit(doc.id)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleRenameSubmit(doc.id); if (e.key === 'Escape') setRenamingId(null); }}
                    onClick={(e) => e.stopPropagation()}
                    className="bg-white/10 text-white text-sm rounded px-2 py-1 outline-none flex-1"
                  />
                ) : (
                  <span className="text-sm text-white flex-1 truncate">{doc.title}</span>
                )}
                <span className="text-xs text-white/30 shrink-0">{formatDate(doc.updatedAt)}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); onFavorite(doc.id, !doc.isFavorite); }}
                  className={`shrink-0 transition-opacity ${doc.isFavorite ? 'text-yellow-400' : 'text-white/20 opacity-0 group-hover:opacity-100'}`}
                >
                  <Star size={14} fill={doc.isFavorite ? 'currentColor' : 'none'} />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(doc.id); }}
                  className="shrink-0 text-white/20 opacity-0 group-hover:opacity-100 hover:text-red-400 transition-all"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
