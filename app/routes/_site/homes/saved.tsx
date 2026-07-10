/**
 * RMHHomes — saved listings (/homes/saved)
 *
 * The user's favorited listings.
 */
import { useCallback, useEffect, useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Loader2 } from 'lucide-react';
import { PageLayout } from '@/components/feed/PageLayout';
import { useSession } from '@/components/Providers';
import { Button } from '@/components/ui/button';
import { ListingGrid } from '@/components/homes/ListingGrid';
import type { Listing } from '@/lib/homes/types';

export const Route = createFileRoute('/_site/homes/saved')({
  head: () => ({ meta: [{ title: 'RMHHomes — Saved' }] }),
  component: HomesSavedPage,
});

function HomesSavedPage() {
  const { data: session, isPending } = useSession();
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/homes/listings?scope=favorites');
      const data = res.ok ? await res.json() : { listings: [] };
      setListings(data.listings ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (session) load();
    else setLoading(false);
  }, [session, load]);

  const onFavoriteChange = useCallback((id: string, favorited: boolean) => {
    // Unfavoriting from this page removes the card.
    if (!favorited) setListings((prev) => prev.filter((l) => l.id !== id));
  }, []);

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
          <p className="mb-4">Sign in to see your saved homes.</p>
          <Link to="/login" search={{ callbackURL: '/homes/saved' }}>
            <Button>Sign in</Button>
          </Link>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout title="Saved" backTo="/homes" backLabel="Back to browse" wide>
      <div className="mx-auto w-full max-w-6xl px-4 pb-16 pt-4 md:px-6">
        <ListingGrid
          listings={listings}
          loading={loading}
          searched
          onFavoriteChange={onFavoriteChange}
          onHover={() => {}}
          emptyTitle="No saved listings yet"
          emptyDescription="Tap the heart on any listing to save it here."
        />
      </div>
    </PageLayout>
  );
}
