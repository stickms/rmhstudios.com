'use client';

import type { FeedItem, FeedItemUser } from '@/lib/feed-types';
import { RMHarkActions } from './RMHarkActions';
import { useEffect, useRef, useState, useMemo } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Repeat2, MoreHorizontal, Heart, Repeat, Trash2, Share2, BadgeCheck, ShieldCheck, Flag, Ban, VolumeX, Bookmark, Coins, Pin, Pencil, Languages, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import { ReportDialog } from '@/components/moderation/ReportDialog';
import { TipDialog } from '@/components/economy/TipDialog';
import { EditPostModal } from './EditPostModal';
import { PostLockedCard } from './PostLockedCard';
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
import { InsightsModal } from './InsightsModal';
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
  const [reportOpen, setReportOpen] = useState(false);
  const [tipOpen, setTipOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [insightsOpen, setInsightsOpen] = useState(false);
  const [pinned, setPinned] = useState(!!item.pinned);
  const [bookmarked, setBookmarked] = useState(!!item.bookmarked);
  const [translatedText, setTranslatedText] = useState<string | null>(null);
  const [showTranslated, setShowTranslated] = useState(false);
  const [translating, setTranslating] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const browserLang = () => {
    const map: Record<string, string> = {
      en: 'English', es: 'Spanish', fr: 'French', de: 'German', pt: 'Portuguese', it: 'Italian',
      nl: 'Dutch', ja: 'Japanese', ko: 'Korean', zh: 'Chinese', ru: 'Russian', ar: 'Arabic',
      hi: 'Hindi', tr: 'Turkish', pl: 'Polish',
    };
    if (typeof navigator === 'undefined') return 'English';
    return map[(navigator.language || 'en').slice(0, 2).toLowerCase()] ?? 'English';
  };

  const handleTranslate = async () => {
    setMenuOpen(false);
    if (translatedText) {
      setShowTranslated((s) => !s);
      return;
    }
    setTranslating(true);
    try {
      const res = await fetch(`/api/rmharks/${actualId}/translate?to=${encodeURIComponent(browserLang())}`, { credentials: 'include' });
      if (!res.ok) {
        toast.error('Could not translate this post.');
        return;
      }
      const data = await res.json();
      if (data.text) {
        setTranslatedText(data.text);
        setShowTranslated(true);
      }
    } finally {
      setTranslating(false);
    }
  };

  const handlePin = async () => {
    setMenuOpen(false);
    try {
      const res = await fetch(`/api/rmharks/${actualId}/pin`, { method: 'POST', credentials: 'include' });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setPinned(!!data.pinned);
        toast.success(data.pinned ? 'Pinned to your profile' : 'Unpinned');
      } else {
        toast.error(data.error || 'Could not pin post');
      }
    } catch {
      toast.error('Could not pin post');
    }
  };

  const handleBookmark = async () => {
    setMenuOpen(false);
    const next = !bookmarked;
    setBookmarked(next); // optimistic
    try {
      const res = await fetch(`/api/rmharks/${actualId}/bookmark`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setBookmarked(!!data.bookmarked);
        toast.success(data.bookmarked ? 'Saved to bookmarks' : 'Removed from bookmarks');
      } else {
        setBookmarked(!next);
        if (res.status === 401) toast.error('Please sign in to bookmark posts.');
      }
    } catch {
      setBookmarked(!next);
    }
  };

  const targetUserId = item.user?.id;
  const handleBlock = async () => {
    setMenuOpen(false);
    if (!targetUserId) return;
    try {
      const res = await fetch('/api/moderation/block', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ targetUserId }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(data.blocked ? 'User blocked' : 'User unblocked');
        if (data.blocked) removeItem(item.id);
      } else {
        toast.error(data.error || 'Could not block user');
      }
    } catch {
      toast.error('Could not block user');
    }
  };
  const handleMute = async () => {
    setMenuOpen(false);
    if (!targetUserId) return;
    try {
      const res = await fetch('/api/moderation/mute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ targetUserId }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(data.muted ? 'User muted' : 'User unmuted');
        if (data.muted) removeItem(item.id);
      } else {
        toast.error(data.error || 'Could not mute user');
      }
    } catch {
      toast.error('Could not mute user');
    }
  };

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
        <div className={`absolute top-3 right-3 ${menuOpen ? 'z-40' : 'z-10'}`} ref={menuRef}>
          <button
            onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}
            className="p-1 rounded-full text-site-text-dim hover:text-site-text hover:bg-site-surface transition-colors"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 w-44 bg-site-bg border border-site-border rounded-xl shadow-xl py-1 z-30" onClick={(e) => e.stopPropagation()}>
              {session && (
                <button
                  onClick={handleBookmark}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-site-text hover:bg-site-surface transition-colors"
                >
                  <Bookmark className={`w-4 h-4 ${bookmarked ? 'fill-site-accent text-site-accent' : 'text-site-text-dim'}`} />
                  {bookmarked ? 'Saved' : 'Bookmark'}
                </button>
              )}
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
              {item.content && !item.deletedAt && item.content.length > 8 && (
                <button
                  onClick={handleTranslate}
                  disabled={translating}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-site-text hover:bg-site-surface transition-colors disabled:opacity-60"
                >
                  <Languages className="w-4 h-4 text-site-text-dim" />
                  {translating ? 'Translating…' : translatedText ? (showTranslated ? 'Show original' : 'Show translation') : 'Translate'}
                </button>
              )}
              {isAuthor && (
                <>
                  <button
                    onClick={() => { setMenuOpen(false); setInsightsOpen(true); }}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-site-text hover:bg-site-surface transition-colors"
                  >
                    <TrendingUp className="w-4 h-4 text-site-text-dim" />
                    View insights
                  </button>
                  <button
                    onClick={() => { setMenuOpen(false); setEditOpen(true); }}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-site-text hover:bg-site-surface transition-colors"
                  >
                    <Pencil className="w-4 h-4 text-site-text-dim" />
                    Edit
                  </button>
                  <button
                    onClick={handlePin}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-site-text hover:bg-site-surface transition-colors"
                  >
                    <Pin className={`w-4 h-4 ${pinned ? 'fill-site-accent text-site-accent' : 'text-site-text-dim'}`} />
                    {pinned ? 'Unpin from profile' : 'Pin to profile'}
                  </button>
                  <button
                    onClick={handleDelete}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-site-danger hover:bg-site-danger/10 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete
                  </button>
                </>
              )}
              {!isAuthor && session && (
                <>
                  {targetUserId && (
                    <button
                      onClick={() => { setMenuOpen(false); setTipOpen(true); }}
                      className="flex items-center gap-2 w-full px-3 py-2 text-sm text-site-text hover:bg-site-surface transition-colors"
                    >
                      <Coins className="w-4 h-4 text-amber-400" />
                      Send tip
                    </button>
                  )}
                  <button
                    onClick={() => { setMenuOpen(false); setReportOpen(true); }}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-site-text hover:bg-site-surface transition-colors"
                  >
                    <Flag className="w-4 h-4 text-site-text-dim" />
                    Report
                  </button>
                  <button
                    onClick={handleMute}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-site-text hover:bg-site-surface transition-colors"
                  >
                    <VolumeX className="w-4 h-4 text-site-text-dim" />
                    Mute
                  </button>
                  <button
                    onClick={handleBlock}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-site-danger hover:bg-site-danger/10 transition-colors"
                  >
                    <Ban className="w-4 h-4" />
                    Block
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Pinned label */}
      {pinned && (
        <div className="flex items-center gap-1.5 text-xs text-site-text-dim mb-2 ml-12">
          <Pin className="w-3.5 h-3.5 fill-site-accent text-site-accent" />
          <span>Pinned</span>
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
              <span
                className="font-bold text-site-text truncate"
                style={
                  displayUser?.cosmetics?.nameColor?.gradient
                    ? { background: displayUser.cosmetics.nameColor.gradient, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }
                    : displayUser?.cosmetics?.nameColor?.color
                    ? { color: displayUser.cosmetics.nameColor.color }
                    : undefined
                }
              >
                {displayUser?.name || 'Unknown'}
              </span>
              {displayUser?.cosmetics?.badge?.emoji && (
                <span className="shrink-0" title="Equipped badge">{displayUser.cosmetics.badge.emoji}</span>
              )}
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
            {item.edited && (
              <span className="text-site-text-dim shrink-0" title="Edited">· edited</span>
            )}
          </div>

          {/* Locked (paid) post — show paywall instead of content/media */}
          {item.locked ? (
            <PostLockedCard
              postId={actualId}
              price={item.unlockPrice ?? 0}
              onUnlocked={(content) => updateItem(item.id, { content, locked: false, unlockPrice: undefined })}
            />
          ) : (
          <>
          {/* Content */}
          {item.content && (
            <RMHarkContent text={item.content} className="text-site-text text-[15px] mt-1 whitespace-pre-wrap break-words" />
          )}
          {/* AI translation (toggled from the ⋯ menu) */}
          {showTranslated && translatedText && (
            <p className="mt-1 whitespace-pre-wrap break-words rounded-lg bg-site-surface/50 p-2 text-[15px] text-site-text">
              {translatedText}
            </p>
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
          </>
          )}

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
        embedId={actualId}
        text={`Check out what ${item.user?.name || item.user?.handle || 'someone'} RMHark'd on RMH Studios!`}
      />

      <ReportDialog
        open={reportOpen}
        onOpenChange={setReportOpen}
        entityType="rmhark"
        entityId={actualId}
      />

      {targetUserId && (
        <TipDialog
          open={tipOpen}
          onOpenChange={setTipOpen}
          recipientId={targetUserId}
          recipientName={item.user?.name ?? item.user?.handle}
          entityType="rmhark"
          entityId={actualId}
        />
      )}

      {isAuthor && (
        <EditPostModal
          open={editOpen}
          onOpenChange={setEditOpen}
          postId={actualId}
          initialContent={item.content ?? ''}
          onSaved={(content) => updateItem(item.id, { content, edited: true })}
        />
      )}

      {isAuthor && insightsOpen && (
        <InsightsModal open={insightsOpen} onClose={() => setInsightsOpen(false)} postId={actualId} />
      )}
    </div>
  );
}
