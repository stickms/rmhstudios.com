'use client';

import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';
import type { DigestLink, DigestPayload } from '@/lib/discovery/schema';

function Block({ title, items }: { title: string; items: DigestLink[] }) {
  if (!items.length) return null;
  return (
    <section>
      <h2 className="site-section-label mb-2">{title}</h2>
      <ul className="space-y-2">
        {items.map((it) => (
          <li key={it.href}>
            <Link
              to={it.href}
              className="glass-fill block rounded-site p-3 hover:bg-site-surface-hover"
            >
              <p className="text-sm text-site-text">{it.title}</p>
              {it.meta && <p className="mt-0.5 text-xs text-site-text-muted">{it.meta}</p>}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** /today - the daily front page, rendered from one snapshot row (A3). */
export function TodayPage({ digest }: { digest: DigestPayload }) {
  const { t } = useTranslation('f-discovery');
  const empty =
    !digest.topPosts.length &&
    !digest.newBuilds.length &&
    !digest.newLibrary.length &&
    !digest.news.length;
  return (
    <PageLayout
      title={t('today-title', { defaultValue: 'Today on RMH' })}
      description={t('today-desc', {
        day: digest.day,
        defaultValue: 'The last 24 hours on RMH Studios, as of {{day}}.',
      })}
    >
      <div className="space-y-5 px-4 pt-2 pb-12">
        {empty && (
          <p className="text-sm text-site-text-muted">
            {t('today-empty', { defaultValue: 'A quiet day so far. Check back tomorrow.' })}
          </p>
        )}
        <Block title={t('today-posts', { defaultValue: 'Top posts' })} items={digest.topPosts} />
        <Block title={t('today-builds', { defaultValue: 'New builds' })} items={digest.newBuilds} />
        <Block title={t('today-news', { defaultValue: 'News' })} items={digest.news} />
        <Block
          title={t('today-library', { defaultValue: 'New in the library' })}
          items={digest.newLibrary}
        />
        <Block
          title={t('today-tags', { defaultValue: 'Trending tags' })}
          items={digest.trendingTags}
        />
      </div>
    </PageLayout>
  );
}
