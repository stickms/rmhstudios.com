import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';
import { CircleManager } from '@/components/circle/CircleManager';
import { SettingsPageBody } from '@/components/settings/SettingsSection';

export const Route = createFileRoute('/_site/settings/circle')({
  head: () => ({
    meta: [{ title: 'Close Friends | RMH Studios' }, { name: 'robots', content: 'noindex' }],
  }),
  component: CircleSettingsPage,
});

function CircleSettingsPage() {
  const { t } = useTranslation('feed');
  const settingsLabel = t('settings', { defaultValue: 'Settings' });
  const title = t('settings-circle-title', { defaultValue: 'Close Friends' });
  return (
    <PageLayout
      title={title}
      wide
      backTo="/settings"
      backLabel={settingsLabel}
      breadcrumbs={[{ label: settingsLabel, to: '/settings' }, { label: title }]}
    >
      <SettingsPageBody>
        <CircleManager />
      </SettingsPageBody>
    </PageLayout>
  );
}
