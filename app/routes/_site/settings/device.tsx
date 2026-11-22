/** This device: what the site keeps in this browser, and clearing it. Personal, so noindex and not in the sitemap. */

import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';
import { DeviceDataPanel } from '@/components/settings/DeviceDataPanel';
import { SettingsPageBody } from '@/components/settings/SettingsSection';
import { noindexHead } from '@/lib/seo';

export const Route = createFileRoute('/_site/settings/device')({
  head: () => noindexHead('This device'),
  component: DevicePage,
});

function DevicePage() {
  const { t } = useTranslation('device-data');
  const settingsLabel = t('settings', {
    defaultValue: 'Settings',
  });
  const title = t('page-title', {
    defaultValue: 'This device',
  });

  return (
    <PageLayout
      title={title}
      description={t('page-description', {
        defaultValue: 'What this site has stored in this browser, and how to clear it.',
      })}
      wide
      backTo="/settings"
      backLabel={settingsLabel}
      breadcrumbs={[
        {
          label: settingsLabel,
          to: '/settings',
        },
        {
          label: title,
        },
      ]}
    >
      <SettingsPageBody>
        <DeviceDataPanel />
      </SettingsPageBody>
    </PageLayout>
  );
}
