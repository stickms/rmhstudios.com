'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from '@tanstack/react-router';
import { Spinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { PostListSkeleton } from '@/components/ui/skeletons/PostCardSkeleton';
import { SearchHitSection, useKindHeading } from '@/components/search/SearchHitRow';
import { ExploreAsk } from './ExploreAsk';
import {
  ExploreRecommendations,
  type DiscoveryData,
  type DiscoveryOfficialBuild,
  type DiscoveryUserBuild,
  type DiscoveryBlogPost,
  type ExploreTab,
} from './ExploreRecommendations';
import { PageTabs } from './PageTabs';
import { SearchField } from '@/components/ui/search-field';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import {
  SEARCH_TAB_KINDS,
  SEARCH_TABS,
  type SearchHit,
  type SearchResponse,
  type SearchTab,
} from '@/lib/search/types';

/** Tabs the discovery panel understands; the rest fall back to its `top` mix. */
const EXPLORE_TABS: ReadonlySet<string> = new Set(['top', 'people', 'posts', 'builds', 'blog']);

const EMPTY: SearchResponse = {
  people: [],
  posts: [],
  builds: [],
  blog: [],
  top: [],
  groups: {},
  meta: { normalized: '', topScore: 0, confidence: 'low', total: 0 },
};

/**
 * Debounce before searching, and the extra pause before spending a model call.
 * The assist pass is deliberately a *second* request: a query mid-typing looks
 * "weak" on every keystroke, and paying for expansion each time would make the
 * fast path as slow as the slow one.
 */
const SEARCH_DEBOUNCE_MS = 250;
const ASSIST_DELAY_MS = 500;
/** Below this many hits, a weak query is worth a model-assisted retry. */
const ASSIST_RESULT_THRESHOLD = 3;

/**
 * Tab labels, one static `t()` call each.
 *
 * A computed key (``t(`tab-${id}`)``) is invisible to `i18next-parser`, so the
 * key never reaches `locales/` and every non-English locale quietly serves the
 * English default. The four `tab-*` keys that already existed were only in the
 * catalog because older code happened to call them statically elsewhere.
 */
function useTabLabel(): (tab: SearchTab) => string {
  const { t } = useTranslation('feed');
  return (tab) => {
    switch (tab) {
      case 'top':
        return t('tab-top', { defaultValue: 'Top' });
      case 'people':
        return t('tab-people', { defaultValue: 'People' });
      case 'posts':
        return t('tab-posts', { defaultValue: 'Posts' });
      case 'builds':
        return t('tab-builds', { defaultValue: 'Builds' });
      case 'blog':
        return t('tab-writing', { defaultValue: 'Writing' });
      case 'library':
        return t('tab-library', { defaultValue: 'Library' });
      case 'places':
        return t('tab-places', { defaultValue: 'Games & Apps' });
    }
  };
}

/**
 * The Explore column: discovery when there is no query, results when there is,
 * and the AI slot between the field and both.
 *
 * This is the merged page. Explore and Search were two destinations doing one
 * job — both titled "Explore", one reachable from the nav and one only from the
 * 404 page, with overlapping recommendations, two AI boxes and a search field
 * on the one that the nav did NOT link to. `/search` is a redirect now, and the
 * field, the tabs and the recommendations all live here: typing filters, and
 * clearing the field puts discovery back.
 */
export function ExploreColumn({
  initialQuery = '',
  initialTab = 'top',
  discovery,
  officialBuilds = [],
  userBuilds = [],
  blogPosts = [],
}: {
  initialQuery?: string;
  initialTab?: SearchTab;
  /** Discovery payload prefetched by the route loader (SSR at first paint). */
  discovery?: DiscoveryData | null;
  officialBuilds?: DiscoveryOfficialBuild[];
  userBuilds?: DiscoveryUserBuild[];
  blogPosts?: DiscoveryBlogPost[];
}) {
  const { t } = useTranslation('feed');
  const tabLabel = useTabLabel();
  const kindHeading = useKindHeading();
  const navigate = useNavigate();
  const [query, setQuery] = useState(initialQuery);
  const [tab, setTabState] = useState<SearchTab>(initialTab);
  const [results, setResults] = useState<SearchResponse>(EMPTY);
  const [loading, setLoading] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guards the assist pass so a query is only ever expanded once.
  const assisted = useRef<string | null>(null);
  // Discards responses that arrive after a newer request was issued.
  const requestId = useRef(0);

  /**
   * Focus the field only where a keyboard is already attached.
   *
   * `autoFocus` was right for a page whose only purpose was searching. This one
   * is also the browse destination — the nav's "Explore" — so on a phone that
   * same prop would throw the on-screen keyboard over the recommendations
   * someone came to read, on every visit. Imperative rather than a conditional
   * `autoFocus` because the prop only acts on the initial mount, and the media
   * query does not resolve until after hydration (`useMediaQuery` reports false
   * on the server so it can't mismatch).
   */
  const fieldRef = useRef<HTMLInputElement | null>(null);
  const hasKeyboard = useMediaQuery('(pointer: fine)');
  useEffect(() => {
    if (hasKeyboard) fieldRef.current?.focus();
  }, [hasKeyboard]);

  // Persist the active tab to the URL (alongside any query) so the selection
  // survives refresh and is shareable, matching the rest of the app's tabs.
  const setTab = useCallback(
    (next: SearchTab) => {
      setTabState(next);
      void navigate({
        to: '/explore',
        search: (prev) => ({ ...prev, q: prev.q ?? '', tab: next }),
        replace: true,
      });
    },
    [navigate],
  );

  const run = useCallback(async (q: string, type: SearchTab, assist: boolean) => {
    if (q.trim().length < 2) {
      setResults(EMPTY);
      return;
    }
    const id = ++requestId.current;
    setLoading(true);
    try {
      const params = new URLSearchParams({ q, tab: type });
      if (assist) params.set('assist', '1');
      const res = await fetch(`/api/search?${params}`, { credentials: 'include' });
      if (!res.ok) return;
      const data: SearchResponse = await res.json();
      // A slower earlier request must not overwrite a newer one's results.
      if (id === requestId.current) setResults(data);
    } catch {
      // Offline or aborted — keep whatever is on screen.
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => run(query, tab, false), SEARCH_DEBOUNCE_MS);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [query, tab, run]);

  // Second pass: when the lexical search came back thin, give the server
  // permission to spend a model call widening the query. Only after the user has
  // stopped typing, and only once per query+tab.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2 || loading) return;
    const weak = results.meta.confidence === 'low' || results.meta.total < ASSIST_RESULT_THRESHOLD;
    if (!weak || results.meta.expandedWith) return;
    const key = `${tab}:${q}`;
    if (assisted.current === key) return;
    const timer = setTimeout(() => {
      assisted.current = key;
      void run(q, tab, true);
    }, ASSIST_DELAY_MS);
    return () => clearTimeout(timer);
  }, [query, tab, loading, results.meta, run]);

  const trimmed = query.trim();
  const hasQuery = trimmed.length >= 2;
  const { meta, top, groups } = results;

  // Top interleaves every corpus by score; a focused tab renders its kinds as
  // labelled sections in the order declared by SEARCH_TAB_KINDS.
  const sections = useMemo(() => {
    if (tab === 'top') return [];
    return SEARCH_TAB_KINDS[tab]
      .map((kind) => ({ kind, hits: groups[kind] ?? [] }))
      .filter((s) => s.hits.length > 0);
  }, [tab, groups]);

  // The Top tab separates confident hits from the tail, so "we found something
  // exact" and "this is the closest we have" don't read as one flat list.
  const { strong, weak } = useMemo(() => {
    const s: SearchHit[] = [];
    const w: SearchHit[] = [];
    for (const hit of top) (hit.confidence === 'low' ? w : s).push(hit);
    return { strong: s, weak: w };
  }, [top]);

  const hasResults = tab === 'top' ? top.length > 0 : sections.length > 0;
  const exploreTab: ExploreTab = (EXPLORE_TABS.has(tab) ? tab : 'top') as ExploreTab;

  return (
    <div className="min-h-screen">
      {/* Tabs first, then the field — the shared page order (`PageTabs`). The
          field is an ordinary control that filters within whichever tab is
          selected, not the page's header; the title is `PageLayout`'s. */}
      <PageTabs
        tabs={SEARCH_TABS.map((id) => ({ id, label: tabLabel(id) }))}
        value={tab}
        onChange={(id) => setTab(id as SearchTab)}
        aria-label={t('search-categories-aria-label', { defaultValue: 'Search categories' })}
        search={
          <SearchField
            ref={fieldRef}
            value={query}
            onValueChange={setQuery}
            aria-label={t('search-input-aria-label', {
              defaultValue: 'Search people, posts, builds, and blog',
            })}
            placeholder={t('search-placeholder-universal', {
              defaultValue: 'Search anything — people, posts, games, writing…',
            })}
            trailing={loading ? <Spinner size={16} className="text-site-text-dim" /> : undefined}
          />
        }
      />

      {/* One AI slot, two forms — see `ExploreAsk`. */}
      <ExploreAsk query={hasQuery ? trimmed : ''} />

      {/* "Did you mean" — offered whenever the best match is not convincing, so
          a near-miss (a typo, or the wrong name for a game) is one tap from the
          right query instead of a dead end. */}
      {hasQuery && meta.suggestion && (
        <div className="border-b border-site-border px-4 py-2 text-sm text-site-text-muted">
          {t('search-did-you-mean', { defaultValue: 'Did you mean' })}{' '}
          <button
            onClick={() => setQuery(meta.suggestion!)}
            className="font-semibold text-site-accent hover:underline"
          >
            {meta.suggestion}
          </button>
        </div>
      )}

      {!hasQuery ? (
        <ExploreRecommendations
          tab={exploreTab}
          initialData={discovery}
          officialBuilds={officialBuilds}
          userBuilds={userBuilds}
          blogPosts={blogPosts}
        />
      ) : loading && !hasResults ? (
        <PostListSkeleton count={6} />
      ) : !hasResults && !loading ? (
        <EmptyState
          description={t('no-results', {
            query: trimmed,
            defaultValue: 'No results for "{{query}}".',
          })}
        />
      ) : (
        <div className="divide-y divide-site-border">
          {tab === 'top' ? (
            <>
              <SearchHitSection hits={strong} />
              <SearchHitSection
                heading={t('search-less-certain', { defaultValue: 'Less certain matches' })}
                hits={weak}
              />
            </>
          ) : (
            sections.map(({ kind, hits }) => (
              <SearchHitSection
                key={kind}
                heading={
                  // A single-kind tab is already labelled by the tab itself.
                  sections.length > 1 ? kindHeading(kind) : undefined
                }
                hits={hits}
                showKind={sections.length > 1}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
