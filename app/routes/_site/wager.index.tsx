import { createFileRoute } from '@tanstack/react-router';
import { buildCanonical, buildMeta } from '@/lib/seo';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Swords, Plus } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { PageLayout } from '@/components/feed/PageLayout';
import { Button } from '@/components/ui/button';
import { Tabs } from '@/components/ui/tabs';
import { useSession } from '@/components/Providers';
import { WagerCard } from '@/components/wager/WagerCard';
import { CreateWagerDialog } from '@/components/wager/CreateWagerDialog';
import type { SerializedWager } from '@/lib/wager/wager.server';
import { prefetchRouteQuery } from '@/lib/route/route-query';
import { wagersQuery } from '@/lib/wager/wager.queries';

export const Route = createFileRoute('/_site/wager/')({
  head: () => ({
    meta: buildMeta({
      title: 'Wager Matches | RMH Studios',
      description: 'Challenge anyone to a coin-staked head-to-head match on any skill game.',
      path: '/wager',
    }),
    links: [buildCanonical('/wager')],
  }),
  // The open tab is public and fetched here (SSR + intent preload); "mine" loads on demand.
  loader: ({ context }) => prefetchRouteQuery(context.queryClient, wagersQuery('open')),
  component: WagerPage,
});

function WagerPage() {
  const { t } = useTranslation('c-wager');
  const { data: session } = useSession();
  const viewerId = session?.user?.id ?? null;
  const [tab, setTab] = useState<'open' | 'mine'>('open');
  const [creating, setCreating] = useState(false);
  const queryClient = useQueryClient();
  const listOptions = wagersQuery(tab);
  const list = useQuery({ ...listOptions, retry: false });
  const loading = list.isPending;
  const wagers = list.data ?? [];

  const onCardChange = (id: string) => (next: SerializedWager | null) => {
    queryClient.setQueryData<SerializedWager[]>(listOptions.queryKey, (prev = []) =>
      next ? prev.map((w) => (w.id === id ? next : w)) : prev.filter((w) => w.id !== id),
    );
  };

  return (
    <PageLayout
      title={t('title', { defaultValue: 'Wager Matches' })}
      wide
      headerRight={
        viewerId ? (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="size-4" aria-hidden />
            {t('new-challenge', { defaultValue: 'New challenge' })}
          </Button>
        ) : null
      }
    >
      {/* §15.1: unified sheet + flowing-capsule tab strip below the page title.
          The "My matches" tab stays disabled (roving-nav-skipped) for guests. */}
      <div>
        <Tabs
          aria-label={t('title', { defaultValue: 'Wager Matches' })}
          value={tab}
          onChange={(id) => setTab(id as 'open' | 'mine')}
          tabs={[
            { id: 'open', label: t('tab-open', { defaultValue: 'Open challenges' }) },
            {
              id: 'mine',
              label: t('tab-mine', { defaultValue: 'My matches' }),
              disabled: !viewerId,
            },
          ]}
        />
      </div>

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-40 rounded-site" />
          ))}
        </div>
      ) : wagers.length === 0 ? (
        <EmptyState
          icon={Swords}
          title={
            tab === 'open'
              ? t('empty-open', {
                  defaultValue: 'No open challenges right now. Post one and stake some coins!',
                })
              : t('empty-mine', { defaultValue: "You haven't played any wager matches yet." })
          }
          action={
            viewerId ? (
              <Button onClick={() => setCreating(true)}>
                {t('new-challenge', { defaultValue: 'New challenge' })}
              </Button>
            ) : null
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {wagers.map((w) => (
            <WagerCard key={w.id} wager={w} viewerId={viewerId} onChange={onCardChange(w.id)} />
          ))}
        </div>
      )}

      {creating && (
        <CreateWagerDialog
          open={creating}
          onClose={() => setCreating(false)}
          onCreated={() => {
            setTab('mine');
            void queryClient.invalidateQueries({ queryKey: wagersQuery('mine').queryKey });
          }}
        />
      )}
    </PageLayout>
  );
}
