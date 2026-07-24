'use client';

import { memo } from 'react';
import { Link } from '@tanstack/react-router';
import { BadgeCheck, Heart, MessageCircle, Repeat2 } from 'lucide-react';
import { UserAvatar } from '@/components/ui/UserAvatar';
import type { FeedItem } from '@/lib/feed-types';

function timeAgo(iso?: string): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const s = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return `${Math.floor(d / 7)}w`;
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
  const isRmhark = item.type === 'rmhark';
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
            {item.user?.handle ? `@${item.user.handle}` : ''} · {timeAgo(item.createdAt)}
          </span>
        </div>
      </div>
      <p className="rmhark__content">{item.content}</p>
    </>
  ) : (
    <>
      <span className="rmhark__kicker">{item.category || item.type}</span>
      <h3 className="rmhark__title">{item.title}</h3>
      {item.description ? <p className="rmhark__content">{item.description}</p> : null}
    </>
  );

  const stats = isRmhark ? (
    <div className="rmhark__stats" aria-hidden>
      <span>
        <Heart aria-hidden /> {item.likeCount ?? 0}
      </span>
      <span>
        <MessageCircle aria-hidden /> {item.commentCount ?? 0}
      </span>
      <span>
        <Repeat2 aria-hidden /> {item.repostCount ?? 0}
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
