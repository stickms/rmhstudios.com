'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from '@tanstack/react-router';
import { Search, Package, BookOpen, Sparkles } from 'lucide-react';
import { useSession } from '@/components/Providers';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { Spinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { PostListSkeleton } from '@/components/ui/skeletons/PostCardSkeleton';
import {
  ExploreRecommendations,
  type DiscoveryOfficialBuild,
  type DiscoveryUserBuild,
  type DiscoveryBlogPost,
} from './ExploreRecommendations';

interface SearchUser {
  id: string;
  name: string | null;
  image: string | null;
  handle: string | null;
}
interface SearchResults {
  people: SearchUser[];
  posts: { id: string; content: string; createdAt: string; likeCount: number; user: SearchUser }[];
  builds: { slug: string; title: string; description: string }[];
  blog: { slug: string; title: string; description: string }[];
}

type Tab = 'top' | 'people' | 'posts' | 'builds' | 'blog';
const TABS: { id: Tab; label: string }[] = [
  { id: 'top', label: 'Top' },
  { id: 'people', label: 'People' },
  { id: 'posts', label: 'Posts' },
  { id: 'builds', label: 'Builds' },
  { id: 'blog', label: 'Blog' },
];

const EMPTY: SearchResults = { people: [], posts: [], builds: [], blog: [] };

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
              {t('ai-error', { defaultValue: 'Could not generate an answer. Try again.' })}{' '}
              <button onClick={ask} className="text-site-accent hover:underline">
                {t('retry', { defaultValue: 'Retry' })}
              </button>
            </p>
          ) : (
            <>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-site-text">{answer}</p>
              {sourceCount > 0 && (
                <p className="mt-2 text-xs text-site-text-dim">
                  {t('ai-based-on', { count: sourceCount, defaultValue: 'Based on {{count}} results below' })}
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
  initialTab?: Tab;
  officialBuilds?: DiscoveryOfficialBuild[];
  userBuilds?: DiscoveryUserBuild[];
  blogPosts?: DiscoveryBlogPost[];
}) {
  const { t } = useTranslation('feed');
  const navigate = useNavigate();
  const [query, setQuery] = useState(initialQuery);
  const [tab, setTabState] = useState<Tab>(initialTab);
  const [results, setResults] = useState<SearchResults>(EMPTY);
  const [loading, setLoading] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Persist the active tab to the URL (alongside any query) so the selection
  // survives refresh and is shareable, matching the rest of the app's tabs.
  const setTab = useCallback(
    (next: Tab) => {
      setTabState(next);
      void navigate({ to: '/search', search: (prev) => ({ ...prev, tab: next }), replace: true });
    },
    [navigate],
  );

  const run = useCallback(async (q: string, type: Tab) => {
    if (q.trim().length < 2) {
      setResults(EMPTY);
      return;
    }
    setLoading(true);
    try {
      const apiType = type === 'top' ? 'all' : type;
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&type=${apiType}`, { credentials: 'include' });
      if (res.ok) setResults(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => run(query, tab), 250);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [query, tab, run]);

  const showPeople = tab === 'top' || tab === 'people';
  const showPosts = tab === 'top' || tab === 'posts';
  const showBuilds = tab === 'top' || tab === 'builds';
  const showBlog = tab === 'top' || tab === 'blog';
  const hasResults =
    results.people.length || results.posts.length || results.builds.length || results.blog.length;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-site-border bg-site-bg/80 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-2 rounded-full border border-site-border bg-site-surface px-4 py-2">
          <Search className="h-4 w-4 text-site-text-muted" />
          <input
            autoFocus
            type="search"
            aria-label={t('search-input-aria-label', { defaultValue: 'Search people, posts, builds, and blog' })}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('search-placeholder', { defaultValue: 'Search people, posts, builds…' })}
            className="w-full bg-transparent text-sm text-site-text placeholder:text-site-text-dim focus:outline-none"
          />
          {loading && <Spinner size={16} className="text-site-text-muted" />}
        </div>
        <div className="mt-3 flex flex-nowrap gap-1 overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist" aria-label={t('search-categories-aria-label', { defaultValue: 'Search categories' })}>
          {TABS.map((tab_item) => (
            <button
              key={tab_item.id}
              role="tab"
              aria-selected={tab === tab_item.id}
              onClick={() => setTab(tab_item.id)}
              className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                tab === tab_item.id
                  ? 'bg-site-accent text-site-accent-fg'
                  : 'text-site-text-muted hover:bg-site-surface hover:text-site-text'
              }`}
            >
              {t(`tab-${tab_item.id}`, { defaultValue: tab_item.label })}
            </button>
          ))}
        </div>
      </header>

      {query.trim().length >= 2 && <AISearchPanel query={query.trim()} />}

      {query.trim().length < 2 ? (
        <ExploreRecommendations
          tab={tab}
          officialBuilds={officialBuilds}
          userBuilds={userBuilds}
          blogPosts={blogPosts}
        />
      ) : loading && !hasResults ? (
        <PostListSkeleton count={6} />
      ) : !hasResults && !loading ? (
        <EmptyState description={t('no-results', { query, defaultValue: 'No results for "{{query}}".' })} />
      ) : (
        <div className="divide-y divide-site-border">
          {showPeople && results.people.length > 0 && (
            <section className="py-2">
              {tab === 'top' && <h2 className="px-4 py-1 text-xs font-semibold uppercase text-site-text-dim">{t('tab-people', { defaultValue: 'People' })}</h2>}
              {results.people.map((u) => (
                <Link
                  key={u.id}
                  to={`/u/${u.handle || u.id}` as string}
                  className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-site-surface-hover"
                >
                  <UserAvatar src={u.image} alt={u.name || 'User'} size={40} fallbackName={u.name || 'U'} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-site-text">{u.name || u.handle}</p>
                    {u.handle && <p className="truncate text-xs text-site-text-muted">@{u.handle}</p>}
                  </div>
                </Link>
              ))}
            </section>
          )}

          {showPosts && results.posts.length > 0 && (
            <section className="py-2">
              {tab === 'top' && <h2 className="px-4 py-1 text-xs font-semibold uppercase text-site-text-dim">{t('tab-posts', { defaultValue: 'Posts' })}</h2>}
              {results.posts.map((p) => (
                <button
                  key={p.id}
                  onClick={() => p.user.handle && navigate({ to: `/u/${p.user.handle}/post/${p.id}` as string })}
                  className="block w-full px-4 py-2.5 text-left transition-colors hover:bg-site-surface-hover"
                >
                  <div className="flex items-center gap-2">
                    <UserAvatar src={p.user.image} alt={p.user.name || 'User'} size={20} fallbackName={p.user.name || 'U'} />
                    <span className="text-sm font-medium text-site-text">{p.user.name || p.user.handle}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-site-text-muted">{p.content}</p>
                </button>
              ))}
            </section>
          )}

          {showBuilds && results.builds.length > 0 && (
            <section className="py-2">
              {tab === 'top' && <h2 className="px-4 py-1 text-xs font-semibold uppercase text-site-text-dim">{t('tab-builds', { defaultValue: 'Builds' })}</h2>}
              {results.builds.map((b) => (
                <Link
                  key={b.slug}
                  to={`/user-builds/${b.slug}` as string}
                  className="flex items-start gap-3 px-4 py-2.5 transition-colors hover:bg-site-surface-hover"
                >
                  <Package className="mt-0.5 h-4 w-4 shrink-0 text-site-accent" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-site-text">{b.title}</p>
                    <p className="line-clamp-1 text-xs text-site-text-muted">{b.description}</p>
                  </div>
                </Link>
              ))}
            </section>
          )}

          {showBlog && results.blog.length > 0 && (
            <section className="py-2">
              {tab === 'top' && <h2 className="px-4 py-1 text-xs font-semibold uppercase text-site-text-dim">{t('tab-blog', { defaultValue: 'Blog' })}</h2>}
              {results.blog.map((b) => (
                <Link
                  key={b.slug}
                  to={`/blog/${b.slug}` as string}
                  className="flex items-start gap-3 px-4 py-2.5 transition-colors hover:bg-site-surface-hover"
                >
                  <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-site-accent" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-site-text">{b.title}</p>
                    <p className="line-clamp-1 text-xs text-site-text-muted">{b.description}</p>
                  </div>
                </Link>
              ))}
            </section>
          )}
        </div>
      )}
    </div>
  );
}
