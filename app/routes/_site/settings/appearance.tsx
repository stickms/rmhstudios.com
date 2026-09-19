import { createFileRoute } from '@tanstack/react-router';
import { PageLayout } from '@/components/feed/PageLayout';
import { AppearancePanel } from '@/components/settings/AppearancePanel';
import { GameAssistPanel } from '@/components/settings/GameAssistPanel';

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
      <div className="space-y-4 px-4 pt-4 pb-12">
        <AppearancePanel />
        {/* Game assists sit beside the site's own accessibility controls
            rather than on their own page: somebody looking for "make this
            usable" looks in one place, and the two halves of that answer —
            the chrome and the games — belong together. */}
        <GameAssistPanel />
      </div>
    </PageLayout>
  );
}
