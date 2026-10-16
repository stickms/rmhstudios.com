import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';
import CalendarSettings from '@/components/calendar/CalendarSettings';

export const Route = createFileRoute('/_site/settings/calendar')({
  head: () => ({
    meta: [{ title: 'Calendar | RMH Studios' }, { name: 'robots', content: 'noindex' }],
  }),
  component: CalendarSettingsPage,
});

function CalendarSettingsPage() {
  const { t } = useTranslation('f-calendar');
  return (
    <PageLayout
      title={t('settings-title', { defaultValue: 'Calendar' })}
      breadcrumbs={[
        { label: t('settings-crumb', { defaultValue: 'Settings' }), to: '/settings' },
        { label: t('settings-title', { defaultValue: 'Calendar' }) },
      ]}
    >
      <CalendarSettings />
    </PageLayout>
  );
}
