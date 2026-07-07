/**
 * RMHHomes — saved listings & searches (/homes/saved)
 *
 * The user's favorites (rendered from stored snapshots, so they survive upstream
 * expiry) and their saved searches (re-runnable, with an alerts toggle).
 */
import { useCallback, useEffect, useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Bell, BellOff, Bookmark, Heart, Loader2, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { PageLayout } from '@/components/feed/PageLayout';
import { useSession } from '@/components/Providers';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ListingCard } from '@/components/homes/ListingCard';
import type { Listing } from '@/lib/homes/types';

export const Route = createFileRoute('/_site/homes/saved')({
  head: () => ({ meta: [{ title: 'RMHHomes — Saved' }] }),
  component: HomesSavedPage,
});

interface SavedListingRow {
  id: string;
  listingId: string;
  listing: Listing;
  notes: string | null;
  createdAt: string;
}
interface SavedSearchRow {
  id: string;
  name: string;
  query: string;
  location: string;
  alertsEnabled: boolean;
  createdAt: string;
}

type Tab = 'listings' | 'searches';

function HomesSavedPage() {
  const { data: session, isPending } = useSession();
  const [tab, setTab] = useState<Tab>('listings');

  const [savedListings, setSavedListings] = useState<SavedListingRow[]>([]);
  const [savedSearches, setSavedSearches] = useState<SavedSearchRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [l, s] = await Promise.all([
        fetch('/api/homes/saved-listings').then((r) => (r.ok ? r.json() : { saved: [] })),
        fetch('/api/homes/saved-searches').then((r) => (r.ok ? r.json() : { searches: [] })),
      ]);
      setSavedListings(l.saved ?? []);
      setSavedSearches(s.searches ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (session) load();
    else setLoading(false);
  }, [session, load]);

  const onSavedChange = useCallback((id: string, saved: boolean) => {
    if (!saved) setSavedListings((prev) => prev.filter((r) => r.listingId !== id));
  }, []);

  async function deleteSearch(id: string) {
    setSavedSearches((prev) => prev.filter((s) => s.id !== id));
    const res = await fetch(`/api/homes/saved-searches?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      toast.error('Could not delete search');
      load();
    }
  }

  async function toggleAlerts(row: SavedSearchRow) {
    const next = !row.alertsEnabled;
    setSavedSearches((prev) =>
      prev.map((s) => (s.id === row.id ? { ...s, alertsEnabled: next } : s)),
    );
    const res = await fetch('/api/homes/saved-searches', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: row.id, alertsEnabled: next }),
    });
    if (!res.ok) {
      toast.error('Could not update alerts');
      load();
    } else {
      toast.success(next ? 'Alerts on for this search' : 'Alerts off');
    }
  }

  if (isPending) {
    return (
      <PageLayout title="Saved" backTo="/homes" wide>
        <div className="grid place-items-center py-24 text-site-text-muted">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </PageLayout>
    );
  }

  if (!session) {
    return (
      <PageLayout title="Saved" backTo="/homes" wide>
        <div className="mx-auto max-w-md px-4 py-20 text-center text-site-text-dim">
          <p className="mb-4">Sign in to see your saved homes and searches.</p>
          <Link to="/login" search={{ callbackURL: '/homes/saved' }}>
            <Button>Sign in</Button>
          </Link>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout title="Saved" backTo="/homes" backLabel="Back to search" wide>
      <div className="mx-auto w-full max-w-5xl px-4 pb-16 pt-5 md:px-6 md:pb-8">
        {/* Tabs */}
        <div className="mb-5 inline-flex rounded-site-sm border border-site-border p-0.5">
          <button
            type="button"
            onClick={() => setTab('listings')}
            className={`inline-flex items-center gap-1.5 rounded-[6px] px-4 py-1.5 text-sm font-medium transition-colors ${
              tab === 'listings'
                ? 'bg-site-surface-hover text-site-text'
                : 'text-site-text-muted hover:text-site-text'
            }`}
          >
            <Heart className="h-4 w-4" /> Listings ({savedListings.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('searches')}
            className={`inline-flex items-center gap-1.5 rounded-[6px] px-4 py-1.5 text-sm font-medium transition-colors ${
              tab === 'searches'
                ? 'bg-site-surface-hover text-site-text'
                : 'text-site-text-muted hover:text-site-text'
            }`}
          >
            <Bookmark className="h-4 w-4" /> Searches ({savedSearches.length})
          </button>
        </div>

        {loading ? (
          <div className="grid place-items-center py-20 text-site-text-muted">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : tab === 'listings' ? (
          savedListings.length === 0 ? (
            <EmptyState
              icon={Heart}
              title="No saved listings yet"
              description="Tap the heart on any listing to save it here."
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {savedListings.map((r) => (
                <ListingCard key={r.id} listing={r.listing} saved onSavedChange={onSavedChange} />
              ))}
            </div>
          )
        ) : savedSearches.length === 0 ? (
          <EmptyState
            icon={Bookmark}
            title="No saved searches"
            description='Run a search and hit "Save search" to keep it here.'
          />
        ) : (
          <div className="flex flex-col gap-2">
            {savedSearches.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between gap-3 rounded-site border border-site-border bg-site-surface/80 p-3 transition-colors hover:border-site-border-bright"
              >
                <a href={`/homes?${s.query}`} className="flex min-w-0 flex-1 items-center gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-site-sm bg-site-accent/15 text-site-accent">
                    <Search className="h-5 w-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-site-text">{s.name}</span>
                    <span className="block truncate text-xs text-site-text-muted">
                      {s.location}
                    </span>
                  </span>
                </a>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => toggleAlerts(s)}
                    aria-label={s.alertsEnabled ? 'Turn off alerts' : 'Turn on alerts'}
                    className={`grid h-9 w-9 place-items-center rounded-site-sm transition-colors ${
                      s.alertsEnabled
                        ? 'text-site-accent'
                        : 'text-site-text-muted hover:text-site-text'
                    }`}
                  >
                    {s.alertsEnabled ? (
                      <Bell className="h-4 w-4" />
                    ) : (
                      <BellOff className="h-4 w-4" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteSearch(s.id)}
                    aria-label="Delete saved search"
                    className="grid h-9 w-9 place-items-center rounded-site-sm text-site-text-muted transition-colors hover:text-site-danger"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </PageLayout>
  );
}
