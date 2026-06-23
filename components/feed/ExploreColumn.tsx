'use client';

import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Compass, Hash, Loader2, Sparkles, TrendingUp, Coins } from 'lucide-react';
import { RMHarkCard } from './RMHarkCard';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { Button } from '@/components/ui/button';
import type { FeedItem } from '@/lib/feed-types';

interface ExploreData {
  trendingTags: { tag: string; count: number }[];
  hotPosts: FeedItem[];
  suggestedUsers: { id: string; name: string | null; image: string | null; handle: string | null; followerCount: number }[];
}

export function ExploreColumn() {
  const [data, setData] = useState<ExploreData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tipLeaders, setTipLeaders] = useState<{ user: { id: string; name: string | null; image: string | null; handle: string | null }; total: number }[]>([]);

  // Ask-the-feed widget state
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    let active = true;
    fetch('/api/explore', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => active && setData(d))
      .finally(() => active && setLoading(false));
    fetch('/api/tips/leaderboard?range=week')
      .then((r) => (r.ok ? r.json() : { leaders: [] }))
      .then((d) => active && setTipLeaders(d.leaders ?? []))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const ask = async () => {
    if (question.trim().length < 3) return;
    setAsking(true);
    setAnswer(null);
    try {
      const res = await fetch('/api/ai/ask-feed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ question: question.trim() }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) setAnswer(d.answer);
      else if (res.status === 401) setAnswer('Sign in to ask the feed.');
      else setAnswer(d.error || 'Could not answer.');
    } finally {
      setAsking(false);
    }
  };

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-site-border bg-site-bg/80 px-4 py-3 backdrop-blur">
        <Compass className="h-5 w-5 text-site-accent" />
        <h1 className="text-lg font-bold text-site-text">Explore</h1>
      </header>

      {/* Ask the feed */}
      <section className="border-b border-site-border p-4">
        <label htmlFor="ask-feed" className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-site-text">
          <Sparkles className="h-4 w-4 text-site-accent" /> Ask the feed
        </label>
        <div className="flex gap-2">
          <input
            id="ask-feed"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && ask()}
            placeholder="What's everyone talking about?"
            className="flex-1 rounded-lg border border-site-border bg-site-bg px-3 py-2 text-sm text-site-text placeholder:text-site-text-dim focus:border-site-accent focus:outline-none"
          />
          <Button variant="accent" onClick={ask} disabled={asking || question.trim().length < 3}>
            {asking ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Ask'}
          </Button>
        </div>
        {answer && <p className="mt-3 whitespace-pre-line rounded-lg bg-site-surface p-3 text-sm text-site-text">{answer}</p>}
      </section>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-site-accent" />
        </div>
      ) : (
        <>
          {/* Trending tags */}
          {data && data.trendingTags.length > 0 && (
            <section className="border-b border-site-border p-4">
              <h2 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-site-text-dim">
                <TrendingUp className="h-3.5 w-3.5" /> Trending
              </h2>
              <div className="flex flex-wrap gap-2">
                {data.trendingTags.map((t) => (
                  <Link
                    key={t.tag}
                    to={`/tag/${t.tag}` as string}
                    className="inline-flex items-center gap-1 rounded-full border border-site-border bg-site-surface px-3 py-1 text-sm text-site-text hover:border-site-accent/50"
                  >
                    <Hash className="h-3 w-3 text-site-accent" />
                    {t.tag}
                    <span className="text-xs text-site-text-dim">{t.count}</span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Who to follow */}
          {data && data.suggestedUsers.length > 0 && (
            <section className="border-b border-site-border p-4">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-site-text-dim">Who to follow</h2>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {data.suggestedUsers.map((u) => (
                  <Link
                    key={u.id}
                    to={`/u/${u.handle || u.id}` as string}
                    className="flex items-center gap-3 rounded-xl border border-site-border bg-site-surface p-2.5 hover:border-site-accent/50"
                  >
                    <UserAvatar src={u.image} alt={u.name || 'User'} size={36} fallbackName={u.name || 'U'} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-site-text">{u.name || u.handle}</p>
                      <p className="truncate text-xs text-site-text-muted">{u.followerCount} followers</p>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Top supported creators */}
          {tipLeaders.length > 0 && (
            <section className="border-b border-site-border p-4">
              <h2 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-site-text-dim">
                <Coins className="h-3.5 w-3.5 text-amber-400" /> Top supported this week
              </h2>
              <div className="space-y-1.5">
                {tipLeaders.slice(0, 5).map((l, i) => (
                  <Link
                    key={l.user.id}
                    to={`/u/${l.user.handle || l.user.id}` as string}
                    className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-site-surface"
                  >
                    <span className="w-5 text-center text-sm font-bold text-site-text-dim">{i + 1}</span>
                    <UserAvatar src={l.user.image} alt={l.user.name || 'User'} size={28} fallbackName={l.user.name || 'U'} />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-site-text">{l.user.name || l.user.handle}</span>
                    <span className="inline-flex items-center gap-1 text-sm font-semibold text-amber-500">
                      <Coins className="h-3.5 w-3.5" /> {l.total.toLocaleString()}
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Hot posts */}
          {data && data.hotPosts.length > 0 && (
            <section>
              <h2 className="px-4 pt-4 text-xs font-semibold uppercase tracking-wide text-site-text-dim">Hot this week</h2>
              <div className="divide-y divide-site-border">
                {data.hotPosts.map((item) => (
                  <RMHarkCard key={item.id} item={item} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
