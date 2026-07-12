'use client';

import { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import {
  PenSquare,
  Heart,
  MessageCircle,
  UserPlus,
  Trophy,
  Flame,
  CalendarDays,
  Star,
} from 'lucide-react';
import { CoinIcon } from '@/components/rmhcoins/CoinIcon';
import { Spinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { PinnedHero } from '@/components/feed/PinnedHero';
import { Reveal, RevealGroup, RevealItem } from '@/components/motion';
import { LIFT_CARD } from '@/components/feed/motionHelpers';

interface Wrapped {
  year: number;
  posts: number;
  likesReceived: number;
  commentsReceived: number;
  newFollowers: number;
  achievementsUnlocked: number;
  coinsEarned: number;
  level: number;
  longestStreak: number;
  busiestMonth: string | null;
  topPost: { id: string; content: string; likeCount: number } | null;
  blurb: string;
}

const fmt = (n: number) => n.toLocaleString();

export function WrappedColumn({
  initialData,
}: {
  /** Current-year Wrapped prefetched by the route loader; `null` when signed out. */
  initialData?: Wrapped | null;
} = {}) {
  const { t } = useTranslation('feed');
  // Seed from the loader when provided so the summary paints immediately.
  const seeded = useRef(initialData !== undefined && initialData !== null);
  const [data, setData] = useState<Wrapped | null>(initialData ?? null);
  const [loading, setLoading] = useState(!initialData);

  useEffect(() => {
    if (seeded.current) return;
    fetch('/api/wrapped', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }
  if (!data) {
    return <EmptyState description={t('wrapped-load-error', { defaultValue: 'Could not load your Wrapped.' })} />;
  }

  const tiles = [
    { label: t('tile-posts', { defaultValue: 'Posts' }), value: fmt(data.posts), icon: PenSquare },
    { label: t('tile-likes-earned', { defaultValue: 'Likes earned' }), value: fmt(data.likesReceived), icon: Heart },
    { label: t('tile-comments', { defaultValue: 'Comments' }), value: fmt(data.commentsReceived), icon: MessageCircle },
    { label: t('tile-new-followers', { defaultValue: 'New followers' }), value: fmt(data.newFollowers), icon: UserPlus },
    { label: t('tile-achievements', { defaultValue: 'Achievements' }), value: fmt(data.achievementsUnlocked), icon: Trophy },
    { label: t('tile-longest-streak', { defaultValue: 'Longest streak' }), value: `${fmt(data.longestStreak)}d`, icon: Flame },
  ];

  return (
    <div className="min-h-screen">
      {/* Pinned scroll-narrative hero — marquee moment for the year review. */}
      <PinnedHero
        eyebrow={t('your-year-on-rmh', { defaultValue: 'Your year on RMH' })}
        title={
          <>
            {data.year}{' '}
            <span style={{ color: 'var(--site-accent)' }}>
              {t('wrapped-heading-word', { defaultValue: 'Wrapped' })}
            </span>
          </>
        }
        subtitle={data.blurb}
        actions={
          <Link to="/recap">
            <Button variant="accent" size="sm">
              {t('recap-year-wrapped', { defaultValue: 'This week' })}
            </Button>
          </Link>
        }
        scrollCue={t('wrapped-scroll-cue', { defaultValue: 'Scroll to explore' })}
        screens={2.6}
      />

      <div className="space-y-6 p-4">
        {/* Level badge — leads the below-fold content. */}
        <Reveal>
          <div className="flex items-center gap-2 rounded-site border border-site-border bg-site-surface px-4 py-3">
            <Star className="h-5 w-5 text-site-accent" />
            <span className="text-sm font-semibold text-site-text">
              {t('level-value', { level: data.level, defaultValue: 'Level {{level}}' })}
            </span>
          </div>
        </Reveal>

        {/* Stat tiles */}
        <Reveal>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-site-text-dim">
            {t('wrapped-stats-heading', { defaultValue: 'Your year in numbers' })}
          </h2>
          <RevealGroup as="div" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {tiles.map((tile) => (
              <RevealItem key={tile.label}>
                <div className={`rounded-site border border-site-border bg-site-surface p-4 ${LIFT_CARD}`}>
                  <tile.icon className="h-5 w-5 text-site-accent" />
                  <p className="mt-2 text-2xl font-extrabold text-site-text">{tile.value}</p>
                  <p className="text-xs text-site-text-dim">{tile.label}</p>
                </div>
              </RevealItem>
            ))}
            <RevealItem>
              <div className={`rounded-site border border-site-border bg-site-surface p-4 ${LIFT_CARD}`}>
                <CoinIcon className="h-5 w-5" />
                <p className="mt-2 text-2xl font-extrabold text-site-text">{fmt(data.coinsEarned)}</p>
                <p className="text-xs text-site-text-dim">{t('tile-coins-earned', { defaultValue: 'Coins earned' })}</p>
              </div>
            </RevealItem>
            {data.busiestMonth && (
              <RevealItem>
                <div className={`rounded-site border border-site-border bg-site-surface p-4 ${LIFT_CARD}`}>
                  <CalendarDays className="h-5 w-5 text-site-accent" />
                  <p className="mt-2 text-2xl font-extrabold text-site-text">{data.busiestMonth}</p>
                  <p className="text-xs text-site-text-dim">{t('tile-busiest-month', { defaultValue: 'Busiest month' })}</p>
                </div>
              </RevealItem>
            )}
          </RevealGroup>
        </Reveal>

        {/* Top post */}
        {data.topPost && (
          <Reveal>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-site-text-dim">
              {t('your-top-post', { defaultValue: 'Your top post' })}
            </h2>
            <Link
              to={`/u/me/post/${data.topPost.id}` as string}
              className={`block rounded-site border border-site-border bg-site-surface p-4 ${LIFT_CARD}`}
            >
              <p className="line-clamp-4 whitespace-pre-wrap break-words text-sm text-site-text">
                {data.topPost.content || t('media-post-fallback', { defaultValue: '(media post)' })}
              </p>
              <p className="mt-2 inline-flex items-center gap-1 text-xs text-site-text-muted">
                <Heart className="h-3.5 w-3.5 text-site-accent" /> {t('top-post-likes', { count: data.topPost.likeCount, formattedCount: fmt(data.topPost.likeCount), defaultValue: '{{formattedCount}} likes' })}
              </p>
            </Link>
          </Reveal>
        )}
      </div>
    </div>
  );
}
