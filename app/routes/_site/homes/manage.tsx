/**
 * RMHHomes — my listings (/homes/manage)
 */
import { useCallback, useEffect, useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Bell, Loader2, Plus } from 'lucide-react';
import { PageLayout } from '@/components/feed/PageLayout';
import { useSession } from '@/components/Providers';
import { Button } from '@/components/ui/button';
import { ListingGrid } from '@/components/homes/ListingGrid';
import type { Listing } from '@/lib/homes/types';

export const Route = createFileRoute('/_site/homes/manage')({
  head: () => ({ meta: [{ title: 'RMHHomes — My listings' }] }),
  component: HomesManagePage,
});

function HomesManagePage() {
  const { data: session, isPending } = useSession();
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/homes/listings?scope=mine');
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

  if (isPending) {
    return (
      <PageLayout title="My listings" backTo="/homes" wide>
        <div className="grid place-items-center py-24 text-site-text-muted">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </PageLayout>
    );
  }

  if (!session) {
    return (
      <PageLayout title="My listings" backTo="/homes" wide>
        <div className="mx-auto max-w-md px-4 py-20 text-center text-site-text-dim">
          <p className="mb-4">Sign in to manage your listings.</p>
          <Link to="/login" search={{ callbackURL: '/homes/manage' }}>
            <Button>Sign in</Button>
          </Link>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout
      title="My listings"
      backTo="/homes"
      backLabel="Back to browse"
      wide
      headerRight={
        <div className="flex items-center gap-1.5">
          <Link to="/homes/watches">
            <Button variant="ghost" size="sm">
              <Bell className="h-4 w-4" />
              <span className="hidden sm:inline">Alerts</span>
            </Button>
          </Link>
          <Link to="/homes/submit">
            <Button size="sm">
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">New listing</span>
            </Button>
          </Link>
        </div>
      }
    >
      <div className="mx-auto w-full max-w-6xl px-4 pb-16 pt-4 md:px-6">
        <ListingGrid
          listings={listings}
          loading={loading}
          searched
          showStatus
          onHover={() => {}}
          emptyTitle="You haven't posted anything yet"
          emptyDescription="Post your first rental or house and it'll show up here."
        />
      </div>
    </PageLayout>
  );
}
