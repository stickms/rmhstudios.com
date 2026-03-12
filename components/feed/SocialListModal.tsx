'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { X, Loader2 } from 'lucide-react';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { Link } from '@tanstack/react-router';
import { authClient } from '@/lib/auth-client';

interface SocialUser {
  id: string;
  name: string | null;
  username: string | null;
  handle: string | null;
  image: string | null;
  isFollowing: boolean;
  isOwnProfile: boolean;
}

interface SocialListModalProps {
  open: boolean;
  onClose: () => void;
  userId: string;
  type: 'followers' | 'following';
}

export function SocialListModal({ open, onClose, userId, type }: SocialListModalProps) {
  const [users, setUsers] = useState<SocialUser[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [followingInProgress, setFollowingInProgress] = useState<Set<string>>(new Set());
  const sentinelRef = useRef<HTMLDivElement>(null);
  const initialFetched = useRef(false);
  const fetchingRef = useRef(false);
  const { data: session } = authClient.useSession();

  const title = type === 'followers' ? 'Followers' : 'Following';
  const endpoint = `/api/profile/${encodeURIComponent(userId)}/${type}`;

  // Prevent body scroll while open
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  // Reset when type/userId changes or modal opens
  useEffect(() => {
    if (open) {
      setUsers([]);
      setCursor(null);
      setHasMore(true);
      initialFetched.current = false;
      fetchingRef.current = false;
    }
  }, [open, userId, type]);

  const fetchPage = useCallback(async (currentCursor: string | null) => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '20' });
      if (currentCursor) params.set('cursor', currentCursor);
      const res = await fetch(`${endpoint}?${params}`);
      if (!res.ok) return;
      const data = await res.json();
      setUsers((prev) => [...prev, ...data.users]);
      setCursor(data.nextCursor);
      setHasMore(data.hasMore);
    } catch (error) {
      console.error('Fetch social list error:', error);
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  }, [endpoint]);

  // Initial fetch
  useEffect(() => {
    if (open && !initialFetched.current && !loading) {
      initialFetched.current = true;
      fetchPage(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Infinite scroll
  const observerCallback = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      if (entries[0].isIntersecting && hasMore && !loading) {
        fetchPage(cursor);
      }
    },
    [hasMore, loading, fetchPage, cursor]
  );

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !open) return;
    const observer = new IntersectionObserver(observerCallback, { rootMargin: '200px' });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [observerCallback, open]);

  const handleFollowToggle = async (targetUser: SocialUser) => {
    if (!session || followingInProgress.has(targetUser.id)) return;

    setFollowingInProgress((prev) => new Set(prev).add(targetUser.id));
    const wasFollowing = targetUser.isFollowing;

    setUsers((prev) =>
      prev.map((u) =>
        u.id === targetUser.id ? { ...u, isFollowing: !wasFollowing } : u
      )
    );

    try {
      const res = await fetch(`/api/profile/${encodeURIComponent(targetUser.id)}/follow`, {
        method: 'POST',
      });
      if (!res.ok) {
        // Revert
        setUsers((prev) =>
          prev.map((u) =>
            u.id === targetUser.id ? { ...u, isFollowing: wasFollowing } : u
          )
        );
      }
    } catch {
      setUsers((prev) =>
        prev.map((u) =>
          u.id === targetUser.id ? { ...u, isFollowing: wasFollowing } : u
        )
      );
    } finally {
      setFollowingInProgress((prev) => {
        const next = new Set(prev);
        next.delete(targetUser.id);
        return next;
      });
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal panel */}
      <div
        className="relative z-10 w-full max-w-md bg-site-bg border border-site-border rounded-2xl shadow-xl flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
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

        {/* List */}
        <div className="overflow-y-auto flex-1">
          {users.length === 0 && !loading && (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
              <p className="text-site-text font-medium mb-1">No {title.toLowerCase()} yet</p>
              <p className="text-sm text-site-text-muted">
                {type === 'followers'
                  ? 'Nobody is following this user yet.'
                  : 'This user isn\'t following anyone yet.'}
              </p>
            </div>
          )}

          {users.map((user) => (
            <div
              key={user.id}
              className="flex items-center gap-3 px-5 py-3 hover:bg-site-surface/50 transition-colors border-b border-site-border/50"
            >
              <Link
                to={`/@${user.handle || user.id}` as string}
                onClick={onClose}
                className="flex items-center gap-3 flex-1 min-w-0"
              >
                <UserAvatar src={user.image ?? undefined} alt={user.name || 'User'} size={40} fallbackName={user.name ?? undefined} />
                <div className="min-w-0">
                  <p className="font-bold text-site-text text-sm truncate">
                    {user.name || user.username || 'Unknown'}
                  </p>
                  {user.handle && (
                    <p className="text-xs text-site-text-dim truncate">@{user.handle}</p>
                  )}
                </div>
              </Link>

              {session && !user.isOwnProfile && (
                <button
                  onClick={() => handleFollowToggle(user)}
                  disabled={followingInProgress.has(user.id)}
                  className={`shrink-0 px-4 py-1.5 rounded-full text-xs font-bold transition-colors ${
                    user.isFollowing
                      ? 'border border-site-border text-site-text hover:border-site-danger hover:text-site-danger hover:bg-site-danger/10'
                      : 'bg-site-accent text-white hover:bg-site-accent-hover'
                  }`}
                >
                  {user.isFollowing ? 'Following' : 'Follow'}
                </button>
              )}
            </div>
          ))}

          {loading && (
            <div className="flex justify-center py-6">
              <Loader2 className="w-5 h-5 text-site-accent animate-spin" />
            </div>
          )}

          <div ref={sentinelRef} className="h-1" />
        </div>
      </div>
    </div>
  );
}
