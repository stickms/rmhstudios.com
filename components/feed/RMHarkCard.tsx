'use client';

import type { FeedItem, FeedItemUser } from '@/lib/feed-types';
import { RMHarkActions } from './RMHarkActions';
import { useEffect, useRef, useState, useMemo } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Repeat2, MoreHorizontal, Heart, Repeat, Trash2, Share2, BadgeCheck, ShieldCheck } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { RMHarkContent, extractFirstUrl } from './RMHarkContent';
import { PollDisplay } from './PollDisplay';
import { GifEmbed } from './GifEmbed';
import { LinkPreview } from './LinkPreview';
import { UserAvatar } from './UserAvatar';
import { useFeedStore } from '@/stores/feedStore';
import { authClient } from '@/lib/auth-client';
import { useResolvedUser } from '@/components/Providers';
import { useFreshUser } from '@/stores/userDisplayStore';
import { EngagementListModal } from './EngagementListModal';
import { ShareModal } from './ShareModal';
import { timeAgoShort } from '@/lib/utils';

interface RMHarkCardProps {
  item: FeedItem;
}

function userProfileHref(user: FeedItemUser | undefined | null): string {
  if (!user) return '/';
  return `/u/${user.handle || user.id}`;
}

function postHref(user: FeedItemUser | undefined | null, postId: string): string {
  if (!user) return '/';
  return `/u/${user.handle || user.id}/post/${postId}`;
}

// UserAvatar imported from shared component

export function RMHarkCard({ item }: RMHarkCardProps) {
  const viewTracked = useRef(false);
  const navigate = useNavigate();
  const actualId = item.actualId ?? item.id;
  const { data: session } = authClient.useSession();
  const { resolved: resolvedUser } = useResolvedUser();
  const { removeItem, updateItem } = useFeedStore();
  const isAuthor = session?.user?.id === item.user?.id;

  // Use freshest user data from cache (covers all users, not just current)
  // Use freshest user data from cache (covers all users, not just current)
  const cachedUser = useFreshUser(item.user);
  const displayUser = useMemo(() => {
    if (!cachedUser) return item.user;
    if (isAuthor && resolvedUser) {
      return { ...cachedUser, image: resolvedUser.image, name: resolvedUser.name ?? cachedUser.name };
    }
    return cachedUser;
  }, [cachedUser, item.user, isAuthor, resolvedUser]);
  const freshRepostedBy = useFreshUser(item.repostedBy);
  const freshOriginalUser = useFreshUser(item.original?.user);
  const [menuOpen, setMenuOpen] = useState(false);
  const [engagementModal, setEngagementModal] = useState<'likes' | 'reposts' | null>(null);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const linkPreviewUrl = useMemo(() => {
    if (item.poll || item.gifUrl || (item.imageUrls && item.imageUrls.length > 0) || !item.content) return null;
    return extractFirstUrl(item.content);
  }, [item.poll, item.gifUrl, item.imageUrls, item.content]);

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
    const selection = window.getSelection();
    if (selection && selection.toString().length > 0) {
      return;
    }
    navigate({ to: postHref(item.user, actualId) });
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
      {freshRepostedBy && (
        <div className="flex items-center gap-1.5 text-xs text-site-text-dim mb-2 ml-12">
          <Repeat2 className="w-3.5 h-3.5" />
          <Link
            to={userProfileHref(freshRepostedBy)}
            className="hover:underline"
          >
            {freshRepostedBy.name || freshRepostedBy.handle || 'Someone'} reRMHark&apos;d
          </Link>
        </div>
      )}

      <div className="flex gap-3">
        <UserAvatar user={displayUser} />

        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center gap-1.5 text-sm pr-6">
            {item.user ? (
              <Link to={userProfileHref(item.user)} className="flex items-center gap-1.5 min-w-0 hover:underline">
              <span className="font-bold text-site-text truncate">
                {displayUser?.name || 'Unknown'}
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
              · {timeAgoShort(item.createdAt)}
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

          {/* Uploaded images grid */}
          {item.imageUrls && item.imageUrls.length > 0 && (
            <div className={`mt-2 grid gap-1 ${item.imageUrls.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
              {item.imageUrls.map((url) => (
                <img
                  key={url}
                  src={url}
                  alt=""
                  loading="lazy"
                  className="w-full rounded-lg object-cover max-h-80"
                />
              ))}
            </div>
          )}

          {/* Link preview — only when no poll, gif, or image */}
          {linkPreviewUrl && <LinkPreview url={linkPreviewUrl} className="mt-3" />}

          {/* Quoted original (if repost) */}
          {item.original && (
            <div className="mt-3 border border-site-border rounded-xl p-3 bg-site-surface/30">
              <div className="flex items-center gap-1.5 text-sm mb-1">
                {freshOriginalUser ? (
                  <Link to={userProfileHref(freshOriginalUser)} className="flex items-center gap-1.5 min-w-0 hover:underline">
                    <span className="font-bold text-site-text truncate">
                      {freshOriginalUser.name || 'Unknown'}
                    </span>
                    {freshOriginalUser.isVerified && (
                      <BadgeCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    )}
                    {freshOriginalUser.isAdmin && (
                      <span title="Admin" className="inline-flex items-center shrink-0">
                        <ShieldCheck className="w-3.5 h-3.5 text-site-accent" />
                      </span>
                    )}
                    {freshOriginalUser.handle && (
                      <span className="text-site-text-dim truncate">
                        @{freshOriginalUser.handle}
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
