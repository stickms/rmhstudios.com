import { createFileRoute } from '@tanstack/react-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Swords, Plus } from 'lucide-react';
import { PageLayout } from '@/components/feed/PageLayout';
import { Button } from '@/components/ui/button';
import { useSession } from '@/components/Providers';
import { WagerCard } from '@/components/wager/WagerCard';
import { CreateWagerDialog } from '@/components/wager/CreateWagerDialog';
import type { SerializedWager } from '@/lib/wager/wager.server';

export const Route = createFileRoute('/_site/wager/')({
  head: () => ({
    meta: [
      { title: 'Wager Matches | RMH Studios' },
      {
        name: 'description',
        content: 'Challenge anyone to a coin-staked head-to-head match on any skill game.',
      },
    ],
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
            <Plus className="size-4" />
            {t('new-challenge', { defaultValue: 'New challenge' })}
          </Button>
        ) : null
      }
    >
      {/* Tabs */}
      <div className="flex gap-2 mb-4" role="tablist">
        {(['open', 'mine'] as const).map((tk) => (
          <button
            key={tk}
            role="tab"
            aria-selected={tab === tk}
            onClick={() => setTab(tk)}
            disabled={tk === 'mine' && !viewerId}
            className={`px-3.5 py-1.5 rounded-site text-sm font-medium transition-colors disabled:opacity-40 ${
              tab === tk
                ? 'bg-site-accent-dim text-site-accent'
                : 'text-site-text-dim hover:text-site-text hover:bg-site-surface-hover'
            }`}
          >
            {tk === 'open'
              ? t('tab-open', { defaultValue: 'Open challenges' })
              : t('tab-mine', { defaultValue: 'My matches' })}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-40 rounded-site glass-fill animate-pulse" />
          ))}
        </div>
      ) : wagers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
          <Swords className="size-10 text-site-text-dim" />
          <p className="text-site-text-dim max-w-sm">
            {tab === 'open'
              ? t('empty-open', {
                  defaultValue: 'No open challenges right now. Post one and stake some coins!',
                })
              : t('empty-mine', { defaultValue: "You haven't played any wager matches yet." })}
          </p>
          {viewerId && (
            <Button onClick={() => setCreating(true)}>
              {t('new-challenge', { defaultValue: 'New challenge' })}
            </Button>
          )}
        </div>
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
