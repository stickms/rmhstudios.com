/**
 * Create · Builds surfaces.
 *
 * Curated/Official builds (the RMH-made games + apps, code-defined) and the
 * community submissions are both rendered through the shared Steam-style
 * `Storefront`: a rotating hero, a featured spotlight rail, and a varied catalog
 * mosaic, in the order the list arrives (Best by default). Curated builds are split into Games and Apps tabs via
 * `CuratedBuildsTab`; community submissions live in their own tab via
 * `UserBuildsTab` (with sorting, search, and lazy infinite-scroll pagination).
 * Each card links to the playable page or the detail page at /builds/$slug.
 */

import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SearchField } from '@/components/ui/search-field';
import { Link } from '@tanstack/react-router';
import { Plus, Heart } from 'lucide-react';
import type { CuratedBuild } from '@/lib/builds/curated';
import { Storefront, type StoreItem } from '@/components/creator-studio/storefront';
import { Button } from '@/components/ui/button';
import { SortSelect } from '@/components/creator-studio/SortSelect';
import { api } from '@/lib/contract/client';
import { listUserBuildsApi } from '@/lib/user-builds.contract';
import '@/components/builds/builds.css';
import '@/components/creator-studio/storefront.css';
import '@/components/rmhvibe/vibe.css';

type UserSort = 'best' | 'recent' | 'popular' | 'views';
type CuratedSort = 'featured' | 'name';

type UserBuildItem = {
  id: string;
  slug: string;
  title: string;
  description: string;
  thumbnailUrl?: string | null;
  technologies: string[];
  likeCount: number;
  viewCount: number;
  category?: { name: string } | null;
  tags: string[];
};

/**
 * Curated (official) builds for a single kind — used by both the Games and the
 * Apps tab. Handles its own search + sort over the pre-filtered list.
 */
export function CuratedBuildsTab({
  curated,
  searchPlaceholder,
  emptyLabel,
  afterControls,
}: {
  curated: CuratedBuild[];
  searchPlaceholder?: string;
  emptyLabel?: string;
  /** Secondary context follows search, so catalog controls stay directly below the tabs. */
  afterControls?: ReactNode;
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
        tags: b.tags,
        cta: b.cta,
        badge:
          b.status ||
          (b.kind === 'game'
            ? t('badge-game', { defaultValue: 'Game' })
            : t('badge-app', { defaultValue: 'App' })),
        href: b.href,
        detailsTo: `/builds/${b.slug}`,
        detailsLabel: t('build-details', { defaultValue: 'Build details' }),
      })),
    [view, t],
  );

  const toolbar = (
    <div data-slot="page-controls" className="builds-toolbar">
      <div className="builds-toolbar__right">
        <SearchField
          containerClassName="min-w-0 flex-1 basis-56"
          value={query}
          onValueChange={setQuery}
          placeholder={
            searchPlaceholder ??
            t('search-builds-placeholder', { defaultValue: 'Search builds...' })
          }
          aria-label={t('search-builds-label', { defaultValue: 'Search builds' })}
        />
        <SortSelect
          value={sort}
          onChange={setSort}
          options={[
            { value: 'featured', label: t('sort-featured', { defaultValue: 'Featured' }) },
            { value: 'name', label: t('sort-name-az', { defaultValue: 'Name (A–Z)' }) },
          ]}
        />
      </div>
    </div>
  );

  return (
    <Storefront
      items={items}
      featured={!query.trim() && sort === 'featured'}
      toolbar={
        <>
          {toolbar}
          {afterControls}
        </>
      }
      emptyLabel={
        emptyLabel ?? t('empty-curated', { defaultValue: 'No builds match that search.' })
      }
    />
  );
}

/**
 * Community-submitted builds (the former "User builds" half of the Builds tab),
 * now promoted to its own Create tab. Fetches from /api/user-builds
 * with search, sort, and lazy infinite-scroll pagination.
 */
export function UserBuildsTab() {
  const { t } = useTranslation('builds');
  const [query, setQuery] = useState('');
  const [userSort, setUserSort] = useState<UserSort>('best');

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
        const data = await api(listUserBuildsApi, {
          query: { limit: 24, sort: userSort, search: query.trim() || undefined },
        });
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
      const data = await api(listUserBuildsApi, {
        query: { limit: 24, sort: userSort, cursor, search: query.trim() || undefined },
      });
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
    <div data-slot="page-controls" className="builds-toolbar">
      <div className="builds-toolbar__right">
        <SearchField
          containerClassName="min-w-0 flex-1 basis-56"
          value={query}
          onValueChange={setQuery}
          placeholder={t('search-user-builds-placeholder', {
            defaultValue: 'Search user builds...',
          })}
          aria-label={t('search-builds-label', { defaultValue: 'Search builds' })}
        />
        <Button asChild variant="default">
          <Link to="/user-builds/submit">
            <Plus aria-hidden />
            {t('submit', { defaultValue: 'Submit' })}
          </Link>
        </Button>
        <SortSelect
          value={userSort}
          onChange={setUserSort}
          options={[
            { value: 'best', label: t('sort-best', { defaultValue: 'Best' }) },
            { value: 'popular', label: t('sort-most-liked', { defaultValue: 'Most liked' }) },
            { value: 'views', label: t('sort-most-viewed', { defaultValue: 'Most viewed' }) },
            { value: 'recent', label: t('sort-newest', { defaultValue: 'Newest' }) },
          ]}
        />
      </div>
    </div>
  );

  return (
    <>
      <Storefront
        items={items}
        featured={!query.trim() && userSort === 'best'}
        toolbar={toolbar}
        emptyLabel={
          isEmpty
            ? query.trim()
              ? t('empty-user-search', { defaultValue: 'No user builds match that search.' })
              : t('empty-user-no-builds', {
                  defaultValue: 'No user builds yet — be the first to submit one.',
                })
            : t('loading', { defaultValue: 'Loading…' })
        }
      />
      <div ref={sentinelRef} aria-hidden="true" className="h-px w-full" />
      {loading && userItems.length > 0 && (
        <p className="vibe-hint vibe-gallery__loading">
          {t('loading', { defaultValue: 'Loading…' })}
        </p>
      )}
    </>
  );
}
