import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ExternalLink } from 'lucide-react';
import type { NewsItem } from '@/lib/elections/news';
import { stateName } from '@/lib/elections/states';
import { timeAgo, useNow } from './hooks';

interface NewsResponse {
  items: NewsItem[];
  sources: { ok: number; total: number };
}

/**
 * Election headlines from public RSS feeds. Headline and a short snippet only; every item links to its
 * publisher in a new tab. Follows the selected state when there is one.
 */
export function NewsWire({ state, live }: { state: string | null; live: boolean }) {
  const { t } = useTranslation('c-elections');
  const now = useNow(30_000);
  const [onlyState, setOnlyState] = useState(true);
  const scoped = Boolean(state) && onlyState;

  const { data, isError } = useQuery<NewsResponse>({
    queryKey: ['elections-news', scoped ? state : '*'],
    queryFn: async () => {
      const r = await fetch(`/api/elections/news${scoped ? `?state=${state}` : ''}`);
      if (!r.ok) throw new Error(String(r.status));
      return r.json();
    },
    refetchInterval: live ? 45_000 : 5 * 60_000,
    staleTime: 20_000,
    retry: 1,
  });

  return (
    <div>
      {state ? (
        <div className="el-pick-row" role="group" aria-label={t('wire.scope', { defaultValue: 'Headline scope' })}>
          <button type="button" className="el-btn el-btn--sm" aria-pressed={scoped} onClick={() => setOnlyState(true)}>
            {stateName(state)}
          </button>
          <button type="button" className="el-btn el-btn--sm" aria-pressed={!scoped} onClick={() => setOnlyState(false)}>
            {t('wire.all', { defaultValue: 'Everywhere' })}
          </button>
        </div>
      ) : null}

      {isError ? (
        <p className="el-eyebrow">{t('wire.error', { defaultValue: 'Headlines are unavailable right now.' })}</p>
      ) : !data ? (
        <div className="el-box el-skel" aria-busy />
      ) : data.items.length === 0 ? (
        <p className="el-eyebrow">{t('wire.empty', { defaultValue: 'No election headlines yet.' })}</p>
      ) : (
        <ul className="el-desk__list el-box el-proj" style={{ margin: 0 }} aria-label={t('wire.label', { defaultValue: 'Election headlines' })}>
          {data.items.slice(0, 14).map((n) => (
            <li key={n.id}>
              <a href={n.url} target="_blank" rel="noopener noreferrer nofollow" style={{ textDecoration: 'none' }}>
                <span className="el-eyebrow" style={{ display: 'block', marginBottom: 2 }}>
                  {n.source} · {timeAgo(n.publishedAt, now)}
                </span>
                {n.title} <ExternalLink size={12} aria-hidden style={{ verticalAlign: -1 }} />
              </a>
              {n.snippet ? <span style={{ display: 'block', fontWeight: 500, fontSize: 14, marginTop: 2 }}>{n.snippet}</span> : null}
            </li>
          ))}
        </ul>
      )}
      {data ? (
        <p className="el-eyebrow" style={{ marginTop: 12 }}>
          {t('wire.sources', { defaultValue: '{{ok}} of {{total}} news feeds answering. Headlines link to the publisher.', ok: data.sources.ok, total: data.sources.total })}
        </p>
      ) : null}
    </div>
  );
}
