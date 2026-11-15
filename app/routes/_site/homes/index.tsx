/**
 * RMHHomes — browse (/homes)
 *
 * The community marketplace: browse real, user-posted rentals and houses on a
 * list synced with a map, filter/search, and post your own. Filters mirror to
 * the URL so searches are shareable.
 *
 * Layout. The page takes the two-column frame (`<NoMargin />`): a map beside a list needs the width the
 * margin column would take, and at 1280px that margin left the two of them 620px to share. From 1024px
 * the default view is the list (rows on rules, 400px) and the map (the rest), divided by a 1px rule, with
 * the map pinned while the list scrolls; "Grid view" drops the map for a grid of cards. Below 1024px there
 * is one column and the same strip switches between the list and the map. The view strip is the shared
 * `Tabs` in both cases; which pair it offers follows the same 1024px breakpoint as the frame.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { buildCanonical, buildMeta } from '@/lib/seo';
import { Bookmark, ChevronLeft, ChevronRight, Plus, Search } from 'lucide-react';
import { toast } from '@/lib/toast';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';
import { NoMargin } from '@/components/shell/NoMargin';
import { useSession } from '@/components/Providers';
import { Button } from '@/components/ui/button';
import { Tabs } from '@/components/ui/tabs';
import { LocationSearch, type HomesPlace } from '@/components/homes/LocationSearch';
import { FiltersBar } from '@/components/homes/FiltersBar';
import { ListingGrid } from '@/components/homes/ListingGrid';
import { ListingsMap } from '@/components/homes/ListingsMap';
import { WatchButton } from '@/components/homes/WatchButton';
import {
  DEFAULT_FILTERS,
  type Listing,
  type SearchCenter,
  type SearchFilters,
} from '@/lib/homes/types';
import { parseFilters, serializeFilters } from '@/lib/homes/query';
import { api } from '@/lib/contract/client';
import { serverError } from '@/lib/http';
import { browseHomeListingsApi } from '@/lib/homes/homes.contract';

export const Route = createFileRoute('/_site/homes/')({
  head: () => ({
    meta: buildMeta({
      title: 'RMHHomes',
      description:
        'Rentals and houses posted by RMH members. Search, map, save, message the poster.',
      path: '/homes',
    }),
    links: [buildCanonical('/homes')],
  }),
  component: HomesBrowsePage,
});

function HomesBrowsePage() {
  const { t } = useTranslation('site');
  const { data: session } = useSession();

  const [filters, setFilters] = useState<SearchFilters>(DEFAULT_FILTERS);
  const [locationQuery, setLocationQuery] = useState('');
  const [pendingPlace, setPendingPlace] = useState<HomesPlace | null>(null);

  const [listings, setListings] = useState<Listing[]>([]);
  const [center, setCenter] = useState<SearchCenter | null>(null);
  const [total, setTotal] = useState(0);

  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [desktopSplit, setDesktopSplit] = useState(true);
  const [mobileMap, setMobileMap] = useState(false);

  const reqIdRef = useRef(0);

  const runSearch = useCallback(
    async (next: SearchFilters, place: HomesPlace | null) => {
      const effective: SearchFilters = place
        ? { ...next, lat: place.lat, lng: place.lng, location: place.label }
        : { ...next, lat: undefined, lng: undefined };

      const myReq = ++reqIdRef.current;
      setLoading(true);
      setSearched(true);
      try {
        const qs = serializeFilters(effective);
        if (typeof window !== 'undefined') {
          window.history.replaceState(null, '', `/homes?${qs.toString()}`);
        }
        const data = await api(browseHomeListingsApi, { query: Object.fromEntries(qs) });
        if (myReq !== reqIdRef.current) return;
        setListings(data.listings ?? []);
        setCenter(data.center ?? null);
        setTotal(data.total ?? 0);
      } catch (err) {
        if (myReq === reqIdRef.current) {
          toast.error(
            serverError(err) ?? t('homes-search-failed', { defaultValue: 'Search failed' }),
          );
          setListings([]);
        }
      } finally {
        if (myReq === reqIdRef.current) setLoading(false);
      }
    },
    [t],
  );

  // Seed from the URL and run an initial browse (newest everywhere if no filters).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const parsed = parseFilters(new URLSearchParams(window.location.search));
    setFilters(parsed);
    setLocationQuery(parsed.location);
    const seedPlace =
      parsed.lat != null && parsed.lng != null
        ? { label: parsed.location, lat: parsed.lat, lng: parsed.lng }
        : null;
    runSearch(parsed, seedPlace);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyFilters = useCallback(
    (patch: Partial<SearchFilters>) => {
      setFilters((prev) => {
        const next = { ...prev, ...patch, page: 1 };
        runSearch(next, pendingPlace);
        return next;
      });
    },
    [runSearch, pendingPlace],
  );

  const submitLocation = useCallback(() => {
    const next = { ...filters, location: locationQuery, page: 1 };
    setFilters(next);
    runSearch(next, pendingPlace);
  }, [filters, locationQuery, pendingPlace, runSearch]);

  const onSelectPlace = useCallback(
    (place: HomesPlace) => {
      setPendingPlace(place);
      const next = { ...filters, location: place.label, page: 1 };
      setFilters(next);
      runSearch(next, place);
    },
    [filters, runSearch],
  );

  const goToPage = useCallback(
    (page: number) => {
      const next = { ...filters, page };
      setFilters(next);
      runSearch(next, pendingPlace);
      if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [filters, pendingPlace, runSearch],
  );

  const onFavoriteChange = useCallback((id: string, favorited: boolean) => {
    setListings((prev) => prev.map((l) => (l.id === id ? { ...l, favorited } : l)));
  }, []);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(total / filters.pageSize)),
    [total, filters.pageSize],
  );

  const renderList = (layout: 'grid' | 'rows') => (
    <ListingGrid
      layout={layout}
      listings={listings}
      loading={loading}
      searched={searched}
      activeId={activeId}
      onHover={setActiveId}
      onFavoriteChange={onFavoriteChange}
      emptyTitle={t('homes-empty-title', { defaultValue: 'No listings here yet' })}
      // The copy used to say to tap "Post a listing" — a header button whose
      // label is `hidden sm:inline`, so on a phone the reader was told to find
      // a word that isn't on screen. Put the action in the empty state instead.
      emptyDescription={t('homes-empty-desc', {
        defaultValue: 'Be the first to post a home in this area.',
      })}
      emptyAction={
        <Button asChild>
          <Link
            to={session ? '/homes/submit' : '/login'}
            search={session ? undefined : { callbackURL: '/homes/submit' }}
          >
            <Plus className="h-4 w-4" aria-hidden />
            {t('homes-post-listing', { defaultValue: 'Post a listing' })}
          </Link>
        </Button>
      }
    />
  );

  return (
    <PageLayout
      title="RMHHomes"
      wide
      headerRight={
        <div className="flex items-center gap-2">
          {/* One button to the whole personal side (/homes/manage), instead of
              the two that used to point at the separate Alerts and Saved
              pages — those are tabs there now. */}
          <Button asChild variant="ghost">
            <Link
              to="/homes/manage"
              aria-label={t('homes-your-homes', { defaultValue: 'Your homes' })}
            >
              <Bookmark className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">
                {t('homes-your-homes', { defaultValue: 'Your homes' })}
              </span>
            </Link>
          </Button>
          <Button asChild>
            <Link
              to={session ? '/homes/submit' : '/login'}
              search={session ? undefined : { callbackURL: '/homes/submit' }}
              aria-label={t('homes-post-listing', { defaultValue: 'Post a listing' })}
            >
              <Plus className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">
                {t('homes-post-listing', { defaultValue: 'Post a listing' })}
              </span>
            </Link>
          </Button>
        </div>
      }
    >
      <NoMargin />
      <FiltersBar
        filters={filters}
        onChange={applyFilters}
        search={
          <div className="flex gap-2">
            <div className="min-w-0 flex-1">
              <LocationSearch
                value={locationQuery}
                onQueryChange={(q) => {
                  setLocationQuery(q);
                  setPendingPlace(null);
                }}
                onSelect={onSelectPlace}
                onSubmit={submitLocation}
              />
            </div>
            <Button
              onClick={submitLocation}
              className="h-10"
              aria-label={t('homes-search', { defaultValue: 'Search' })}
            >
              <Search aria-hidden />
              <span className="hidden sm:inline">
                {t('homes-search', { defaultValue: 'Search' })}
              </span>
            </Button>
          </div>
        }
      />

      {/* Results toolbar: the count at the start, Watch and the view strip at the end. */}
      <div
        data-slot="homes-toolbar"
        className="mt-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2"
      >
        <p className="t-body text-site-text-muted" aria-live="polite">
          {loading ? (
            t('homes-searching', { defaultValue: 'Searching…' })
          ) : (
            <>
              {t('homes-count-noun', {
                defaultValue: '{{count}} homes',
                defaultValue_one: '{{count}} home',
                count: total,
              })}
              {center && (
                <>
                  {' '}
                  {t('homes-near', {
                    defaultValue: 'near {{place}}',
                    place: center.label.split(',')[0],
                  })}
                </>
              )}
            </>
          )}
        </p>
        <div className="flex items-center gap-3">
          <WatchButton filters={filters} center={center} />
          <div className="lg:hidden">
            <Tabs
              size="sm"
              className="w-auto"
              aria-label={t('homes-view-mode', { defaultValue: 'View mode' })}
              tabs={[
                { id: 'list', label: t('homes-view-list', { defaultValue: 'List' }) },
                { id: 'map', label: t('homes-view-map', { defaultValue: 'Map' }) },
              ]}
              value={mobileMap ? 'map' : 'list'}
              onChange={(id) => setMobileMap(id === 'map')}
            />
          </div>
          <div className="hidden lg:block">
            <Tabs
              size="sm"
              className="w-auto"
              aria-label={t('homes-view-mode', { defaultValue: 'View mode' })}
              tabs={[
                { id: 'split', label: t('homes-view-split', { defaultValue: 'Map + list view' }) },
                { id: 'grid', label: t('homes-view-grid', { defaultValue: 'Grid view' }) },
              ]}
              value={desktopSplit ? 'split' : 'grid'}
              onChange={(id) => setDesktopSplit(id === 'split')}
            />
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="mt-3">
        <div className="lg:hidden">
          {mobileMap ? (
            <ListingsMap
              listings={listings}
              center={center}
              activeId={activeId}
              onActive={setActiveId}
              onSelect={(id) => setActiveId(id)}
              className="h-[70dvh]"
            />
          ) : (
            renderList('grid')
          )}
        </div>

        <div className="hidden lg:block">
          {desktopSplit ? (
            <div
              data-slot="homes-split"
              className="grid grid-cols-[minmax(0,400px)_minmax(0,1fr)] border-t border-site-border"
            >
              <div className="min-w-0 border-e border-site-border pe-4">{renderList('rows')}</div>
              <div className="min-w-0 ps-4 pt-4">
                <div className="site-sticky-secondary site-sticky-pinned h-[calc(100dvh-var(--site-sticky-secondary-top)-var(--site-sticky-edge))] min-h-80">
                  <ListingsMap
                    listings={listings}
                    center={center}
                    activeId={activeId}
                    onActive={setActiveId}
                    className="h-full"
                  />
                </div>
              </div>
            </div>
          ) : (
            renderList('grid')
          )}
        </div>
      </div>

      {/* Pagination */}
      {!loading && !mobileMap && total > filters.pageSize && (
        <div className="mt-6 flex items-center justify-center gap-3">
          <Button
            variant="default"
            disabled={filters.page <= 1}
            onClick={() => goToPage(filters.page - 1)}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />{' '}
            {t('homes-prev', { defaultValue: 'Prev' })}
          </Button>
          <span className="text-sm text-site-text-muted">
            {t('homes-page-of', {
              defaultValue: 'Page {{page}} of {{total}}',
              page: filters.page,
              total: totalPages,
            })}
          </span>
          <Button
            variant="default"
            disabled={filters.page >= totalPages}
            onClick={() => goToPage(filters.page + 1)}
          >
            {t('homes-next', { defaultValue: 'Next' })}{' '}
            <ChevronRight className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      )}
    </PageLayout>
  );
}
