'use client';

import { useMemo } from 'react';
import { Link } from '@tanstack/react-router';
import { Hash, TrendingUp, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useFeedStore } from '@/stores/feedStore';
import { useIsDesktop } from '@/hooks/useIsDesktop';
import { UserAvatar } from '@/components/ui/UserAvatar';
import type { FeedItem, FeedItemUser } from '@/lib/feed-types';

const TAG_RE = /(?:^|\s)#([\p{L}\p{N}_]{2,30})/gu;

interface Trend {
  tag: string;
  count: number;
}
interface Voice {
  user: FeedItemUser;
  count: number;
}

/** Tally hashtags across the loaded timeline — a genuinely live "what's moving
 *  right now" read that costs nothing extra (the feed is already in memory and
 *  SSE keeps it fresh, so this recomputes as new rmharks stream in). */
function computeTrends(items: FeedItem[]): Trend[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    const text = item.content;
    if (!text) continue;
    for (const m of text.matchAll(TAG_RE)) {
      const tag = m[1].toLowerCase();
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .filter(([, c]) => c > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([tag, count]) => ({ tag, count }));
}

/** The most-present voices in the current timeline. */
function computeVoices(items: FeedItem[]): Voice[] {
  const byUser = new Map<string, Voice>();
  for (const item of items) {
    const u = item.user;
    if (!u?.id) continue;
    const existing = byUser.get(u.id);
    if (existing) existing.count += 1;
    else byUser.set(u.id, { user: u, count: 1 });
  }
  return [...byUser.values()]
    .filter((v) => v.count > 1)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
}

/**
 * The home feed's live right rail. Purely client-derived from the in-memory
 * feed store — no new endpoint — so it stays in lock-step with the timeline and
 * the SSE stream. Desktop only (the wheel owns the whole viewport on phones);
 * `useIsDesktop` keeps it from mounting / subscribing at all on small screens.
 */
export function FeedAside() {
  const { t } = useTranslation('feed');
  const isDesktop = useIsDesktop();
  const items = useFeedStore((s) => s.items);

  const trends = useMemo(() => computeTrends(items), [items]);
  const voices = useMemo(() => computeVoices(items), [items]);

  if (!isDesktop) return null;
  if (trends.length === 0 && voices.length === 0) return null;

  return (
    <div className="feed-aside">
      {trends.length > 0 && (
        <section className="glass-fill feed-aside__card">
          <h2 className="site-aside__title">
            <TrendingUp aria-hidden />
            {t('trending-now', { defaultValue: 'Trending now' })}
          </h2>
          <ul className="feed-aside__trends">
            {trends.map(({ tag, count }) => (
              <li key={tag}>
                <Link to={`/tag/${tag}` as string} className="feed-aside__trend">
                  <span className="feed-aside__trend-tag">
                    <Hash aria-hidden />
                    {tag}
                  </span>
                  <span className="feed-aside__trend-count">
                    {t('posts-count', { count, defaultValue: '{{count}} posts' })}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {voices.length > 0 && (
        <section className="glass-fill feed-aside__card">
          <h2 className="site-aside__title">
            <Users aria-hidden />
            {t('active-voices', { defaultValue: 'Active voices' })}
          </h2>
          <ul className="feed-aside__voices">
            {voices.map(({ user, count }) => {
              const name = user.name || user.username || t('someone', { defaultValue: 'Someone' });
              const href = `/u/${user.handle ?? user.id}`;
              return (
                <li key={user.id}>
                  <Link to={href as string} className="feed-aside__voice">
                    <UserAvatar src={user.image} alt="" size={34} fallbackName={name} />
                    <span className="feed-aside__voice-who">
                      <span className="feed-aside__voice-name">{name}</span>
                      <span className="feed-aside__voice-count">
                        {t('active-posts-count', { count, defaultValue: '{{count}} rmharks' })}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
