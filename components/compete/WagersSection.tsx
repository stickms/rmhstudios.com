/**
 * The Wagers section of `/compete`: open coin-staked challenges and the
 * viewer's own matches. It was the `/wager` index page until the 2026-11-19
 * consolidation; `/wager/$id` is still its own page. The "My matches" tab stays
 * disabled (skipped by the roving nav) for guests.
 */
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Swords, Plus } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useArrival } from '@/components/ui/arrive';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Tabs } from '@/components/ui/tabs';
import { useSession } from '@/components/Providers';
import { WagerCard } from '@/components/wager/WagerCard';
import { CreateWagerDialog } from '@/components/wager/CreateWagerDialog';
import type { SerializedWager } from '@/lib/wager/wager.server';
import { wagersQuery } from '@/lib/wager/wager.queries';

export function WagersSection() {
  const { t } = useTranslation('c-wager');
  const { data: session } = useSession();
  const viewerId = session?.user?.id ?? null;
  const [tab, setTab] = useState<'open' | 'mine'>('open');
  const [creating, setCreating] = useState(false);
  const queryClient = useQueryClient();
  const listOptions = wagersQuery(tab);
  const list = useQuery({ ...listOptions, retry: false });
  const loading = list.isPending;
  // A failed fetch (signed out on "mine", a 5xx) shows the empty state, as it always has.
  const wagers = list.data?.wagers ?? [];
  const arrival = useArrival(!loading);

  const onCardChange = (id: string) => (next: SerializedWager | null) => {
    queryClient.setQueryData(listOptions.queryKey, (prev) => {
      const rows = prev?.wagers ?? [];
      return {
        wagers: next ? rows.map((w) => (w.id === id ? next : w)) : rows.filter((w) => w.id !== id),
      };
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="t-body text-site-text-muted">
          {t('compete-description', {
            defaultValue: 'Challenge anyone to a coin-staked head-to-head match on any skill game.',
          })}
        </p>
        {viewerId ? (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="size-4" aria-hidden />
            {t('new-challenge', { defaultValue: 'New challenge' })}
          </Button>
        ) : null}
      </div>

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
          className={arrival}
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
              <Button onClick={() => setCreating(true)}>{t('new-challenge', { defaultValue: 'New challenge' })}</Button>
            ) : null
          }
        />
      ) : (
        <div className={cn('grid gap-3 sm:grid-cols-2', arrival)}>
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
    </div>
  );
}
