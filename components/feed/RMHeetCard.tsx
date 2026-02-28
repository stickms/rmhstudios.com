'use client';

import type { FeedItem } from '@/lib/feed-types';
import { RMHeetActions } from './RMHeetActions';
import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Repeat2 } from 'lucide-react';
import Link from 'next/link';

interface RMHeetCardProps {
  item: FeedItem;
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const seconds = Math.floor((now - then) / 1000);

  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo`;
  return `${Math.floor(months / 12)}y`;
}

function UserAvatar({ user }: { user: FeedItem['user'] }) {
  if (!user) return null;
  const avatar = (
    <div className="w-10 h-10 rounded-full bg-linear-to-tr from-site-accent to-site-accent-hover flex items-center justify-center text-white font-bold text-sm shrink-0">
      {user.image ? (
        <img src={user.image} alt={user.name || 'User'} className="w-full h-full rounded-full object-cover" />
      ) : (
        (user.name?.[0] || 'U').toUpperCase()
      )}
    </div>
  );
  return <Link href={`/profile/${user.id}`}>{avatar}</Link>;
}

export function RMHeetCard({ item }: RMHeetCardProps) {
  const viewTracked = useRef(false);
  const router = useRouter();
  const actualId = item.actualId ?? item.id;

  // Track view when card becomes visible
  useEffect(() => {
    if (viewTracked.current) return;
    viewTracked.current = true;
    fetch(`/api/rmheets/${actualId}/view`, { method: 'POST' }).catch(() => {});
  }, [actualId]);

  const handleCardClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('a') || target.closest('button') || target.closest('[role="button"]')) {
      return;
    }
    router.push(`/${item.user?.id}/post/${actualId}`);
  };

  return (
    <div
      className="px-4 py-3 border-b border-site-border hover:bg-site-surface/30 transition-colors cursor-pointer"
      onClick={handleCardClick}
    >
      {/* ReRMH'd label */}
      {item.repostedBy && (
        <div className="flex items-center gap-1.5 text-xs text-site-text-dim mb-2 ml-12">
          <Repeat2 className="w-3.5 h-3.5" />
          <Link
            href={`/profile/${item.repostedBy.id}`}
            className="hover:underline"
          >
            {item.repostedBy.name || item.repostedBy.username || 'Someone'} ReRMH&apos;d
          </Link>
        </div>
      )}

      <div className="flex gap-3">
        <UserAvatar user={item.user} />

        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center gap-1.5 text-sm">
            {item.user ? (
              <Link href={`/profile/${item.user.id}`} className="flex items-center gap-1.5 min-w-0 hover:underline">
                <span className="font-bold text-site-text truncate">
                  {item.user.name || 'Unknown'}
                </span>
                {item.user.username && (
                  <span className="text-site-text-dim truncate">
                    @{item.user.username}
                  </span>
                )}
              </Link>
            ) : (
              <span className="font-bold text-site-text truncate">
                Unknown
              </span>
            )}
            <span className="text-site-text-dim shrink-0">
              · {timeAgo(item.createdAt)}
            </span>
          </div>

          {/* Content */}
          <p className="text-site-text text-[15px] mt-1 whitespace-pre-wrap break-words">
            {item.content}
          </p>

          {/* Quoted original (if repost) */}
          {item.original && (
            <div className="mt-3 border border-site-border rounded-xl p-3 bg-site-surface/30">
              <div className="flex items-center gap-1.5 text-sm mb-1">
                {item.original.user ? (
                  <Link href={`/profile/${item.original.user.id}`} className="flex items-center gap-1.5 min-w-0 hover:underline">
                    <span className="font-bold text-site-text truncate">
                      {item.original.user.name || 'Unknown'}
                    </span>
                    {item.original.user.username && (
                      <span className="text-site-text-dim truncate">
                        @{item.original.user.username}
                      </span>
                    )}
                  </Link>
                ) : (
                  <span className="font-bold text-site-text truncate">
                    Unknown
                  </span>
                )}
              </div>
              <p className="text-site-text text-sm whitespace-pre-wrap break-words">
                {item.original.content}
              </p>
            </div>
          )}

          {/* Actions */}
          <RMHeetActions item={item} />
        </div>
      </div>
    </div>
  );
}
