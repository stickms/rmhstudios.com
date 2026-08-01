'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from '@tanstack/react-router';
import { Sparkles } from 'lucide-react';
import { useSession } from '@/components/Providers';
import { Spinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { PostListSkeleton } from '@/components/ui/skeletons/PostCardSkeleton';
import { SearchHitSection, useKindHeading } from '@/components/search/SearchHitRow';
import {
  ExploreRecommendations,
  type DiscoveryOfficialBuild,
  type DiscoveryUserBuild,
  type DiscoveryBlogPost,
  type ExploreTab,
} from './ExploreRecommendations';
import { PageTabs } from './PageTabs';
import { SearchField } from '@/components/ui/search-field';
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
 * Opt-in "Ask AI" answer above the raw results. Kept behind a button (not fired
 * on every keystroke) so it only spends a model call when the user actually
 * wants a summarised answer. Grounded server-side in the same corpus the tabs
 * search. Hidden for logged-out visitors (the endpoint requires auth).
 */
function AISearchPanel({ query }: { query: string }) {
  const { t } = useTranslation('feed');
  const { data: session } = useSession();
  const [answer, setAnswer] = useState<string | null>(null);
  const [sourceCount, setSourceCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  // A new query invalidates any previous answer so the button reappears.
  useEffect(() => {
    setAnswer(null);
    setError(false);
    setLoading(false);
  }, [query]);

  const ask = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch('/api/ai/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ q: query }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      setAnswer(typeof data.answer === 'string' ? data.answer : '');
      setSourceCount(typeof data.sourceCount === 'number' ? data.sourceCount : 0);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [query]);

  if (!session) return null;

  return (
    <div className="border-b border-site-border px-4 py-3">
      {answer === null && !loading ? (
        <button
          onClick={ask}
          className="flex w-full items-center gap-2 rounded-site border border-site-border bg-site-surface px-3 py-2 text-left text-sm font-medium text-site-text transition-colors hover:bg-site-surface-hover"
        >
          <Sparkles className="h-4 w-4 shrink-0 text-site-accent" />
          <span className="truncate">
            {t('ask-ai-about', { query, defaultValue: 'Ask AI about “{{query}}”' })}
          </span>
        </button>
      ) : (
        <div className="rounded-site border border-site-border bg-site-surface px-3.5 py-3">
          <div className="mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-site-text-dim">
            <Sparkles className="h-3.5 w-3.5 text-site-accent" />
            {t('ai-answer', { defaultValue: 'AI answer' })}
          </div>
          {loading ? (
            <div className="flex items-center gap-2 py-1 text-sm text-site-text-muted">
              <Spinner size={14} /> {t('ai-thinking', { defaultValue: 'Reading the results…' })}
            </div>
          ) : error ? (
            <p className="text-sm text-site-text-muted">
              {t('ai-error', { defaultValue: 'Could not generate an answer. Try again.' })}
              {''}
              <button onClick={ask} className="text-site-accent hover:underline">
                {t('retry', { defaultValue: 'Retry' })}
              </button>
            </p>
          ) : (
            <>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-site-text">{answer}</p>
              {sourceCount > 0 && (
                <p className="mt-2 text-xs text-site-text-dim">
                  {t('ai-based-on', {
                    count: sourceCount,
                    defaultValue: 'Based on {{count}} results below',
                  })}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function SearchColumn({
  initialQuery = '',
  initialTab = 'top',
  officialBuilds = [],
  userBuilds = [],
  blogPosts = [],
}: {
  initialQuery?: string;
  initialTab?: SearchTab;
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

  // Persist the active tab to the URL (alongside any query) so the selection
  // survives refresh and is shareable, matching the rest of the app's tabs.
  const setTab = useCallback(
    (next: SearchTab) => {
      setTabState(next);
      void navigate({
        to: '/search',
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
      {/* Tabs first, then the field — the shared page order (`PageTabs`). This
 page used to invert it: the field sat above the tabs inside a sticky
 surface capsule that read as the page's header, which is why Explore was
 the one destination whose first row under the title was an input while its
 neighbours all showed tabs. The title is `PageLayout`'s now, so the capsule
 has nothing left to be, and the field is an ordinary control that filters
 within whichever tab is selected. */}
      <PageTabs
        tabs={SEARCH_TABS.map((id) => ({ id, label: tabLabel(id) }))}
        value={tab}
        onChange={(id) => setTab(id as SearchTab)}
        aria-label={t('search-categories-aria-label', { defaultValue: 'Search categories' })}
        search={
          <SearchField
            autoFocus
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

      {hasQuery && <AISearchPanel query={trimmed} />}

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
