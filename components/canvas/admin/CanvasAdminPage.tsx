import { lazy, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Grid2x2, StickyNote } from 'lucide-react';
import { AdminBody } from '@/components/admin/AdminBody';
import { PageLayout } from '@/components/feed/PageLayout';
import { Tabs } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrivalSuspense } from '@/components/ui/arrive';

const panels = {
  canvas: lazy(() => import('./CanvasPanel')),
  notes: lazy(() => import('./NotesPanel')),
};
type Tab = keyof typeof panels;

/** /admin/canvas — start pixel-canvas events (Z5) and hide context notes (X3). */
export function CanvasAdminPage() {
  const { t } = useTranslation('f-canvas');
  const [tab, setTab] = useState<Tab>('canvas');
  const Panel = panels[tab];
  return (
    <PageLayout
      title={t('admin-page-title', { defaultValue: 'Canvas and context notes' })}
      description={t('admin-page-desc', {
        defaultValue: 'Schedule community canvas events and moderate context notes on posts.',
      })}
      wide
      backTo="/admin"
    >
      <AdminBody>
        <Tabs
          aria-label={t('admin-tabs', { defaultValue: 'Canvas admin sections' })}
          value={tab}
          onChange={(id) => setTab(id as Tab)}
          tabs={[
            {
              id: 'canvas',
              label: t('admin-tab-canvas', { defaultValue: 'Canvas' }),
              icon: Grid2x2,
            },
            {
              id: 'notes',
              label: t('admin-tab-notes', { defaultValue: 'Context notes' }),
              icon: StickyNote,
            },
          ]}
        />
        {/* AdminBody spaces its children (space-y), so each panel fades itself. */}
        <ArrivalSuspense fallback={<Skeleton className="h-48 w-full" />} wrap={false}>
          <Panel />
        </ArrivalSuspense>
      </AdminBody>
    </PageLayout>
  );
}
