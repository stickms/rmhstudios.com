import { Suspense, lazy, memo, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from '@tanstack/react-router';
import { BadgeCheck } from 'lucide-react';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { RelativeTime } from '@/components/ui/RelativeTime';
import { SpineItem } from '@/components/ui/spine';
import { BadgeMark } from '@/components/shop/art/BadgeMark';
import { RMHarkActions } from '@/components/feed/RMHarkActions';
import { PostMenuTrigger } from '@/components/feed/PostMenuTrigger';
import { AutomatedBadge } from '@/components/feed/AutomatedBadge';
import { FeedMedia } from '@/components/feed/FeedMedia';
import { TakeMeterLazy } from '@/components/feed/TakeMeterLazy';
import { PostPlusBadges } from '@/components/posts-plus/PostPlusBadgesLazy';
import { cn, relativeTimeShort } from '@/lib/utils';
import type { FeedItem } from '@/lib/feed-types';
import { useLocaleStore } from '@/stores/localeStore';
import { ARRIVE, ArrivalSuspense } from '@/components/ui/arrive';
import { CoveredLine } from '@/components/feed/CoveredLine';
import { useAppliedContentWarning } from '@/components/feed/use-show-content-warnings';
import { feedKickerLabel } from '@/components/feed/kicker-labels';
import { usePostAction } from '@/components/feed/feed-nav';
import { postLinkPreviewUrl, textWithoutPreviewedLink } from '@/lib/feed/first-link';

/** The post menu's rows and dialogs: fetched the first time a row's three dots are used, never with the feed. */
const loadFeedRowMenu = () => import('@/components/feed/FeedRowMenu');
// The link card loads with the first row that has a link, not with the feed.
const LinkPreview = lazy(() =>
  import('@/components/feed/LinkPreview').then((m) => ({ default: m.LinkPreview })),
);
const FeedRowMenu = lazy(loadFeedRowMenu);

/** "GAME_ANNOUNCEMENT" → "Game announcement": the last-resort label when a feed category has no translation. */
function humanizeKicker(raw: string): string {
  const words = raw.replace(/[_-]+/g, ' ').trim().toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function hrefFor(item: FeedItem): string {
  if (item.href) return item.href;
  if (item.type === 'rmhark' && item.user) {
    return `/u/${item.user.handle || item.user.id}/post/${item.actualId || item.id}`;
  }
  return '/';
}

/**
 * A `FeedItem` as one item on the home spine (Steel section 10, Home): a dot, the author line in `t-meta`, the text in
 * `t-post`, the picture, and the K8 action words. No box (S1, R3): the row is separated from the next by the spine's rule.
 *
 * A post is the author, text and media inside ONE link to the thread, with the action row beside it, never inside it
 * (an anchor cannot hold buttons). The three dots at the top end open the post's menu (owner, 2026-11-13): the same
 * menu the post card and the post page have, in a chunk of its own (`FeedRowMenu`) so the feed does not pay for it. A platform announcement (a game, an app, an article, a study) is the same kind of
 * row with less in it: its kind in `t-meta`, the title, one line, and a text link.
 *
 * **This is deliberately not `components/feed/RMHarkCard`.** They render the same `FeedItem`, but the card owns a heavier
 * interactive post (reactions, view tracking, the profile hover card) for the pages that show one post at full size; the home
 * feed keeps this compact row and shares the action words with it. What they must not do is disagree about the same
 * post: the shared pieces are shared for real (`relativeTimeShort`, `RelativeTime`, `UserAvatar`, `RMHarkActions`).
 */
export const FeedRow = memo(function FeedRow({ item }: { item: FeedItem }) {
  const { t } = useTranslation('feed');
  const contentRef = useRef<HTMLParagraphElement | null>(null);
  const [clamped, setClamped] = useState(false);
  const isRmhark = item.type === 'rmhark';
  const warning = useAppliedContentWarning({
    isSensitive: item.isSensitive,
    contentWarning: item.contentWarning,
    userId: item.user?.id,
  });
  const covered = isRmhark && warning.coverText;
  // The first link of a post with no media of its own unfurls under it (lib/feed/first-link.ts).
  const linkPreviewUrl = isRmhark && !covered && !item.locked ? postLinkPreviewUrl(item) : null;
  // The card carries a lone trailing link, so the row's text drops it; a card that cannot load puts it back.
  const [previewFailed, setPreviewFailed] = useState(false);
  const bodyText = previewFailed
    ? (item.content ?? '')
    : textWithoutPreviewedLink(item.content ?? '', linkPreviewUrl && !item.pending ? linkPreviewUrl : null);
  const rawKicker = item.category || item.type;
  const kicker = feedKickerLabel(t, rawKicker) ?? humanizeKicker(rawKicker);
  const href = hrefFor(item);
  const external = href.startsWith('http');
  // An optimistic post has a temporary id: there is nothing to open and nothing to like until the server answers.
  const pending = Boolean(item.pending);
  // `o` and Enter on the focused row (feed-nav.tsx): the row's one link.
  const navigate = useNavigate();
  const openRow = () => {
    if (external) window.open(href, '_blank', 'noopener,noreferrer');
    else navigate({ to: href } as never);
  };
  usePostAction(item.id, 'open', openRow, !pending);
  const menuAnchor = useRef<HTMLButtonElement | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuMounted, setMenuMounted] = useState(false);
  const locale = useLocaleStore((s) => s.locale);
  const [made, setTranslation] = useState<{ text: string; locale: string } | null>(null);
  // A translation is into the site's language: after a change of language it is no longer shown.
  const translation = made && made.locale === locale ? made.text : null;
  const hasMenu = isRmhark && !pending && !item.deletedAt;

  // The body hard-clamps at five lines, so a long post would end mid-word with nothing to say more existed. Measured
  // once the text is laid out, so short posts get no cue. It is a span, not a link: the body is already one.
  useEffect(() => {
    const el = contentRef.current;
    if (el) setClamped(el.scrollHeight - el.clientHeight > 1);
  }, [item.content]);

  const displayName =
    item.user?.name || item.user?.handle || t('someone', { defaultValue: 'Someone' });
  // The author's bought cosmetics: a name colour, a badge after the name, post flair as the edge on the spine.
  const cosmetics = item.user?.cosmetics;
  const nameColor = cosmetics?.nameColor;
  const nameStyle = nameColor?.gradient
    ? {
        backgroundImage: nameColor.gradient,
        WebkitBackgroundClip: 'text',
        backgroundClip: 'text',
        color: 'transparent',
      }
    : nameColor?.color
      ? { color: nameColor.color }
      : undefined;
  const postFlair = cosmetics?.postFlair?.gradient ?? cosmetics?.postFlair?.color ?? null;

  const body = isRmhark ? (
    <>
      <div className={hasMenu ? 'flex items-center gap-2.5 pe-9' : 'flex items-center gap-2.5'}>
        <UserAvatar
          src={item.user?.image ?? undefined}
          alt=""
          size={28}
          fallbackName={item.user?.name || item.user?.handle || undefined}
        />
        <div className="min-w-0">
          <span className="t-body flex items-center gap-1 font-semibold text-site-text">
            <bdi className="truncate" style={nameStyle}>
              {displayName}
            </bdi>
            <BadgeMark
              badge={cosmetics?.badge}
              size={16}
              title={t('equipped-badge', { defaultValue: 'Equipped badge' })}
              className="shrink-0"
            />
            {item.user?.isVerified ? (
              <>
                <BadgeCheck className="size-3.5 shrink-0" aria-hidden />
                <span className="sr-only">{t('verified', { defaultValue: 'Verified' })}</span>
              </>
            ) : null}
            {item.user?.isBot ? <AutomatedBadge /> : null}
          </span>
          <span className="t-meta block truncate">
            {item.user?.handle ? <bdi>{`@${item.user.handle}`}</bdi> : ''}
            {item.createdAt ? (
              <>
                {item.user?.handle ? ' · ' : ''}
                <RelativeTime date={item.createdAt} format={relativeTimeShort} />
              </>
            ) : null}
          </span>
        </div>
      </div>
      {covered ? (
        // A content warning reason stands in for the text and media (sprint 06 #16). The row is one link, so there is
        // no button here: the post page has the reveal.
        <CoveredLine reason={warning.reason} className="t-post mt-2 break-words" />
      ) : bodyText ? (
        <p ref={contentRef} className="t-post mt-2 line-clamp-5 break-words whitespace-pre-wrap">
          {bodyText}
        </p>
      ) : null}
      {clamped && !covered ? (
        <span className="t-body mt-1 block font-medium underline">
          {t('read-more', { defaultValue: 'Read more' })}
        </span>
      ) : null}
      {translation && !covered ? (
        <p
          className={cn(
            't-body mt-2 border-s border-site-border ps-3 break-words whitespace-pre-wrap',
            ARRIVE,
          )}
        >
          {translation}
        </p>
      ) : null}
      {pending ? (
        <span className="t-meta mt-2 block">{t('posting', { defaultValue: 'Posting…' })}</span>
      ) : covered ? null : (
        <FeedMedia
          imageUrls={item.imageUrls}
          imageAlts={item.imageAlts}
          gifUrl={item.gifUrl}
          gifAlt={item.gifAlt}
          sensitive={item.isSensitive}
        />
      )}
    </>
  ) : (
    <>
      <span className="t-meta block">{kicker}</span>
      <h3 className="t-heading mt-1">{item.title}</h3>
      {item.description ? (
        <p className="t-body mt-1 line-clamp-1 text-site-text-muted">{item.description}</p>
      ) : null}
      <span className="t-body mt-1 block font-medium underline">
        {t('read-more', { defaultValue: 'Read more' })}
      </span>
    </>
  );

  // The take meter's buttons can't sit inside the link, so like the action row it is the link's sibling.
  const take =
    isRmhark && item.isTake && !item.locked && !pending ? (
      <TakeMeterLazy postId={item.actualId ?? item.id} />
    ) : null;

  return (
    <SpineItem
      as="article"
      className={pending ? 'opacity-60' : undefined}
      aria-busy={pending || undefined}
      // The current post of the feed keys (j / k): a real focus target. Enter on the row itself opens it.
      data-feed-post={item.id}
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && e.target === e.currentTarget && !pending) {
          e.preventDefault();
          openRow();
        }
      }}
    >
      {postFlair ? <span aria-hidden className="post-flair" style={{ background: postFlair }} /> : null}
      {pending ? (
        <div>{body}</div>
      ) : external ? (
        <a href={href} className="block" target="_blank" rel="noopener noreferrer">
          {body}
        </a>
      ) : (
        <Link to={href} className="block">
          {body}
        </Link>
      )}
      {/* The link card is the row link's sibling: an anchor cannot sit inside another. */}
      {linkPreviewUrl && !pending ? (
        <ArrivalSuspense fallback={<div aria-hidden className="mt-3 h-20" />}>
          <LinkPreview url={linkPreviewUrl} className="mt-3" onUnavailable={() => setPreviewFailed(true)} />
        </ArrivalSuspense>
      ) : null}
      {hasMenu ? (
        <div className="feed-row__menu">
          <PostMenuTrigger
            ref={menuAnchor}
            label={t('post-actions', { defaultValue: 'Post actions' })}
            open={menuOpen}
            // Warm the chunk on approach, so the first press opens the menu rather than starting a download.
            onPointerEnter={() => void loadFeedRowMenu()}
            onFocus={() => void loadFeedRowMenu()}
            onClick={() => {
              setMenuMounted(true);
              setMenuOpen((open) => !open);
            }}
          />
          {menuMounted ? (
            <Suspense fallback={null}>
              <FeedRowMenu
                item={item}
                open={menuOpen}
                onClose={() => setMenuOpen(false)}
                anchorRef={menuAnchor}
                onTranslation={setTranslation}
              />
            </Suspense>
          ) : null}
        </div>
      ) : null}
      {take}
      {isRmhark && !item.locked && !pending && (
        <PostPlusBadges
          postId={item.actualId ?? item.id}
          seriesId={item.seriesId}
          expiresAt={item.expiresAt}
        />
      )}
      {isRmhark && !pending ? <RMHarkActions item={item} /> : null}
    </SpineItem>
  );
});
