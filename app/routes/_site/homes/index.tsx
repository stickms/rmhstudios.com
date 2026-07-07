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
  Building2,
  ChevronLeft,
  ChevronRight,
  Info,
  LayoutGrid,
  List,
  Loader2,
  Map as MapIcon,
  Search,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { PageLayout } from '@/components/feed/PageLayout';
import { useSession } from '@/components/Providers';
import { Button } from '@/components/ui/button';
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

const POPULAR = ['Rochester, NY', 'New York, NY', 'Austin, TX', 'Chicago, IL', 'Seattle, WA'];

function HomesSearchPage() {
  const { data: session, isPending } = useSession();

  const [filters, setFilters] = useState<SearchFilters>(DEFAULT_FILTERS);
  const [locationQuery, setLocationQuery] = useState('');
  const [pendingPlace, setPendingPlace] = useState<HomesPlace | null>(null);

  const [listings, setListings] = useState<Listing[]>([]);
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [center, setCenter] = useState<SearchCenter | null>(null);
  const [total, setTotal] = useState(0);
  const [demo, setDemo] = useState(false);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [desktopSplit, setDesktopSplit] = useState(true);
  const [mobileMap, setMobileMap] = useState(false);
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
      setDemo(Boolean(data.demo));
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

  const quickSearch = useCallback(
    (label: string) => {
      setLocationQuery(label);
      setPendingPlace(null);
      const next = { ...filters, location: label, page: 1 };
      setFilters(next);
      runSearch(next, null);
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
        <div className="mx-auto max-w-2xl px-4 py-10 md:py-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative overflow-hidden rounded-3xl border border-site-border bg-gradient-to-b from-site-surface to-site-bg p-8 text-center md:p-12"
          >
            <div
              className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full opacity-30 blur-3xl"
              style={{ background: 'var(--site-accent)' }}
            />
            <div className="relative">
              <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-site bg-site-accent/15 text-site-accent">
                <Building2 className="h-7 w-7" />
              </div>
              <h2
                className="text-3xl font-bold tracking-tight text-site-text"
                style={{ fontFamily: 'var(--site-font-display)' }}
              >
                Find your next home
              </h2>
              <p className="mx-auto mt-3 max-w-md text-site-text-muted">
                RMHHomes searches apartments and houses across free public listing sources, maps
                every result, and keeps your favorites and saved searches in one place.
              </p>
              <Link to="/login" search={{ callbackURL: '/homes' }} className="mt-6 inline-block">
                <Button size="lg">Sign in to search</Button>
              </Link>
            </div>
          </motion.div>
        </div>
      </PageLayout>
    );
  }

  const renderGrid = () => (
    <ListingGrid
      listings={listings}
      savedIds={savedIds}
      loading={loading}
      searched={searched}
      activeId={activeId}
      onHover={setActiveId}
      onSavedChange={onSavedChange}
    />
  );

  return (
    <PageLayout
      title="RMHHomes"
      wide
      headerRight={
        <Link to="/homes/saved">
          <Button variant="ghost" size="sm">
            <Bookmark className="h-4 w-4" />
            <span className="hidden sm:inline">Saved</span>
          </Button>
        </Link>
      }
    >
      <div className="mx-auto w-full max-w-6xl px-4 pb-16 pt-4 md:px-6 md:pb-10">
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
                autoFocus={!searched}
              />
            </div>
            <Button size="lg" onClick={submitLocation} className="h-11 sm:w-auto">
              <Search className="h-4 w-4" />
              Search
            </Button>
          </div>

          <FiltersBar filters={filters} onChange={applyFilters} />
        </motion.div>

        {/* Landing state (before first search) */}
        {!searched && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="mt-6 overflow-hidden rounded-3xl border border-site-border bg-gradient-to-b from-site-surface to-site-bg p-8 text-center md:p-12"
          >
            <span className="inline-flex items-center gap-1.5 rounded-full border border-site-accent/40 bg-site-accent/10 px-3 py-1 text-xs font-medium text-site-accent">
              <Sparkles className="h-3.5 w-3.5" /> Apartments &amp; houses, all in one place
            </span>
            <h1
              className="mx-auto mt-4 max-w-xl text-3xl font-bold tracking-tight text-site-text md:text-4xl"
              style={{ fontFamily: 'var(--site-font-display)' }}
            >
              Where do you want to live?
            </h1>
            <p className="mx-auto mt-3 max-w-md text-site-text-muted">
              Search a city, neighborhood, or ZIP. RMHHomes maps every result and lets you save the
              ones you love.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {POPULAR.map((city) => (
                <button
                  key={city}
                  type="button"
                  onClick={() => quickSearch(city)}
                  className="rounded-full border border-site-border bg-site-surface px-3.5 py-1.5 text-sm text-site-text-muted transition-colors hover:border-site-accent/50 hover:text-site-text"
                >
                  {city}
                </button>
              ))}
            </div>
          </motion.div>
        )}

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
                    {total === 1 ? 'home' : 'homes'}
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
                <Button variant="outline" size="sm" onClick={saveCurrentSearch} disabled={saving}>
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Bookmark className="h-4 w-4" />
                  )}
                  <span className="hidden sm:inline">Save search</span>
                </Button>

                {/* Mobile map/list toggle */}
                <Button
                  variant="outline"
                  size="sm"
                  className="lg:hidden"
                  onClick={() => setMobileMap((v) => !v)}
                >
                  {mobileMap ? <List className="h-4 w-4" /> : <MapIcon className="h-4 w-4" />}
                  {mobileMap ? 'List' : 'Map'}
                </Button>

                {/* Desktop split/list toggle */}
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

            {/* Demo-data banner (no real provider returned results) */}
            {demo && !loading && (
              <div className="flex items-start gap-2 rounded-site border border-site-warning/30 bg-site-warning/10 px-3 py-2 text-xs text-site-warning">
                <Info className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  Showing <strong>demo listings</strong> — no live listing source returned results
                  for this area. Configure a provider (e.g. a free RentCast API key) to see real
                  homes. These placeholders aren&apos;t real properties.
                </span>
              </div>
            )}

            {providers.length > 0 && <ProviderStatusBar providers={providers} />}
          </div>
        )}

        {/* Results body */}
        {searched && (
          <div className="mt-4">
            {/* Mobile: list or full-height map */}
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

            {/* Desktop: split or grid */}
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
        )}

        {/* Pagination */}
        {searched && !loading && !mobileMap && total > filters.pageSize && (
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
