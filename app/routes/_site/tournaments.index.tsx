import { createFileRoute, Link } from '@tanstack/react-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Trophy, Plus, Coins, Users } from 'lucide-react';
import { PageLayout } from '@/components/feed/PageLayout';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useSession } from '@/components/Providers';
import { CreateTournamentDialog } from '@/components/tournaments/CreateTournamentDialog';
import type { SerializedTournament } from '@/lib/tournaments/tournament.server';

export const Route = createFileRoute('/_site/tournaments/')({
  head: () => ({
    meta: [
      { title: 'Tournaments | RMH Studios' },
      {
        name: 'description',
        content: 'Compete in coin-prize bracket tournaments across RMH Studios games.',
      },
    ],
  }),
  component: TournamentsPage,
});

const TABS = [
  { key: 'REGISTRATION', label: 'Open' },
  { key: 'LIVE', label: 'Live' },
  { key: 'COMPLETE', label: 'Finished' },
] as const;

function TournamentsPage() {
  const { t } = useTranslation('c-tournaments');
  const { data: session } = useSession();
  const viewerId = session?.user?.id ?? null;
  const [status, setStatus] = useState<(typeof TABS)[number]['key']>('REGISTRATION');
  const [items, setItems] = useState<SerializedTournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/tournaments?status=${status}`);
      const data = await res.json().catch(() => ({ tournaments: [] }));
      setItems(res.ok ? (data.tournaments ?? []) : []);
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <PageLayout
      title={t('title', { defaultValue: 'Tournaments' })}
      wide
      headerRight={
        viewerId ? (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="size-4" />
            {t('host', { defaultValue: 'Host' })}
          </Button>
        ) : null
      }
    >
      <div className="flex gap-2 mb-4" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            role="tab"
            aria-selected={status === tab.key}
            onClick={() => setStatus(tab.key)}
            className={`px-3.5 py-1.5 rounded-site text-sm font-medium transition-colors ${
              status === tab.key
                ? 'bg-site-accent-dim text-site-accent'
                : 'text-site-text-dim hover:text-site-text hover:bg-site-surface-hover'
            }`}
          >
            {tab.key === 'REGISTRATION'
              ? t('tab-open', { defaultValue: 'Open' })
              : tab.key === 'LIVE'
                ? t('tab-live', { defaultValue: 'Live' })
                : t('tab-done', { defaultValue: 'Finished' })}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-32 rounded-site glass-fill animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
          <Trophy className="size-10 text-site-text-dim" />
          <p className="text-site-text-dim max-w-sm">
            {t('empty', { defaultValue: 'No tournaments here yet. Host one and set the prize!' })}
          </p>
          {viewerId && (
            <Button onClick={() => setCreating(true)}>
              {t('host', { defaultValue: 'Host a tournament' })}
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {items.map((tourney) => (
            <Link key={tourney.id} to="/tournaments/$id" params={{ id: tourney.id }}>
              <Card className="p-4 space-y-3 h-full" interactive>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="font-semibold truncate">{tourney.name}</h2>
                    <p className="text-sm text-site-text-dim truncate">
                      {tourney.gameTitle ?? tourney.gameId}
                      {' · '}
                      {tourney.format === 'ROUND_ROBIN'
                        ? t('round-robin', { defaultValue: 'Round robin' })
                        : t('single-elim', { defaultValue: 'Single elim' })}
                    </p>
                  </div>
                  {tourney.status === 'LIVE' && (
                    <Badge variant="accent">{t('live', { defaultValue: 'Live' })}</Badge>
                  )}
                  {tourney.status === 'COMPLETE' && (
                    <Badge variant="success">{t('done', { defaultValue: 'Done' })}</Badge>
                  )}
                </div>
                <div className="flex items-center gap-4 text-sm text-site-text-dim">
                  <span className="flex items-center gap-1.5">
                    <Coins className="size-4 text-yellow-500" />
                    {t('prize', { defaultValue: '{{n}} prize', n: tourney.prizePoolCoins })}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Users className="size-4" />
                    {tourney.playerCount}/{tourney.maxPlayers}
                  </span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {creating && (
        <CreateTournamentDialog open={creating} onClose={() => setCreating(false)} />
      )}
    </PageLayout>
  );
}
