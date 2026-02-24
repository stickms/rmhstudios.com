'use client';

import { useState, useRef, useEffect } from 'react';
import { ArrowLeft, Share2, Star, Users } from 'lucide-react';
import CollaboratorAvatars from './CollaboratorAvatars';
import type { CollabUser } from '@/lib/rmh-utils/useCollaboration';

interface Props {
  title: string;
  isFavorite: boolean;
  connected: boolean;
  collaborators: CollabUser[];
  onBack: () => void;
  onRename: (title: string) => void;
  onToggleFavorite: () => void;
  onShare: () => void;
  accentColor: string;
}

export default function DocumentHeader({ title, isFavorite, connected, collaborators, onBack, onRename, onToggleFavorite, onShare, accentColor }: Props) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setEditValue(title);
  }, [title]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const handleSubmit = () => {
    if (editValue.trim() && editValue.trim() !== title) {
      onRename(editValue.trim());
    } else {
      setEditValue(title);
    }
    setEditing(false);
  };

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 border-b border-white/10 bg-zinc-950/80 backdrop-blur-sm">
      <button onClick={onBack} className="text-white/40 hover:text-white/70 transition-colors p-1">
        <ArrowLeft size={18} />
      </button>

      {editing ? (
        <input
          ref={inputRef}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleSubmit}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); if (e.key === 'Escape') { setEditValue(title); setEditing(false); } }}
          className="bg-white/5 text-white text-sm font-medium rounded px-2 py-1 outline-none border border-white/10 min-w-[200px]"
        />
      ) : (
        <button
          onClick={() => setEditing(true)}
          className="text-sm font-medium text-white hover:text-white/80 transition-colors truncate max-w-[300px]"
        >
          {title}
        </button>
      )}

      <div className="flex-1" />

      <CollaboratorAvatars collaborators={collaborators} connected={connected} />

      <button
        onClick={onToggleFavorite}
        className={`p-1.5 rounded-lg transition-colors ${isFavorite ? 'text-yellow-400' : 'text-white/30 hover:text-white/50'}`}
      >
        <Star size={16} fill={isFavorite ? 'currentColor' : 'none'} />
      </button>

      <button
        onClick={onShare}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-white transition-colors"
        style={{ background: accentColor }}
      >
        <Share2 size={14} />
        Share
      </button>
    </div>
  );
}
