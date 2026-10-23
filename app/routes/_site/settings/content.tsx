import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';
import { FeedControlsSettings } from '@/components/settings/FeedControlsSettings';
import { HideBotsSetting } from '@/components/settings/HideBotsSetting';
import { RequireAltTextSetting } from '@/components/settings/RequireAltTextSetting';
import { AutoDeleteSetting } from '@/components/posts-plus/AutoDeleteSetting';
import { SettingsPageBody } from '@/components/settings/SettingsSection';

export const Route = createFileRoute('/_site/settings/content')({
  head: () => ({
    meta: [{ title: 'Content preferences | RMH Studios' }, { name: 'robots', content: 'noindex' }],
  }),
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
        <HideBotsSetting />
        <AutoDeleteSetting />
        <FeedControlsSettings />
      </SettingsPageBody>
    </PageLayout>
  );
}
