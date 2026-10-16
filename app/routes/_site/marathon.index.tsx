import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';
import MarathonPlanner from '@/components/marathon/MarathonPlanner';
import { useSession } from '@/components/Providers';
import { noindexHead } from '@/lib/seo';

export const Route = createFileRoute('/_site/marathon/')({
  head: () => noindexHead('Marathon planner'),
  component: MarathonPage,
});

function MarathonPage() {
  const { t } = useTranslation('f-tools');
  const { data: session } = useSession();
  return (
    <PageLayout title={t('marathon-heading', { defaultValue: 'Marathon planner' })}>
      {session?.user ? (
        <MarathonPlanner />
      ) : (
        <p className="p-4 text-sm text-site-text-muted">
          {t('marathon-signin', { defaultValue: 'Sign in to build and share a watch list.' })}
        </p>
      )}
    </PageLayout>
  );
}
