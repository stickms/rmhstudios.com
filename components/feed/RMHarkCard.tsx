import type { FeedItem, FeedItemUser } from '@/lib/feed-types';
import { RMHarkActions } from './RMHarkActions';
import { useEffect, useRef, useState, useMemo } from 'react';
import { useNavigate, useRouter } from '@tanstack/react-router';
import { BadgeCheck, ShieldCheck } from 'lucide-react';
import { AutomatedBadge } from './AutomatedBadge';
import { toast } from '@/lib/toast';
import { RMHarkOverflowMenu } from './RMHarkOverflowMenu';
import { PostLockedCard } from './PostLockedCard';
import { Link } from '@tanstack/react-router';
import { RMHarkContent, extractFirstUrl } from './RMHarkContent';
import { ProfileHoverCard } from './ProfileHoverCard';
import { PollDisplay } from './PollDisplay';
import { TakeMeterLazy } from './TakeMeterLazy';
import { ContextNotesLazy } from '@/components/context-notes/ContextNotesLazy';
import { RunnableEmbed } from '@/components/code-embed/RunnableEmbed';
import { PostPlusBadges } from '@/components/posts-plus/PostPlusBadges';
import { GifEmbed } from './GifEmbed';
import { LinkPreview } from './LinkPreview';
import { PostImageGrid } from './PostImageGrid';
import { SensitiveMedia } from './SensitiveMedia';
import { postMediaVTName } from '@/lib/view-transition';
import { UserAvatar } from './UserAvatar';
import { SpineItem } from '@/components/ui/spine';
import { Spinner } from '@/components/ui/spinner';
import { useFeedStore } from '@/stores/feedStore';
import { ReactionMenu } from '@/components/shared/ReactionMenu';
import { ReactionChips } from '@/components/shared/ReactionChips';
import { useReactionTrigger } from '@/lib/emoji/use-reaction-trigger';
import { applyReactionToggle } from '@/lib/social/reactions';
import { useResolvedUser, useSession } from '@/components/Providers';
import { useFreshUser } from '@/stores/userDisplayStore';
import { relativeTimeShort } from '@/lib/utils';
import { RelativeTime } from '@/components/ui/RelativeTime';
import { EditHistoryButton } from './EditHistory';
import { FlairChip } from '@/components/communities/FlairChip';
import { useTranslation } from 'react-i18next';
import { useLocaleStore } from '@/stores/localeStore';
import { LOCALE_TO_LANGUAGE_NAME } from '@/lib/i18n/config';
import { prefetchPostDetail } from '@/lib/feed/post-detail-prefetch';
import { reactToPostApi, viewPostApi } from '@/lib/feed/rmhark-actions.contract';
import { AI_TIMEOUT_MS, api } from '@/lib/contract/client';
import { translatePostApi } from '@/lib/ai/ai.contract';

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
      await api(reactToPostApi, { params: { id: actualId }, body: { emoji } });
    } catch {
      updateItem(item.id, { reactions: prev });
    }
  };

  // When the site language changes, drop any cached translation so the next
  //"Translate"click re-translates into the newly selected language.
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
      const data = await api(translatePostApi, {
        params: { id: actualId },
        query: { to: LOCALE_TO_LANGUAGE_NAME[locale] },
        timeoutMs: AI_TIMEOUT_MS,
      });
      if (data.text) {
        setTranslatedText(data.text);
        setShowTranslated(true);
      }
    } catch {
      toast.error(t('translate-error', { defaultValue: 'Could not translate this post.' }));
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
  // feed page issued 20 `POST /view`requests at once during hydration — all
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
      api(viewPostApi, { params: { id: actualId } }).catch(() => {});
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
  // `defaultPreload:'intent'`warming — the detail loader ran cold on click,
  // stalling the VT freeze into a choppy open. Warm the destination on hover/
  // focus-in so the loader is usually cached before the click and the liquid
  // morph runs inside the §15.2 readiness budget. preloadRoute is deduped by
  // the router's 30s preload stale time, so repeat hovers are free.
  const warmDetail = () => {
    if (item.pending || item.deletedAt) return;
    void router.preloadRoute({ to: postHref(item.user, actualId) }).catch(() => {});
  };
  // A press on the card's body is the open itself starting (~100ms before the
  // click, and a finger's only intent signal — it has no hover). It warms the
  // route like a hover does AND starts the post's own body and comments fetches,
  // which the detail page otherwise only began after mounting
  // (lib/feed/post-detail-prefetch). Hover and focus don't start those: a like
  // can come between a hover and the open, never between a press and its click.
  // A press on a link or button inside the card is that control's, exactly as
  // in `handleCardClick`.
  const warmDetailOnPress = (e: React.PointerEvent) => {
    if (item.pending || item.deletedAt) return;
    const target = e.target as HTMLElement;
    if (target.closest('a, button, [role="button"]')) return;
    warmDetail();
    prefetchPostDetail(actualId);
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
    // `resetScroll: false` defers the scroll reset to the destination's commit (useScrollRestoration handles it) so the
    // feed doesn't visibly scroll up; going back then restores the exact feed position. No transition (M8): a route
    // change swaps content, and the speed comes from the preload above.
    navigate({ to: postHref(item.user, actualId), resetScroll: false });
  };

  // Keyboard equivalent of the card click. Every `<Link>` inside a card points at
  // a PROFILE — the post itself was reachable only by mouse, so a keyboard user
  // could not open a thread from the feed at all. Same `role="link"` + Enter/Space
  // contract the quoted-original block below already uses.
  const openable = !item.pending && !item.deletedAt;
  const handleCardKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    // Let a focused link/button inside the card handle its own activation.
    if ((e.target as HTMLElement).closest('a, button, [role="button"]')) return;
    e.preventDefault();
    navigate({ to: postHref(item.user, actualId), resetScroll: false });
  };

  return (
    // A post is one spine item (Steel section 10): a dot, no card, a rule under it (S1, S2, R3). The whole row opens the
    // thread; controls inside it keep their own clicks.
    <SpineItem
      as="article"
      ref={cardRef}
      {...(item.pending || item.deletedAt ? {} : reactionTrigger)}
      role={openable ? 'link' : undefined}
      tabIndex={openable ? 0 : undefined}
      className={item.pending ? 'pointer-events-none opacity-60 select-none' : 'cursor-pointer'}
      onClick={item.pending ? undefined : handleCardClick}
      onKeyDown={openable ? handleCardKeyDown : undefined}
      onMouseEnter={item.pending ? undefined : warmDetail}
      onFocusCapture={item.pending ? undefined : warmDetail}
      onPointerDown={item.pending ? undefined : warmDetailOnPress}
      aria-busy={item.pending || undefined}
    >
      {/* Pinned and reposted-by labels: plain `t-meta` lines above the author. */}
      {item.pinned && <p className="t-meta mb-2">{t('pinned', { defaultValue: 'Pinned' })}</p>}
      {freshRepostedBy && (
        <p className="t-meta mb-2">
          <Link to={userProfileHref(freshRepostedBy)} className="hover:underline">
            {t('reposted-by-label', {
              name:
                freshRepostedBy.name ||
                freshRepostedBy.handle ||
                t('someone', { defaultValue: 'Someone' }),
              defaultValue: '{{name}} reposted',
            })}
          </Link>
        </p>
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

        <div className="min-w-0 flex-1">
          {/* Header: name, handle and time on one line; the three dots at the inline end. */}
          <div className="t-body flex items-center gap-2">
            {item.user ? (
              <ProfileHoverCard userId={item.user.handle || item.user.id}>
                <Link
                  to={userProfileHref(item.user)}
                  className="flex min-w-0 items-center gap-1.5 hover:underline"
                >
                  <span
                    className="truncate font-semibold text-site-text"
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
                    <>
                      <BadgeCheck className="size-3.5 shrink-0" aria-hidden />
                      <span className="sr-only">{t('verified', { defaultValue: 'Verified' })}</span>
                    </>
                  )}
                  {item.user.isBot && <AutomatedBadge />}
                  {item.user.isAdmin && (
                    <>
                      <ShieldCheck className="size-3.5 shrink-0" aria-hidden />
                      <span className="sr-only">{t('admin-title', { defaultValue: 'Admin' })}</span>
                    </>
                  )}
                  {item.user.handle && <span className="t-meta truncate">@{item.user.handle}</span>}
                </Link>
              </ProfileHoverCard>
            ) : (
              <span className="truncate font-semibold text-site-text">
                {t('unknown-user', { defaultValue: 'Unknown' })}
              </span>
            )}
            <span className="t-meta shrink-0">
              <RelativeTime date={item.createdAt} format={relativeTimeShort} />
            </span>
            {item.edited && <EditHistoryButton postId={actualId} />}
            {/* An optimistic post: awaiting the server round-trip. */}
            {item.pending && (
              <span className="t-meta ms-auto flex shrink-0 items-center gap-2">
                <Spinner size={12} />
                {t('posting', { defaultValue: 'Posting…' })}
              </span>
            )}
            {!item.deletedAt && !item.pending && (
              <RMHarkOverflowMenu
                className="ms-auto shrink-0"
                item={item}
                isAuthor={isAuthor}
                onUpdate={(updates) => updateItem(item.id, updates)}
                onRemove={() => removeItem(item.id)}
                translate={{
                  translating,
                  hasTranslation: translatedText !== null,
                  showing: showTranslated,
                  onToggle: handleTranslate,
                }}
              />
            )}
          </div>

          {/* Locked (paid) post: the paywall instead of content and media */}
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
              {item.communityFlair && <FlairChip flair={item.communityFlair} className="mt-2" />}
              {/* Content */}
              {item.content && (
                <RMHarkContent
                  text={item.content}
                  className="t-post mt-1 break-words whitespace-pre-wrap text-site-text"
                />
              )}
              {/* AI translation (toggled from the menu): set off by a rule, not a box */}
              {showTranslated && translatedText && (
                <p className="t-body mt-2 border-s-2 border-site-border ps-3 break-words whitespace-pre-wrap">
                  {translatedText}
                </p>
              )}

              {/* Authored thread: this post is the root of a multi-post thread. */}
              {item.threadReplyCount ? (
                <Link
                  to="/thread/$rootId"
                  params={{ rootId: item.id }}
                  onClick={(e) => e.stopPropagation()}
                  className="t-body mt-2 inline-flex items-center gap-1 font-semibold underline"
                >
                  {t('show-thread', { defaultValue: 'Show this thread' })}
                  <span className="font-normal text-site-text-muted">
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

              {/* Take meter (X6): only on posts the author marked as a take */}
              {item.isTake && !item.locked && !item.pending && (
                <TakeMeterLazy postId={item.actualId ?? item.id} />
              )}

              {/* Runnable snippet (F14): click-to-run, never auto-runs in the feed */}
              {item.hasEmbed && !item.locked && !item.pending && (
                <RunnableEmbed postId={item.actualId ?? item.id} />
              )}

              {/* Context note (X3): loads lazily, only for posts with a visible note */}
              {item.hasNote && !item.locked && !item.pending && (
                <ContextNotesLazy postId={item.actualId ?? item.id} hasNote />
              )}

              {/* Series part (X5) and auto-delete (X8) badges: nothing for ordinary posts */}
              {!item.locked && !item.pending && (
                <PostPlusBadges
                  postId={item.actualId ?? item.id}
                  seriesId={item.seriesId}
                  expiresAt={item.expiresAt}
                />
              )}

              {/* Image / GIF: hidden behind a content warning when marked sensitive */}
              {(item.gifUrl || (item.imageUrls && item.imageUrls.length > 0)) && (
                <SensitiveMedia sensitive={item.isSensitive} className="mt-3">
                  {item.gifUrl && <GifEmbed url={item.gifUrl} />}
                  {item.imageUrls && item.imageUrls.length > 0 && (
                    <PostImageGrid
                      urls={item.imageUrls}
                      alts={item.imageAlts}
                      heroName={postMediaVTName(actualId)}
                    />
                  )}
                </SensitiveMedia>
              )}

              {/* Link preview: only when no poll, gif, or image */}
              {linkPreviewUrl && <LinkPreview url={linkPreviewUrl} className="mt-3" />}
            </>
          )}

          {/* Quoted original (if repost): set off by a rule, and clicks through to the original post */}
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
              className="mt-3 cursor-pointer border-s-2 border-site-border ps-3"
            >
              <div className="t-body mb-1 flex items-center gap-2">
                {freshOriginalUser ? (
                  <Link
                    to={userProfileHref(freshOriginalUser)}
                    className="flex min-w-0 items-center gap-1.5 hover:underline"
                  >
                    <span className="truncate font-semibold text-site-text">
                      {freshOriginalUser.name || t('unknown-user', { defaultValue: 'Unknown' })}
                    </span>
                    {freshOriginalUser.isVerified && (
                      <>
                        <BadgeCheck className="size-3.5 shrink-0" aria-hidden />
                        <span className="sr-only">
                          {t('verified', { defaultValue: 'Verified' })}
                        </span>
                      </>
                    )}
                    {freshOriginalUser.isAdmin && (
                      <>
                        <ShieldCheck className="size-3.5 shrink-0" aria-hidden />
                        <span className="sr-only">
                          {t('admin-title', { defaultValue: 'Admin' })}
                        </span>
                      </>
                    )}
                    {freshOriginalUser.handle && (
                      <span className="t-meta truncate">@{freshOriginalUser.handle}</span>
                    )}
                  </Link>
                ) : (
                  <span className="truncate font-semibold text-site-text">
                    {t('unknown-user', { defaultValue: 'Unknown' })}
                  </span>
                )}
              </div>
              <RMHarkContent
                text={item.original.content ?? ''}
                className="t-body break-words whitespace-pre-wrap text-site-text"
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

          {/* Actions (K8) */}
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
    </SpineItem>
  );
}
