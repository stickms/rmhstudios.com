'use client';

import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { BookOpen, ChevronLeft, ChevronRight, Hourglass } from 'lucide-react';
import { useNearViewport } from '@/hooks/useNearViewport';
import { isExpired, type SeriesNav } from '@/lib/posts-plus/constants';

/**
 * posts-plus badges on a post: "Part k of N - Series name" with prev/next (X5)
 * and "Deletes in 3h" (X8).
 *
 * The feed item carries only `seriesId` / `expiresAt`; everything else about a
 * series is fetched from its own route when the chip nears the viewport, so a
 * feed page with no series posts pays for none of it. Renders nothing for the
 * (overwhelming) majority of posts.
 */

const navCache = new Map<string, SeriesNav | null>();

export function PostPlusBadges({
  postId,
  seriesId,
  expiresAt,
  className = 'mt-2',
}: {
  postId: string;
  seriesId?: string;
  expiresAt?: string;
  className?: string;
}) {
  if (!seriesId && !expiresAt) return null;
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      {seriesId && <SeriesChip postId={postId} />}
      {expiresAt && <ExpiryChip expiresAt={expiresAt} />}
    </div>
  );
}

function SeriesChip({ postId }: { postId: string }) {
  const { t } = useTranslation('f-posts-plus');
  const { ref, visible } = useNearViewport<HTMLDivElement>('300px 0px', navCache.has(postId));
  const [nav, setNav] = useState<SeriesNav | null>(() => navCache.get(postId) ?? null);

  useEffect(() => {
    if (!visible || navCache.has(postId)) return;
    let cancelled = false;
    fetch(`/api/series/post/${encodeURIComponent(postId)}`, { credentials: 'include' })
      .then((r) => (r.ok ? (r.json() as Promise<SeriesNav>) : null))
      .then((d) => {
        navCache.set(postId, d);
        if (!cancelled) setNav(d);
      })
      .catch(() => {
        navCache.set(postId, null);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, postId]);

  // Reserve the chip's height so it appearing does not push the card around.
  if (!nav) return <div ref={ref} className="h-6 w-40" aria-hidden />;

  const author = nav.series.authorId;
  const step = (
    target: { id: string; handle: string | null } | null,
    label: string,
    Icon: typeof ChevronLeft,
  ) =>
    target ? (
      <Link
        to="/u/$userid/post/$postid"
        params={{ userid: target.handle ?? author, postid: target.id }}
        aria-label={label}
        title={label}
        onClick={(e) => e.stopPropagation()}
        className="inline-flex h-6 w-6 items-center justify-center rounded-full text-site-text-muted transition-colors hover:bg-site-surface-hover hover:text-site-text"
      >
        <Icon className="h-4 w-4" aria-hidden />
      </Link>
    ) : (
      <span className="inline-flex h-6 w-6 items-center justify-center opacity-30" aria-hidden>
        <Icon className="h-4 w-4" />
      </span>
    );

  return (
    <div
      ref={ref}
      className="glass-fill inline-flex max-w-full items-center gap-1 rounded-full px-1.5 py-0.5 text-xs text-site-text-muted"
    >
      {step(nav.prev, t('series-prev', { defaultValue: 'Previous part' }), ChevronLeft)}
      <Link
        to="/series/$id"
        params={{ id: nav.series.id }}
        onClick={(e) => e.stopPropagation()}
        className="inline-flex min-w-0 items-center gap-1.5 hover:text-site-text"
      >
        <BookOpen className="h-3.5 w-3.5 shrink-0 text-site-accent" aria-hidden />
        <span className="truncate">
          {t('series-chip', {
            defaultValue: 'Part {{k}} of {{n}} · {{title}}',
            k: nav.position,
            n: nav.series.total,
            title: nav.series.title,
          })}
        </span>
      </Link>
      {step(nav.next, t('series-next', { defaultValue: 'Next part' }), ChevronRight)}
    </div>
  );
}

/** "Deletes in 3h" - computed after mount (server and client clocks differ) and refreshed each minute. */
function ExpiryChip({ expiresAt }: { expiresAt: string }) {
  const { t } = useTranslation('f-posts-plus');
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  if (now === null) return <div className="h-6 w-28" aria-hidden />;
  if (isExpired(expiresAt, now)) return null;

  const mins = Math.max(1, Math.ceil((Date.parse(expiresAt) - now) / 60_000));
  const label =
    mins >= 1440
      ? t('expires-days', { defaultValue: 'Deletes in {{n}}d', n: Math.ceil(mins / 1440) })
      : mins >= 60
        ? t('expires-hours', { defaultValue: 'Deletes in {{n}}h', n: Math.ceil(mins / 60) })
        : t('expires-minutes', { defaultValue: 'Deletes in {{n}}m', n: mins });

  return (
    <span className="glass-fill inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs text-site-text-muted">
      <Hourglass className="h-3.5 w-3.5 text-site-warning" aria-hidden />
      {label}
    </span>
  );
}
