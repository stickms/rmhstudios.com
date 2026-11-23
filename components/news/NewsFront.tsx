import { Link, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';
import { PageTabs } from '@/components/feed/PageTabs';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { SearchField } from '@/components/ui/search-field';
import type { TabItem } from '@/components/ui/tabs';
import type { NewsFrontItem } from '@/lib/news';
import { NEWS_CATEGORIES, type NewsCategory } from '@/lib/news-wire/categorize';
import { NEWS_PUBLISHERS } from '@/lib/news-wire/sources';
import { categoryLabel, NewsMeta, NewsPicture } from './NewsParts';
import { NewsStoryRow } from './NewsStoryRow';

export interface NewsFrontData {
  items: NewsFrontItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface NewsFrontSearch {
  category?: NewsCategory;
  q?: string;
  page?: number;
}

/** How many headlines sit beside the lead story on the first page. */
const BESIDE_LEAD = 4;

/**
 * The RMH News front page. The first page of an unsearched view opens with a lead story (the newest headline that has
 * a picture) and four headlines beside it, divided by a vertical rule; everything after is rows on rules. Searches and
 * later pages are rows only. Categories are link tabs, the search is a GET form, pages are links: it all works with
 * scripting off.
 */
export function NewsFront({ data, search }: { data: NewsFrontData; search: NewsFrontSearch }) {
  const { t } = useTranslation('c-news');
  const navigate = useNavigate();
  const [query, setQuery] = useState(search.q ?? '');
  useEffect(() => setQuery(search.q ?? ''), [search.q]);

  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));
  const showLead = data.page === 1 && !search.q && data.items.length > BESIDE_LEAD + 1;
  const leadIndex = showLead ? data.items.findIndex((s) => Boolean(s.image)) : -1;
  const lead = leadIndex >= 0 ? data.items[leadIndex] : undefined;
  const rest = lead ? data.items.filter((_, i) => i !== leadIndex) : data.items;
  const beside = lead ? rest.slice(0, BESIDE_LEAD) : [];
  const latest = lead ? rest.slice(BESIDE_LEAD) : rest;

  const tabs: TabItem[] = [
    { id: 'all', label: t('tab-all', { defaultValue: 'Top stories' }) },
    ...NEWS_CATEGORIES.map((c) => ({ id: c, label: categoryLabel(t, c) })),
  ];

  const submitSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const q = query.trim();
    void navigate({
      to: '/news',
      search: { ...(search.category ? { category: search.category } : {}), ...(q ? { q } : {}) },
    });
  };

  const pageSearch = (page: number) => ({
    ...(search.category ? { category: search.category } : {}),
    ...(search.q ? { q: search.q } : {}),
    ...(page > 1 ? { page } : {}),
  });

  return (
    <PageLayout title={t('rmh-news-title', { defaultValue: 'RMH News' })} wide>
      <PageTabs
        tabs={tabs}
        value={search.category ?? 'all'}
        aria-label={t('categories-label', { defaultValue: 'News categories' })}
        renderTab={(tab, props) => (
          <Link
            to="/news"
            search={tab.id === 'all' ? {} : { category: tab.id as NewsCategory }}
            id={props.id}
            aria-current={props['aria-current']}
            className={`${props.className} min-h-11`}
          >
            {props.children}
          </Link>
        )}
        search={
          <form role="search" action="/news" method="get" onSubmit={submitSearch}>
            {search.category ? <input type="hidden" name="category" value={search.category} /> : null}
            <SearchField
              name="q"
              value={query}
              onValueChange={setQuery}
              placeholder={t('search-headlines-placeholder', { defaultValue: 'Search headlines' })}
              aria-label={t('search-label', { defaultValue: 'Search headlines' })}
            />
          </form>
        }
      />

      {data.items.length === 0 ? (
        search.q ? (
          <EmptyState
            title={t('empty-search-title', { defaultValue: 'No headlines match' })}
            description={t('empty-search-body', {
              defaultValue: 'Nothing in the last three weeks matches “{{q}}”. Try fewer or different words.',
              q: search.q,
            })}
          />
        ) : (
          <EmptyState
            title={t('empty-title', { defaultValue: 'No headlines yet' })}
            description={t('empty-body', {
              defaultValue: 'New headlines arrive every 20 minutes. Check back shortly.',
            })}
          />
        )
      ) : null}

      {lead ? (
        // The lead and its four neighbours sit side by side only where the column is wide enough for both (a container
        // query: the shell's margin column takes the room a viewport breakpoint would assume); otherwise they stack.
        // Stacked, a rule divides the lead from the rows under it (R3); side by side, the vertical rule does.
        <section aria-label={t('top-stories-label', { defaultValue: 'Top stories' })} className="@container">
          <div className="border-b border-site-border pb-6 @3xl:grid @3xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] @3xl:gap-6">
            <Link to="/news/$slug" params={{ slug: lead.slug }} className="group block space-y-3 pt-4 pb-6 @3xl:pb-0">
              <NewsPicture src={lead.image} className="aspect-[16/9] w-full" eager />
              <NewsMeta category={lead.category} publisher={lead.sourcePublisher} publishedAt={lead.publishedAt} />
              <h2 className="t-heading text-site-text group-hover:underline">{lead.title}</h2>
              {lead.description ? <p className="t-post text-site-text-muted">{lead.description}</p> : null}
            </Link>
            <ul className="border-t border-site-border @3xl:border-t-0 @3xl:border-s @3xl:ps-6">
              {beside.map((story) => (
                <NewsStoryRow key={story.slug} story={story} compact />
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      {latest.length > 0 ? (
        <section aria-labelledby={lead ? 'news-latest' : undefined} className={lead ? 'pt-6' : undefined}>
          {lead ? (
            <h2 id="news-latest" className="t-heading">
              {t('latest', { defaultValue: 'Latest' })}
            </h2>
          ) : null}
          <ul>
            {latest.map((story) => (
              <NewsStoryRow key={story.slug} story={story} />
            ))}
          </ul>
        </section>
      ) : null}

      {totalPages > 1 ? (
        <nav
          aria-label={t('pages-label', { defaultValue: 'Pages' })}
          className="flex items-center justify-between gap-4 border-t border-site-border py-4"
        >
          {data.page > 1 ? (
            <Button asChild>
              <Link to="/news" search={pageSearch(data.page - 1)}>
                {t('newer', { defaultValue: 'Newer' })}
              </Link>
            </Button>
          ) : (
            <span />
          )}
          <span className="t-meta">
            {t('page-of', { defaultValue: 'Page {{page}} of {{total}}', page: data.page, total: totalPages })}
          </span>
          {data.page < totalPages ? (
            <Button asChild>
              <Link to="/news" search={pageSearch(data.page + 1)}>
                {t('older', { defaultValue: 'Older' })}
              </Link>
            </Button>
          ) : (
            <span />
          )}
        </nav>
      ) : null}

      <p className="t-meta border-t border-site-border pt-4 pb-8">
        {t('attribution', {
          defaultValue:
            'Headlines, excerpts and pictures belong to their publishers: {{publishers}}. Every story links to the original. Summaries are written by AI from the original article when you open it.',
          publishers: NEWS_PUBLISHERS.join(', '),
        })}
      </p>
    </PageLayout>
  );
}
