'use client';

import { useState, useCallback } from 'react';
import { X, UserPlus, Trash2, Crown, Edit3, Eye } from 'lucide-react';
import type { CollaboratorInfo, CollaboratorRole } from '@/lib/rmh-utils/types';

interface Props {
  open: boolean;
  onClose: () => void;
  documentId: string;
  collaborators: CollaboratorInfo[];
  ownerName: string;
  onAdd: (username: string, role: CollaboratorRole) => Promise<boolean>;
  onRemove: (userId: string) => Promise<void>;
  accentColor: string;
}

export default function ShareDialog({ open, onClose, documentId, collaborators, ownerName, onAdd, onRemove, accentColor }: Props) {
  const [username, setUsername] = useState('');
  const [role, setRole] = useState<CollaboratorRole>('EDITOR');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleAdd = useCallback(async () => {
    if (!username.trim()) return;
    setLoading(true);
    setError('');
    const ok = await onAdd(username.trim(), role);
    if (!ok) setError('User not found or could not be added');
    else setUsername('');
    setLoading(false);
  }, [username, role, onAdd]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-9999 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-zinc-900 border border-white/10 rounded-2xl w-full max-w-md shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <h2 className="text-lg font-semibold text-white">Share Document</h2>
          <button onClick={onClose} className="text-white/40 hover:text-white/70 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Add collaborator */}
          <div className="flex gap-2">
            <input
              placeholder="Enter username..."
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-white/20"
            />
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as CollaboratorRole)}
              className="bg-white/5 border border-white/10 rounded-lg px-2 py-2 text-sm text-white/70 outline-none"
            >
              <option value="EDITOR">Editor</option>
              <option value="VIEWER">Viewer</option>
            </select>
            <button
              onClick={handleAdd}
              disabled={loading || !username.trim()}
              className="px-3 py-2 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-40"
              style={{ background: accentColor }}
            >
              <UserPlus size={16} />
            </button>
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}

          {/* Collaborator list */}
          <div className="space-y-2">
            {/* Owner */}
            <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/5">
              <div className="w-8 h-8 rounded-full bg-yellow-500/20 flex items-center justify-center">
                <Crown size={14} className="text-yellow-400" />
              </div>
              <span className="text-sm text-white flex-1">{ownerName} <span className="text-white/30">(owner)</span></span>
            </div>

            {collaborators.map((c) => (
              <div key={c.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/5">
                <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                  {c.role === 'EDITOR' ? <Edit3 size={14} className="text-blue-400" /> : <Eye size={14} className="text-white/40" />}
                </div>
                <span className="text-sm text-white flex-1">
                  {c.user.name || 'User'}
                  <span className="text-white/30 ml-1">({c.role.toLowerCase()})</span>
                </span>
                <button
                  onClick={() => onRemove(c.userId)}
                  className="text-white/20 hover:text-red-400 transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}

            {collaborators.length === 0 && (
              <p className="text-sm text-white/30 text-center py-2">No collaborators yet</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
