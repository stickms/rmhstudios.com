import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { AdminBody } from '@/components/admin/AdminBody';
import { MediaSweepPanel } from '@/components/admin/media-sweep/MediaSweepPanel';
import { PageLayout } from '@/components/feed/PageLayout';
import { NoMargin } from '@/components/shell/NoMargin';

export const Route = createFileRoute('/_site/admin/media-sweep')({
  head: () => ({
    meta: [{ title: 'Media sweep | Admin | RMH Studios' }],
  }),
  component: AdminMediaSweepPage,
});

function AdminMediaSweepPage() {
  const { t } = useTranslation('media-sweep');
  return (
    <PageLayout
      title={t('page-title', { defaultValue: 'Media sweep' })}
      description={t('page-description', {
        defaultValue:
          'Stored uploads nobody uses, removed on a schedule. Preview what a run would delete before it runs.',
      })}
      wide
      backTo="/admin"
    >
      <NoMargin />
      <AdminBody width="wide">
        <MediaSweepPanel />
      </AdminBody>
    </PageLayout>
  );
}
