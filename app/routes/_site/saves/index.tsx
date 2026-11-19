/**
 * /saves — everything you kept, in one place.
 *
 * There were four destinations for "things I kept" — /saves, /bookmarks,
 * /lists, /wishlist — and twelve save-shaped models behind them. Two of those
 * models were the same idea twice: `SavedItem` is the generic foldered save and
 * has listed 'rmhark' among its entity types since it was built, while
 * `RMHarkBookmark` predated it and was never folded in. So a post could be
 * bookmarked AND saved, into two lists, on two pages, with neither aware of the
 * other — and asked where the thing they saved went, a user had no correct
 * answer. Migration 20260803210000 merges the rows; /bookmarks redirects here.
 *
 * Wishlist is NOT merged into the same store, because it is not the same
 * object: a wishlist entry is shop intent carrying a target price. It is a tab
 * — one destination, two shelves — rather than one table pretending two
 * concepts are one. Lists left on 2026-11-19: a list is a curated set of
 * *accounts* read as its own timeline, which is a Feed, so it is managed on
 * /feeds beside custom feeds, saved searches and alerts; `?tab=lists` forwards
 * there.
 */

import { useCallback } from 'react';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { useTranslation } from 'react-i18next';
import { Bookmark, Gift } from 'lucide-react';
import { PageLayout } from '@/components/feed/PageLayout';
import { PageTabs } from '@/components/feed/PageTabs';
import { type TabItem } from '@/components/ui/tabs';
import { SavesHub } from '@/components/saves/SavesHub';
import { WishlistView } from '@/components/wishlist/WishlistView';
import { getRequestSession } from '@/lib/auth-session.server';
import { listSaves, listFolders } from '@/lib/saves/saves.server';
import { listWishlist } from '@/lib/wishlist/wishlist.server';
import type { HydratedSave, SaveFolderView } from '@/lib/saves/types';
import type { WishlistItemView } from '@/lib/wishlist/types';

const SAVES_TABS = ['saved', 'wishlist'] as const;
type SavesTab = (typeof SAVES_TABS)[number];

interface HubData {
  items: HydratedSave[];
  nextCursor: string | null;
  folders: SaveFolderView[];
  wishlist: WishlistItemView[];
}

const EMPTY: HubData = { items: [], nextCursor: null, folders: [], wishlist: [] };

const fetchSaves = createServerFn({ method: 'GET' }).handler(async (): Promise<HubData> => {
  const session = await getRequestSession();
  if (!session) return EMPTY;
  const userId = session.user.id;
  // Both shelves load together: they are one page, and switching tabs costs no
  // round trip. Each is a bounded per-user read.
  const [result, folders, wishlist] = await Promise.all([
    listSaves(userId, {}),
    listFolders(userId),
    listWishlist(userId),
  ]);
  return { ...result, folders, wishlist };
});

export const Route = createFileRoute('/_site/saves/')({
  head: () => ({ meta: [{ title: 'Saved | RMH Studios' }, { name: 'robots', content: 'noindex' }] }),
  validateSearch: (search: Record<string, unknown>): { tab?: SavesTab | 'lists' } =>
    search.tab === 'lists' || SAVES_TABS.includes(search.tab as SavesTab)
      ? { tab: search.tab as SavesTab | 'lists' }
      : {},
  // Lists moved to /feeds; an old `/saves?tab=lists` link lands there.
  beforeLoad: ({ search }) => {
    if (search.tab === 'lists') throw redirect({ to: '/feeds', search: { tab: 'lists' } });
  },
  loader: () => fetchSaves(),
  component: SavesPage,
});

function SavesPage() {
  const { t } = useTranslation('feed');
  const data = Route.useLoaderData();
  const { tab = 'saved' } = Route.useSearch();
  const navigate = useNavigate();

  const setTab = useCallback(
    (next: string) => {
      void navigate({ to: '/saves', search: { tab: next as SavesTab }, replace: true });
    },
    [navigate],
  );

  const tabs: TabItem[] = [
    { id: 'saved', label: t('saves-tab-saved', { defaultValue: 'Saved' }), icon: Bookmark },
    { id: 'wishlist', label: t('saves-tab-wishlist', { defaultValue: 'Wishlist' }), icon: Gift },
  ];

  return (
    <PageLayout title={t('saves-title', { defaultValue: 'Saved' })}>
      <PageTabs
        tabs={tabs}
        value={tab}
        onChange={setTab}
        idBase="saves"
        aria-label={t('saves-title', { defaultValue: 'Saved' })}
      />

      {tab === 'saved' && (
        <div role="tabpanel" id="saves-panel-saved" aria-labelledby="saves-tab-saved">
          <SavesHub
            initial={{ items: data.items, nextCursor: data.nextCursor, folders: data.folders }}
          />
        </div>
      )}
      {tab === 'wishlist' && (
        <div
          role="tabpanel"
          id="saves-panel-wishlist"
          aria-labelledby="saves-tab-wishlist"
          className="px-4 pt-4 pb-12"
        >
          <WishlistView initial={data.wishlist} />
        </div>
      )}
    </PageLayout>
  );
}
