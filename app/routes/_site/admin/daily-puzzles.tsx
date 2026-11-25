import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { AdminBody } from '@/components/admin/AdminBody';
import { DailyPuzzlesAdmin } from '@/components/admin/DailyPuzzlesAdmin';
import { PageLayout } from '@/components/feed/PageLayout';
import { NoMargin } from '@/components/shell/NoMargin';

export const Route = createFileRoute('/_site/admin/daily-puzzles')({
  head: () => ({
    meta: [{ title: 'Daily puzzles | Admin | RMH Studios' }],
  }),
  component: AdminDailyPuzzlesPage,
});

function AdminDailyPuzzlesPage() {
  const { t } = useTranslation('puzzle-reports');
  return (
    <PageLayout
      title={t('page-title', { defaultValue: 'Daily puzzles' })}
      description={t('page-description', {
        defaultValue:
          'The coming puzzles with their answers, what players reported, and a way to replace one before its day starts.',
      })}
      wide
      backTo="/admin"
    >
      <NoMargin />
      <AdminBody width="wide">
        <DailyPuzzlesAdmin />
      </AdminBody>
    </PageLayout>
  );
}
