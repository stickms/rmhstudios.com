import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';
import { AppearancePanel } from '@/components/settings/AppearancePanel';
import { AccessPrefsPanel } from '@/components/access/AccessPrefsPanel';
import { GameAssistPanel } from '@/components/settings/GameAssistPanel';
import { GlobeCursorPanel } from '@/components/settings/GlobeCursorPanel';
import { SettingsPageBody } from '@/components/settings/SettingsSection';

export const Route = createFileRoute('/_site/settings/appearance')({
  head: () => ({
    meta: [{ title: 'Appearance | RMH Studios' }, { name: 'robots', content: 'noindex' }],
  }),
  component: AppearanceSettingsPage,
});

function AppearanceSettingsPage() {
  const { t } = useTranslation('feed');
  const settingsLabel = t('settings', { defaultValue: 'Settings' });
  const title = t('settings-appearance', { defaultValue: 'Appearance' });
  return (
    <PageLayout
      title={title}
      wide
      backTo="/settings"
      backLabel={settingsLabel}
      breadcrumbs={[{ label: settingsLabel, to: '/settings' }, { label: title }]}
    >
      <SettingsPageBody>
        <AppearancePanel />
        <GlobeCursorPanel />
        {/* Game assists sit beside the site's own accessibility controls
            rather than on their own page: somebody looking for "make this
            usable" looks in one place, and the two halves of that answer —
            the chrome and the games — belong together. */}
        <GameAssistPanel />
        <AccessPrefsPanel />
      </SettingsPageBody>
    </PageLayout>
  );
}
