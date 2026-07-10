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
import { ProfileHoverCard } from './ProfileHoverCard';
import { PollDisplay } from './PollDisplay';
import { GifEmbed } from './GifEmbed';
import { LinkPreview } from './LinkPreview';
import { PostImageGrid } from './PostImageGrid';
import { runViewTransition, postMediaVTName } from '@/lib/view-transition';
import { UserAvatar } from './UserAvatar';
import { Spinner } from '@/components/ui/spinner';
import { useOptimisticAction } from '@/hooks/useOptimisticAction';
import { useFeedStore } from '@/stores/feedStore';
import { ReactionMenu } from '@/components/shared/ReactionMenu';
import { ReactionChips } from '@/components/shared/ReactionChips';
import { useReactionTrigger } from '@/lib/emoji/use-reaction-trigger';
import { applyReactionToggle } from '@/lib/social/reactions';
import { authClient } from '@/lib/auth-client';
import { useResolvedUser } from '@/components/Providers';
import { useFreshUser } from '@/stores/userDisplayStore';
import { EngagementListModal } from './EngagementListModal';
import { InsightsModal } from './InsightsModal';
import { ShareModal } from './ShareModal';
import { timeAgoShort } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import { useLocaleStore } from '@/stores/localeStore';
import { LOCALE_TO_LANGUAGE_NAME } from '@/lib/i18n/config';

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
  const { t } = useTranslation('feed');
  const locale = useLocaleStore((s) => s.locale);
  const viewTracked = useRef(false);
  const navigate = useNavigate();
  const actualId = item.actualId ?? item.id;
  const { data: session } = authClient.useSession();
  const { resolved: resolvedUser } = useResolvedUser();
  // Select actions individually (stable references) instead of subscribing to
  // the whole store, so an unrelated store change doesn't re-render this card.
  const removeItem = useFeedStore((s) => s.removeItem);
  const updateItem = useFeedStore((s) => s.updateItem);
  const { run: runBookmark } = useOptimisticAction();
  const { run: runPin } = useOptimisticAction();
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
  const [reactionMenu, setReactionMenu] = useState<{ x: number; y: number } | null>(null);
  const reactionTrigger = useReactionTrigger((x, y) => setReactionMenu({ x, y }));

  const toggleReaction = async (emoji: string) => {
    const prev = item.reactions;
    updateItem(item.id, { reactions: applyReactionToggle(item.reactions ?? [], emoji) });
    try {
      const res = await fetch(`/api/rmharks/${actualId}/react`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emoji }),
      });
      if (!res.ok) throw new Error('react failed');
    } catch {
      updateItem(item.id, { reactions: prev });
    }
  };

  // When the site language changes, drop any cached translation so the next
  // "Translate" click re-translates into the newly selected language.
  useEffect(() => {
    setTranslatedText(null);
    setShowTranslated(false);
  }, [locale]);

  const handleTranslate = async () => {
    setMenuOpen(false);
    if (translatedText) {
      setShowTranslated((s) => !s);
      return;
    }
    setTranslating(true);
    try {
      const res = await fetch(`/api/rmharks/${actualId}/translate?to=${encodeURIComponent(LOCALE_TO_LANGUAGE_NAME[locale])}`, { credentials: 'include' });
      if (!res.ok) {
        toast.error(t('translate-error', { defaultValue: 'Could not translate this post.' }));
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

  const handlePin = () => {
    setMenuOpen(false);
    const next = !pinned;
    runPin({
      apply: () => setPinned(next),
      rollback: () => setPinned(!next),
      commit: () =>
        fetch(`/api/rmharks/${actualId}/pin`, { method: 'POST', credentials: 'include' }),
      reconcile: async (res) => {
        const data = await res.json().catch(() => ({}));
        setPinned(!!data.pinned);
        toast.success(
          data.pinned
            ? t('pinned-success', { defaultValue: 'Pinned to your profile' })
            : t('unpinned-success', { defaultValue: 'Unpinned' })
        );
      },
      onError: (_err, res) => {
        // A bad status may carry a specific message; a thrown error won't.
        if (res) {
          res
            .json()
            .catch(() => ({}))
            .then((data: { error?: string }) =>
              toast.error(data.error || t('pin-error', { defaultValue: 'Could not pin post' }))
            );
        } else {
          toast.error(t('pin-error', { defaultValue: 'Could not pin post' }));
        }
      },
    });
  };

  const handleBookmark = () => {
    setMenuOpen(false);
    const next = !bookmarked;
    runBookmark({
      apply: () => setBookmarked(next),
      rollback: () => setBookmarked(!next),
      commit: () =>
        fetch(`/api/rmharks/${actualId}/bookmark`, { method: 'POST', credentials: 'include' }),
      reconcile: async (res) => {
        const data = await res.json().catch(() => ({}));
        setBookmarked(!!data.bookmarked);
        toast.success(
          data.bookmarked
            ? t('bookmark-saved', { defaultValue: 'Saved to bookmarks' })
            : t('bookmark-removed', { defaultValue: 'Removed from bookmarks' })
        );
      },
      onError: (_err, res) => {
        if (res?.status === 401)
          toast.error(t('bookmark-sign-in', { defaultValue: 'Please sign in to bookmark posts.' }));
      },
    });
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
        toast.success(data.blocked ? t('user-blocked', { defaultValue: 'User blocked' }) : t('user-unblocked', { defaultValue: 'User unblocked' }));
        if (data.blocked) removeItem(item.id);
      } else {
        toast.error(data.error || t('block-error', { defaultValue: 'Could not block user' }));
      }
    } catch {
      toast.error(t('block-error', { defaultValue: 'Could not block user' }));
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
        toast.success(data.muted ? t('user-muted', { defaultValue: 'User muted' }) : t('user-unmuted', { defaultValue: 'User unmuted' }));
        if (data.muted) removeItem(item.id);
      } else {
        toast.error(data.error || t('mute-error', { defaultValue: 'Could not mute user' }));
      }
    } catch {
      toast.error(t('mute-error', { defaultValue: 'Could not mute user' }));
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
    if (!confirm(t('delete-confirm', { defaultValue: 'Delete this RMHark?' }))) return;
    removeItem(item.id);
    try {
      await fetch(`/api/rmharks/${actualId}`, { method: 'DELETE' });
    } catch {
      // Item already removed from UI
    }
  };

  // Track view when card becomes visible. Skip optimistic (pending) posts —
  // their temp id isn't a real post yet.
  useEffect(() => {
    if (item.pending || viewTracked.current) return;
    viewTracked.current = true;
    fetch(`/api/rmharks/${actualId}/view`, { method: 'POST' }).catch(() => {});
  }, [actualId, item.pending]);

  const handleCardClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('a') || target.closest('button') || target.closest('[role="button"]')) {
      return;
    }
    const selection = window.getSelection();
    if (selection && selection.toString().length > 0) {
      return;
    }
    // `resetScroll: false` defers the scroll reset to the destination's commit
    // (useScrollRestoration handles it) so the feed doesn't visibly scroll up
    // during the transition; going back then restores the exact feed position.
    const go = () => navigate({ to: postHref(item.user, actualId), resetScroll: false });
    // Only run a View Transition when there's a hero image to morph into the
    // detail page; text-only posts keep the normal per-page enter animation.
    // Degrades to a plain navigation when unsupported or reduced-motion is on.
    if (item.imageUrls && item.imageUrls.length > 0) runViewTransition(go);
    else go();
  };

  return (
    <div
      {...(item.pending || item.deletedAt ? {} : reactionTrigger)}
      className={`relative px-4 py-3 border-b border-site-border transition-colors ${
        item.pending
          ? 'opacity-60 pointer-events-none select-none'
          : 'hover:bg-site-surface/30 cursor-pointer'
      }`}
      onClick={item.pending ? undefined : handleCardClick}
      aria-busy={item.pending || undefined}
    >
      {/* Optimistic post — awaiting the server round-trip. */}
      {item.pending && (
        <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5 text-xs text-site-text-dim">
          <Spinner size={12} />
          {t('posting', { defaultValue: 'Posting…' })}
        </div>
      )}

      {/* More menu — top right of card */}
      {!item.deletedAt && !item.pending && (
        <div className={`absolute top-3 right-3 ${menuOpen ? 'z-40' : 'z-10'}`} ref={menuRef}>
          <button
            onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}
            className="p-1 rounded-full text-site-text-dim hover:text-site-text hover:bg-site-surface transition-colors"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 w-44 bg-site-bg border border-site-border rounded-site shadow-xl py-1 z-30" onClick={(e) => e.stopPropagation()}>
              {session && (
                <button
                  onClick={handleBookmark}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-site-text hover:bg-site-surface transition-colors"
                >
                  <Bookmark className={`w-4 h-4 ${bookmarked ? 'fill-site-accent text-site-accent' : 'text-site-text-dim'}`} />
                  {bookmarked ? t('bookmark-saved-label', { defaultValue: 'Saved' }) : t('bookmark-label', { defaultValue: 'Bookmark' })}
                </button>
              )}
              <button
                onClick={() => { setMenuOpen(false); setEngagementModal('likes'); }}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-site-text hover:bg-site-surface transition-colors"
              >
                <Heart className="w-4 h-4 text-site-text-dim" />
                {t('liked-by', { defaultValue: 'Liked by' })}
              </button>
              <button
                onClick={() => { setMenuOpen(false); setEngagementModal('reposts'); }}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-site-text hover:bg-site-surface transition-colors"
              >
                <Repeat className="w-4 h-4 text-site-text-dim" />
                {t('rermharkd-by', { defaultValue: "reRMHark'd by" })}
              </button>
              <button
                onClick={handleShare}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-site-text hover:bg-site-surface transition-colors"
              >
                <Share2 className="w-4 h-4 text-site-text-dim" />
                {t('share', { defaultValue: 'Share' })}
              </button>
              {item.content && !item.deletedAt && item.content.length > 8 && (
                <button
                  onClick={handleTranslate}
                  disabled={translating}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-site-text hover:bg-site-surface transition-colors disabled:opacity-60"
                >
                  <Languages className="w-4 h-4 text-site-text-dim" />
                  {translating ? t('translating', { defaultValue: 'Translating…' }) : translatedText ? (showTranslated ? t('show-original', { defaultValue: 'Show original' }) : t('show-translation', { defaultValue: 'Show translation' })) : t('translate', { defaultValue: 'Translate' })}
                </button>
              )}
              {isAuthor && (
                <>
                  <button
                    onClick={() => { setMenuOpen(false); setInsightsOpen(true); }}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-site-text hover:bg-site-surface transition-colors"
                  >
                    <TrendingUp className="w-4 h-4 text-site-text-dim" />
                    {t('view-insights', { defaultValue: 'View insights' })}
                  </button>
                  <button
                    onClick={() => { setMenuOpen(false); setEditOpen(true); }}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-site-text hover:bg-site-surface transition-colors"
                  >
                    <Pencil className="w-4 h-4 text-site-text-dim" />
                    {t('edit', { defaultValue: 'Edit' })}
                  </button>
                  <button
                    onClick={handlePin}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-site-text hover:bg-site-surface transition-colors"
                  >
                    <Pin className={`w-4 h-4 ${pinned ? 'fill-site-accent text-site-accent' : 'text-site-text-dim'}`} />
                    {pinned ? t('unpin-from-profile', { defaultValue: 'Unpin from profile' }) : t('pin-to-profile', { defaultValue: 'Pin to profile' })}
                  </button>
                  <button
                    onClick={handleDelete}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-site-danger hover:bg-site-danger/10 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    {t('delete', { defaultValue: 'Delete' })}
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
                      <Coins className="w-4 h-4 text-site-warning" />
                      {t('send-tip', { defaultValue: 'Send tip' })}
                    </button>
                  )}
                  <button
                    onClick={() => { setMenuOpen(false); setReportOpen(true); }}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-site-text hover:bg-site-surface transition-colors"
                  >
                    <Flag className="w-4 h-4 text-site-text-dim" />
                    {t('report', { defaultValue: 'Report' })}
                  </button>
                  <button
                    onClick={handleMute}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-site-text hover:bg-site-surface transition-colors"
                  >
                    <VolumeX className="w-4 h-4 text-site-text-dim" />
                    {t('mute', { defaultValue: 'Mute' })}
                  </button>
                  <button
                    onClick={handleBlock}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-site-danger hover:bg-site-danger/10 transition-colors"
                  >
                    <Ban className="w-4 h-4" />
                    {t('block', { defaultValue: 'Block' })}
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
          <span>{t('pinned', { defaultValue: 'Pinned' })}</span>
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
            {freshRepostedBy.name || freshRepostedBy.handle || t('someone', { defaultValue: 'Someone' })} reRMHark&apos;d
          </Link>
        </div>
      )}

      <div className="flex gap-3">
        {item.user ? (
          <ProfileHoverCard userId={item.user.handle || item.user.id}>
            <span className="shrink-0 self-start"><UserAvatar user={displayUser} /></span>
          </ProfileHoverCard>
        ) : (
          <UserAvatar user={displayUser} />
        )}

        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center gap-1.5 text-sm pr-6">
            {item.user ? (
              <ProfileHoverCard userId={item.user.handle || item.user.id}>
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
                {displayUser?.name || t('unknown-user', { defaultValue: 'Unknown' })}
              </span>
              {displayUser?.cosmetics?.badge?.emoji && (
                <span className="shrink-0" title="Equipped badge">{displayUser.cosmetics.badge.emoji}</span>
              )}
              {item.user.isVerified && (
                <BadgeCheck className="w-4 h-4 text-site-success shrink-0" />
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
              </ProfileHoverCard>
            ) : (
              <span className="font-bold text-site-text truncate">
                {t('unknown-user', { defaultValue: 'Unknown' })}
              </span>
            )}
            <span className="text-site-text-dim shrink-0">
              · {timeAgoShort(item.createdAt)}
            </span>
            {item.edited && (
              <span className="text-site-text-dim shrink-0" title="Edited">· {t('edited', { defaultValue: 'edited' })}</span>
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
            <p className="mt-1 whitespace-pre-wrap break-words rounded-site-sm bg-site-surface/50 p-2 text-[15px] text-site-text">
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
            <PostImageGrid urls={item.imageUrls} className="mt-2" heroName={postMediaVTName(actualId)} />
          )}

          {/* Link preview — only when no poll, gif, or image */}
          {linkPreviewUrl && <LinkPreview url={linkPreviewUrl} className="mt-3" />}
          </>
          )}

          {/* Quoted original (if repost) — clicks through to the original post */}
          {item.original && (
            <div
              role="link"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                if (window.getSelection()?.toString()) return;
                if ((e.target as HTMLElement).closest('a, button')) return;
                if (freshOriginalUser && item.original) {
                  navigate({ to: postHref(freshOriginalUser, item.original.id), resetScroll: false });
                }
              }}
              onKeyDown={(e) => {
                if ((e.key === 'Enter' || e.key === ' ') && freshOriginalUser && item.original) {
                  e.preventDefault();
                  e.stopPropagation();
                  navigate({ to: postHref(freshOriginalUser, item.original.id), resetScroll: false });
                }
              }}
              className="mt-3 border border-site-border rounded-site p-3 bg-site-surface/30 cursor-pointer transition-colors hover:bg-site-surface/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-site-accent/40"
            >
              <div className="flex items-center gap-1.5 text-sm mb-1">
                {freshOriginalUser ? (
                  <Link to={userProfileHref(freshOriginalUser)} className="flex items-center gap-1.5 min-w-0 hover:underline">
                    <span className="font-bold text-site-text truncate">
                      {freshOriginalUser.name || t('unknown-user', { defaultValue: 'Unknown' })}
                    </span>
                    {freshOriginalUser.isVerified && (
                      <BadgeCheck className="w-3.5 h-3.5 text-site-success shrink-0" />
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
              {/* Original's media (server omits these for paid/non-public posts) */}
              {item.original.gifUrl && <GifEmbed url={item.original.gifUrl} className="mt-2" />}
              {!item.original.gifUrl && item.original.imageUrls && item.original.imageUrls.length > 0 && (
                <PostImageGrid urls={item.original.imageUrls} className="mt-2" />
              )}
            </div>
          )}

          {!item.deletedAt && !item.pending && (
            <ReactionChips reactions={item.reactions ?? []} onToggle={toggleReaction} className="mt-2" />
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
          initialGifUrl={item.gifUrl ?? ''}
          onSaved={(content, gifUrl) => updateItem(item.id, { content, gifUrl: gifUrl ?? undefined, edited: true })}
        />
      )}

      {isAuthor && insightsOpen && (
        <InsightsModal open={insightsOpen} onClose={() => setInsightsOpen(false)} postId={actualId} />
      )}

      {reactionMenu && (
        <ReactionMenu
          x={reactionMenu.x}
          y={reactionMenu.y}
          onSelect={toggleReaction}
          onClose={() => setReactionMenu(null)}
        />
      )}
    </div>
  );
}
