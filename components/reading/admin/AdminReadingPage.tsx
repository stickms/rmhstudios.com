'use client';

import { AdminBody } from '@/components/admin/AdminBody';
import { lazy, Suspense, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BookText, Layers } from 'lucide-react';
import { PageLayout } from '@/components/feed/PageLayout';
import { PageTabs } from '@/components/feed/PageTabs';
import { Skeleton } from '@/components/ui/skeleton';

const AdminGlossary = lazy(() => import('./AdminGlossary'));
const AdminStories = lazy(() => import('./AdminStories'));

/** Admin tools for the reading package: the lore glossary (L6) and news stories (L5). */
export function AdminReadingPage() {
  const { t } = useTranslation('f-reading');
  const [tab, setTab] = useState<'glossary' | 'stories'>('glossary');
  return (
    <PageLayout
      title={t('admin-reading', { defaultValue: 'Reading tools' })}
      description={t('admin-reading-lede', {
        defaultValue: 'Manage the lore glossary and group related news articles into stories.',
      })}
      wide
      backTo="/admin"
      backLabel={t('back-to-admin', { defaultValue: 'Back to admin' })}
    >
      <PageTabs
        aria-label={t('admin-reading-tabs', { defaultValue: 'Reading tools sections' })}
        value={tab}
        onChange={(id) => setTab(id === 'stories' ? 'stories' : 'glossary')}
        tabs={[
          {
            id: 'glossary',
            label: t('admin-tab-glossary', { defaultValue: 'Glossary' }),
            icon: BookText,
          },
          {
            id: 'stories',
            label: t('admin-tab-stories', { defaultValue: 'News stories' }),
            icon: Layers,
          },
        ]}
      />
      <AdminBody width="narrow">
        <Suspense fallback={<Skeleton className="h-40 w-full" />}>
          {tab === 'glossary' ? <AdminGlossary /> : <AdminStories />}
        </Suspense>
      </AdminBody>
    </PageLayout>
  );
}
