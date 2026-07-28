'use client';

import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { BadgeCheck, Heart, MessageCircle, Repeat2 } from 'lucide-react';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { RelativeTime } from '@/components/ui/RelativeTime';
import type { FeedItem } from '@/lib/feed-types';

/**
 * Elapsed time, formatted against an explicit `now` — never `Date.now()` read
 * at render. A relative string computed during SSR does not survive to
 * hydration (the clock moved), which fails hydration for the entire tree; see
 * components/ui/RelativeTime.
 */
function timeAgo(then: number, now: number): string {
  const s = Math.max(0, Math.floor((now - then) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return `${Math.floor(d / 7)}w`;
}

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
 * A single RMHark projected from the radial core — the compact monochrome unit
 * of the feed wheel. Rmharks show author + content; platform announcements show
 * their headline. Kept deliberately light so the wheel stays fluid mid-spin.
 */
export const RmharkCard = memo(function RmharkCard({ item }: { item: FeedItem }) {
  const { t } = useTranslation('feed');
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
                <RelativeTime date={item.createdAt} format={timeAgo} />
              </>
            ) : null}
          </span>
        </div>
      </div>
      <p className="rmhark__content">{item.content}</p>
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
