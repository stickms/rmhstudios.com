import { createFileRoute } from '@tanstack/react-router';
import { buildCanonical, buildMeta } from '@/lib/seo';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Swords, Plus } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { PageLayout } from '@/components/feed/PageLayout';
import { Button } from '@/components/ui/button';
import { LiquidTabs } from '@/components/ui/liquid-tabs';
import { useSession } from '@/components/Providers';
import { WagerCard } from '@/components/wager/WagerCard';
import { CreateWagerDialog } from '@/components/wager/CreateWagerDialog';
import type { SerializedWager } from '@/lib/wager/wager.server';

export const Route = createFileRoute('/_site/wager/')({
  head: () => ({
    meta: buildMeta({
      title: 'Wager Matches | RMH Studios',
      description: 'Challenge anyone to a coin-staked head-to-head match on any skill game.',
      path: '/wager',
    }),
    links: [buildCanonical('/wager')],
  }),
  component: WagerPage,
});

function WagerPage() {
  const { t } = useTranslation('c-wager');
  const { data: session } = useSession();
  const viewerId = session?.user?.id ?? null;
  const [tab, setTab] = useState<'open' | 'mine'>('open');
  const [wagers, setWagers] = useState<SerializedWager[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/wager?filter=${tab}`);
      const data = await res.json().catch(() => ({ wagers: [] }));
      setWagers(res.ok ? (data.wagers ?? []) : []);
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    void load();
  }, [load]);

  const onCardChange = (id: string) => (next: SerializedWager | null) => {
    setWagers((prev) =>
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
        <LiquidTabs
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
          onCreated={(w) => {
            setTab('mine');
            setWagers((prev) => [w, ...prev]);
          }}
        />
      )}
    </PageLayout>
  );
}
