import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';
import { LiquidTabs } from '@/components/ui/liquid-tabs';
import { LinkRulesAdmin } from '@/components/safety/LinkRulesAdmin';
import { ViewAsAdmin } from '@/components/safety/ViewAsAdmin';

export const Route = createFileRoute('/_site/admin/safety')({
  head: () => ({ meta: [{ title: 'Safety Tools | RMH Studios' }] }),
  component: AdminSafetyPage,
});

function AdminSafetyPage() {
  const { t } = useTranslation('f-safety');
  const [tab, setTab] = useState<'links' | 'view-as'>('links');
  return (
    <PageLayout title={t('admin-title', { defaultValue: 'Safety Tools' })} wide backTo="/admin">
      <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4 md:p-8">
        <LiquidTabs
          tabs={[
            { id: 'links', label: t('admin-tab-links', { defaultValue: 'Link warnings' }) },
            { id: 'view-as', label: t('admin-tab-view-as', { defaultValue: 'View as member' }) },
          ]}
          value={tab}
          onChange={(id) => setTab(id as typeof tab)}
          aria-label={t('admin-title', { defaultValue: 'Safety Tools' })}
        />
        {tab === 'links' ? <LinkRulesAdmin /> : <ViewAsAdmin />}
      </div>
    </PageLayout>
  );
}
