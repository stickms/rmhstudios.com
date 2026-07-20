import { createFileRoute } from '@tanstack/react-router';
import { PageLayout } from '@/components/feed/PageLayout';
import { AppearancePanel } from '@/components/settings/AppearancePanel';

export const Route = createFileRoute('/_site/settings/appearance')({
  head: () => ({
    meta: [{ title: 'Appearance | RMH Studios' }, { name: 'robots', content: 'noindex' }],
  }),
  component: AppearanceSettingsPage,
});

function AppearanceSettingsPage() {
  return (
    <PageLayout
      title="Appearance"
      backTo="/settings"
      breadcrumbs={[
        { label: 'Settings', to: '/settings' },
        { label: 'Appearance' },
      ]}
    >
      <div className="px-4 pt-4 pb-12">
        <AppearancePanel />
      </div>
    </PageLayout>
  );
}
