'use client';

import type { FeedItem, FeedItemUser } from '@/lib/feed-types';
import { RMHarkActions } from './RMHarkActions';
import { useEffect, useRef, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Repeat2, MoreHorizontal, Heart, Repeat, Trash2, Share2, BadgeCheck, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { RMHarkContent, extractFirstUrl } from './RMHarkContent';
import { PollDisplay } from './PollDisplay';
import { GifEmbed } from './GifEmbed';
import { LinkPreview } from './LinkPreview';
import { useFeedStore } from '@/stores/feedStore';
import { authClient } from '@/lib/auth-client';
import { EngagementListModal } from './EngagementListModal';
import { ShareModal } from './ShareModal';

interface RMHarkCardProps {
  item: FeedItem;
}

function userProfileHref(user: FeedItemUser | undefined | null): string {
  if (!user) return '/';
  return `/@${user.handle || user.id}`;
}

function postHref(user: FeedItemUser | undefined | null, postId: string): string {
  if (!user) return '/';
  return `/@${user.handle || user.id}/post/${postId}`;
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
  return <Link href={userProfileHref(user)}>{avatar}</Link>;
}

export function RMHarkCard({ item }: RMHarkCardProps) {
  const viewTracked = useRef(false);
  const router = useRouter();
  const actualId = item.actualId ?? item.id;
  const { data: session } = authClient.useSession();
  const { removeItem, updateItem } = useFeedStore();
  const isAuthor = session?.user?.id === item.user?.id;
  const [menuOpen, setMenuOpen] = useState(false);
  const [engagementModal, setEngagementModal] = useState<'likes' | 'reposts' | null>(null);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const linkPreviewUrl = useMemo(() => {
    if (item.poll || item.gifUrl || !item.content) return null;
    return extractFirstUrl(item.content);
  }, [item.poll, item.gifUrl, item.content]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

  const shareUrl = typeof window !== 'undefined' ? `${window.location.origin}${postHref(item.user, actualId)}` : '';

  const handleShare = () => {
    setMenuOpen(false);
    const userName = item.user?.name || item.user?.handle || 'someone';
    const shareText = `Check out what ${userName} RMHark'd on RMH Studios!`;
    if (navigator.share) {
      navigator.share({ title: 'RMH', text: shareText, url: shareUrl }).catch(() => {});
    } else {
      setShareModalOpen(true);
    }
  };

  const handleDelete = async () => {
    setMenuOpen(false);
    if (!confirm('Delete this RMHark?')) return;
    removeItem(item.id);
    try {
      await fetch(`/api/rmharks/${actualId}`, { method: 'DELETE' });
    } catch {
      // Item already removed from UI
    }
  };

  // Track view when card becomes visible
  useEffect(() => {
    if (viewTracked.current) return;
    viewTracked.current = true;
    fetch(`/api/rmharks/${actualId}/view`, { method: 'POST' }).catch(() => {});
  }, [actualId]);

  const handleCardClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('a') || target.closest('button') || target.closest('[role="button"]')) {
      return;
    }
    router.push(postHref(item.user, actualId));
  };

  return (
    <div
      className="relative px-4 py-3 border-b border-site-border hover:bg-site-surface/30 transition-colors cursor-pointer"
      onClick={handleCardClick}
    >
      {/* More menu — top right of card */}
      {!item.deletedAt && (
        <div className="absolute top-3 right-3 z-10" ref={menuRef}>
          <button
            onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}
            className="p-1 rounded-full text-site-text-dim hover:text-site-text hover:bg-site-surface transition-colors"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 w-44 bg-site-bg border border-site-border rounded-xl shadow-xl py-1 z-30" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => { setMenuOpen(false); setEngagementModal('likes'); }}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-site-text hover:bg-site-surface transition-colors"
              >
                <Heart className="w-4 h-4 text-site-text-dim" />
                Liked by
              </button>
              <button
                onClick={() => { setMenuOpen(false); setEngagementModal('reposts'); }}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-site-text hover:bg-site-surface transition-colors"
              >
                <Repeat className="w-4 h-4 text-site-text-dim" />
                reRMHark'd by
              </button>
              <button
                onClick={handleShare}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-site-text hover:bg-site-surface transition-colors"
              >
                <Share2 className="w-4 h-4 text-site-text-dim" />
                Share
              </button>
              {isAuthor && (
                <button
                  onClick={handleDelete}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-site-danger hover:bg-site-danger/10 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* reRMHark'd label */}
      {item.repostedBy && (
        <div className="flex items-center gap-1.5 text-xs text-site-text-dim mb-2 ml-12">
          <Repeat2 className="w-3.5 h-3.5" />
          <Link
            href={userProfileHref(item.repostedBy)}
            className="hover:underline"
          >
            {item.repostedBy.name || item.repostedBy.handle || 'Someone'} reRMHark&apos;d
          </Link>
        </div>
      )}

      <div className="flex gap-3">
        <UserAvatar user={item.user} />

        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center gap-1.5 text-sm pr-6">
            {item.user ? (
              <Link href={userProfileHref(item.user)} className="flex items-center gap-1.5 min-w-0 hover:underline">
              <span className="font-bold text-site-text truncate">
                {item.user.name || 'Unknown'}
              </span>
              {item.user.isVerified && (
                <BadgeCheck className="w-4 h-4 text-emerald-500 shrink-0" />
              )}
              {item.user.isAdmin && (
                <span title="Admin" className="inline-flex items-center shrink-0">
                  <ShieldCheck className="w-4 h-4 text-site-accent" />
                </span>
              )}
              {item.user.handle && (
                <span className="text-site-text-dim truncate">
                  @{item.user.handle}
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
          {item.content && (
            <RMHarkContent text={item.content} className="text-site-text text-[15px] mt-1 whitespace-pre-wrap break-words" />
          )}

          {/* Poll */}
          {item.poll && (
            <PollDisplay
              poll={item.poll}
              postId={item.actualId ?? item.id}
              onUpdate={(updatedPoll) => updateItem(item.id, { poll: updatedPoll })}
            />
          )}

          {/* Image / GIF */}
          {item.gifUrl && <GifEmbed url={item.gifUrl} className="mt-3" />}

          {/* Link preview — only when no poll, gif, or image */}
          {linkPreviewUrl && <LinkPreview url={linkPreviewUrl} className="mt-3" />}

          {/* Quoted original (if repost) */}
          {item.original && (
            <div className="mt-3 border border-site-border rounded-xl p-3 bg-site-surface/30">
              <div className="flex items-center gap-1.5 text-sm mb-1">
                {item.original.user ? (
                  <Link href={userProfileHref(item.original.user)} className="flex items-center gap-1.5 min-w-0 hover:underline">
                    <span className="font-bold text-site-text truncate">
                      {item.original.user.name || 'Unknown'}
                    </span>
                    {item.original.user.isVerified && (
                      <BadgeCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    )}
                    {item.original.user.isAdmin && (
                      <span title="Admin" className="inline-flex items-center shrink-0">
                        <ShieldCheck className="w-3.5 h-3.5 text-site-accent" />
                      </span>
                    )}
                    {item.original.user.handle && (
                      <span className="text-site-text-dim truncate">
                        @{item.original.user.handle}
                      </span>
                    )}
                  </Link>
                ) : (
                  <span className="font-bold text-site-text truncate">
                    Unknown
                  </span>
                )}
              </div>
              <RMHarkContent text={item.original.content ?? ''} className="text-site-text text-sm whitespace-pre-wrap break-words" />
            </div>
          )}

          {/* Actions */}
          {!item.deletedAt && <RMHarkActions item={item} />}
        </div>
      </div>

      {engagementModal && (
        <EngagementListModal
          open={engagementModal !== null}
          onClose={() => setEngagementModal(null)}
          postId={actualId}
          type={engagementModal}
        />
      )}

      <ShareModal
        open={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
        url={shareUrl}
        text={`Check out what ${item.user?.name || item.user?.handle || 'someone'} RMHark'd on RMH Studios!`}
      />
    </div>
  );
}
