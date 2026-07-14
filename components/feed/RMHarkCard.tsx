'use client';

import type { FeedItem, FeedItemUser } from '@/lib/feed-types';
import { RMHarkActions } from './RMHarkActions';
import { useEffect, useRef, useState, useMemo } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Repeat2, BadgeCheck, ShieldCheck, Pin } from 'lucide-react';
import { toast } from 'sonner';
import { RMHarkOverflowMenu } from './RMHarkOverflowMenu';
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
import { useFeedStore } from '@/stores/feedStore';
import { ReactionMenu } from '@/components/shared/ReactionMenu';
import { ReactionChips } from '@/components/shared/ReactionChips';
import { useReactionTrigger } from '@/lib/emoji/use-reaction-trigger';
import { applyReactionToggle } from '@/lib/social/reactions';
import { authClient } from '@/lib/auth-client';
import { useResolvedUser } from '@/components/Providers';
import { useFreshUser } from '@/stores/userDisplayStore';
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
  const [translatedText, setTranslatedText] = useState<string | null>(null);
  const [showTranslated, setShowTranslated] = useState(false);
  const [translating, setTranslating] = useState(false);
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

  const linkPreviewUrl = useMemo(() => {
    if (item.poll || item.gifUrl || (item.imageUrls && item.imageUrls.length > 0) || !item.content) return null;
    return extractFirstUrl(item.content);
  }, [item.poll, item.gifUrl, item.imageUrls, item.content]);

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
      className={`relative px-4 py-3 border-b border-site-border transition-colors duration-200 ${
        item.pending
          ? 'opacity-60 pointer-events-none select-none'
          : 'hover:bg-site-surface/30 hover:border-site-border-bright cursor-pointer'
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

      {/* More menu — top right of card (shared with the post page) */}
      {!item.deletedAt && !item.pending && (
        <div className="absolute top-3 right-3 z-10">
          <RMHarkOverflowMenu
            item={item}
            isAuthor={isAuthor}
            onUpdate={(updates) => updateItem(item.id, updates)}
            onRemove={() => removeItem(item.id)}
            iconClassName="w-4 h-4"
            translate={{
              translating,
              hasTranslation: translatedText !== null,
              showing: showTranslated,
              onToggle: handleTranslate,
            }}
          />
        </div>
      )}

      {/* Pinned label */}
      {item.pinned && (
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

          {/* Authored thread: this post is the root of a multi-post thread. */}
          {item.threadReplyCount ? (
            <Link
              to="/thread/$rootId"
              params={{ rootId: item.id }}
              onClick={(e) => e.stopPropagation()}
              className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-site-accent hover:underline"
            >
              {t('show-thread', { defaultValue: 'Show this thread' })}
              <span className="text-site-text-dim">
                · {t('thread-more', { defaultValue: '{{n}} more', n: item.threadReplyCount })}
              </span>
            </Link>
          ) : null}

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
