'use client';

import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Hash, Loader2, TrendingUp, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { RMHarkCard } from './RMHarkCard';
import { UserAvatar } from '@/components/ui/UserAvatar';
import type { FeedItem } from '@/lib/feed-types';

interface Community {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  memberCount: number;
}

interface ExploreData {
  trendingTags: { tag: string; count: number }[];
  hotPosts: FeedItem[];
  suggestedUsers: { id: string; name: string | null; image: string | null; handle: string | null; followerCount: number }[];
  communities: Community[];
}

/**
 * Discovery content shown on the Explore/Search page when no query is active:
 * trending tags, people and communities to discover, and hot posts.
 */
export function ExploreRecommendations() {
  const { t } = useTranslation('feed');
  const [data, setData] = useState<ExploreData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetch('/api/explore', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => active && setData(d))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-site-accent" />
      </div>
    );
  }

  if (!data) {
    return (
      <p className="px-4 py-16 text-center text-sm text-site-text-muted">
        {t('explore-empty-hint', { defaultValue: 'Start typing to search across people, posts, builds, and the blog.' })}
      </p>
    );
  }

  return (
    <div>
      {/* Trending tags */}
      {data.trendingTags.length > 0 && (
        <section className="border-b border-site-border p-4">
          <h2 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-site-text-dim">
            <TrendingUp className="h-3.5 w-3.5" /> {t('trending-heading', { defaultValue: 'Trending' })}
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
      {data.suggestedUsers.length > 0 && (
        <section className="border-b border-site-border p-4">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-site-text-dim">{t('who-to-follow', { defaultValue: 'Who to follow' })}</h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {data.suggestedUsers.map((u) => (
              <Link
                key={u.id}
                to={`/u/${u.handle || u.id}` as string}
                className="flex items-center gap-3 rounded-xl border border-site-border bg-site-surface p-2.5 hover:border-site-accent/50"
              >
                <UserAvatar src={u.image} alt={u.name || t('user-alt', { defaultValue: 'User' })} size={36} fallbackName={u.name || 'U'} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-site-text">{u.name || u.handle}</p>
                  <p className="truncate text-xs text-site-text-muted">{t('follower-count', { count: u.followerCount, defaultValue: '{{count}} followers' })}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Communities to discover */}
      {data.communities.length > 0 && (
        <section className="border-b border-site-border p-4">
          <h2 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-site-text-dim">
            <Users className="h-3.5 w-3.5" /> {t('communities-heading', { defaultValue: 'Communities' })}
          </h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {data.communities.map((c) => (
              <Link
                key={c.id}
                to={`/c/${c.slug}` as string}
                className="flex items-center gap-3 rounded-xl border border-site-border bg-site-surface p-2.5 hover:border-site-accent/50"
              >
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xl"
                  style={{ background: (c.color || 'var(--site-accent)') + '22' }}
                >
                  {c.icon || '👥'}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-site-text">{c.name}</p>
                  <p className="truncate text-xs text-site-text-muted">
                    {c.memberCount} member{c.memberCount === 1 ? '' : 's'}
                    {c.description ? ` · ${c.description}` : ''}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Hot posts */}
      {data.hotPosts.length > 0 && (
        <section>
          <h2 className="px-4 pt-4 text-xs font-semibold uppercase tracking-wide text-site-text-dim">{t('hot-this-week', { defaultValue: 'Hot this week' })}</h2>
          <div className="divide-y divide-site-border">
            {data.hotPosts.map((item) => (
              <RMHarkCard key={item.id} item={item} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
