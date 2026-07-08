/**
 * RMHHomes — my alerts (/homes/watches)
 *
 * Manage saved-search watches: pause/resume or delete. New watches are created
 * from the Browse page's "Watch" button.
 */
import { createFileRoute, Link } from '@tanstack/react-router';
import { Loader2 } from 'lucide-react';
import { PageLayout } from '@/components/feed/PageLayout';
import { useSession } from '@/components/Providers';
import { Button } from '@/components/ui/button';
import { WatchManager } from '@/components/homes/WatchManager';

export const Route = createFileRoute('/_site/homes/watches')({
  head: () => ({ meta: [{ title: 'RMHHomes — My alerts' }] }),
  component: HomesWatchesPage,
});

function HomesWatchesPage() {
  const { data: session, isPending } = useSession();

  if (isPending) {
    return (
      <PageLayout title="Alerts" backTo="/homes" wide>
        <div className="grid place-items-center py-24 text-site-text-muted">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </PageLayout>
    );
  }

  if (!session) {
    return (
      <PageLayout title="Alerts" backTo="/homes" wide>
        <div className="mx-auto max-w-md px-4 py-20 text-center text-site-text-dim">
          <p className="mb-4">Sign in to manage your listing alerts.</p>
          <Link to="/login" search={{ callbackURL: '/homes/watches' }}>
            <Button>Sign in</Button>
          </Link>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout title="Alerts" backTo="/homes" backLabel="Back to browse" wide>
      <div className="mx-auto w-full max-w-3xl px-4 pb-16 pt-4 md:px-6">
        <p className="mb-4 text-sm text-site-text-muted">
          You’ll get a notification when a new listing matches one of your active alerts.
        </p>
        <WatchManager />
      </div>
    </PageLayout>
  );
}
