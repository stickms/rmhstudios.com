'use client';

import { useEffect, useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import Link from 'next/link';

interface EngagementUser {
  id: string;
  name: string | null;
  username: string | null;
  handle: string | null;
  image: string | null;
}

interface EngagementListModalProps {
  open: boolean;
  onClose: () => void;
  postId: string;
  commentId?: string;
  type: 'likes' | 'reposts';
}

export function EngagementListModal({ open, onClose, postId, commentId, type }: EngagementListModalProps) {
  const [users, setUsers] = useState<EngagementUser[]>([]);
  const [loading, setLoading] = useState(false);

  const title = type === 'likes' ? 'Liked by' : 'reRMHark\u2019d by';
  const base = commentId
    ? `/api/rmharks/${postId}/comment/${commentId}`
    : `/api/rmharks/${postId}`;
  const endpoint = `${base}/${type === 'likes' ? 'like' : 'repost'}`;

  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setUsers([]);
    fetch(endpoint)
      .then((res) => res.json())
      .then((data) => setUsers(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [open, endpoint]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onMouseDown={(e) => { e.stopPropagation(); onClose(); }}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      <div
        className="relative z-10 w-full max-w-md bg-site-bg border border-site-border rounded-2xl shadow-xl flex flex-col max-h-[80vh]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-site-border shrink-0">
          <h2 className="font-(family-name:--site-font-display) font-bold text-lg text-site-text">
            {title}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-site-text-muted hover:text-site-text hover:bg-site-surface transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1">
          {users.length === 0 && !loading && (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
              <p className="text-site-text font-medium mb-1">
                No {type === 'likes' ? 'likes' : 'reRMHarks'} yet
              </p>
            </div>
          )}

          {users.map((user) => (
            <Link
              key={user.id}
              href={`/@${user.handle || user.id}`}
              onClick={onClose}
              className="flex items-center gap-3 px-5 py-3 hover:bg-site-surface/50 transition-colors border-b border-site-border/50"
            >
              <div className="w-10 h-10 rounded-full bg-linear-to-tr from-site-accent to-site-accent-hover flex items-center justify-center text-white font-bold text-sm shrink-0">
                {user.image ? (
                  <img
                    src={user.image}
                    alt={user.name || 'User'}
                    className="w-full h-full rounded-full object-cover"
                  />
                ) : (
                  (user.name?.[0] || 'U').toUpperCase()
                )}
              </div>
              <div className="min-w-0">
                <p className="font-bold text-site-text text-sm truncate">
                  {user.name || user.username || 'Unknown'}
                </p>
                {user.handle && (
                  <p className="text-xs text-site-text-dim truncate">@{user.handle}</p>
                )}
              </div>
            </Link>
          ))}

          {loading && (
            <div className="flex justify-center py-6">
              <Loader2 className="w-5 h-5 text-site-accent animate-spin" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
