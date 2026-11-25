import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useArrival } from '@/components/ui/arrive';
import { cn } from '@/lib/utils';
import { Swords } from 'lucide-react';
import { useSession } from '@/components/Providers';
import { WagerCard } from '@/components/wager/WagerCard';
import { prefetchRouteQuery } from '@/lib/route/route-query';
import { wagerQuery } from '@/lib/wager/wager.queries';
import { ExcludedWagerPage } from '@/components/settings/ExcludedNotice';
import { fetchExclusionNotice } from '@/lib/economy/exclusion-page.functions';

export const Route = createFileRoute('/_site/wager/$id')({
  head: () => ({ meta: [{ title: 'Wager Match | RMH Studios' }] }),
  // A self-excluded member gets the notice, decided on the server; the match is not even fetched for them.
  loader: async ({ context, params }) => {
    const notice = await fetchExclusionNotice();
    if (!notice.excluded) await prefetchRouteQuery(context.queryClient, wagerQuery(params.id));
    return notice;
  },
  component: WagerRoute,
});

function WagerRoute() {
  const notice = Route.useLoaderData();
  return notice.excluded ? <ExcludedWagerPage until={notice.until} /> : <WagerDetailPage />;
}

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
  const arrival = useArrival(!loading);

  return (
    <PageLayout
      title={t('detail-title', { defaultValue: 'Wager Match' })}
      backTo="/compete?tab=wagers"
      backLabel={t('back', { defaultValue: 'Back to wagers' })}
    >
      <div className={cn('max-w-xl', arrival)}>
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
