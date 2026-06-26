/**
 * Creator Studio · Builds surfaces.
 *
 * Curated/Official builds (the RMH-made games + apps, code-defined) and the
 * community submissions are both rendered through the shared Steam-style
 * `Storefront`: a rotating hero, a featured spotlight rail, and a varied catalog
 * mosaic. Curated builds are split into Games and Apps tabs via
 * `CuratedBuildsTab`; community submissions live in their own tab via
 * `UserBuildsTab` (with sorting, search, and lazy infinite-scroll pagination).
 * Each card links to the playable page or the detail page at /builds/$slug.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { Search, Plus, Heart } from 'lucide-react';
import type { CuratedBuild } from '@/lib/builds/curated';
import { Storefront, type StoreItem } from '@/components/creator-studio/storefront';

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

function hueFor(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}

/**
 * Curated (official) builds for a single kind — used by both the Games and the
 * Apps tab. Handles its own search + sort over the pre-filtered list.
 */
export function CuratedBuildsTab({
  curated,
  seed,
  searchPlaceholder,
  emptyLabel,
}: {
  curated: CuratedBuild[];
  seed: number;
  searchPlaceholder?: string;
  emptyLabel?: string;
}) {
  const { t } = useTranslation('builds');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<CuratedSort>('featured');

  const view = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = curated;
    if (q) {
      list = list.filter(
        (b) =>
          b.title.toLowerCase().includes(q) ||
          b.description.toLowerCase().includes(q) ||
          b.tags.some((tag) => tag.toLowerCase().includes(q)),
      );
    }
    if (sort === 'name') list = [...list].sort((a, b) => a.title.localeCompare(b.title));
    return list;
  }, [curated, query, sort]);

  const items: StoreItem[] = useMemo(
    () =>
      view.map((b) => ({
        id: b.id,
        title: b.title,
        description: b.description,
        coverUrl: b.thumbnailUrl,
        wideCoverUrl: b.wideCoverUrl,
        hue: b.hue,
        tags: b.tags,
        cta: b.cta,
        badge: b.status || (b.kind === 'game' ? t('badge-game', { defaultValue: 'Game' }) : t('badge-app', { defaultValue: 'App' })),
        href: b.href,
        detailsTo: `/builds/${b.slug}`,
        detailsLabel: t('build-details', { defaultValue: 'Build details' }),
      })),
    [view, t],
  );

  const toolbar = (
    <div className="builds-toolbar">
      <div className="builds-toolbar__right">
        <div className="vibe-search">
          <Search size={16} className="vibe-search__icon" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder ?? t('search-builds-placeholder', { defaultValue: 'Search builds...' })}
            aria-label={t('search-builds-label', { defaultValue: 'Search builds' })}
            className="vibe-search__input"
          />
        </div>
        <label className="builds-sort">
          <span className="builds-sort__label">{t('sort-label', { defaultValue: 'Sort' })}</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as CuratedSort)} className="builds-sort__select">
            <option value="featured">{t('sort-featured', { defaultValue: 'Featured' })}</option>
            <option value="name">{t('sort-name-az', { defaultValue: 'Name (A–Z)' })}</option>
          </select>
        </label>
      </div>
    </div>
  );

  return (
    <Storefront
      items={items}
      seed={seed}
      featured={!query.trim() && sort === 'featured'}
      toolbar={toolbar}
      emptyLabel={emptyLabel ?? t('empty-curated', { defaultValue: 'No builds match that search.' })}
    />
  );
}

/**
 * Community-submitted builds (the former "User builds" half of the Builds tab),
 * now promoted to its own Creator Studio tab. Fetches from /api/user-builds
 * with search, sort, and lazy infinite-scroll pagination.
 */
export function UserBuildsTab({ seed }: { seed: number }) {
  const { t } = useTranslation('builds');
  const [query, setQuery] = useState('');
  const [userSort, setUserSort] = useState<UserSort>('recent');

  const [userItems, setUserItems] = useState<UserBuildItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const reqId = useRef(0);

  useEffect(() => {
    const id = ++reqId.current;
    const timer = setTimeout(async () => {
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
    return () => clearTimeout(timer);
  }, [userSort, query]);

  const loadMore = useCallback(async () => {
    if (loading || !cursor) return;
    const id = reqId.current;
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '24', sort: userSort, cursor });
      if (query.trim()) params.set('search', query.trim());
      const res = await fetch(`/api/user-builds?${params.toString()}`);
      const data = await res.json();
      if (reqId.current !== id) return;
      setUserItems((prev) => [...prev, ...(data.items ?? [])]);
      setCursor(data.nextCursor ?? null);
    } finally {
      if (reqId.current === id) setLoading(false);
    }
  }, [loading, cursor, userSort, query]);

  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
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
  }, [cursor, loadMore]);

  const items: StoreItem[] = useMemo(
    () =>
      userItems.map((b) => ({
        id: b.id,
        title: b.title,
        description: b.description,
        coverUrl: b.thumbnailUrl,
        hue: hueFor(b.id),
        tags: b.tags?.length ? b.tags : b.technologies,
        cta: t('open', { defaultValue: 'Open' }),
        to: `/builds/${b.slug}`,
        badge:
          b.likeCount > 0 ? (
            <span className="builds-likes">
              <Heart size={10} className="builds-likes__icon" /> {b.likeCount}
            </span>
          ) : (
            b.category?.name
          ),
        meta:
          b.viewCount > 0
            ? t('views-count', { count: b.viewCount, defaultValue: '{{count}} views' })
            : undefined,
      })),
    [userItems, t],
  );

  const isEmpty = loadedOnce && userItems.length === 0 && !loading;

  const toolbar = (
    <div className="builds-toolbar">
      <div className="builds-toolbar__right">
        <div className="vibe-search">
          <Search size={16} className="vibe-search__icon" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('search-user-builds-placeholder', { defaultValue: 'Search user builds...' })}
            aria-label={t('search-builds-label', { defaultValue: 'Search builds' })}
            className="vibe-search__input"
          />
        </div>
        <Link to="/user-builds/submit" className="builds-submit">
          <Plus size={15} />
          <span>{t('submit', { defaultValue: 'Submit' })}</span>
        </Link>
        <label className="builds-sort">
          <span className="builds-sort__label">{t('sort-label', { defaultValue: 'Sort' })}</span>
          <select value={userSort} onChange={(e) => setUserSort(e.target.value as UserSort)} className="builds-sort__select">
            <option value="recent">{t('sort-recent', { defaultValue: 'Recent' })}</option>
            <option value="popular">{t('sort-most-liked', { defaultValue: 'Most liked' })}</option>
            <option value="views">{t('sort-most-viewed', { defaultValue: 'Most viewed' })}</option>
          </select>
        </label>
      </div>
    </div>
  );

  return (
    <>
      <Storefront
        items={items}
        seed={seed}
        featured={!query.trim() && userSort === 'recent'}
        toolbar={toolbar}
        emptyLabel={
          isEmpty
            ? query.trim()
              ? t('empty-user-search', { defaultValue: 'No user builds match that search.' })
              : t('empty-user-no-builds', { defaultValue: 'No user builds yet — be the first to submit one.' })
            : t('loading', { defaultValue: 'Loading…' })
        }
      />
      <div ref={sentinelRef} aria-hidden="true" className="h-px w-full" />
      {loading && userItems.length > 0 && <p className="vibe-hint vibe-gallery__loading">{t('loading', { defaultValue: 'Loading…' })}</p>}
    </>
  );
}
