/** The "Wiki" row on a community's page (s09-04): one rule-separated row with the number of pages. */
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { apiQuery } from '@/lib/contract/client';
import { listCommunityPagesApi } from '@/lib/communities/pages.contract';

export function WikiRow({ slug }: { slug: string }) {
  const { t } = useTranslation('community-wiki');
  const pages = useQuery({
    ...apiQuery(listCommunityPagesApi, { query: { communitySlug: slug } }),
    select: (data) => ('pages' in data ? data.pages.length : 0),
    staleTime: 60_000,
  });
  // The list is a 404 for anyone who may not read it (a private community, a banned member): no row then.
  if (pages.isError || pages.data === undefined) return null;
  return (
    <div className="border-y border-site-border px-4">
      <Link to={`/c/${slug}/wiki` as string} className="flex items-baseline justify-between gap-3 py-3">
        <span className="t-body font-medium">{t('row-title', { defaultValue: 'Wiki' })}</span>
        <span className="t-meta">
          {t('row-count', {
            count: pages.data,
            defaultValue_one: '{{count}} page',
            defaultValue_other: '{{count}} pages',
          })}
        </span>
      </Link>
    </div>
  );
}
