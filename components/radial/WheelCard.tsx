'use client';

import { memo, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { BadgeCheck, Heart, MessageCircle, Repeat2 } from 'lucide-react';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { RelativeTime } from '@/components/ui/RelativeTime';
import { RmharkMedia } from './RmharkMedia';
import { relativeTimeShort } from '@/lib/utils';
import type { FeedItem } from '@/lib/feed-types';

/** "GAME_ANNOUNCEMENT" → "Game announcement" — the last-resort label when a
 *  feed category has no translation of its own. */
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
 * A `FeedItem` as the compact, monochrome unit of the home wheel — author +
 * content for a post, headline for a platform announcement.
 *
 * **This is deliberately not `components/feed/RMHarkCard`, and the two are not
 * merging.** They render the same `FeedItem`, which is why they used to be
 * named `RmharkCard` and `RMHarkCard` — a pair distinguished only by the case
 * of three letters, and a collision waiting for the first contributor on a
 * case-insensitive filesystem.
 *
 * They stay separate because the column card is an interactive post (30
 * imports, 11 hooks, session + feed-store subscriptions, view tracking,
 * like/repost/menu actions) and the wheel cannot afford it: the wheel rakes
 * its cards onto a 3D cylinder, and design.md §4 records that a rotated 3D
 * transform is the slow path for an antialiased curve — nothing rasterised
 * survives between frames, and the globe's wireframe as thirteen elements
 * halved the frame rate of the whole gesture. Adding a `variant="wheel"` to
 * the 541-line card would put all of that weight on the site's most-viewed
 * surface to save a file.
 *
 * What they must NOT do is disagree about the same post. Everything shared is
 * shared for real: `relativeTimeShort` (the two had private copies that
 * disagreed — this one stopped at "5w" where the column rolled over to "1mo"),
 * `RelativeTime`, `UserAvatar`, `FeedItem`. When you add a capability to one
 * card, check whether this one silently drops it — media was exactly that bug,
 * and the comment below is what it left behind.
 */
export const WheelCard = memo(function WheelCard({ item }: { item: FeedItem }) {
  const { t } = useTranslation('feed');
  const contentRef = useRef<HTMLParagraphElement | null>(null);
  const [clamped, setClamped] = useState(false);
  const isRmhark = item.type === 'rmhark';
  const rawKicker = item.category || item.type;
  const kicker = t(`kicker.${rawKicker}`, { defaultValue: humanizeKicker(rawKicker) });
  const href = hrefFor(item);
  const external = href.startsWith('http');

  const body = isRmhark ? (
    <>
      <div className="rmhark__head">
        <UserAvatar
          src={item.user?.image ?? undefined}
          alt={item.user?.name || item.user?.handle || 'User'}
          size={38}
          fallbackName={item.user?.name || item.user?.handle || undefined}
        />
        <div className="rmhark__who">
          <span className="rmhark__name">
            {item.user?.name || item.user?.handle || 'Someone'}
            {item.user?.isVerified ? <BadgeCheck className="rmhark__verified" aria-hidden /> : null}
          </span>
          <span className="rmhark__meta">
            {item.user?.handle ? `@${item.user.handle}` : ''}
            {item.createdAt ? (
              <>
                {' · '}
                <RelativeTime date={item.createdAt} format={relativeTimeShort} />
              </>
            ) : null}
          </span>
        </div>
      </div>
      <p ref={contentRef} className="rmhark__content">
        {item.content}
      </p>
      {/* The body hard-clamps at five lines, so a long post ended mid-word with
          nothing to say more existed — the card links to the thread, but only
          the whole card does, and nothing marked it as truncated. Measured, not
          guessed, so short posts get no cue. It is a span, not a link: the card
          is already one, and nesting interactive elements is invalid. */}
      {clamped ? (
        <span className="rmhark__more">{t('read-more', { defaultValue: 'Read more' })}</span>
      ) : null}
      {/* A post's photos are most of what it says, and the wheel card used to
          drop them entirely — an image post read as a caption with nothing under
          it, and the only way to see the picture was to open the post. */}
      <RmharkMedia
        imageUrls={item.imageUrls}
        imageAlts={item.imageAlts}
        gifUrl={item.gifUrl}
        sensitive={item.isSensitive}
      />
    </>
  ) : (
    <>
      <span className="rmhark__kicker">{kicker}</span>
      <h3 className="rmhark__title">{item.title}</h3>
      {item.description ? <p className="rmhark__content">{item.description}</p> : null}
    </>
  );

  // Passive metadata, not a toolbar. These counts are not interactive here (the
  // whole card is one link), but they were styled as the universal like/comment/
  // repost action row and hidden from assistive tech entirely — so they read as
  // broken buttons to sighted users and did not exist for everyone else. Now
  // they carry their own labels and are announced as the text they are.
  const stats = isRmhark ? (
    <div className="rmhark__stats">
      <span>
        <Heart aria-hidden />{' '}
        {t('like-count', { defaultValue: '{{count}} likes', count: item.likeCount ?? 0 })}
      </span>
      <span>
        <MessageCircle aria-hidden />{' '}
        {t('comment-count', { defaultValue: '{{count}} comments', count: item.commentCount ?? 0 })}
      </span>
      <span>
        <Repeat2 aria-hidden />{' '}
        {t('repost-count', { defaultValue: '{{count}} reposts', count: item.repostCount ?? 0 })}
      </span>
    </div>
  ) : null;

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const measure = () => setClamped(el.scrollHeight - el.clientHeight > 1);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [item.content]);

  const inner = (
    <article className="rmhark">
      {body}
      {stats}
    </article>
  );

  return external ? (
    <a href={href} className="rmhark__link" target="_blank" rel="noopener noreferrer">
      {inner}
    </a>
  ) : (
    <Link to={href} className="rmhark__link">
      {inner}
    </Link>
  );
});
