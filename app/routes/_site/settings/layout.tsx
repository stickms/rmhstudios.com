import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';
import { WidgetEditor } from '@/components/home/WidgetEditor';
import { SidebarEditMode } from '@/components/site/SidebarEditMode';
import { DesktopNavSetting } from '@/components/settings/DesktopNavSetting';
import { SettingsPageBody, SettingsSection } from '@/components/settings/SettingsSection';

export const Route = createFileRoute('/_site/settings/layout')({
  head: () => ({
    meta: [{ title: 'Layout | RMH Studios' }, { name: 'robots', content: 'noindex' }],
  }),
  component: LayoutSettingsPage,
});

function LayoutSettingsPage() {
  const { t } = useTranslation('c-layout');
  const { t: tf } = useTranslation('feed');
  const settingsLabel = tf('settings', { defaultValue: 'Settings' });
  const title = t('layout', { defaultValue: 'Layout' });
  return (
    <PageLayout
      title={title}
      wide
      backTo="/settings"
      backLabel={settingsLabel}
      breadcrumbs={[{ label: settingsLabel, to: '/settings' }, { label: title }]}
    >
      <SettingsPageBody>
        <SettingsSection
          title={t('home-widgets', { defaultValue: 'Home widgets' })}
          description={t('home-widgets-desc', {
            defaultValue: 'Choose which widgets appear on your home page and in what order.',
          })}
        >
          <WidgetEditor />
        </SettingsSection>

        <SettingsSection
          title={t('desktop-nav', { defaultValue: 'Desktop navigation' })}
          description={t('desktop-nav-desc', {
            defaultValue: 'Choose what fills the left column on a wide screen.',
          })}
        >
          <DesktopNavSetting />
        </SettingsSection>

        <SettingsSection
          title={t('sidebar', { defaultValue: 'Sidebar' })}
          description={t('sidebar-desc', {
            defaultValue:
              'Drag the tabs into the order you want, or hide the ones you don’t use. Hidden tabs stay reachable from search and their link.',
          })}
        >
          <SidebarEditMode />
        </SettingsSection>
      </SettingsPageBody>
    </PageLayout>
  );
}
