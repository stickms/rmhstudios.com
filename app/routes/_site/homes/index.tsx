/**
 * RMHHomes — browse (/homes)
 *
 * The community marketplace: browse real, user-posted rentals and houses on a
 * grid synced with a map, filter/search, and post your own. Filters mirror to
 * the URL so searches are shareable.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { buildCanonical, buildMeta } from '@/lib/seo';
import { m as motion } from 'framer-motion';
import {
  Bookmark,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  List,
  Map as MapIcon,
  Plus,
  Search,
} from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';
import { useSession } from '@/components/Providers';
import { Button } from '@/components/ui/button';
import { LiquidTabs } from '@/components/ui/liquid-tabs';
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

  const runSearch = useCallback(async (next: SearchFilters, place: HomesPlace | null) => {
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
      const res = await fetch(`/api/homes/listings?${qs.toString()}`);
      if (myReq !== reqIdRef.current) return;
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || t('homes-search-failed', { defaultValue: 'Search failed' }));
      }
      const data = await res.json();
      setListings(data.listings ?? []);
      setCenter(data.center ?? null);
      setTotal(data.total ?? 0);
    } catch (err) {
      if (myReq === reqIdRef.current) {
        toast.error(
          err instanceof Error ? err.message : t('homes-search-failed', { defaultValue: 'Search failed' }),
        );
        setListings([]);
      }
    } finally {
      if (myReq === reqIdRef.current) setLoading(false);
    }
  }, [t]);

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

  const renderGrid = () => (
    <ListingGrid
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
      emptyDescription={t('homes-empty-desc', { defaultValue: 'Be the first to post a home in this area.' })}
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
          <Button asChild variant="ghost" size="sm" className="min-h-11">
            <Link to="/homes/manage" aria-label={t('homes-your-homes', { defaultValue: 'Your homes' })}>
              <Bookmark className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">
                {t('homes-your-homes', { defaultValue: 'Your homes' })}
              </span>
            </Link>
          </Button>
          <Button asChild size="sm" className="min-h-11">
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
      <div className="w-full px-4 pt-4 pb-12">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col gap-3"
        >
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="flex-1">
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
            <Button onClick={submitLocation} className="sm:w-auto">
              <Search className="h-4 w-4" aria-hidden />
              {t('homes-search', { defaultValue: 'Search' })}
            </Button>
          </div>
          <FiltersBar filters={filters} onChange={applyFilters} />
        </motion.div>

        {/* Results header */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-site-text-dim">
            {loading ? (
              t('homes-searching', { defaultValue: 'Searching…' })
            ) : (
              <>
                <span className="font-semibold text-site-text">{total.toLocaleString()}</span>{' '}
                {t('homes-count-noun', {
                  defaultValue: '{{count}} homes',
                  defaultValue_one: '{{count}} home',
                  count: total,
                })}
                {center && (
                  <span className="text-site-text-muted">
                    {' '}
                    {t('homes-near', {
                      defaultValue: 'near {{place}}',
                      place: center.label.split(',')[0],
                    })}
                  </span>
                )}
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <WatchButton filters={filters} center={center} />
            <Button
              variant="outline"
              size="sm"
              className="min-h-11 lg:hidden"
              onClick={() => setMobileMap((v) => !v)}
            >
              {mobileMap ? <List className="h-4 w-4" aria-hidden /> : <MapIcon className="h-4 w-4" aria-hidden />}
              {mobileMap
                ? t('homes-view-list', { defaultValue: 'List' })
                : t('homes-view-map', { defaultValue: 'Map' })}
            </Button>
            <LiquidTabs
              size="sm"
              iconOnly
              className="hidden w-auto lg:inline-flex"
              aria-label={t('homes-view-mode', { defaultValue: 'View mode' })}
              tabs={[
                {
                  id: 'split',
                  label: t('homes-view-split', { defaultValue: 'Map + list view' }),
                  icon: MapIcon,
                },
                {
                  id: 'grid',
                  label: t('homes-view-grid', { defaultValue: 'Grid view' }),
                  icon: LayoutGrid,
                },
              ]}
              value={desktopSplit ? 'split' : 'grid'}
              onChange={(id) => setDesktopSplit(id === 'split')}
            />
          </div>
        </div>

        {/* Body */}
        <div className="mt-4">
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
              renderGrid()
            )}
          </div>

          <div className="hidden lg:block">
            {desktopSplit ? (
              <div className="grid gap-4 lg:grid-cols-[1fr_minmax(320px,42%)]">
                <div>{renderGrid()}</div>
                <div className="site-sticky-secondary site-sticky-pinned h-[calc(100dvh-var(--site-sticky-secondary-top)-var(--site-sticky-edge))]">
                  <ListingsMap
                    listings={listings}
                    center={center}
                    activeId={activeId}
                    onActive={setActiveId}
                    className="h-full"
                  />
                </div>
              </div>
            ) : (
              renderGrid()
            )}
          </div>
        </div>

        {/* Pagination */}
        {!loading && !mobileMap && total > filters.pageSize && (
          <div className="mt-4 flex items-center justify-center gap-3">
            <Button
              variant="outline"
              size="sm"
              className="min-h-11"
              disabled={filters.page <= 1}
              onClick={() => goToPage(filters.page - 1)}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden /> {t('homes-prev', { defaultValue: 'Prev' })}
            </Button>
            <span className="text-sm text-site-text-dim">
              {t('homes-page-of', {
                defaultValue: 'Page {{page}} of {{total}}',
                page: filters.page,
                total: totalPages,
              })}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="min-h-11"
              disabled={filters.page >= totalPages}
              onClick={() => goToPage(filters.page + 1)}
            >
              {t('homes-next', { defaultValue: 'Next' })} <ChevronRight className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        )}
      </div>
    </PageLayout>
  );
}
