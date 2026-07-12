'use client';

import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Hash, TrendingUp, Users, Package, BookOpen } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { RMHarkCard } from './RMHarkCard';
import { RevealGroup, RevealItem } from '@/components/motion';
import { Spinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { OptimizedImage } from '@/components/ui/OptimizedImage';
import type { FeedItem } from '@/lib/feed-types';
import { LIFT_CARD } from '@/components/feed/motionHelpers';

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

export interface DiscoveryOfficialBuild {
  id: string;
  title: string;
  thumbnailUrl: string | null;
  href: string;
  status?: string;
}

export interface DiscoveryUserBuild {
  id: string;
  slug: string;
  title: string;
  thumbnailUrl: string | null;
}

export interface DiscoveryBlogPost {
  slug: string;
  title: string;
  date: string;
}

export type ExploreTab = 'top' | 'people' | 'posts' | 'builds' | 'blog';

interface ExploreRecommendationsProps {
  /** Active search tab — discovery content is filtered to match it. */
  tab?: ExploreTab;
  officialBuilds?: DiscoveryOfficialBuild[];
  userBuilds?: DiscoveryUserBuild[];
  blogPosts?: DiscoveryBlogPost[];
}

/**
 * Discovery content shown on the Explore/Search page when no query is active.
 * The active tab filters which sections appear, so the tab bar stays functional
 * even before the user types: People → who to follow + communities, Posts →
 * trending tags + hot posts, Builds → builds to try, Blog → recent writing, and
 * Top shows the social discovery mix.
 */
export function ExploreRecommendations({
  tab = 'top',
  officialBuilds = [],
  userBuilds = [],
  blogPosts = [],
}: ExploreRecommendationsProps) {
  const { t } = useTranslation('feed');
  const [data, setData] = useState<ExploreData | null>(null);
  const [loading, setLoading] = useState(true);

  // The social discovery sections (trending/people/communities/hot) come from
  // /api/explore; the Builds and Blog tabs render from props, so they don't need
  // to wait on that request.
  const needsExploreData = tab === 'top' || tab === 'people' || tab === 'posts';

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

  const showTrending = tab === 'top' || tab === 'posts';
  const showPeople = tab === 'top' || tab === 'people';
  const showCommunities = tab === 'top' || tab === 'people';
  const showHot = tab === 'top' || tab === 'posts';
  const showBuilds = tab === 'builds';
  const showBlog = tab === 'blog';

  if (needsExploreData && loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }

  const builds = [...officialBuilds, ...userBuilds];

  return (
    <RevealGroup as="div">
      {/* Trending tags */}
      {showTrending && data && data.trendingTags.length > 0 && (
        <RevealItem as="section" className="border-b border-site-border p-4">
          <h2 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-site-text-dim">
            <TrendingUp className="h-3.5 w-3.5" /> {t('trending-heading', { defaultValue: 'Trending' })}
          </h2>
          <div className="flex flex-wrap gap-2">
            {data.trendingTags.map((tag) => (
              <Link
                key={tag.tag}
                to={`/tag/${tag.tag}` as string}
                className="inline-flex items-center gap-1 rounded-full border border-site-border bg-site-surface px-3 py-1 text-sm text-site-text transition-colors duration-200 hover:border-site-accent/50"
              >
                <Hash className="h-3 w-3 text-site-accent" />
                {tag.tag}
                <span className="text-xs text-site-text-dim">{tag.count}</span>
              </Link>
            ))}
          </div>
        </RevealItem>
      )}

      {/* Who to follow */}
      {showPeople && data && data.suggestedUsers.length > 0 && (
        <RevealItem as="section" className="border-b border-site-border p-4">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-site-text-dim">{t('who-to-follow', { defaultValue: 'Who to follow' })}</h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {data.suggestedUsers.map((u) => (
              <Link
                key={u.id}
                to={`/u/${u.handle || u.id}` as string}
                className={`flex items-center gap-3 rounded-site border border-site-border bg-site-surface p-2.5 ${LIFT_CARD}`}
              >
                <UserAvatar src={u.image} alt={u.name || t('user-alt', { defaultValue: 'User' })} size={36} fallbackName={u.name || 'U'} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-site-text">{u.name || u.handle}</p>
                  <p className="truncate text-xs text-site-text-muted">{t('follower-count', { count: u.followerCount, defaultValue: '{{count}} followers' })}</p>
                </div>
              </Link>
            ))}
          </div>
        </RevealItem>
      )}

      {/* Communities to discover */}
      {showCommunities && data && data.communities.length > 0 && (
        <RevealItem as="section" className="border-b border-site-border p-4">
          <h2 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-site-text-dim">
            <Users className="h-3.5 w-3.5" /> {t('communities-heading', { defaultValue: 'Communities' })}
          </h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {data.communities.map((c) => (
              <Link
                key={c.id}
                to={`/c/${c.slug}` as string}
                className={`flex items-center gap-3 rounded-site border border-site-border bg-site-surface p-2.5 ${LIFT_CARD}`}
              >
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-site text-xl"
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
        </RevealItem>
      )}

      {/* Builds to try */}
      {showBuilds && (
        builds.length > 0 ? (
          <RevealItem as="section" className="p-4">
            <h2 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-site-text-dim">
              <Package className="h-3.5 w-3.5" /> {t('builds-heading', { defaultValue: 'Builds to try' })}
            </h2>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {officialBuilds.map((b) => (
                <a
                  key={b.id}
                  href={b.href}
                  className={`flex items-center gap-3 rounded-site border border-site-border bg-site-surface p-2.5 ${LIFT_CARD}`}
                >
                  <BuildThumb src={b.thumbnailUrl} title={b.title} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-site-text">{b.title}</p>
                    <p className="truncate text-xs text-site-text-muted">{b.status || t('official-build', { defaultValue: 'Official build' })}</p>
                  </div>
                </a>
              ))}
              {userBuilds.map((b) => (
                <Link
                  key={b.id}
                  to={`/user-builds/${b.slug}` as string}
                  className={`flex items-center gap-3 rounded-site border border-site-border bg-site-surface p-2.5 ${LIFT_CARD}`}
                >
                  <BuildThumb src={b.thumbnailUrl} title={b.title} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-site-text">{b.title}</p>
                    <p className="truncate text-xs text-site-text-muted">{t('community-build', { defaultValue: 'Community build' })}</p>
                  </div>
                </Link>
              ))}
            </div>
          </RevealItem>
        ) : (
          <EmptyState description={t('search-builds-hint', { defaultValue: 'Type to search games, apps, and community builds.' })} />
        )
      )}

      {/* Blog to read */}
      {showBlog && (
        blogPosts.length > 0 ? (
          <RevealItem as="section" className="py-2">
            <h2 className="flex items-center gap-1.5 px-4 py-1 text-xs font-semibold uppercase tracking-wide text-site-text-dim">
              <BookOpen className="h-3.5 w-3.5" /> {t('blog-heading', { defaultValue: 'From the blog' })}
            </h2>
            {blogPosts.map((p) => (
              <Link
                key={p.slug}
                to={`/blog/${p.slug}` as string}
                className="flex items-start gap-3 px-4 py-2.5 transition-colors hover:bg-site-surface-hover"
              >
                <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-site-accent" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-site-text">{p.title}</p>
                  <p className="truncate text-xs text-site-text-muted">{new Date(p.date).toLocaleDateString()}</p>
                </div>
              </Link>
            ))}
          </RevealItem>
        ) : (
          <EmptyState description={t('search-blog-hint', { defaultValue: 'Type to search the blog.' })} />
        )
      )}

      {/* Hot posts — feed cards keep their own entrance; the block reveals once. */}
      {showHot && data && data.hotPosts.length > 0 && (
        <RevealItem as="section">
          <h2 className="px-4 pt-4 text-xs font-semibold uppercase tracking-wide text-site-text-dim">{t('hot-this-week', { defaultValue: 'Hot this week' })}</h2>
          <div className="divide-y divide-site-border">
            {data.hotPosts.map((item) => (
              <RMHarkCard key={item.id} item={item} />
            ))}
          </div>
        </RevealItem>
      )}

      {/* Nothing to show for the social tabs (no data yet). */}
      {needsExploreData && !data && (
        <EmptyState description={t('explore-empty-hint', { defaultValue: 'Start typing to search across people, posts, builds, and the blog.' })} />
      )}
    </RevealGroup>
  );
}

function BuildThumb({ src, title }: { src: string | null; title: string }) {
  if (!src) {
    return (
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-site bg-site-surface-hover text-sm font-bold text-site-text/70">
        {title.slice(0, 1).toUpperCase()}
      </div>
    );
  }
  return (
    <div className="h-10 w-10 shrink-0 overflow-hidden rounded-site bg-site-bg">
      <OptimizedImage src={src} alt={title} width={40} height={40} className="h-full w-full object-cover" />
    </div>
  );
}
