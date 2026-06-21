'use client';

import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Loader2, Sparkles, Heart, MessageCircle, UserPlus, Trophy, Flame, PenSquare } from 'lucide-react';

interface Recap {
  posts: number;
  likesReceived: number;
  commentsReceived: number;
  newFollowers: number;
  achievementsUnlocked: number;
  streak: number;
  topPost: { id: string; content: string; likeCount: number } | null;
  blurb: string;
}

const STAT_META = [
  { key: 'posts', label: 'Posts', icon: PenSquare },
  { key: 'likesReceived', label: 'Likes received', icon: Heart },
  { key: 'commentsReceived', label: 'Comments', icon: MessageCircle },
  { key: 'newFollowers', label: 'New followers', icon: UserPlus },
  { key: 'achievementsUnlocked', label: 'Achievements', icon: Trophy },
  { key: 'streak', label: 'Day streak', icon: Flame },
] as const;

export function RecapColumn() {
  const [recap, setRecap] = useState<Recap | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetch('/api/recap', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => active && setRecap(d))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-site-border bg-site-bg/80 px-4 py-3 backdrop-blur">
        <Sparkles className="h-5 w-5 text-site-accent" />
        <h1 className="text-lg font-bold text-site-text">Your week on RMH</h1>
        <Link
          to="/wrapped"
          className="ml-auto inline-flex items-center gap-1 rounded-full border border-site-border px-3 py-1 text-xs font-semibold text-site-accent transition-colors hover:bg-site-surface"
        >
          <Sparkles className="h-3.5 w-3.5" /> Year Wrapped
        </Link>
      </header>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-site-accent" />
        </div>
      ) : !recap ? (
        <p className="px-4 py-16 text-center text-sm text-site-text-muted">Could not load your recap.</p>
      ) : (
        <div className="space-y-4 p-4">
          <div className="rounded-2xl border border-site-accent/30 bg-site-accent-dim p-4">
            <p className="text-sm text-site-text">{recap.blurb}</p>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {STAT_META.map(({ key, label, icon: Icon }) => (
              <div key={key} className="rounded-xl border border-site-border bg-site-surface p-3 text-center">
                <Icon className="mx-auto h-5 w-5 text-site-accent" />
                <p className="mt-1 text-2xl font-bold text-site-text">{recap[key] as number}</p>
                <p className="text-xs text-site-text-muted">{label}</p>
              </div>
            ))}
          </div>

          {recap.topPost && (
            <div className="rounded-xl border border-site-border bg-site-surface p-4">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-site-text-dim">Your top post</p>
              <p className="line-clamp-3 text-sm text-site-text">{recap.topPost.content}</p>
              <p className="mt-1 text-xs text-site-text-muted">❤️ {recap.topPost.likeCount} likes</p>
            </div>
          )}

          <Link
            to="/achievements"
            className="block rounded-xl border border-site-border bg-site-surface p-3 text-center text-sm font-medium text-site-accent hover:bg-site-surface-hover"
          >
            View your achievements →
          </Link>
        </div>
      )}
    </div>
  );
}
