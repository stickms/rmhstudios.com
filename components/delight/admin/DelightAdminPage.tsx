'use client';

import { lazy, Suspense, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Cookie, Compass, Landmark, Languages, PartyPopper } from 'lucide-react';
import { PageLayout } from '@/components/feed/PageLayout';
import { LiquidTabs } from '@/components/ui/liquid-tabs';
import { Skeleton } from '@/components/ui/skeleton';

const panels = {
  hunt: lazy(() => import('./HuntPanel')),
  museum: lazy(() => import('./MuseumPanel')),
  fortunes: lazy(() => import('./FortunesPanel')),
  fools: lazy(() => import('./FoolsPanel')),
  translations: lazy(() => import('./TranslationsPanel')),
};
type Tab = keyof typeof panels;

/** /admin/delight — the admin side of the hunt, museum, fortunes, April Fools flag and translations. */
export function DelightAdminPage() {
  const { t } = useTranslation('f-delight');
  const [tab, setTab] = useState<Tab>('hunt');
  const Panel = panels[tab];
  return (
    <PageLayout
      title={t('admin-title', { defaultValue: 'Delight tools' })}
      description={t('admin-desc', {
        defaultValue:
          'Run the site hunt, curate the museum, moderate fortunes, flip April Fools, review translations.',
      })}
      backTo="/admin"
    >
      <div className="space-y-4 px-4 pt-4 pb-12">
        <LiquidTabs
          aria-label={t('admin-tabs', { defaultValue: 'Delight tools sections' })}
          value={tab}
          onChange={(id) => setTab(id as Tab)}
          scroll
          tabs={[
            { id: 'hunt', label: t('admin-tab-hunt', { defaultValue: 'Hunt' }), icon: Compass },
            {
              id: 'museum',
              label: t('admin-tab-museum', { defaultValue: 'Museum' }),
              icon: Landmark,
            },
            {
              id: 'fortunes',
              label: t('admin-tab-fortunes', { defaultValue: 'Fortunes' }),
              icon: Cookie,
            },
            {
              id: 'fools',
              label: t('admin-tab-fools', { defaultValue: 'April Fools' }),
              icon: PartyPopper,
            },
            {
              id: 'translations',
              label: t('admin-tab-translations', { defaultValue: 'Translations' }),
              icon: Languages,
            },
          ]}
        />
        <Suspense fallback={<Skeleton className="h-40 w-full" />}>
          <Panel />
        </Suspense>
      </div>
    </PageLayout>
  );
}
