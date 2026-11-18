import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';
import { AppearancePanel } from '@/components/settings/AppearancePanel';
import { AccessPrefsPanel } from '@/components/access/AccessPrefsPanel';
import { SettingsPageBody } from '@/components/settings/SettingsSection';
import { fetchOwnedThemes } from '@/lib/themes/owned-themes.functions';

export const Route = createFileRoute('/_site/settings/appearance')({
  head: () => ({
    meta: [{ title: 'Appearance | RMH Studios' }, { name: 'robots', content: 'noindex' }],
  }),
  loader: async () => ({ ownedThemes: await fetchOwnedThemes() }),
  component: AppearanceSettingsPage,
});

function AppearanceSettingsPage() {
  const { t } = useTranslation('feed');
  const { ownedThemes } = Route.useLoaderData();
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
        <AppearancePanel ownedThemes={ownedThemes} />
        <AccessPrefsPanel />
      </SettingsPageBody>
    </PageLayout>
  );
}
