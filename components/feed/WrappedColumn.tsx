'use client';

import { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import {
  Sparkles,
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
      <header className="sticky top-0 z-10 border-b border-site-border bg-site-bg/80 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-site-accent" />
          <h1 className="text-lg font-bold text-site-text">{t('wrapped-heading', { year: data.year, defaultValue: '{{year}} Wrapped' })}</h1>
        </div>
      </header>

      <div className="space-y-6 p-4">
        {/* Hero */}
        <section className="overflow-hidden rounded-site border border-site-border bg-gradient-to-br from-site-accent/20 via-site-surface to-site-surface p-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-site-accent">{t('your-year-on-rmh', { defaultValue: 'Your year on RMH' })}</p>
          <p className="mt-2 text-2xl font-extrabold leading-snug text-site-text">{data.blurb}</p>
          <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-site-bg px-3 py-1.5 text-sm font-semibold text-site-text">
            <Star className="h-4 w-4 text-site-accent" /> {t('level-value', { level: data.level, defaultValue: 'Level {{level}}' })}
          </div>
        </section>

        {/* Stat tiles */}
        <section className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {tiles.map((t) => (
            <div key={t.label} className="rounded-site border border-site-border bg-site-surface p-4">
              <t.icon className="h-5 w-5 text-site-accent" />
              <p className="mt-2 text-2xl font-extrabold text-site-text">{t.value}</p>
              <p className="text-xs text-site-text-dim">{t.label}</p>
            </div>
          ))}
          <div className="rounded-site border border-site-border bg-site-surface p-4">
            <CoinIcon className="h-5 w-5" />
            <p className="mt-2 text-2xl font-extrabold text-site-text">{fmt(data.coinsEarned)}</p>
            <p className="text-xs text-site-text-dim">{t('tile-coins-earned', { defaultValue: 'Coins earned' })}</p>
          </div>
          {data.busiestMonth && (
            <div className="rounded-site border border-site-border bg-site-surface p-4">
              <CalendarDays className="h-5 w-5 text-site-accent" />
              <p className="mt-2 text-2xl font-extrabold text-site-text">{data.busiestMonth}</p>
              <p className="text-xs text-site-text-dim">{t('tile-busiest-month', { defaultValue: 'Busiest month' })}</p>
            </div>
          )}
        </section>

        {/* Top post */}
        {data.topPost && (
          <section>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-site-text-dim">
              {t('your-top-post', { defaultValue: 'Your top post' })}
            </h2>
            <Link
              to={`/u/me/post/${data.topPost.id}` as string}
              className="block rounded-site border border-site-border bg-site-surface p-4 transition-colors hover:border-site-accent/60"
            >
              <p className="line-clamp-4 whitespace-pre-wrap break-words text-sm text-site-text">
                {data.topPost.content || t('media-post-fallback', { defaultValue: '(media post)' })}
              </p>
              <p className="mt-2 inline-flex items-center gap-1 text-xs text-site-text-dim">
                <Heart className="h-3.5 w-3.5 text-site-accent" /> {t('top-post-likes', { count: data.topPost.likeCount, formattedCount: fmt(data.topPost.likeCount), defaultValue: '{{formattedCount}} likes' })}
              </p>
            </Link>
          </section>
        )}
      </div>
    </div>
  );
}
