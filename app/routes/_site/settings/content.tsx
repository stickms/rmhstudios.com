import { createFileRoute } from '@tanstack/react-router';
import { PageLayout } from '@/components/feed/PageLayout';
import { FeedControlsSettings } from '@/components/settings/FeedControlsSettings';
import { RequireAltTextSetting } from '@/components/settings/RequireAltTextSetting';

export const Route = createFileRoute('/_site/settings/content')({
  head: () => ({
    meta: [{ title: 'Content preferences | RMH Studios' }, { name: 'robots', content: 'noindex' }],
  }),
  component: ContentSettingsPage,
});

function ContentSettingsPage() {
  return (
    <PageLayout
      title="Content preferences"
      backTo="/settings"
      breadcrumbs={[{ label: 'Settings', to: '/settings' }, { label: 'Content' }]}
    >
      <div className="px-4 pt-4 pb-12">
        <RequireAltTextSetting />
        <FeedControlsSettings />
      </div>
    </PageLayout>
  );
}
