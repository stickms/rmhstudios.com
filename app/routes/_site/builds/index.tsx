/**
 * /builds — the unified builds grid.
 *
 * A grid of slightly-rounded cards (with the Library's staggered rise + a 3D
 * tilt-on-hover) showing either Curated/Official builds (the RMH-made games +
 * apps, code-defined) or community User builds (from the DB). A switch toggles
 * between them — defaulting to Curated — with sorting, search, and, for user
 * builds, lazy infinite-scroll pagination. Full-bleed black/white vibe aesthetic,
 * mobile-friendly. Each card links to its detail page at /builds/$slug.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Menu, Search, Plus, Heart, Info } from 'lucide-react';
import { useMobileSidebar } from '@/components/feed/MobileSidebarShell';
import { MobileBrandPrefix } from '@/components/feed/MobileHeader';
import { listCuratedBuilds, type CuratedBuild } from '@/lib/builds/curated';
import { shelfRiseDelay } from '@/components/library/shelf';
import { AnimatedMain } from '@/components/feed/AnimatedMain';
import { WIDE_NO_RIGHT_SIDEBAR_WIDTH } from '@/lib/layout-width';
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

export const Route = createFileRoute('/_site/builds/')({
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

/**
 * Pointer-driven 3D tilt + a shared cursor highlight across the build cards.
 *
 * Each animation frame (while the pointer is over the grid) we update, per card:
 * a tilt (`--rx`/`--ry` + `--lift`, only for the card under the cursor) and a
 * glare (`--mx`/`--my` position with a distance-based `--glow` intensity) so every
 * card reflects the same moving light.
 *
 * To keep the per-frame work bounded, only cards currently on screen are touched:
 * an IntersectionObserver maintains the visible set (lazy — off-screen cards cost
 * nothing), and a MutationObserver observes infinite-scroll cards as they mount.
 * Skipped entirely for touch / reduced-motion.
 */
function usePointerCards(gridRef: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    if (
      window.matchMedia('(hover: none)').matches ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    )
      return;

    const TILT = 16; // max tilt, degrees
    const GLOW_RADIUS = 540; // px falloff for the shared highlight
    let px = 0;
    let py = 0;
    let raf = 0;

    const reset = (inner: HTMLElement) => {
      inner.style.removeProperty('--rx');
      inner.style.removeProperty('--ry');
      inner.style.removeProperty('--lift');
      inner.style.setProperty('--glow', '0');
    };

    // Only on-screen cards are updated each frame.
    const visible = new Set<HTMLElement>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const el = e.target as HTMLElement;
          if (e.isIntersecting) {
            visible.add(el);
          } else {
            visible.delete(el);
            reset(el); // flatten as it leaves the viewport
          }
        }
      },
      { rootMargin: '120px' },
    );

    // Observe current + future (.builds-card__inner) cards exactly once each.
    const observed = new WeakSet<Element>();
    const observeAll = () => {
      grid.querySelectorAll<HTMLElement>('.builds-card__inner').forEach((el) => {
        if (!observed.has(el)) {
          observed.add(el);
          io.observe(el);
        }
      });
    };
    observeAll();
    const mo = new MutationObserver(observeAll);
    mo.observe(grid, { childList: true, subtree: true });

    const frame = () => {
      raf = 0;
      visible.forEach((inner) => {
        const r = inner.getBoundingClientRect();
        inner.style.setProperty('--mx', `${((px - r.left) / r.width) * 100}%`);
        inner.style.setProperty('--my', `${((py - r.top) / r.height) * 100}%`);

        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const glow = Math.max(0, 1 - Math.hypot(px - cx, py - cy) / GLOW_RADIUS);
        inner.style.setProperty('--glow', glow.toFixed(3));

        const inside = px >= r.left && px <= r.right && py >= r.top && py <= r.bottom;
        if (inside) {
          const dx = (px - r.left) / r.width - 0.5;
          const dy = (py - r.top) / r.height - 0.5;
          inner.style.setProperty('--ry', `${dx * TILT}deg`);
          inner.style.setProperty('--rx', `${-dy * TILT}deg`);
          inner.style.setProperty('--lift', '1');
        } else {
          inner.style.setProperty('--rx', '0deg');
          inner.style.setProperty('--ry', '0deg');
          inner.style.setProperty('--lift', '0');
        }
      });
    };

    const onMove = (e: PointerEvent) => {
      px = e.clientX;
      py = e.clientY;
      if (!raf) raf = requestAnimationFrame(frame);
    };
    const onLeave = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      visible.forEach(reset);
    };

    grid.addEventListener('pointermove', onMove, { passive: true });
    grid.addEventListener('pointerleave', onLeave);
    return () => {
      grid.removeEventListener('pointermove', onMove);
      grid.removeEventListener('pointerleave', onLeave);
      if (raf) cancelAnimationFrame(raf);
      io.disconnect();
      mo.disconnect();
    };
  }, [gridRef]);
}

