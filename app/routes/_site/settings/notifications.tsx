import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { prefetchRouteQuery } from '@/lib/route/route-query';
import {
  discoveryAlertsQuery,
  discoveryMemoriesQuery,
  emailPrefsQuery,
} from '@/lib/settings/prefs.queries';
import { PageLayout } from '@/components/feed/PageLayout';
import { DiscoverySettings } from '@/components/discovery/DiscoverySettings';
import { NotificationSettings } from '@/components/settings/NotificationSettings';
import { EmailSettings } from '@/components/settings/EmailSettings';
import { SettingsPageBody } from '@/components/settings/SettingsSection';

export const Route = createFileRoute('/_site/settings/notifications')({
  head: () => ({
    meta: [{ title: 'Notifications | RMH Studios' }, { name: 'robots', content: 'noindex' }],
  }),
  loader: async ({ context }) => {
    await Promise.all([
      prefetchRouteQuery(context.queryClient, discoveryAlertsQuery()),
      prefetchRouteQuery(context.queryClient, discoveryMemoriesQuery()),
      prefetchRouteQuery(context.queryClient, emailPrefsQuery()),
    ]);
    return undefined;
  },
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
        <EmailSettings />
        <DiscoverySettings />
      </SettingsPageBody>
    </PageLayout>
  );
}
