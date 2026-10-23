import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';
import { DiscoverySettings } from '@/components/discovery/DiscoverySettings';
import { NotificationSettings } from '@/components/settings/NotificationSettings';
import { SettingsPageBody } from '@/components/settings/SettingsSection';

export const Route = createFileRoute('/_site/settings/notifications')({
  head: () => ({
    meta: [{ title: 'Notifications | RMH Studios' }, { name: 'robots', content: 'noindex' }],
  }),
  component: NotificationSettingsPage,
});

function NotificationSettingsPage() {
  const { t } = useTranslation('feed');
  const settingsLabel = t('settings', { defaultValue: 'Settings' });
  const title = t('settings-notifications', { defaultValue: 'Notifications' });
  return (
    <PageLayout
      title={title}
      wide
      backTo="/settings"
      backLabel={settingsLabel}
      breadcrumbs={[{ label: settingsLabel, to: '/settings' }, { label: title }]}
    >
      <SettingsPageBody>
        <NotificationSettings />
        <DiscoverySettings />
      </SettingsPageBody>
    </PageLayout>
  );
}
