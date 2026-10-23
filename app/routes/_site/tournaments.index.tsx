import { SwissLabel } from '@/components/competitive/SwissStandings';
import { createFileRoute, Link } from '@tanstack/react-router';
import { buildCanonical, buildMeta } from '@/lib/seo';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Trophy, Plus, Coins, Users } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { PageLayout } from '@/components/feed/PageLayout';
import { Button } from '@/components/ui/button';
import { LiquidTabs } from '@/components/ui/liquid-tabs';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useSession } from '@/components/Providers';
import { CreateTournamentDialog } from '@/components/tournaments/CreateTournamentDialog';
import type { SerializedTournament } from '@/lib/tournaments/tournament.server';

export const Route = createFileRoute('/_site/tournaments/')({
  head: () => ({
    meta: buildMeta({
      title: 'Tournaments | RMH Studios',
      description: 'Compete in coin-prize bracket tournaments across RMH Studios games.',
      path: '/tournaments',
    }),
    links: [buildCanonical('/tournaments')],
  }),
  component: TournamentsPage,
});

type TournamentStatus = 'REGISTRATION' | 'LIVE' | 'COMPLETE';

function TournamentsPage() {
  const { t } = useTranslation('c-tournaments');
  const { data: session } = useSession();
  const viewerId = session?.user?.id ?? null;
  const [status, setStatus] = useState<TournamentStatus>('REGISTRATION');
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
      description={t('description', {
        defaultValue: 'Join open brackets, follow live matches, or host your own competition.',
      })}
      wide
      headerRight={
        viewerId ? (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="size-4" aria-hidden />
            {t('host-tournaments-index', { defaultValue: 'Host' })}
          </Button>
        ) : null
      }
    >
      {/* §15.1: unified sheet + flowing-capsule tab strip below the page title. */}
      <div>
        <LiquidTabs
          aria-label={t('title', { defaultValue: 'Tournaments' })}
          value={status}
          onChange={(id) => setStatus(id as TournamentStatus)}
          tabs={[
            { id: 'REGISTRATION', label: t('tab-open', { defaultValue: 'Open' }) },
            { id: 'LIVE', label: t('tab-live', { defaultValue: 'Live' }) },
            { id: 'COMPLETE', label: t('tab-done', { defaultValue: 'Finished' }) },
          ]}
          fullWidth
          scroll
        />
      </div>

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 rounded-site" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Trophy}
          title={t('empty', { defaultValue: 'No tournaments here yet. Host one and set the prize!' })}
          action={
            viewerId ? (
              <Button onClick={() => setCreating(true)}>
                {t('host', { defaultValue: 'Host a tournament' })}
              </Button>
            ) : null
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {items.map((tourney) => (
            <Link key={tourney.id} to="/tournaments/$id" params={{ id: tourney.id }}>
              <Card className="h-full gap-3 px-4 py-4" interactive>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="font-semibold truncate">{tourney.name}</h2>
                    <p className="text-sm text-site-text-dim truncate">
                      {tourney.gameTitle ?? tourney.gameId}
                      {' · '}
                      {tourney.format === 'SWISS'
                        ? <SwissLabel />
                        : tourney.format === 'ROUND_ROBIN'
                        ? t('round-robin', { defaultValue: 'Round robin' })
                        : t('single-elim-tournaments-index', { defaultValue: 'Single elim' })}
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
                  <span className="flex items-center gap-2">
                    <Coins className="size-4 text-site-warning" aria-hidden />
                    {t('prize', { defaultValue: '{{n}} prize', n: tourney.prizePoolCoins })}
                  </span>
                  <span className="flex items-center gap-2">
                    <Users className="size-4" aria-hidden />
                    {tourney.playerCount}/{tourney.maxPlayers}
                  </span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {creating && <CreateTournamentDialog open={creating} onClose={() => setCreating(false)} />}
    </PageLayout>
  );
}
