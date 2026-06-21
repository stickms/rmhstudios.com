'use client';

import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import {
  Loader2,
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

export function WrappedColumn() {
  const [data, setData] = useState<Wrapped | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/wrapped', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-site-accent" />
      </div>
    );
  }
  if (!data) {
    return <p className="px-4 py-16 text-center text-sm text-site-text-muted">Could not load your Wrapped.</p>;
  }

  const tiles = [
    { label: 'Posts', value: fmt(data.posts), icon: PenSquare },
    { label: 'Likes earned', value: fmt(data.likesReceived), icon: Heart },
    { label: 'Comments', value: fmt(data.commentsReceived), icon: MessageCircle },
    { label: 'New followers', value: fmt(data.newFollowers), icon: UserPlus },
    { label: 'Achievements', value: fmt(data.achievementsUnlocked), icon: Trophy },
    { label: 'Longest streak', value: `${fmt(data.longestStreak)}d`, icon: Flame },
  ];

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-site-border bg-site-bg/80 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-site-accent" />
          <h1 className="text-lg font-bold text-site-text">{data.year} Wrapped</h1>
        </div>
      </header>

      <div className="space-y-6 p-4">
        {/* Hero */}
        <section className="overflow-hidden rounded-2xl border border-site-border bg-gradient-to-br from-site-accent/20 via-site-surface to-site-surface p-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-site-accent">Your year on RMH</p>
          <p className="mt-2 text-2xl font-extrabold leading-snug text-site-text">{data.blurb}</p>
          <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-site-bg px-3 py-1.5 text-sm font-semibold text-site-text">
            <Star className="h-4 w-4 text-site-accent" /> Level {data.level}
          </div>
        </section>

        {/* Stat tiles */}
        <section className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {tiles.map((t) => (
            <div key={t.label} className="rounded-xl border border-site-border bg-site-surface p-4">
              <t.icon className="h-5 w-5 text-site-accent" />
              <p className="mt-2 text-2xl font-extrabold text-site-text">{t.value}</p>
              <p className="text-xs text-site-text-dim">{t.label}</p>
            </div>
          ))}
          <div className="rounded-xl border border-site-border bg-site-surface p-4">
            <CoinIcon className="h-5 w-5" />
            <p className="mt-2 text-2xl font-extrabold text-site-text">{fmt(data.coinsEarned)}</p>
            <p className="text-xs text-site-text-dim">Coins earned</p>
          </div>
          {data.busiestMonth && (
            <div className="rounded-xl border border-site-border bg-site-surface p-4">
              <CalendarDays className="h-5 w-5 text-site-accent" />
              <p className="mt-2 text-2xl font-extrabold text-site-text">{data.busiestMonth}</p>
              <p className="text-xs text-site-text-dim">Busiest month</p>
            </div>
          )}
        </section>

        {/* Top post */}
        {data.topPost && (
          <section>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-site-text-dim">
              Your top post
            </h2>
            <Link
              to={`/u/me/post/${data.topPost.id}` as string}
              className="block rounded-xl border border-site-border bg-site-surface p-4 transition-colors hover:border-site-accent/60"
            >
              <p className="line-clamp-4 whitespace-pre-wrap break-words text-sm text-site-text">
                {data.topPost.content || '(media post)'}
              </p>
              <p className="mt-2 inline-flex items-center gap-1 text-xs text-site-text-dim">
                <Heart className="h-3.5 w-3.5 text-site-accent" /> {fmt(data.topPost.likeCount)} likes
              </p>
            </Link>
          </section>
        )}
      </div>
    </div>
  );
}
