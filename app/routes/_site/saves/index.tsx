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
 * Lists and Wishlist are NOT merged into the same store, because they are not
 * the same object: a list is a curated set of *accounts* read as its own
 * timeline, and a wishlist entry is shop intent carrying a target price. They
 * are tabs — one destination, three shelves — rather than one table pretending
 * three concepts are one.
 */

import { useCallback } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { useTranslation } from 'react-i18next';
import { Bookmark, ListOrdered, Gift } from 'lucide-react';
import { PageLayout } from '@/components/feed/PageLayout';
import { PageTabs } from '@/components/feed/PageTabs';
import { type LiquidTab } from '@/components/ui/liquid-tabs';
import { SavesHub } from '@/components/saves/SavesHub';
import { ListsManager } from '@/components/lists/ListsManager';
import { WishlistView } from '@/components/wishlist/WishlistView';
import { auth } from '@/lib/auth';
import { listSaves, listFolders } from '@/lib/saves/saves.server';
import { getUserLists } from '@/lib/lists/lists.server';
import { listWishlist } from '@/lib/wishlist/wishlist.server';
import type { HydratedSave, SaveFolderView } from '@/lib/saves/types';
import type { ListView } from '@/lib/lists/constants';
import type { WishlistItemView } from '@/lib/wishlist/types';

const SAVES_TABS = ['saved', 'lists', 'wishlist'] as const;
type SavesTab = (typeof SAVES_TABS)[number];

interface HubData {
  items: HydratedSave[];
  nextCursor: string | null;
  folders: SaveFolderView[];
  lists: ListView[];
  wishlist: WishlistItemView[];
}

const EMPTY: HubData = { items: [], nextCursor: null, folders: [], lists: [], wishlist: [] };

const fetchSaves = createServerFn({ method: 'GET' }).handler(async (): Promise<HubData> => {
  const request = getRequest();
  const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
  if (!session) return EMPTY;
  const userId = session.user.id;
  // All three shelves load together: they are one page, and switching tabs
  // costs no round trip. Each is a bounded per-user read.
  const [result, folders, lists, wishlist] = await Promise.all([
    listSaves(userId, {}),
    listFolders(userId),
    getUserLists(userId),
    listWishlist(userId),
  ]);
  return { ...result, folders, lists, wishlist };
});

export const Route = createFileRoute('/_site/saves/')({
  head: () => ({ meta: [{ title: 'Saved | RMH Studios' }, { name: 'robots', content: 'noindex' }] }),
  validateSearch: (search: Record<string, unknown>): { tab?: SavesTab } =>
    SAVES_TABS.includes(search.tab as SavesTab) ? { tab: search.tab as SavesTab } : {},
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

  const tabs: LiquidTab[] = [
    { id: 'saved', label: t('saves-tab-saved', { defaultValue: 'Saved' }), icon: Bookmark },
    { id: 'lists', label: t('saves-tab-lists', { defaultValue: 'Lists' }), icon: ListOrdered },
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
      {tab === 'lists' && (
        <div role="tabpanel" id="saves-panel-lists" aria-labelledby="saves-tab-lists">
          <ListsManager initial={data.lists} />
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