function Builds() {
  const { t } = useTranslation('builds');
  const { curated } = Route.useLoaderData();
  const { open: openSidebar } = useMobileSidebar();
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

  // Pointer-driven tilt + shared cursor highlight across the cards.
  const gridRef = useRef<HTMLDivElement>(null);
  usePointerCards(gridRef);

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
    <>
    <AnimatedMain
      className="vibe-screen lib min-h-screen w-full min-w-0 border-r border-site-border pb-16 md:pb-0"
      targetWidth={WIDE_NO_RIGHT_SIDEBAR_WIDTH}
    >
      <header className="vibe-gallery__head">
        {/* Wrapper carries md:hidden — `.vibe-toolbar__icon` sets its own
            display, which would otherwise override the utility on desktop. */}
        <span className="md:hidden">
          <button type="button" onClick={openSidebar} aria-label={t('open-menu', { defaultValue: 'Open menu' })} className="vibe-toolbar__icon">
            <Menu size={18} />
          </button>
        </span>
        <div className="flex items-center gap-2 min-w-0">
          <MobileBrandPrefix />
          <h1 className="vibe-gallery__title">{t('page-title', { defaultValue: 'Builds' })}</h1>
        </div>
        <div className="vibe-search">
          <Search size={16} className="vibe-search__icon" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={showingCurated ? t('search-builds-placeholder', { defaultValue: 'Search builds...' }) : t('search-user-builds-placeholder', { defaultValue: 'Search user builds...' })}
            aria-label={t('search-builds-label', { defaultValue: 'Search builds' })}
            className="vibe-search__input"
          />
        </div>
      </header>

      <div className="builds-toolbar">
        <div className="builds-switch" role="tablist" aria-label={t('build-source-label', { defaultValue: 'Build source' })}>
          <button
            type="button"
            role="tab"
            aria-selected={showingCurated}
            className={`builds-switch__btn ${showingCurated ? 'is-active' : ''}`}
            onClick={() => setTab('curated')}
          >
            {t('tab-curated', { defaultValue: 'Curated' })}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={!showingCurated}
            className={`builds-switch__btn ${!showingCurated ? 'is-active' : ''}`}
            onClick={() => setTab('user')}
          >
            {t('tab-user-builds', { defaultValue: 'User builds' })}
          </button>
        </div>

        <div className="builds-toolbar__right">
          {showingCurated ? (
            <label className="builds-sort">
              <span className="builds-sort__label">{t('sort-label', { defaultValue: 'Sort' })}</span>
              <select
                value={curatedSort}
                onChange={(e) => setCuratedSort(e.target.value as CuratedSort)}
                className="builds-sort__select"
              >
                <option value="featured">{t('sort-featured', { defaultValue: 'Featured' })}</option>
                <option value="name">{t('sort-name-az', { defaultValue: 'Name (A–Z)' })}</option>
              </select>
            </label>
          ) : (
            <>
              <Link to="/user-builds/submit" className="builds-submit">
                <Plus size={15} />
                <span>{t('submit', { defaultValue: 'Submit' })}</span>
              </Link>
              <label className="builds-sort">
                <span className="builds-sort__label">{t('sort-label', { defaultValue: 'Sort' })}</span>
                <select
                  value={userSort}
                  onChange={(e) => setUserSort(e.target.value as UserSort)}
                  className="builds-sort__select"
                >
                  <option value="recent">{t('sort-recent', { defaultValue: 'Recent' })}</option>
                  <option value="popular">{t('sort-most-liked', { defaultValue: 'Most liked' })}</option>
                  <option value="views">{t('sort-most-viewed', { defaultValue: 'Most viewed' })}</option>
                </select>
              </label>
            </>
          )}
        </div>
      </div>

      {isEmpty ? (
        <p className="vibe-hint lib__empty">
          {showingCurated ? t('empty-curated', { defaultValue: 'No builds match that search.' }) : query.trim() ? t('empty-user-search', { defaultValue: 'No user builds match that search.' }) : t('empty-user-no-builds', { defaultValue: 'No user builds yet — be the first to submit one.' })}
        </p>
      ) : (
        <div ref={gridRef} className="builds-grid" role="list">
          {showingCurated
            ? curatedView.map((b, i) => <CuratedCard key={b.id} build={b} index={i} />)
            : userItems.map((b, i) => <UserCard key={b.id} build={b} index={i} />)}
        </div>
      )}

      {!showingCurated && (
        <>
          <div ref={sentinelRef} aria-hidden="true" className="h-px w-full" />
          {loading && <p className="vibe-hint vibe-gallery__loading">{t('loading', { defaultValue: 'Loading…' })}</p>}
        </>
      )}
    </AnimatedMain>
    {/* Trailing gutter to match the blog/feed layout */}
    <div className="hidden lg:block w-4 shrink-0" />
    </>
  );
}

