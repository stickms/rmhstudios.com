/**
 * /builds — the unified builds bookshelf.
 *
 * A bookshelf (same look as /library) of either Curated/Official builds (the
 * RMH-made games + apps, code-defined) or community User builds (from the DB). A
 * switch toggles between them — defaulting to Curated — with sorting, search, and,
 * for user builds, lazy infinite-scroll pagination. Full-bleed black/white vibe
 * aesthetic, mobile-friendly. Each book links to its detail page at /builds/$slug.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowLeft, Search, Plus, Heart, Info } from 'lucide-react';
import { listCuratedBuilds, type CuratedBuild } from '@/lib/builds/curated';
import '@/components/library/library.css';
import '@/components/builds/builds.css';

type Tab = 'curated' | 'user';
type UserSort = 'recent' | 'popular' | 'views';
type CuratedSort = 'featured' | 'name';

type UserBuildItem = {
  id: string;
  slug: string;
  title: string;
  description: string;
  thumbnailUrl: string | null;
  technologies: string[];
  likeCount: number;
  viewCount: number;
  category?: { name: string } | null;
  tags: string[];
};

export const Route = createFileRoute('/builds/')({
  head: () => ({
    meta: [
      { title: 'Builds | RMH Studios' },
      { name: 'description', content: 'Explore RMH Studios builds — official games and apps, plus community creations.' },
    ],
  }),
  loader: () => ({ curated: listCuratedBuilds() }),
  component: Builds,
});

function hueFor(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}

function Builds() {
  const { curated } = Route.useLoaderData();
  const [tab, setTab] = useState<Tab>('curated');
  const [query, setQuery] = useState('');
  const [curatedSort, setCuratedSort] = useState<CuratedSort>('featured');
  const [userSort, setUserSort] = useState<UserSort>('recent');

  const [userItems, setUserItems] = useState<UserBuildItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const reqId = useRef(0);

  // Curated builds: filter + sort entirely on the client (small, static set).
  const curatedView = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = curated;
    if (q) {
      list = list.filter(
        (b) =>
          b.title.toLowerCase().includes(q) ||
          b.description.toLowerCase().includes(q) ||
          b.tags.some((t) => t.toLowerCase().includes(q)),
      );
    }
    if (curatedSort === 'name') list = [...list].sort((a, b) => a.title.localeCompare(b.title));
    return list;
  }, [curated, query, curatedSort]);

  // User builds: (re)fetch from the top whenever the tab/sort/search settles.
  useEffect(() => {
    if (tab !== 'user') return;
    const id = ++reqId.current;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ limit: '24', sort: userSort });
        if (query.trim()) params.set('search', query.trim());
        const res = await fetch(`/api/user-builds?${params.toString()}`);
        const data = await res.json();
        if (reqId.current !== id) return;
        setUserItems(data.items ?? []);
        setCursor(data.nextCursor ?? null);
        setLoadedOnce(true);
      } finally {
        if (reqId.current === id) setLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [tab, userSort, query]);

  const loadMore = useCallback(async () => {
    if (loading || !cursor || tab !== 'user') return;
    const id = reqId.current;
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '24', sort: userSort, cursor });
      if (query.trim()) params.set('search', query.trim());
      const res = await fetch(`/api/user-builds?${params.toString()}`);
      const data = await res.json();
      if (reqId.current !== id) return; // a fresh query superseded us
      setUserItems((prev) => [...prev, ...(data.items ?? [])]);
      setCursor(data.nextCursor ?? null);
    } finally {
      if (reqId.current === id) setLoading(false);
    }
  }, [loading, cursor, tab, userSort, query]);

  // Infinite scroll for the user tab.
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (tab !== 'user') return;
    const el = sentinelRef.current;
    if (!el || !cursor) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMore();
      },
      { rootMargin: '600px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [tab, cursor, loadMore]);

  const showingCurated = tab === 'curated';
  const isEmpty = showingCurated ? curatedView.length === 0 : loadedOnce && userItems.length === 0 && !loading;

  return (
    <main className="vibe-screen lib min-h-screen">
      <header className="vibe-gallery__head">
        <Link to="/" aria-label="Back to home" className="vibe-toolbar__icon">
          <ArrowLeft size={17} />
        </Link>
        <h1 className="vibe-gallery__title">Builds</h1>
        <div className="vibe-search">
          <Search size={16} className="vibe-search__icon" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={showingCurated ? 'Search builds...' : 'Search user builds...'}
            aria-label="Search builds"
            className="vibe-search__input"
          />
        </div>
      </header>

      <div className="builds-toolbar">
        <div className="builds-switch" role="tablist" aria-label="Build source">
          <button
            type="button"
            role="tab"
            aria-selected={showingCurated}
            className={`builds-switch__btn ${showingCurated ? 'is-active' : ''}`}
            onClick={() => setTab('curated')}
          >
            Curated
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={!showingCurated}
            className={`builds-switch__btn ${!showingCurated ? 'is-active' : ''}`}
            onClick={() => setTab('user')}
          >
            User builds
          </button>
        </div>

        <div className="builds-toolbar__right">
          {showingCurated ? (
            <label className="builds-sort">
              <span className="builds-sort__label">Sort</span>
              <select
                value={curatedSort}
                onChange={(e) => setCuratedSort(e.target.value as CuratedSort)}
                className="builds-sort__select"
              >
                <option value="featured">Featured</option>
                <option value="name">Name (A–Z)</option>
              </select>
            </label>
          ) : (
            <>
              <Link to="/user-builds/submit" className="builds-submit">
                <Plus size={15} />
                <span>Submit</span>
              </Link>
              <label className="builds-sort">
                <span className="builds-sort__label">Sort</span>
                <select
                  value={userSort}
                  onChange={(e) => setUserSort(e.target.value as UserSort)}
                  className="builds-sort__select"
                >
                  <option value="recent">Recent</option>
                  <option value="popular">Most liked</option>
                  <option value="views">Most viewed</option>
                </select>
              </label>
            </>
          )}
        </div>
      </div>

      {isEmpty ? (
        <p className="vibe-hint lib__empty">
          {showingCurated ? 'No builds match that search.' : query.trim() ? 'No user builds match that search.' : 'No user builds yet — be the first to submit one.'}
        </p>
      ) : (
        <div className="lib__shelf" role="list">
          {showingCurated
            ? curatedView.map((b, i) => <CuratedBook key={b.id} build={b} index={i} />)
            : userItems.map((b, i) => <UserBook key={b.id} build={b} index={i} />)}
        </div>
      )}

      {!showingCurated && (
        <>
          <div ref={sentinelRef} aria-hidden="true" className="h-px w-full" />
          {loading && <p className="vibe-hint vibe-gallery__loading">Loading…</p>}
        </>
      )}
    </main>
  );
}

/** The cover + caption (+ hover description) shared by both book kinds. */
function BookFace({
  title,
  description,
  coverUrl,
  badge,
}: {
  title: string;
  description: string;
  coverUrl: string | null;
  badge?: React.ReactNode;
}) {
  return (
    <>
      <div className="lib-book__3d">
        <div className={`lib-book__cover ${coverUrl ? 'has-cover' : ''}`}>
          <span className="lib-book__edge" aria-hidden="true" />
          {coverUrl ? (
            <img className="lib-book__img" src={coverUrl} alt={title} loading="lazy" decoding="async" />
          ) : (
            <span className="lib-book__title">{title}</span>
          )}
          {badge && <span className="lib-book__pages-badge">{badge}</span>}
          {!coverUrl && <span className="lib-book__mark">RMH</span>}
        </div>
        {description && <span className="lib-book__desc-pop">{description}</span>}
      </div>
      <div className="lib-book__meta">
        <p className="lib-book__name">{title}</p>
      </div>
    </>
  );
}

