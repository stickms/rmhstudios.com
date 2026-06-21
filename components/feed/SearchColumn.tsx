'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { Search, Loader2, Package, BookOpen } from 'lucide-react';
import { UserAvatar } from '@/components/ui/UserAvatar';

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

export function SearchColumn({ initialQuery = '' }: { initialQuery?: string }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState(initialQuery);
  const [tab, setTab] = useState<Tab>('top');
  const [results, setResults] = useState<SearchResults>(EMPTY);
  const [loading, setLoading] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

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
            aria-label="Search people, posts, builds, and blog"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search people, posts, builds…"
            className="w-full bg-transparent text-sm text-site-text placeholder:text-site-text-dim focus:outline-none"
          />
          {loading && <Loader2 className="h-4 w-4 animate-spin text-site-text-muted" />}
        </div>
        <div className="mt-3 flex gap-1 overflow-x-auto" role="tablist" aria-label="Search categories">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                tab === t.id
                  ? 'bg-site-accent text-site-accent-fg'
                  : 'text-site-text-muted hover:bg-site-surface hover:text-site-text'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </header>

      {query.trim().length < 2 ? (
        <p className="px-4 py-16 text-center text-sm text-site-text-muted">
          Start typing to search across people, posts, builds, and the blog.
        </p>
      ) : !hasResults && !loading ? (
        <p className="px-4 py-16 text-center text-sm text-site-text-muted">
          No results for &ldquo;{query}&rdquo;.
        </p>
      ) : (
        <div className="divide-y divide-site-border">
          {showPeople && results.people.length > 0 && (
            <section className="py-2">
              {tab === 'top' && <h2 className="px-4 py-1 text-xs font-semibold uppercase text-site-text-dim">People</h2>}
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
              {tab === 'top' && <h2 className="px-4 py-1 text-xs font-semibold uppercase text-site-text-dim">Posts</h2>}
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
              {tab === 'top' && <h2 className="px-4 py-1 text-xs font-semibold uppercase text-site-text-dim">Builds</h2>}
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
              {tab === 'top' && <h2 className="px-4 py-1 text-xs font-semibold uppercase text-site-text-dim">Blog</h2>}
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
