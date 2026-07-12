'use client';

import { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { Compass, Hash, Loader2, Sparkles, TrendingUp, Coins } from 'lucide-react';
import { RMHarkCard } from './RMHarkCard';
import { RevealGroup, RevealItem } from '@/components/motion';
import { Spinner } from '@/components/ui/spinner';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { Button } from '@/components/ui/button';
import type { FeedItem } from '@/lib/feed-types';

// Hairline card that lifts subtly on hover — the quiet micro-interaction shared
// across the hand-tuned discovery grids.
const LIFT_CARD =
  'transition-[transform,border-color] duration-200 hover:-translate-y-0.5 hover:border-site-accent/50';

interface ExploreData {
  trendingTags: { tag: string; count: number }[];
  hotPosts: FeedItem[];
  suggestedUsers: { id: string; name: string | null; image: string | null; handle: string | null; followerCount: number }[];
}

export function ExploreColumn({
  initialData,
}: {
  /** Explore payload prefetched by the route loader. */
  initialData?: ExploreData | null;
} = {}) {
  // Seed from the loader when provided so the page paints immediately and the
  // mount fetch is skipped.
  const seeded = useRef(initialData !== undefined && initialData !== null);
  const [data, setData] = useState<ExploreData | null>(initialData ?? null);
  const [loading, setLoading] = useState(!seeded.current);
  const [tipLeaders, setTipLeaders] = useState<{ user: { id: string; name: string | null; image: string | null; handle: string | null }; total: number }[]>([]);

  // Ask-the-feed widget state
  const { t } = useTranslation('feed');

  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    let active = true;
    // The primary payload is seeded by the loader; only fetch it here on the
    // client fallback path.
    if (!seeded.current) {
      fetch('/api/explore', { credentials: 'include' })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => active && setData(d))
        .finally(() => active && setLoading(false));
    }
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
      else if (res.status === 401) setAnswer(t('ask-sign-in', { defaultValue: 'Sign in to ask the feed.' }));
      else setAnswer(d.error || t('ask-error', { defaultValue: 'Could not answer.' }));
    } finally {
      setAsking(false);
    }
  };

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-site-border bg-site-bg/80 px-4 py-3 backdrop-blur">
        <Compass className="h-5 w-5 text-site-accent" />
        <h1 className="text-lg font-bold text-site-text">{t('explore-title', { defaultValue: 'Explore' })}</h1>
      </header>

      {/* Ask the feed */}
      <section className="border-b border-site-border p-4">
        <label htmlFor="ask-feed" className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-site-text">
          <Sparkles className="h-4 w-4 text-site-accent" /> {t('ask-the-feed', { defaultValue: 'Ask the feed' })}
        </label>
        <div className="flex gap-2">
          <input
            id="ask-feed"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && ask()}
            placeholder={t('ask-placeholder', { defaultValue: "What's everyone talking about?" })}
            className="flex-1 rounded-site-sm border border-site-border bg-site-bg px-3 py-2 text-sm text-site-text placeholder:text-site-text-dim focus:border-site-accent focus:outline-none"
          />
          <Button variant="accent" onClick={ask} disabled={asking || question.trim().length < 3}>
            {asking ? <Loader2 className="h-4 w-4 animate-spin" /> : t('ask-button', { defaultValue: 'Ask' })}
          </Button>
        </div>
        {answer && <p className="mt-3 whitespace-pre-line rounded-site-sm bg-site-surface p-3 text-sm text-site-text">{answer}</p>}
      </section>

      {loading ? (
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      ) : (
        <RevealGroup>
          {/* Trending tags */}
          {data && data.trendingTags.length > 0 && (
            <RevealItem as="section" className="border-b border-site-border p-4">
              <h2 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-site-text-dim">
                <TrendingUp className="h-3.5 w-3.5" /> {t('trending', { defaultValue: 'Trending' })}
              </h2>
              <div className="flex flex-wrap gap-2">
                {data.trendingTags.map((t) => (
                  <Link
                    key={t.tag}
                    to={`/tag/${t.tag}` as string}
                    className="inline-flex items-center gap-1 rounded-full border border-site-border bg-site-surface px-3 py-1 text-sm text-site-text transition-colors duration-200 hover:border-site-accent/50"
                  >
                    <Hash className="h-3 w-3 text-site-accent" />
                    {t.tag}
                    <span className="text-xs text-site-text-dim">{t.count}</span>
                  </Link>
                ))}
              </div>
            </RevealItem>
          )}

          {/* Who to follow */}
          {data && data.suggestedUsers.length > 0 && (
            <RevealItem as="section" className="border-b border-site-border p-4">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-site-text-dim">{t('who-to-follow', { defaultValue: 'Who to follow' })}</h2>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {data.suggestedUsers.map((u) => (
                  <Link
                    key={u.id}
                    to={`/u/${u.handle || u.id}` as string}
                    className={`flex items-center gap-3 rounded-site border border-site-border bg-site-surface p-2.5 ${LIFT_CARD}`}
                  >
                    <UserAvatar src={u.image} alt={u.name || t('user-fallback', { defaultValue: 'User' })} size={36} fallbackName={u.name || 'U'} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-site-text">{u.name || u.handle}</p>
                      <p className="truncate text-xs text-site-text-muted">{t('follower-count', { count: u.followerCount, defaultValue: '{{count}} followers' })}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </RevealItem>
          )}

          {/* Top supported creators */}
          {tipLeaders.length > 0 && (
            <RevealItem as="section" className="border-b border-site-border p-4">
              <h2 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-site-text-dim">
                <Coins className="h-3.5 w-3.5 text-site-warning" /> {t('top-supported-this-week', { defaultValue: 'Top supported this week' })}
              </h2>
              <div className="space-y-1.5">
                {tipLeaders.slice(0, 5).map((l, i) => (
                  <Link
                    key={l.user.id}
                    to={`/u/${l.user.handle || l.user.id}` as string}
                    className="flex items-center gap-3 rounded-site-sm px-2 py-1.5 hover:bg-site-surface"
                  >
                    <span className="w-5 text-center text-sm font-bold text-site-text-dim">{i + 1}</span>
                    <UserAvatar src={l.user.image} alt={l.user.name || t('user-fallback', { defaultValue: 'User' })} size={28} fallbackName={l.user.name || 'U'} />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-site-text">{l.user.name || l.user.handle}</span>
                    <span className="inline-flex items-center gap-1 text-sm font-semibold text-site-warning">
                      <Coins className="h-3.5 w-3.5" /> {l.total.toLocaleString()}
                    </span>
                  </Link>
                ))}
              </div>
            </RevealItem>
          )}

          {/* Hot posts — the feed cards keep their own entrance; the section
              block reveals once as a unit (no per-card reveal). */}
          {data && data.hotPosts.length > 0 && (
            <RevealItem as="section">
              <h2 className="px-4 pt-4 text-xs font-semibold uppercase tracking-wide text-site-text-dim">{t('hot-this-week', { defaultValue: 'Hot this week' })}</h2>
              <div className="divide-y divide-site-border">
                {data.hotPosts.map((item) => (
                  <RMHarkCard key={item.id} item={item} />
                ))}
              </div>
            </RevealItem>
          )}
        </RevealGroup>
      )}
    </div>
  );
}
