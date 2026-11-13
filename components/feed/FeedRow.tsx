import { Suspense, lazy, memo, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { BadgeCheck } from 'lucide-react';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { RelativeTime } from '@/components/ui/RelativeTime';
import { SpineItem } from '@/components/ui/spine';
import { RMHarkActions } from '@/components/feed/RMHarkActions';
import { PostMenuTrigger } from '@/components/feed/PostMenuTrigger';
import { AutomatedBadge } from '@/components/feed/AutomatedBadge';
import { FeedMedia } from '@/components/feed/FeedMedia';
import { TakeMeterLazy } from '@/components/feed/TakeMeterLazy';
import { PostPlusBadges } from '@/components/posts-plus/PostPlusBadges';
import { relativeTimeShort } from '@/lib/utils';
import type { FeedItem } from '@/lib/feed-types';

/** The post menu's rows and dialogs: fetched the first time a row's three dots are used, never with the feed. */
const loadFeedRowMenu = () => import('@/components/feed/FeedRowMenu');
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
  const rawKicker = item.category || item.type;
  const kicker = t(`kicker.${rawKicker}`, { defaultValue: humanizeKicker(rawKicker) });
  const href = hrefFor(item);
  const external = href.startsWith('http');
  // An optimistic post has a temporary id: there is nothing to open and nothing to like until the server answers.
  const pending = Boolean(item.pending);
  const menuAnchor = useRef<HTMLButtonElement | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuMounted, setMenuMounted] = useState(false);
  const [translation, setTranslation] = useState<string | null>(null);
  const hasMenu = isRmhark && !pending && !item.deletedAt;

  // The body hard-clamps at five lines, so a long post would end mid-word with nothing to say more existed. Measured
  // once the text is laid out, so short posts get no cue. It is a span, not a link: the body is already one.
  useEffect(() => {
    const el = contentRef.current;
    if (el) setClamped(el.scrollHeight - el.clientHeight > 1);
  }, [item.content]);

  const displayName =
    item.user?.name || item.user?.handle || t('someone', { defaultValue: 'Someone' });

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
            <span className="truncate">{displayName}</span>
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
      {item.content ? (
        <p ref={contentRef} className="t-post mt-2 line-clamp-5 break-words whitespace-pre-wrap">
          {item.content}
        </p>
      ) : null}
      {clamped ? (
        <span className="t-body mt-1 block font-medium underline">
          {t('read-more', { defaultValue: 'Read more' })}
        </span>
      ) : null}
      {translation ? (
        <p className="t-body mt-2 border-s border-site-border ps-3 break-words whitespace-pre-wrap">
          {translation}
        </p>
      ) : null}
      {pending ? (
        <span className="t-meta mt-2 block">{t('posting', { defaultValue: 'Posting…' })}</span>
      ) : (
        <FeedMedia
          imageUrls={item.imageUrls}
          imageAlts={item.imageAlts}
          gifUrl={item.gifUrl}
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
    >
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
