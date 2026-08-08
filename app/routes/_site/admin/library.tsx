/**
 * `/admin/library` — library administration, in one place.
 *
 * This was two destinations, `/admin/library-quota` and `/admin/library-storage`,
 * reached from two cards on the admin hub and connected to each other by
 * nothing: both ended in `backTo="/admin"`, so going from "who is waiting on an
 * upload appeal" to "is the object store even healthy" meant a round trip
 * through the dashboard. They are two questions about one subsystem, and the
 * answer to the second changes what you do about the first — approving a cap
 * increase while storage is ephemeral grants somebody more room on a disk that
 * disappears when the container recycles.
 *
 * So: one page, two `?tab=` panels. Both old URLs redirect here, since they were
 * linked from the hub and possibly bookmarked.
 *
 * `?tab=` rather than two child routes: neither panel is indexable (the whole
 * admin section is classified `admin` in `lib/sitemap.ts`), so nothing is gained
 * by giving each its own crawlable URL, and a tablist keeps the switch instant
 * with no second navigation.
 */

import { useCallback, useState } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Inbox, Loader2, RefreshCw, HardDrive } from 'lucide-react';
import { PageLayout } from '@/components/feed/PageLayout';
import { PageTabs } from '@/components/feed/PageTabs';
import { type LiquidTab } from '@/components/ui/liquid-tabs';
import { Button } from '@/components/ui/button';
import { QuotaAppealsPanel } from '@/components/admin/library/QuotaAppealsPanel';
import { StorageHealthPanel } from '@/components/admin/library/StorageHealthPanel';

const LIBRARY_TABS = ['appeals', 'storage'] as const;
type LibraryTab = (typeof LIBRARY_TABS)[number];

export const Route = createFileRoute('/_site/admin/library')({
  head: () => ({ meta: [{ title: 'Library | Admin | RMH Studios' }] }),
  validateSearch: (search: Record<string, unknown>): { tab?: LibraryTab } =>
    LIBRARY_TABS.includes(search.tab as LibraryTab) ? { tab: search.tab as LibraryTab } : {},
  component: AdminLibraryPage,
});

function AdminLibraryPage() {
  const { t } = useTranslation('admin');
  const { tab = 'appeals' } = Route.useSearch();
  const navigate = useNavigate();
  const [storageLoading, setStorageLoading] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  const setTab = useCallback(
    (next: string) => {
      void navigate({ to: '/admin/library', search: { tab: next as LibraryTab }, replace: true });
    },
    [navigate],
  );

  const tabs: LiquidTab[] = [
    {
      id: 'appeals',
      label: t('library-quota-tab', { defaultValue: 'Upload appeals' }),
      icon: Inbox,
    },
    {
      id: 'storage',
      label: t('library-storage-tab', { defaultValue: 'Storage health' }),
      icon: HardDrive,
    },
  ];

  return (
    <PageLayout
      title={t('library-admin-title', { defaultValue: 'Library' })}
      backTo="/admin"
      backLabel={t('back-to-admin', { defaultValue: 'Back to admin' })}
      wide
      headerRight={
        // Only the storage panel has anything to refresh; the appeal queue
        // re-fetches itself when a decision removes a row.
        tab === 'storage' ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setReloadToken((n) => n + 1)}
            disabled={storageLoading}
          >
            {storageLoading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            {t('refresh', { defaultValue: 'Refresh' })}
          </Button>
        ) : undefined
      }
    >
      <PageTabs
        tabs={tabs}
        value={tab}
        onChange={setTab}
        idBase="admin-library"
        aria-label={t('library-admin-title', { defaultValue: 'Library' })}
      />

      <div className="mx-auto w-full max-w-4xl px-4 pt-2 pb-12 md:px-8">
        {tab === 'appeals' && (
          <div
            role="tabpanel"
            id="admin-library-panel-appeals"
            aria-labelledby="admin-library-tab-appeals"
          >
            <QuotaAppealsPanel />
          </div>
        )}
        {tab === 'storage' && (
          <div
            role="tabpanel"
            id="admin-library-panel-storage"
            aria-labelledby="admin-library-tab-storage"
          >
            <StorageHealthPanel
              reloadToken={reloadToken}
              onRefreshStateChange={setStorageLoading}
            />
          </div>
        )}
      </div>
    </PageLayout>
  );
}
