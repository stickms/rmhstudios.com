/**
 * The Tournaments section of `/compete`: open, live and finished brackets, and
 * the Host action. It was the `/tournaments` index page until the 2026-11-19
 * consolidation; `/tournaments/$id` is still its own page.
 */
import { SwissLabel } from '@/components/competitive/SwissStandings';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Trophy, Plus, Coins, Users } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useArrival } from '@/components/ui/arrive';
import { Button } from '@/components/ui/button';
import { Tabs } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { useSession } from '@/components/Providers';
import { Cells } from '@/components/ui/rules';
import { CreateTournamentDialog } from '@/components/tournaments/CreateTournamentDialog';
import { tournamentsQuery, type TournamentStatus } from '@/lib/tournaments/tournaments.queries';

export function TournamentsSection() {
  const { t } = useTranslation('c-tournaments');
  const { data: session } = useSession();
  const viewerId = session?.user?.id ?? null;
  const [status, setStatus] = useState<TournamentStatus>('REGISTRATION');
  const [creating, setCreating] = useState(false);
  const list = useQuery({ ...tournamentsQuery(status), retry: false });
  const loading = list.isPending;
  const items = list.data?.tournaments ?? [];
  const arrival = useArrival(!loading);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="t-body text-site-text-muted">
          {t('description', {
            defaultValue: 'Join open brackets, follow live matches, or host your own competition.',
          })}
        </p>
        {viewerId ? (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="size-4" aria-hidden />
            {t('host-tournaments-index', { defaultValue: 'Host' })}
          </Button>
        ) : null}
      </div>

      <div>
        <Tabs
          aria-label={t('title', { defaultValue: 'Tournaments' })}
          value={status}
          onChange={(id) => setStatus(id as TournamentStatus)}
          tabs={[
            { id: 'REGISTRATION', label: t('tab-open', { defaultValue: 'Open' }) },
            { id: 'LIVE', label: t('tab-live', { defaultValue: 'Live' }) },
            { id: 'COMPLETE', label: t('tab-done', { defaultValue: 'Finished' }) },
          ]}
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
          className={arrival}
          icon={Trophy}
          title={t('empty', { defaultValue: 'No tournaments here yet. Host one and set the prize!' })}
          action={
            viewerId ? (
              <Button onClick={() => setCreating(true)}>{t('host', { defaultValue: 'Host a tournament' })}</Button>
            ) : null
          }
        />
      ) : (
        <Cells columns={2} className={arrival}>
          {items.map((tourney) => (
            <li key={tourney.id}>
              <Link to="/tournaments/$id" params={{ id: tourney.id }} className="row-hover flex h-full flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="font-semibold truncate">{tourney.name}</h2>
                    <p className="text-sm text-site-text-muted truncate">
                      {tourney.gameTitle ?? tourney.gameId}
                      {' · '}
                      {tourney.format === 'SWISS' ? (
                        <SwissLabel />
                      ) : tourney.format === 'DOUBLE_ELIM' ? (
                        t('double-elim-label', { ns: 'double-elimination', defaultValue: 'Double elim' })
                      ) : tourney.format === 'ROUND_ROBIN' ? (
                        t('round-robin', { defaultValue: 'Round robin' })
                      ) : (
                        t('single-elim-tournaments-index', { defaultValue: 'Single elim' })
                      )}
                    </p>
                  </div>
                  {tourney.status === 'LIVE' && <Badge variant="default">{t('live', { defaultValue: 'Live' })}</Badge>}
                  {tourney.status === 'COMPLETE' && (
                    <Badge variant="success">{t('done', { defaultValue: 'Done' })}</Badge>
                  )}
                </div>
                <div className="flex items-center gap-4 text-sm text-site-text-muted">
                  <span className="flex items-center gap-2">
                    <Coins className="size-4 text-site-warning" aria-hidden />
                    {t('prize', { defaultValue: '{{n}} prize', n: tourney.prizePoolCoins })}
                  </span>
                  <span className="flex items-center gap-2">
                    <Users className="size-4" aria-hidden />
                    {tourney.playerCount}/{tourney.maxPlayers}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </Cells>
      )}

      {creating && <CreateTournamentDialog open={creating} onClose={() => setCreating(false)} />}
    </div>
  );
}
