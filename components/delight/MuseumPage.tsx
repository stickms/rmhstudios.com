'use client';

import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Landmark } from 'lucide-react';
import { PageLayout } from '@/components/feed/PageLayout';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { fetchJson } from '@/lib/http';

interface Era {
  id: string;
  eraDate: string;
  title: string;
  body: string;
  imageUrl: string | null;
}

/** Z3 — /museum: the site's eras, newest first. */
export function MuseumPage() {
  const { t } = useTranslation('f-delight');
  const q = useQuery({
    queryKey: ['delight', 'museum'],
    queryFn: () => fetchJson<{ eras: Era[] }>('/api/museum'),
    staleTime: 5 * 60_000,
  });
  return (
    <PageLayout
      title={t('museum-title', { defaultValue: 'Site museum' })}
      description={t('museum-desc', {
        defaultValue: 'How the site has looked and grown, era by era.',
      })}
    >
      <div className="px-4 pt-2 pb-12">
        {q.isPending ? (
          <Skeleton className="h-48 w-full" />
        ) : !q.data?.eras.length ? (
          <EmptyState
            icon={Landmark}
            title={t('museum-empty', { defaultValue: 'The museum is still being curated' })}
          />
        ) : (
          <ol className="space-y-4 border-s border-site-border ps-4">
            {q.data.eras.map((e) => (
              <li key={e.id} className="glass-fill space-y-2 rounded-site p-4">
                <time
                  className="text-xs font-semibold uppercase tracking-wide text-site-text-dim"
                  dateTime={e.eraDate}
                >
                  {new Date(`${e.eraDate}T00:00:00Z`).toLocaleDateString(undefined, {
                    year: 'numeric',
                    month: 'long',
                    timeZone: 'UTC',
                  })}
                </time>
                <h2 className="text-lg font-semibold text-site-text">{e.title}</h2>
                {e.imageUrl && (
                  <img
                    src={e.imageUrl}
                    alt={t('museum-shot', {
                      defaultValue: 'Screenshot: {{title}}',
                      title: e.title,
                    })}
                    loading="lazy"
                    className="w-full rounded-site"
                  />
                )}
                <p className="whitespace-pre-line text-sm text-site-text-muted">{e.body}</p>
              </li>
            ))}
          </ol>
        )}
      </div>
    </PageLayout>
  );
}
