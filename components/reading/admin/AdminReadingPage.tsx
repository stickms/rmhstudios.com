'use client';

import { lazy, Suspense, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BookText, Layers } from 'lucide-react';
import { PageLayout } from '@/components/feed/PageLayout';
import { LiquidTabs } from '@/components/ui/liquid-tabs';
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
      backTo="/admin"
    >
      <div className="space-y-4 px-4 pt-4 pb-12">
        <LiquidTabs
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
        <Suspense fallback={<Skeleton className="h-40 w-full" />}>
          {tab === 'glossary' ? <AdminGlossary /> : <AdminStories />}
        </Suspense>
      </div>
    </PageLayout>
  );
}
