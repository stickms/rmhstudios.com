/**
 * `/homes/manage` — everything RMHHomes keeps for you, in one place.
 *
 * This was three routes — `/homes/manage`, `/homes/saved`, `/homes/watches` —
 * and the three files were the same file: fetch one scope, render a
 * `ListingGrid`, and re-implement the pending spinner and the signed-out prompt
 * around it. Each ended in `backTo="/homes"`, so the only path from your saved
 * listings to your alerts ran back through browse, and only Manage linked to
 * either of the others (via two header buttons that existed nowhere else).
 *
 * They are one destination: the three answers to "what does this site hold for
 * me". So they are three `?tab=` panels behind one sign-in gate, and the two old
 * URLs redirect in — they are in `robots.txt` and were linked from browse, so
 * they stay resolvable.
 *
 * `?tab=` rather than child routes: all three are `personal` in `lib/sitemap.ts`
 * and `Disallow`ed in `robots.txt`, so no crawlable URL is lost, and switching
 * shelves costs no navigation.
 */

import { useCallback, useEffect, useState } from 'react';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Bell, Bookmark, Plus, Home as HomeIcon } from 'lucide-react';
import { PageLayout } from '@/components/feed/PageLayout';
import { PageTabs } from '@/components/feed/PageTabs';
import { type LiquidTab } from '@/components/ui/liquid-tabs';
import { useSession } from '@/components/Providers';
import { Button } from '@/components/ui/button';
import { SignedOutPrompt } from '@/components/ui/signed-out-prompt';
import { Spinner } from '@/components/ui/spinner';
import { ListingGrid } from '@/components/homes/ListingGrid';
import { WatchManager } from '@/components/homes/WatchManager';
import type { Listing } from '@/lib/homes/types';

const HOMES_TABS = ['listings', 'saved', 'alerts'] as const;
type HomesTab = (typeof HOMES_TABS)[number];

export const Route = createFileRoute('/_site/homes/manage')({
  head: () => ({
    meta: [{ title: 'RMHHomes — Your homes' }, { name: 'robots', content: 'noindex' }],
  }),
  validateSearch: (search: Record<string, unknown>): { tab?: HomesTab } =>
    HOMES_TABS.includes(search.tab as HomesTab) ? { tab: search.tab as HomesTab } : {},
  component: HomesManagePage,
});

/**
 * The two listing shelves differ only by API scope and empty copy, so they are
 * one component. `showStatus` is on for your own listings (draft/live/expired
 * matters there and means nothing on someone else's).
 */
function ListingShelf({
  scope,
  showStatus,
  emptyTitle,
  emptyDescription,
  dropOnUnfavorite,
}: {
  scope: 'mine' | 'favorites';
  showStatus?: boolean;
  emptyTitle: string;
  emptyDescription: string;
  dropOnUnfavorite?: boolean;
}) {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/homes/listings?scope=${scope}`)
      .then((res) => (res.ok ? res.json() : { listings: [] }))
      .catch(() => ({ listings: [] }))
      .then((data) => {
        if (cancelled) return;
        setListings(data.listings ?? []);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [scope]);

  const onFavoriteChange = useCallback(
    (id: string, favorited: boolean) => {
      // Unfavoriting from the Saved shelf removes the card it was on.
      if (dropOnUnfavorite && !favorited) setListings((prev) => prev.filter((l) => l.id !== id));
    },
    [dropOnUnfavorite],
  );

  return (
    <ListingGrid
      listings={listings}
      loading={loading}
      searched
      showStatus={showStatus}
      onFavoriteChange={onFavoriteChange}
      onHover={() => {}}
      emptyTitle={emptyTitle}
      emptyDescription={emptyDescription}
    />
  );
}

function HomesManagePage() {
  const { t } = useTranslation('site');
  const { data: session, isPending } = useSession();
  const { tab = 'listings' } = Route.useSearch();
  const navigate = useNavigate();

  const setTab = useCallback(
    (next: string) => {
      void navigate({ to: '/homes/manage', search: { tab: next as HomesTab }, replace: true });
    },
    [navigate],
  );

  const title = t('homes-manage-title', { defaultValue: 'Your homes' });

  if (isPending) {
    return (
      <PageLayout title={title} backTo="/homes" wide>
        <div className="grid place-items-center py-24 text-site-text-muted">
          <Spinner />
        </div>
      </PageLayout>
    );
  }

  // One sign-in gate for all three shelves, instead of the three near-identical
  // ones the separate pages each carried.
  if (!session) {
    return (
      <PageLayout title={title} backTo="/homes" wide>
        <SignedOutPrompt
          callbackURL="/homes/manage"
          title={t('homes-manage-signin', {
            defaultValue: 'Sign in to see your listings, saved homes and alerts.',
          })}
        />
      </PageLayout>
    );
  }

  const tabs: LiquidTab[] = [
    {
      id: 'listings',
      label: t('homes-tab-listings', { defaultValue: 'My listings' }),
      icon: HomeIcon,
    },
    { id: 'saved', label: t('homes-tab-saved', { defaultValue: 'Saved' }), icon: Bookmark },
    { id: 'alerts', label: t('homes-tab-alerts', { defaultValue: 'Alerts' }), icon: Bell },
  ];

  return (
    <PageLayout
      title={title}
      backTo="/homes"
      backLabel={t('homes-back-to-browse', { defaultValue: 'Back to browse' })}
      wide
      headerRight={
        <Button asChild size="sm" className="min-h-11">
          <Link
            to="/homes/submit"
            aria-label={t('homes-new-listing', { defaultValue: 'New listing' })}
          >
            <Plus className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">
              {t('homes-new-listing', { defaultValue: 'New listing' })}
            </span>
          </Link>
        </Button>
      }
    >
      <PageTabs
        tabs={tabs}
        value={tab}
        onChange={setTab}
        idBase="homes-manage"
        aria-label={title}
      />

      <div className="w-full px-4 pt-4 pb-12">
        {tab === 'listings' && (
          <div
            role="tabpanel"
            id="homes-manage-panel-listings"
            aria-labelledby="homes-manage-tab-listings"
          >
            <ListingShelf
              scope="mine"
              showStatus
              emptyTitle={t('homes-empty-mine-title', {
                defaultValue: "You haven't posted anything yet",
              })}
              emptyDescription={t('homes-empty-mine-desc', {
                defaultValue: "Post your first rental or house and it'll show up here.",
              })}
            />
          </div>
        )}
        {tab === 'saved' && (
          <div
            role="tabpanel"
            id="homes-manage-panel-saved"
            aria-labelledby="homes-manage-tab-saved"
          >
            <ListingShelf
              scope="favorites"
              dropOnUnfavorite
              emptyTitle={t('homes-empty-saved-title', { defaultValue: 'No saved listings yet' })}
              emptyDescription={t('homes-empty-saved-desc', {
                defaultValue: 'Tap the heart on any listing to save it here.',
              })}
            />
          </div>
        )}
        {tab === 'alerts' && (
          <div
            role="tabpanel"
            id="homes-manage-panel-alerts"
            aria-labelledby="homes-manage-tab-alerts"
            className="w-full max-w-3xl"
          >
            <p className="mb-4 text-sm text-site-text-muted">
              {t('homes-alerts-hint', {
                defaultValue:
                  'You’ll get a notification when a new listing matches one of your active alerts.',
              })}
            </p>
            <WatchManager />
          </div>
        )}
      </div>
    </PageLayout>
  );
}
