import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';
import AdventCalendar from '@/components/gifting/AdventCalendar';
import { useSession } from '@/components/Providers';
import { noindexHead } from '@/lib/seo';

export const Route = createFileRoute('/_site/advent')({
  head: () => noindexHead('Advent Calendar'),
  component: AdventPage,
});

function AdventPage() {
  const { t } = useTranslation('f-gifting');
  const { data: session } = useSession();
  return (
    <PageLayout
      title={t('advent-title', { defaultValue: 'Advent calendar' })}
      description={t('advent-desc', { defaultValue: 'A door a day through December.' })}
    >
      <div className="p-4">
        {session?.user ? (
          <AdventCalendar />
        ) : (
          <p className="text-sm text-site-text-muted">
            {t('advent-signin', { defaultValue: 'Sign in to open your doors.' })}
          </p>
        )}
      </div>
    </PageLayout>
  );
}
