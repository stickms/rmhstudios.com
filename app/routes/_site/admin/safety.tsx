import { useState } from 'react';
import { AdminBody } from '@/components/admin/AdminBody';
import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';
import { PageTabs } from '@/components/feed/PageTabs';
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
    <PageLayout
      title={t('admin-title', { defaultValue: 'Safety Tools' })}
      wide
      backTo="/admin"
      backLabel={t('back-to-admin', { defaultValue: 'Back to admin' })}
    >
      <PageTabs
        tabs={[
          { id: 'links', label: t('admin-tab-links', { defaultValue: 'Link warnings' }) },
          { id: 'view-as', label: t('admin-tab-view-as', { defaultValue: 'View as member' }) },
        ]}
        value={tab}
        onChange={(id) => setTab(id as typeof tab)}
        aria-label={t('admin-title', { defaultValue: 'Safety Tools' })}
      />
      <AdminBody width="narrow">{tab === 'links' ? <LinkRulesAdmin /> : <ViewAsAdmin />}</AdminBody>
    </PageLayout>
  );
}