/** The card face — cover + caption (+ hover description) shared by both kinds. */
function CardFace({
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
      <div className="builds-card__media">
        <div className={`builds-card__inner ${coverUrl ? 'has-cover' : ''}`}>
          {coverUrl ? (
            <img className="builds-card__img" src={coverUrl} alt={title} loading="lazy" decoding="async" />
          ) : (
            <>
              <span className="builds-card__placeholder">{title}</span>
              <span className="builds-card__mark">RMH</span>
            </>
          )}
          {badge && <span className="builds-card__badge">{badge}</span>}
          {description && <span className="builds-card__desc">{description}</span>}
        </div>
      </div>
      <div className="builds-card__meta">
        <p className="builds-card__name">{title}</p>
      </div>
    </>
  );
}

/**
 * Curated build: the card opens the build itself (its page), and a small Details
 * button (top-right) opens the /builds/$slug detail page.
 */
function CuratedCard({ build, index }: { build: CuratedBuild; index: number }) {
  const { t } = useTranslation('builds');
  return (
    <div
      className="builds-card"
      role="listitem"
      style={{ '--card-hue': String(build.hue), animationDelay: shelfRiseDelay(index) } as React.CSSProperties}
    >
      <a className="builds-card__primary" href={build.href} aria-label={t('open-build', { title: build.title, defaultValue: 'Open {{title}}' })}>
        <CardFace
          title={build.title}
          description={build.description}
          coverUrl={build.thumbnailUrl}
          badge={build.status || (build.kind === 'game' ? t('badge-game', { defaultValue: 'Game' }) : t('badge-app', { defaultValue: 'App' }))}
        />
      </a>
      <Link
        to="/builds/$slug"
        params={{ slug: build.slug }}
        className="builds-card__details"
        aria-label={t('details-for', { title: build.title, defaultValue: 'Details for {{title}}' })}
        title={t('build-details', { defaultValue: 'Build details' })}
      >
        <Info size={15} />
      </Link>
    </div>
  );
}

/** User build: opens its detail page. */
function UserCard({ build, index }: { build: UserBuildItem; index: number }) {
  const { t } = useTranslation('builds');
  return (
    <Link
      to="/builds/$slug"
      params={{ slug: build.slug }}
      className="builds-card"
      role="listitem"
      style={{ '--card-hue': String(hueFor(build.id)), animationDelay: shelfRiseDelay(index) } as React.CSSProperties}
      aria-label={t('open-build', { title: build.title, defaultValue: 'Open {{title}}' })}
    >
      <CardFace
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
