/**
 * RMHHomes — browse (/homes)
 *
 * The community marketplace: browse real, user-posted rentals and houses on a
 * grid synced with a map, filter/search, and post your own. Filters mirror to
 * the URL so searches are shareable.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { motion } from 'framer-motion';
import {
  Bell,
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
import { PageLayout } from '@/components/feed/PageLayout';
import { useSession } from '@/components/Providers';
import { Button } from '@/components/ui/button';
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
    meta: [
      { title: 'RMHHomes — Rentals & houses posted by the community' },
      {
        name: 'description',
        content:
          'Browse real apartments and houses posted by RMH members, or post your own. Search by location, map every result, save favorites, and message the poster.',
      },
    ],
  }),
  component: HomesBrowsePage,
});

function HomesBrowsePage() {
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
        throw new Error(data.error || 'Search failed');
      }
      const data = await res.json();
      setListings(data.listings ?? []);
      setCenter(data.center ?? null);
      setTotal(data.total ?? 0);
    } catch (err) {
      if (myReq === reqIdRef.current) {
        toast.error(err instanceof Error ? err.message : 'Search failed');
        setListings([]);
      }
    } finally {
      if (myReq === reqIdRef.current) setLoading(false);
    }
  }, []);

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
      emptyTitle="No listings here yet"
      emptyDescription="Be the first to post a home in this area — tap “Post a listing”."
    />
  );

  return (
    <PageLayout
      title="RMHHomes"
      wide
      headerRight={
        <div className="flex items-center gap-1.5">
          <Link to="/homes/watches">
            <Button variant="ghost" size="sm">
              <Bell className="h-4 w-4" />
              <span className="hidden sm:inline">Alerts</span>
            </Button>
          </Link>
          <Link to="/homes/saved">
            <Button variant="ghost" size="sm">
              <Bookmark className="h-4 w-4" />
              <span className="hidden sm:inline">Saved</span>
            </Button>
          </Link>
          {session ? (
            <Link to="/homes/submit">
              <Button size="sm">
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">Post a listing</span>
              </Button>
            </Link>
          ) : (
            <Link to="/login" search={{ callbackURL: '/homes/submit' }}>
              <Button size="sm">
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">Post a listing</span>
              </Button>
            </Link>
          )}
        </div>
      }
    >
      <div className="mx-auto w-full max-w-6xl px-4 pb-16 pt-4 md:px-6 md:pb-10">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col gap-3"
        >
          <div className="flex flex-col gap-2 sm:flex-row">
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
            <Button size="lg" onClick={submitLocation} className="h-11 sm:w-auto">
              <Search className="h-4 w-4" />
              Search
            </Button>
          </div>
          <FiltersBar filters={filters} onChange={applyFilters} />
        </motion.div>

        {/* Results header */}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm text-site-text-dim">
            {loading ? (
              'Searching…'
            ) : (
              <>
                <span className="font-semibold text-site-text">{total.toLocaleString()}</span>{' '}
                {total === 1 ? 'home' : 'homes'}
                {center && (
                  <span className="text-site-text-muted"> near {center.label.split(',')[0]}</span>
                )}
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <WatchButton filters={filters} center={center} />
            <Button
              variant="outline"
              size="sm"
              className="lg:hidden"
              onClick={() => setMobileMap((v) => !v)}
            >
              {mobileMap ? <List className="h-4 w-4" /> : <MapIcon className="h-4 w-4" />}
              {mobileMap ? 'List' : 'Map'}
            </Button>
            <div className="hidden rounded-site-sm border border-site-border p-0.5 lg:inline-flex">
              <button
                type="button"
                onClick={() => setDesktopSplit(true)}
                aria-label="Map + list view"
                className={`rounded-[6px] p-1.5 ${desktopSplit ? 'bg-site-surface-hover text-site-text' : 'text-site-text-muted'}`}
              >
                <MapIcon className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setDesktopSplit(false)}
                aria-label="Grid view"
                className={`rounded-[6px] p-1.5 ${!desktopSplit ? 'bg-site-surface-hover text-site-text' : 'text-site-text-muted'}`}
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
            </div>
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
                className="h-[70vh]"
              />
            ) : (
              renderGrid()
            )}
          </div>

          <div className="hidden lg:block">
            {desktopSplit ? (
              <div className="grid gap-4 lg:grid-cols-[1fr_minmax(320px,42%)]">
                <div>{renderGrid()}</div>
                <div className="sticky top-20 h-[calc(100vh-6rem)]">
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
          <div className="mt-6 flex items-center justify-center gap-3">
            <Button
              variant="outline"
              size="sm"
              disabled={filters.page <= 1}
              onClick={() => goToPage(filters.page - 1)}
            >
              <ChevronLeft className="h-4 w-4" /> Prev
            </Button>
            <span className="text-sm text-site-text-dim">
              Page {filters.page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={filters.page >= totalPages}
              onClick={() => goToPage(filters.page + 1)}
            >
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </PageLayout>
  );
}
