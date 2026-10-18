'use client';

import { lazy, Suspense, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Grid2x2, StickyNote } from 'lucide-react';
import { PageLayout } from '@/components/feed/PageLayout';
import { LiquidTabs } from '@/components/ui/liquid-tabs';
import { Skeleton } from '@/components/ui/skeleton';

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
      backTo="/admin"
    >
      <div className="space-y-4 px-4 pt-4 pb-12">
        <LiquidTabs
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
        <Suspense fallback={<Skeleton className="h-48 w-full" />}>
          <Panel />
        </Suspense>
      </div>
    </PageLayout>
  );
}
