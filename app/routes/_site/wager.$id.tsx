import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Swords } from 'lucide-react';
import { useSession } from '@/components/Providers';
import { WagerCard } from '@/components/wager/WagerCard';
import { prefetchRouteQuery } from '@/lib/route/route-query';
import { wagerQuery } from '@/lib/wager/wager.queries';

export const Route = createFileRoute('/_site/wager/$id')({
  head: () => ({ meta: [{ title: 'Wager Match | RMH Studios' }] }),
  loader: ({ context, params }) => prefetchRouteQuery(context.queryClient, wagerQuery(params.id)),
  component: WagerDetailPage,
});

function WagerDetailPage() {
  const { t } = useTranslation('c-wager');
  const { id } = Route.useParams();
  const { data: session } = useSession();
  const viewerId = session?.user?.id ?? null;
  const queryClient = useQueryClient();
  const query = wagerQuery(id);
  // An unknown (or unreadable) match is the "no longer exists" state.
  const { data, isPending: loading } = useQuery(query);
  const wager = data?.wager ?? null;

  return (
    <PageLayout
      title={t('detail-title', { defaultValue: 'Wager Match' })}
      backTo="/wager"
      backLabel={t('back', { defaultValue: 'Back to wagers' })}
    >
      <div className="max-w-xl">
        {loading ? (
          <Skeleton className="h-48 rounded-site" />
        ) : wager ? (
          <WagerCard
            wager={wager}
            viewerId={viewerId}
            onChange={(w) => w && queryClient.setQueryData(query.queryKey, { wager: w })}
          />
        ) : (
          <EmptyState
            icon={Swords}
            title={t('not-found', { defaultValue: 'This match no longer exists.' })}
          />
        )}
      </div>
    </PageLayout>
  );
}
