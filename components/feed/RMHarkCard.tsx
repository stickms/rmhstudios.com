'use client';

import type { FeedItem, FeedItemUser } from '@/lib/feed-types';
import { RMHarkActions } from './RMHarkActions';
import { useEffect, useRef, useState, useMemo } from 'react';
import { useNavigate, useRouter } from '@tanstack/react-router';
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
import { SensitiveMedia } from './SensitiveMedia';
import { runLiquidOpen, liquidVTName, postMediaVTName } from '@/lib/view-transition';
import { UserAvatar } from './UserAvatar';
import { Spinner } from '@/components/ui/spinner';
import { useFeedStore } from '@/stores/feedStore';
import { ReactionMenu } from '@/components/shared/ReactionMenu';
import { ReactionChips } from '@/components/shared/ReactionChips';
import { useReactionTrigger } from '@/lib/emoji/use-reaction-trigger';
import { applyReactionToggle } from '@/lib/social/reactions';
import { useResolvedUser, useSession } from '@/components/Providers';
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
  const cardRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const router = useRouter();
  const actualId = item.actualId ?? item.id;
  // Read the viewer from the ONE root-level session subscription (shared
  // context) instead of each card opening its own authClient.useSession().
  const { data: session } = useSession();
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
      return {
        ...cachedUser,
        image: resolvedUser.image,
        name: resolvedUser.name ?? cachedUser.name,
      };
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
      const res = await fetch(
        `/api/rmharks/${actualId}/translate?to=${encodeURIComponent(LOCALE_TO_LANGUAGE_NAME[locale])}`,
        { credentials: 'include' },
      );
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
    if (item.poll || item.gifUrl || (item.imageUrls && item.imageUrls.length > 0) || !item.content)
      return null;
    return extractFirstUrl(item.content);
  }, [item.poll, item.gifUrl, item.imageUrls, item.content]);

  // Track view when the card actually scrolls into (near) the viewport. Skip
  // optimistic (pending) posts — their temp id isn't a real post yet.
  //
  // Previously this fired on mount for every rendered card, so the 20-item first
  // feed page issued 20 `POST /view` requests at once during hydration — all
  // contending for the connection pool and main thread exactly at TTI, and
  // over-counting views for cards below the fold that were never seen. Gating on
  // IntersectionObserver fires only for cards the viewer reaches (a few at first
  // paint), which both frees up TTI and makes the view count accurate.
  useEffect(() => {
    if (item.pending || viewTracked.current) return;
    const el = cardRef.current;
    if (!el) return;

    const track = () => {
      if (viewTracked.current) return;
      viewTracked.current = true;
      fetch(`/api/rmharks/${actualId}/view`, { method: 'POST' }).catch(() => {});
    };

    // Fallback for environments without IntersectionObserver: keep the old
    // fire-on-mount behavior so views are never silently dropped.
    if (typeof IntersectionObserver === 'undefined') {
      track();
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          track();
          io.disconnect();
        }
      },
      // Count a card as viewed just before it fully enters the viewport.
      { rootMargin: '200px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [actualId, item.pending]);

  // §15.2: this card is a div (not a <Link>), so it never got the router's
  // `defaultPreload: 'intent'` warming — the detail loader ran cold on click,
  // stalling the VT freeze into a choppy open. Warm the destination on hover/
  // focus-in so the loader is usually cached before the click and the liquid
  // morph runs inside the §15.2 readiness budget. preloadRoute is deduped by
  // the router's 30s preload stale time, so repeat hovers are free.
  const warmDetail = () => {
    if (item.pending || item.deletedAt) return;
    void router.preloadRoute({ to: postHref(item.user, actualId) }).catch(() => {});
  };

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
    // §5.48: liquidly expand the whole card slab into the detail hero. The card's
    // VT name is set at click time and cleared after (never at rest on a list
    // item); the nested media morph (postMediaVTName, set statically on the first
    // image) rides along. This one path replaces the former image-only
    // runViewTransition trigger — text and media posts now morph uniformly
    // (§12.8: one mechanism). Degrades to plain nav under no-VT / reduced motion.
    runLiquidOpen(cardRef.current, liquidVTName('post', actualId), go);
  };

  return (
    <div
      ref={cardRef}
      {...(item.pending || item.deletedAt ? {} : reactionTrigger)}
      // Floating glass card (§8.3): .glass-fill gives the border/radius/tint;
      // .glass-interactive adds the hover tint-raise, springy press, hover glint
      // ring and pointer light (data-glass-light marks it for useGlassLight).
      // Cards stay L1 — NEVER add .glass-pane/blur to a repeated list item (§9).
      data-glass-light=""
      className={`relative glass-fill rounded-site px-4 py-3 ${
        item.pending
          ? 'opacity-60 pointer-events-none select-none'
          : 'glass-interactive cursor-pointer'
      }`}
      onClick={item.pending ? undefined : handleCardClick}
      onMouseEnter={item.pending ? undefined : warmDetail}
      onFocusCapture={item.pending ? undefined : warmDetail}
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
          <Link to={userProfileHref(freshRepostedBy)} className="hover:underline">
            {freshRepostedBy.name ||
              freshRepostedBy.handle ||
              t('someone', { defaultValue: 'Someone' })}{' '}
            reRMHark&apos;d
          </Link>
        </div>
      )}

      <div className="flex gap-3">
        {item.user ? (
          <ProfileHoverCard userId={item.user.handle || item.user.id}>
            <span className="shrink-0 self-start">
              <UserAvatar user={displayUser} />
            </span>
          </ProfileHoverCard>
        ) : (
          <UserAvatar user={displayUser} />
        )}

        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center gap-1.5 text-sm pr-6">
            {item.user ? (
              <ProfileHoverCard userId={item.user.handle || item.user.id}>
                <Link
                  to={userProfileHref(item.user)}
                  className="flex items-center gap-1.5 min-w-0 hover:underline"
                >
                  <span
                    className="font-bold text-site-text truncate"
                    style={
                      displayUser?.cosmetics?.nameColor?.gradient
                        ? {
                            background: displayUser.cosmetics.nameColor.gradient,
                            WebkitBackgroundClip: 'text',
                            backgroundClip: 'text',
                            color: 'transparent',
                          }
                        : displayUser?.cosmetics?.nameColor?.color
                          ? { color: displayUser.cosmetics.nameColor.color }
                          : undefined
                    }
                  >
                    {displayUser?.name || t('unknown-user', { defaultValue: 'Unknown' })}
                  </span>
                  {displayUser?.cosmetics?.badge?.emoji && (
                    <span className="shrink-0" title="Equipped badge">
                      {displayUser.cosmetics.badge.emoji}
                    </span>
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
                    <span className="text-site-text-dim truncate">@{item.user.handle}</span>
                  )}
                </Link>
              </ProfileHoverCard>
            ) : (
              <span className="font-bold text-site-text truncate">
                {t('unknown-user', { defaultValue: 'Unknown' })}
              </span>
            )}
            {/* Relative time is computed from Date.now(), so the value the server
                renders and the value the client hydrates with can differ by a tick
                (e.g. "5s" → "7s"). suppressHydrationWarning keeps React from
                treating that expected drift as a hydration error (React #418). */}
            <span className="text-site-text-dim shrink-0" suppressHydrationWarning>
              · {timeAgoShort(item.createdAt)}
            </span>
            {item.edited && (
              <span className="text-site-text-dim shrink-0" title="Edited">
                · {t('edited', { defaultValue: 'edited' })}
              </span>
            )}
          </div>

          {/* Locked (paid) post — show paywall instead of content/media */}
          {item.locked ? (
            <PostLockedCard
              postId={actualId}
              price={item.unlockPrice ?? 0}
              onUnlocked={(content) =>
                updateItem(item.id, { content, locked: false, unlockPrice: undefined })
              }
            />
          ) : (
            <>
              {/* Content */}
              {item.content && (
                <RMHarkContent
                  text={item.content}
                  className="text-site-text text-[15px] mt-1 whitespace-pre-wrap break-words"
                />
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

              {/* Image / GIF — hidden behind a content warning when marked sensitive */}
              {(item.gifUrl || (item.imageUrls && item.imageUrls.length > 0)) && (
                <SensitiveMedia sensitive={item.isSensitive} className="mt-2">
                  {item.gifUrl && <GifEmbed url={item.gifUrl} className="mt-1" />}
                  {item.imageUrls && item.imageUrls.length > 0 && (
                    <PostImageGrid
                      urls={item.imageUrls}
                      alts={item.imageAlts}
                      heroName={postMediaVTName(actualId)}
                    />
                  )}
                </SensitiveMedia>
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
                  navigate({
                    to: postHref(freshOriginalUser, item.original.id),
                    resetScroll: false,
                  });
                }
              }}
              onKeyDown={(e) => {
                if ((e.key === 'Enter' || e.key === ' ') && freshOriginalUser && item.original) {
                  e.preventDefault();
                  e.stopPropagation();
                  navigate({
                    to: postHref(freshOriginalUser, item.original.id),
                    resetScroll: false,
                  });
                }
              }}
              className="mt-3 border border-site-border rounded-site p-3 bg-site-surface/30 cursor-pointer transition-colors hover:bg-site-surface/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-site-accent/40"
            >
              <div className="flex items-center gap-1.5 text-sm mb-1">
                {freshOriginalUser ? (
                  <Link
                    to={userProfileHref(freshOriginalUser)}
                    className="flex items-center gap-1.5 min-w-0 hover:underline"
                  >
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
                  <span className="font-bold text-site-text truncate">Unknown</span>
                )}
              </div>
              <RMHarkContent
                text={item.original.content ?? ''}
                className="text-site-text text-sm whitespace-pre-wrap break-words"
              />
              {/* Original's media (server omits these for paid/non-public posts) */}
              {item.original.gifUrl && <GifEmbed url={item.original.gifUrl} className="mt-2" />}
              {!item.original.gifUrl &&
                item.original.imageUrls &&
                item.original.imageUrls.length > 0 && (
                  <PostImageGrid
                    urls={item.original.imageUrls}
                    alts={item.original.imageAlts}
                    className="mt-2"
                  />
                )}
            </div>
          )}

          {!item.deletedAt && !item.pending && (
            <ReactionChips
              reactions={item.reactions ?? []}
              onToggle={toggleReaction}
              className="mt-2"
            />
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
