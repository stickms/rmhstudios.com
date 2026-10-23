import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';
import CalendarSettings from '@/components/calendar/CalendarSettings';
import { SettingsPageBody } from '@/components/settings/SettingsSection';

export const Route = createFileRoute('/_site/settings/calendar')({
  head: () => ({
    meta: [{ title: 'Calendar | RMH Studios' }, { name: 'robots', content: 'noindex' }],
  }),
  component: CalendarSettingsPage,
});

function CalendarSettingsPage() {
  const { t } = useTranslation('f-calendar');
  const settingsLabel = t('settings-crumb', { defaultValue: 'Settings' });
  const title = t('settings-title', { defaultValue: 'Calendar' });
  return (
    <PageLayout
      title={title}
      wide
      backTo="/settings"
      backLabel={settingsLabel}
      breadcrumbs={[{ label: settingsLabel, to: '/settings' }, { label: title }]}
    >
      <SettingsPageBody>
        <CalendarSettings />
      </SettingsPageBody>
    </PageLayout>
  );
}
