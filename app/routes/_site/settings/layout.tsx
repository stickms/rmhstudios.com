/**
 * /settings/layout — arrange the desktop sidebar's list of places.
 *
 * It also carried a "Home widgets" editor. The widget stack it configured was
 * rendered nowhere after the Steel front page replaced the dashboard, so every
 * change there was saved and never shown; the editor and the stack are gone
 * (settings audit, 2026-11-19). The sidebar editor was in the same state until
 * the Steel sidebar started reading the saved arrangement (`sidebarPlaces()`).
 */

import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';
import { SidebarEditMode } from '@/components/site/SidebarEditMode';
import { SettingsPageBody, SettingsSection } from '@/components/settings/SettingsSection';

export const Route = createFileRoute('/_site/settings/layout')({
  head: () => ({
    meta: [{ title: 'Sidebar | RMH Studios' }, { name: 'robots', content: 'noindex' }],
  }),
  component: LayoutSettingsPage,
});

function LayoutSettingsPage() {
  const { t } = useTranslation('c-layout');
  const { t: tf } = useTranslation('feed');
  const settingsLabel = tf('settings', { defaultValue: 'Settings' });
  const title = tf('settings-nav-layout', { defaultValue: 'Sidebar' });
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
          description={t('sidebar-places-desc', {
            defaultValue:
              'The places listed under Feed, Explore, Games and Inbox in the sidebar on wide screens. Put them in your order, or hide the ones you don’t use.',
          })}
        >
          <SidebarEditMode />
        </SettingsSection>
      </SettingsPageBody>
    </PageLayout>
  );
}
