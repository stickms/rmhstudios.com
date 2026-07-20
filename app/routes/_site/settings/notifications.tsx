import { createFileRoute } from '@tanstack/react-router';
import { PageLayout } from '@/components/feed/PageLayout';
import { NotificationSettings } from '@/components/settings/NotificationSettings';

export const Route = createFileRoute('/_site/settings/notifications')({
  head: () => ({
    meta: [{ title: 'Notifications | RMH Studios' }, { name: 'robots', content: 'noindex' }],
  }),
  component: NotificationSettingsPage,
});

function NotificationSettingsPage() {
  return (
    <PageLayout
      title="Notifications"
      backTo="/settings"
      breadcrumbs={[{ label: 'Settings', to: '/settings' }, { label: 'Notifications' }]}
    >
      <div className="px-4 pt-4 pb-12">
        <NotificationSettings />
      </div>
    </PageLayout>
  );
}
