import { createFileRoute } from '@tanstack/react-router';
import { PageLayout } from '@/components/feed/PageLayout';
import { CircleManager } from '@/components/circle/CircleManager';

export const Route = createFileRoute('/_site/settings/circle')({
  head: () => ({
    meta: [{ title: 'Close Friends | RMH Studios' }, { name: 'robots', content: 'noindex' }],
  }),
  component: CircleSettingsPage,
});

function CircleSettingsPage() {
  return (
    <PageLayout
      title="Close Friends"
      backTo="/settings"
      breadcrumbs={[{ label: 'Settings', to: '/settings' }, { label: 'Close Friends' }]}
    >
      <div className="px-4 pt-4 pb-12">
        <CircleManager />
      </div>
    </PageLayout>
  );
}
