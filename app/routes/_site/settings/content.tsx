import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { prefetchRouteQuery } from '@/lib/route/route-query';
import { feedSignalsQuery } from '@/lib/feed/signals.queries';
import { quietCountsQuery } from '@/lib/feed/quiet-counts.queries';
import { altTextSettingQuery, autoDeleteSettingQuery } from '@/lib/settings/prefs.queries';
import { PageLayout } from '@/components/feed/PageLayout';
import { FeedControlsSettings } from '@/components/settings/FeedControlsSettings';
import { RequireAltTextSetting } from '@/components/settings/RequireAltTextSetting';
import { AutoDeleteSetting } from '@/components/posts-plus/AutoDeleteSetting';
import { RepostMutesSection } from '@/components/settings/RepostMutesSection';
import { MissingAltTextSection } from '@/components/settings/MissingAltTextSection';
import { SettingsPageBody } from '@/components/settings/SettingsSection';

export const Route = createFileRoute('/_site/settings/content')({
  head: () => ({
    meta: [{ title: 'Content preferences | RMH Studios' }, { name: 'robots', content: 'noindex' }],
  }),
  loader: async ({ context }) => {
    await Promise.all([
      prefetchRouteQuery(context.queryClient, feedSignalsQuery()),
      prefetchRouteQuery(context.queryClient, altTextSettingQuery()),
      prefetchRouteQuery(context.queryClient, autoDeleteSettingQuery()),
      prefetchRouteQuery(context.queryClient, quietCountsQuery()),
    ]);
    return undefined;
  },
  component: ContentSettingsPage,
});

function ContentSettingsPage() {
  const { t } = useTranslation('feed');
  const settingsLabel = t('settings', { defaultValue: 'Settings' });
  const title = t('settings-content-title', { defaultValue: 'Content preferences' });
  return (
    <PageLayout
      title={title}
      wide
      backTo="/settings"
      backLabel={settingsLabel}
      breadcrumbs={[{ label: settingsLabel, to: '/settings' }, { label: title }]}
    >
      <SettingsPageBody>
        <RequireAltTextSetting />
        <AutoDeleteSetting />
        <FeedControlsSettings />
        <RepostMutesSection />
        <MissingAltTextSection />
      </SettingsPageBody>
    </PageLayout>
  );
}
