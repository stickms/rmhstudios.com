import { createFileRoute, Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';
import { TrashPanel } from '@/components/trash/TrashPanel';
import { BulkCleanupPanel } from '@/components/trash/BulkCleanupPanel';
import { Button } from '@/components/ui/button';
import { useSession } from '@/components/Providers';

/**
 * `/trash` — the recycle bin plus the bulk cleanup tools (plan I1 + I2).
 *
 * The two live on one page because they are one job: bulk delete routes through
 * the same soft delete, so everything a cleanup removes lands in the bin
 * directly above it and can be picked back out individually.
 *
 * `noindex`: the whole page is one account's deleted content.
 */
export const Route = createFileRoute('/_site/trash')({
  head: () => ({
    meta: [{ title: 'Trash | RMH Studios' }, { name: 'robots', content: 'noindex' }],
  }),
  component: TrashPage,
});

function TrashPage() {
  const { t } = useTranslation('settings-content');
  const { data: session, isPending } = useSession();

  return (
    <PageLayout
      title={t('trash-page-title', { defaultValue: 'Trash' })}
      description={t('trash-page-description', {
        defaultValue: 'Restore something you deleted, or clear out a lot of it at once.',
      })}
      backTo="/settings"
      breadcrumbs={[{ label: 'Settings', to: '/settings' }, { label: 'Trash' }]}
    >
      <div className="mx-auto flex max-w-2xl flex-col gap-8 px-4 pt-4 pb-12">
        {isPending ? null : session ? (
          <>
            <TrashPanel />
            <BulkCleanupPanel />
          </>
        ) : (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <p className="font-medium text-site-text">
              {t('trash-signed-out', { defaultValue: 'Sign in to see your deleted content' })}
            </p>
            <Link to="/login" search={{ callbackURL: '/trash' }}>
              <Button variant="accent">{t('trash-sign-in', { defaultValue: 'Sign in' })}</Button>
            </Link>
          </div>
        )}
      </div>
    </PageLayout>
  );
}
