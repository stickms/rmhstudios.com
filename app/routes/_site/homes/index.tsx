/**
 * RMHHomes — search (/homes)
 *
 * The main experience: location search + filters, a results grid synced with an
 * interactive map, provider transparency, pagination, and save-search. Filters
 * are mirrored to the URL so any search is shareable and survives refresh.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { motion } from 'framer-motion';
import {
  Bookmark,
  Home,
  LayoutGrid,
  Map as MapIcon,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { PageLayout } from '@/components/feed/PageLayout';
import { useSession } from '@/components/Providers';
import { LocationSearch, type HomesPlace } from '@/components/homes/LocationSearch';
import { FiltersBar } from '@/components/homes/FiltersBar';
import { ListingGrid } from '@/components/homes/ListingGrid';
import { ListingsMap } from '@/components/homes/ListingsMap';
import { ProviderStatusBar } from '@/components/homes/ProviderStatus';
import {
  DEFAULT_FILTERS,
  type Listing,
  type ProviderStatus,
  type SearchCenter,
  type SearchFilters,
} from '@/lib/homes/types';
import { parseFilters, serializeFilters } from '@/lib/homes/query';

export const Route = createFileRoute('/_site/homes/')({
  head: () => ({
    meta: [
      { title: 'RMHHomes — Find apartments & houses' },
      {
        name: 'description',
        content:
          'Search apartments and houses across free public listing sources, map every result, save your favorites, and set up saved searches — all in one RMH-native platform.',
      },
    ],
  }),
  component: HomesSearchPage,
});

type View = 'grid' | 'split';

function HomesSearchPage() {
  const { data: session, isPending } = useSession();

  const [filters, setFilters] = useState<SearchFilters>(DEFAULT_FILTERS);
  const [locationQuery, setLocationQuery] = useState('');
  const [pendingPlace, setPendingPlace] = useState<HomesPlace | null>(null);

  const [listings, setListings] = useState<Listing[]>([]);
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [center, setCenter] = useState<SearchCenter | null>(null);
  const [total, setTotal] = useState(0);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [view, setView] = useState<View>('split');
  const [saving, setSaving] = useState(false);

  const reqIdRef = useRef(0);

  /** Execute a search for a given filter set (and sync the URL). */
  const runSearch = useCallback(async (next: SearchFilters, place: HomesPlace | null) => {
    if (!next.location.trim() && place == null) return;

    const effective: SearchFilters = place
      ? { ...next, lat: place.lat, lng: place.lng, location: place.label }
      : { ...next, lat: undefined, lng: undefined };

    const myReq = ++reqIdRef.current;
    setLoading(true);
    setSearched(true);

    try {
      const qs = serializeFilters(effective);
      // Keep the URL shareable without triggering a TanStack navigation.
      if (typeof window !== 'undefined') {
        window.history.replaceState(null, '', `/homes?${qs.toString()}`);
      }

      const res = await fetch(`/api/homes/search?${qs.toString()}`);
      if (myReq !== reqIdRef.current) return; // stale response
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Search failed');
      }
      const data = await res.json();
      setListings(data.listings ?? []);
      setProviders(data.providers ?? []);
      setCenter(data.center ?? null);
      setTotal(data.total ?? 0);
      setSavedIds(new Set<string>(data.savedIds ?? []));
    } catch (err) {
      if (myReq === reqIdRef.current) {
        toast.error(err instanceof Error ? err.message : 'Search failed');
        setListings([]);
        setProviders([]);
      }
    } finally {
      if (myReq === reqIdRef.current) setLoading(false);
    }
  }, []);

  // Seed from the URL on first mount (shareable searches).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const parsed = parseFilters(new URLSearchParams(window.location.search));
    setFilters(parsed);
    setLocationQuery(parsed.location);
    if (parsed.location.trim() || (parsed.lat != null && parsed.lng != null)) {
      const seedPlace =
        parsed.lat != null && parsed.lng != null
          ? { label: parsed.location, lat: parsed.lat, lng: parsed.lng }
          : null;
      runSearch(parsed, seedPlace);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Change filters and immediately re-run (resetting to page 1). */
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

  const onSavedChange = useCallback((id: string, saved: boolean) => {
    setSavedIds((prev) => {
      const next = new Set(prev);
      if (saved) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  async function saveCurrentSearch() {
    if (!filters.location.trim()) {
      toast.error('Search a location first');
      return;
    }
    setSaving(true);
    try {
      const qs = serializeFilters(filters).toString();
      const res = await fetch('/api/homes/saved-searches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: filters.location.split(',')[0] || 'Saved search',
          query: qs,
          location: filters.location,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Could not save search');
      }
      toast.success('Search saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save search');
    } finally {
      setSaving(false);
    }
  }

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(total / filters.pageSize)),
    [total, filters.pageSize],
  );

  if (isPending) {
    return (
      <PageLayout title="RMHHomes" wide>
        <div className="grid place-items-center py-24 text-site-text-muted">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </PageLayout>
    );
  }

  if (!session) {
    return (
      <PageLayout title="RMHHomes" wide>
        <div className="mx-auto max-w-md px-4 py-20 text-center">
          <Home className="mx-auto mb-4 h-12 w-12 text-site-accent" />
          <h2 className="mb-2 text-xl font-semibold text-site-text">
            Sign in to find your next home
          </h2>
          <p className="mb-6 text-site-text-dim">
            RMHHomes searches apartments and houses across free public listing sources, maps every
            result, and keeps your favorites and saved searches in one place.
          </p>
          <Link
            to="/login"
            search={{ callbackURL: '/homes' }}
            className="inline-flex items-center gap-2 rounded-lg bg-site-accent px-5 py-2.5 font-medium text-white transition hover:opacity-90"
          >
            Sign in
          </Link>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout
      title="RMHHomes"
      wide
      headerRight={
        <Link
          to="/homes/saved"
          className="inline-flex items-center gap-1.5 rounded-lg border border-site-border px-3 py-1.5 text-sm text-site-text-dim transition hover:text-site-text"
        >
          <Bookmark className="h-4 w-4" />
          <span className="hidden sm:inline">Saved</span>
        </Link>
      }
    >
      <div className="mx-auto w-full max-w-6xl px-4 py-5 md:px-6">
        {/* Search controls */}
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
                autoFocus
              />
            </div>
            <button
              type="button"
              onClick={submitLocation}
              className="rounded-lg bg-site-accent px-5 py-2.5 text-sm font-medium text-white transition hover:opacity-90"
            >
              Search
            </button>
          </div>

          <FiltersBar filters={filters} onChange={applyFilters} />
        </motion.div>

        {/* Results header */}
        {searched && (
          <div className="mt-5 flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm text-site-text-dim">
                {loading ? (
                  'Searching…'
                ) : (
                  <>
                    <span className="font-semibold text-site-text">{total.toLocaleString()}</span>{' '}
                    {total === 1 ? 'result' : 'results'}
                    {center && (
                      <span className="text-site-text-muted">
                        {' '}
                        near {center.label.split(',')[0]}
                      </span>
                    )}
                  </>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={saveCurrentSearch}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-site-border px-3 py-1.5 text-sm text-site-text-dim transition hover:text-site-text disabled:opacity-50"
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Bookmark className="h-4 w-4" />
                  )}
                  Save search
                </button>
                <div className="hidden rounded-lg border border-site-border p-0.5 lg:inline-flex">
                  <button
                    type="button"
                    onClick={() => setView('split')}
                    aria-label="Map + list view"
                    className={`rounded-md p-1.5 ${view === 'split' ? 'bg-site-surface-hover text-site-text' : 'text-site-text-muted'}`}
                  >
                    <MapIcon className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setView('grid')}
                    aria-label="Grid view"
                    className={`rounded-md p-1.5 ${view === 'grid' ? 'bg-site-surface-hover text-site-text' : 'text-site-text-muted'}`}
                  >
                    <LayoutGrid className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
            {providers.length > 0 && <ProviderStatusBar providers={providers} />}
          </div>
        )}

        {/* Results body */}
        <div className="mt-4">
          {view === 'split' ? (
            <div className="grid gap-4 lg:grid-cols-[1fr_minmax(320px,42%)]">
              <div>
                <ListingGrid
                  listings={listings}
                  savedIds={savedIds}
                  loading={loading}
                  searched={searched}
                  activeId={activeId}
                  onHover={setActiveId}
                  onSavedChange={onSavedChange}
                />
              </div>
              {searched && (
                <div className="hidden lg:block">
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
              )}
            </div>
          ) : (
            <ListingGrid
              listings={listings}
              savedIds={savedIds}
              loading={loading}
              searched={searched}
              activeId={activeId}
              onHover={setActiveId}
              onSavedChange={onSavedChange}
            />
          )}
        </div>

        {/* Pagination */}
        {searched && !loading && total > filters.pageSize && (
          <div className="mt-6 flex items-center justify-center gap-3">
            <button
              type="button"
              disabled={filters.page <= 1}
              onClick={() => goToPage(filters.page - 1)}
              className="inline-flex items-center gap-1 rounded-lg border border-site-border px-3 py-1.5 text-sm text-site-text disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" /> Prev
            </button>
            <span className="text-sm text-site-text-dim">
              Page {filters.page} of {totalPages}
            </span>
            <button
              type="button"
              disabled={filters.page >= totalPages}
              onClick={() => goToPage(filters.page + 1)}
              className="inline-flex items-center gap-1 rounded-lg border border-site-border px-3 py-1.5 text-sm text-site-text disabled:opacity-40"
            >
              Next <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </PageLayout>
  );
}