/**
 * Curated build: the cover/icon opens the build itself (its page), and a small
 * Details button (top-right) opens the /builds/$slug detail page.
 */
function CuratedBook({ build, index }: { build: CuratedBuild; index: number }) {
  return (
    <div
      className="lib-book"
      role="listitem"
      style={{ '--book-hue': String(build.hue), animationDelay: `${(index % 8) * 45}ms` } as React.CSSProperties}
    >
      <a className="lib-book__primary" href={build.href} aria-label={`Open ${build.title}`}>
        <BookFace
          title={build.title}
          description={build.description}
          coverUrl={build.thumbnailUrl}
          badge={build.status || (build.kind === 'game' ? 'Game' : 'App')}
        />
      </a>
      <Link
        to="/builds/$slug"
        params={{ slug: build.slug }}
        className="lib-book__details"
        aria-label={`Details for ${build.title}`}
        title="Build details"
      >
        <Info size={15} />
      </Link>
    </div>
  );
}

/** User build: opens its detail page. */
function UserBook({ build, index }: { build: UserBuildItem; index: number }) {
  return (
    <Link
      to="/builds/$slug"
      params={{ slug: build.slug }}
      className="lib-book"
      role="listitem"
      style={{ '--book-hue': String(hueFor(build.id)), animationDelay: `${(index % 8) * 45}ms` } as React.CSSProperties}
      aria-label={`Open ${build.title}`}
    >
      <BookFace
        title={build.title}
        description={build.description}
        coverUrl={build.thumbnailUrl}
        badge={
          build.likeCount > 0 ? (
            <span className="builds-likes">
              <Heart size={10} className="builds-likes__icon" /> {build.likeCount}
            </span>
          ) : (
            build.category?.name
          )
        }
      />
    </Link>
  );
}
