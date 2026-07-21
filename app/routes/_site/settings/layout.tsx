import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';
import { WidgetEditor } from '@/components/home/WidgetEditor';
import { SidebarEditMode } from '@/components/site/SidebarEditMode';

export const Route = createFileRoute('/_site/settings/layout')({
  head: () => ({
    meta: [{ title: 'Layout | RMH Studios' }, { name: 'robots', content: 'noindex' }],
  }),
  component: LayoutSettingsPage,
});

function LayoutSettingsPage() {
  const { t } = useTranslation('c-layout');
  return (
    <PageLayout
      title={t('layout', { defaultValue: 'Layout' })}
      backTo="/settings"
      breadcrumbs={[{ label: 'Settings', to: '/settings' }, { label: t('layout', { defaultValue: 'Layout' }) }]}
    >
      <div className="space-y-8 px-4 pt-4 pb-12">
        <section>
          <h2 className="mb-1 text-base font-semibold text-site-text">
            {t('home-widgets', { defaultValue: 'Home widgets' })}
          </h2>
          <p className="mb-4 text-sm text-site-text-muted">
            {t('home-widgets-desc', {
              defaultValue: 'Choose which widgets appear on your home page and in what order.',
            })}
          </p>
          <WidgetEditor />
        </section>

        <section>
          <h2 className="mb-1 text-base font-semibold text-site-text">
            {t('sidebar', { defaultValue: 'Sidebar' })}
          </h2>
          <p className="mb-4 text-sm text-site-text-muted">
            {t('sidebar-desc', {
              defaultValue:
                'Drag the tabs into the order you want, or hide the ones you don’t use. Hidden tabs stay reachable from search and their link.',
            })}
          </p>
          <SidebarEditMode />
        </section>
      </div>
    </PageLayout>
  );
}
