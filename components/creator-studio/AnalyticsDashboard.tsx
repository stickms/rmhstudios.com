'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye, Heart, MessageCircle, Repeat2, Users, FileText, TrendingUp } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { Spinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { formatCount } from '@/lib/utils';

interface Analytics {
  summary: {
    posts: number;
    impressions: number;
    likes: number;
    comments: number;
    reposts: number;
    engagementRate: number;
  };
  followerCount: number;
  daily: { date: string; posts: number }[];
  topPosts: {
    id: string;
    content: string;
    createdAt: string;
    views: number;
    likes: number;
    comments: number;
    reposts: number;
  }[];
}

export function AnalyticsDashboard() {
  const { t } = useTranslation('feed');
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch('/api/profile/analytics')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: Analytics) => {
        if (alive) setData(d);
      })
      .catch(() => alive && setFailed(true))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }

  if (failed || !data) {
    return (
      <div className="py-12">
        <EmptyState
          icon={TrendingUp}
          title={t('analytics-unavailable', { defaultValue: 'Analytics unavailable' })}
          description={t('analytics-unavailable-desc', { defaultValue: 'We could not load your analytics. Please try again later.' })}
        />
      </div>
    );
  }

  const { summary } = data;
  const maxDaily = Math.max(1, ...data.daily.map((d) => d.posts));
  const engagementPct = (summary.engagementRate * 100).toFixed(1);

  const tiles = [
    { icon: Eye, label: t('impressions', { defaultValue: 'Impressions' }), value: summary.impressions },
    { icon: Heart, label: t('likes', { defaultValue: 'Likes' }), value: summary.likes },
    { icon: MessageCircle, label: t('comments', { defaultValue: 'Comments' }), value: summary.comments },
    { icon: Repeat2, label: t('reposts', { defaultValue: 'Reposts' }), value: summary.reposts },
    { icon: FileText, label: t('posts', { defaultValue: 'Posts' }), value: summary.posts },
    { icon: Users, label: t('followers-label', { defaultValue: 'Followers' }), value: data.followerCount },
  ];

  return (
    <div className="space-y-[var(--site-section-gap)]">
      {/* Summary tiles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {tiles.map(({ icon: Icon, label, value }) => (
          <div key={label} className="glass-fill rounded-site px-4 py-3">
            <div className="flex items-center gap-2 text-site-text-dim">
              <Icon className="size-4" aria-hidden="true" />
              <span className="text-xs font-medium">{label}</span>
            </div>
            <p className="mt-2 text-2xl font-bold text-site-text">{formatCount(value)}</p>
          </div>
        ))}
      </div>

      {/* Engagement rate */}
      <div className="glass-fill rounded-site px-4 py-3">
        <div className="flex items-center gap-2 text-site-text-dim">
          <TrendingUp className="size-4" aria-hidden="true" />
          <span className="text-xs font-medium">
            {t('engagement-rate', { defaultValue: 'Engagement rate' })}
          </span>
        </div>
        <p className="mt-2 text-2xl font-bold text-site-text">{engagementPct}%</p>
        <p className="text-xs text-site-text-dim">
          {t('engagement-rate-desc', { defaultValue: 'Interactions ÷ impressions across all your posts' })}
        </p>
      </div>

      {/* Posts-per-day chart (last 30 days) */}
      <div className="glass-fill rounded-site px-4 py-3">
        <h2 className="site-section-label mb-3">
          {t('posts-last-30-days', { defaultValue: 'Posts in the last 30 days' })}
        </h2>
        <div className="flex h-28 items-end gap-1" role="img" aria-label={t('posts-per-day-chart', { defaultValue: 'Posts per day, last 30 days' })}>
          {data.daily.map((d) => (
            <div
              key={d.date}
              className="flex-1 rounded-t-sm bg-site-accent/70 transition-colors hover:bg-site-accent"
              style={{ height: `${Math.max(3, (d.posts / maxDaily) * 100)}%` }}
              title={`${d.date}: ${d.posts}`}
            />
          ))}
        </div>
      </div>

      {/* Top posts */}
      <div>
        <h2 className="site-section-label mb-3">
          {t('top-posts', { defaultValue: 'Top posts by impressions' })}
        </h2>
        {data.topPosts.length === 0 ? (
          <p className="text-sm text-site-text-dim">{t('no-posts-yet', { defaultValue: 'No posts yet. Be the first!' })}</p>
        ) : (
          <ul className="space-y-3">
            {data.topPosts.map((p) => (
              <li key={p.id}>
                <Link
                  to="/u/$userid/post/$postid"
                  params={{ userid: '_', postid: p.id }}
                  className="glass-fill glass-interactive block rounded-site px-4 py-3"
                >
                  <p className="line-clamp-2 text-sm text-site-text">
                    {p.content || t('no-text-post', { defaultValue: '(media post)' })}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-4 text-xs text-site-text-dim">
                    <span className="inline-flex items-center gap-2"><Eye aria-hidden className="size-3.5" />{formatCount(p.views)}</span>
                    <span className="inline-flex items-center gap-2"><Heart aria-hidden className="size-3.5" />{formatCount(p.likes)}</span>
                    <span className="inline-flex items-center gap-2"><MessageCircle aria-hidden className="size-3.5" />{formatCount(p.comments)}</span>
                    <span className="inline-flex items-center gap-2"><Repeat2 aria-hidden className="size-3.5" />{formatCount(p.reposts)}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
