import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';
import { KeyboardSettings } from '@/components/settings/KeyboardSettings';
import { SettingsPageBody } from '@/components/settings/SettingsSection';

export const Route = createFileRoute('/_site/settings/keyboard')({
  head: () => ({
    meta: [{ title: 'Keyboard | RMH Studios' }, { name: 'robots', content: 'noindex' }],
  }),
  component: KeyboardSettingsPage,
});

function KeyboardSettingsPage() {
  const { t } = useTranslation('keyboard');
  const settingsLabel = t('settings', { defaultValue: 'Settings' });
  const title = t('title', { defaultValue: 'Keyboard' });
  return (
    <PageLayout
      title={title}
      wide
      backTo="/settings"
      backLabel={settingsLabel}
      breadcrumbs={[{ label: settingsLabel, to: '/settings' }, { label: title }]}
    >
      <SettingsPageBody>
        <KeyboardSettings />
      </SettingsPageBody>
    </PageLayout>
  );
}
