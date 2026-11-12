import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/contract/client';
import { exploreApi } from '@/lib/discovery/explore.contract';
import { useIdleReady } from '@/hooks/useIdleReady';

const TTL = 5 * 60_000;

/**
 * The margin's two short lists (Steel L6): what is trending and who to follow, each under a `t-label` heading, rows on
 * rules, no pictures. It loads after the main column, once the browser is idle, from the Explore data the old live rail
 * used, and only at a width that displays the margin (MarginColumn).
 */
export default function MarginLists() {
  const { t } = useTranslation('feed');
  const idle = useIdleReady();
  // Supplementary: a failure leaves the lists out. The cache is shared across pages, so a client navigation re-uses it.
  const { data } = useQuery({
    queryKey: ['shell-margin-explore'],
    queryFn: ({ signal }) => api(exploreApi, { signal }),
    enabled: idle,
    staleTime: TTL,
    retry: false,
  });
  const tags = data?.trendingTags?.slice(0, 5) ?? [];
  const people = data?.suggestedUsers?.slice(0, 3) ?? [];

  return (
    <>
      {tags.length > 0 && (
        <section className="site-margin__group">
          <h2 className="t-label">{t('trending', { defaultValue: 'Trending' })}</h2>
          <ul className="site-margin__list">
            {tags.map((entry) => (
              <li key={entry.tag}>
                <Link to={`/tag/${entry.tag}` as string} className="site-margin__row">
                  <span>#{entry.tag}</span>
                  <span className="t-meta">{entry.count}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      {people.length > 0 && (
        <section className="site-margin__group">
          <h2 className="t-label">{t('who-to-follow', { defaultValue: 'Who to follow' })}</h2>
          <ul className="site-margin__list">
            {people.map((person) => (
              <li key={person.id}>
                <Link to={`/u/${person.handle || person.id}` as string} className="site-margin__row">
                  <span>{person.name || person.handle}</span>
                  {person.handle && <span className="t-meta">@{person.handle}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
