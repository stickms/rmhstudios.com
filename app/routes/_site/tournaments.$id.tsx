import { createFileRoute } from '@tanstack/react-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Coins, Users, Play, Trophy, Medal } from 'lucide-react';
import { PageLayout } from '@/components/feed/PageLayout';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { useSession } from '@/components/Providers';
import { BracketView } from '@/components/tournaments/BracketView';
import type { SerializedTournament } from '@/lib/tournaments/tournament.server';

export const Route = createFileRoute('/_site/tournaments/$id')({
  head: () => ({ meta: [{ title: 'Tournament | RMH Studios' }] }),
  component: TournamentDetailPage,
});

function TournamentDetailPage() {
  const { t } = useTranslation('c-tournaments');
  const { id } = Route.useParams();
  const { data: session } = useSession();
  const viewerId = session?.user?.id ?? null;
  const isAdmin = (session?.user as { isAdmin?: boolean } | undefined)?.isAdmin ?? false;

  const [tourney, setTourney] = useState<SerializedTournament | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [reportingId, setReportingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/tournaments/${id}`);
    const data = await res.json().catch(() => ({}));
    setTourney(res.ok ? (data.tournament ?? null) : null);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (path: string, okMsg: string) => {
    setBusy(true);
    try {
      const res = await fetch(path, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? t('failed', { defaultValue: 'Something went wrong' }));
        return;
      }
      toast.success(okMsg);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const report = async (matchId: string, winnerEntrantId: string) => {
    setReportingId(matchId);
    try {
      const res = await fetch(`/api/tournaments/${id}/matches/${matchId}/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ winnerEntrantId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? t('failed', { defaultValue: 'Something went wrong' }));
        return;
      }
      if (data.tournamentComplete)
        toast.success(t('complete', { defaultValue: 'Tournament complete — prizes paid out!' }));
      else toast.success(t('result-recorded', { defaultValue: 'Result recorded' }));
      await load();
    } finally {
      setReportingId(null);
    }
  };

  if (loading) {
    return (
      <PageLayout title={t('title', { defaultValue: 'Tournament' })} backTo="/tournaments" wide>
        <div className="h-64 rounded-site glass-fill animate-pulse" />
      </PageLayout>
    );
  }
  if (!tourney) {
    return (
      <PageLayout title={t('title', { defaultValue: 'Tournament' })} backTo="/tournaments" wide>
        <p className="text-site-text-dim py-12 text-center">
          {t('not-found', { defaultValue: 'This tournament no longer exists.' })}
        </p>
      </PageLayout>
    );
  }

  const isHost = viewerId === tourney.createdById;
  const canManage = isHost || isAdmin;
  const canReport = (isHost || isAdmin) && tourney.status === 'LIVE';
  const full = tourney.playerCount >= tourney.maxPlayers;
  const winner = tourney.entrants?.find((e) => e.placement === 1);

  return (
    <PageLayout
      title={tourney.name}
      backTo="/tournaments"
      backLabel={t('back', { defaultValue: 'Back to tournaments' })}
      wide
      headerRight={
        <Badge variant={tourney.status === 'LIVE' ? 'accent' : tourney.status === 'COMPLETE' ? 'success' : 'outline'}>
          {tourney.status === 'REGISTRATION'
            ? t('registering', { defaultValue: 'Registering' })
            : tourney.status === 'LIVE'
              ? t('live', { defaultValue: 'Live' })
              : t('done', { defaultValue: 'Finished' })}
        </Badge>
      }
    >
      <div className="space-y-5 max-w-4xl">
        {/* Summary */}
        <Card className="p-4 flex flex-wrap items-center gap-x-6 gap-y-3" pane>
          <div>
            <div className="text-xs text-site-text-dim uppercase tracking-wide">
              {t('game', { defaultValue: 'Game' })}
            </div>
            <div className="font-medium">{tourney.gameTitle ?? tourney.gameId}</div>
          </div>
          <div>
            <div className="text-xs text-site-text-dim uppercase tracking-wide">
              {t('prize-pool', { defaultValue: 'Prize pool' })}
            </div>
            <div className="font-medium flex items-center gap-1.5">
              <Coins className="size-4 text-yellow-500" />
              {tourney.prizePoolCoins || tourney.seedPoolCoins}
            </div>
          </div>
          <div>
            <div className="text-xs text-site-text-dim uppercase tracking-wide">
              {t('players', { defaultValue: 'Players' })}
            </div>
            <div className="font-medium flex items-center gap-1.5">
              <Users className="size-4" />
              {tourney.playerCount}/{tourney.maxPlayers}
            </div>
          </div>
          <div>
            <div className="text-xs text-site-text-dim uppercase tracking-wide">
              {t('entry-fee', { defaultValue: 'Entry fee' })}
            </div>
            <div className="font-medium">
              {tourney.entryFeeCoins > 0
                ? t('n-coins', { defaultValue: '{{n}} coins', n: tourney.entryFeeCoins })
                : t('free', { defaultValue: 'Free' })}
            </div>
          </div>
        </Card>

        {/* Winner banner */}
        {tourney.status === 'COMPLETE' && winner && (
          <Card className="p-4 flex items-center gap-3" pane>
            <Trophy className="size-8 text-yellow-500 shrink-0" />
            <div>
              <div className="text-xs text-site-text-dim uppercase tracking-wide">
                {t('champion', { defaultValue: 'Champion' })}
              </div>
              <div className="text-lg font-semibold">{winner.user?.name}</div>
            </div>
          </Card>
        )}

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          {tourney.status === 'REGISTRATION' && viewerId && !tourney.viewerEntered && !full && (
            <Button
              onClick={() =>
                act(
                  `/api/tournaments/${id}/register`,
                  t('registered', { defaultValue: 'You\'re in!' }),
                )
              }
              loading={busy}
            >
              {tourney.entryFeeCoins > 0
                ? t('register-fee', {
                    defaultValue: 'Register · {{n}} 🪙',
                    n: tourney.entryFeeCoins,
                  })
                : t('register', { defaultValue: 'Register' })}
            </Button>
          )}
          {tourney.status === 'REGISTRATION' && tourney.viewerEntered && (
            <Button
              variant="outline"
              onClick={() =>
                act(
                  `/api/tournaments/${id}/withdraw`,
                  t('withdrew', { defaultValue: 'Withdrew and refunded' }),
                )
              }
              loading={busy}
            >
              {t('withdraw', { defaultValue: 'Withdraw' })}
            </Button>
          )}
          {tourney.status === 'REGISTRATION' && canManage && (
            <Button
              variant="secondary"
              onClick={() =>
                act(`/api/tournaments/${id}/start`, t('started', { defaultValue: 'Bracket started!' }))
              }
              loading={busy}
              disabled={tourney.playerCount < 2}
            >
              <Play className="size-4" />
              {t('start', { defaultValue: 'Start' })}
            </Button>
          )}
          {(tourney.status === 'REGISTRATION' || tourney.status === 'LIVE') && canManage && (
            <Button
              variant="danger"
              onClick={() =>
                act(
                  `/api/tournaments/${id}/cancel`,
                  t('cancelled', { defaultValue: 'Cancelled and refunded' }),
                )
              }
              loading={busy}
            >
              {t('cancel', { defaultValue: 'Cancel & refund' })}
            </Button>
          )}
        </div>

        {/* Bracket (live / complete) */}
        {(tourney.status === 'LIVE' || tourney.status === 'COMPLETE') && (
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-site-text-dim mb-2">
              {t('bracket', { defaultValue: 'Bracket' })}
            </h2>
            <BracketView
              tournament={tourney}
              canReport={canReport}
              reportingId={reportingId}
              onReport={report}
            />
            {canReport && (
              <p className="text-xs text-site-text-dim mt-2">
                {t('report-hint', {
                  defaultValue: 'Tap the winner of each match to advance the bracket.',
                })}
              </p>
            )}
          </div>
        )}

        {/* Entrants */}
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-site-text-dim mb-2">
            {t('entrants', { defaultValue: 'Entrants' })} ({tourney.playerCount})
          </h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {(tourney.entrants ?? []).map((e) => (
              <div key={e.id} className="flex items-center gap-2 glass-fill rounded-site px-3 py-2">
                {e.placement ? (
                  <span className="w-5 text-center text-sm font-semibold text-site-text-dim">
                    {e.placement === 1 ? (
                      <Trophy className="size-4 text-yellow-500 inline" />
                    ) : e.placement <= 3 ? (
                      <Medal className="size-4 text-site-text-dim inline" />
                    ) : (
                      `#${e.placement}`
                    )}
                  </span>
                ) : (
                  e.seed != null && (
                    <span className="w-5 text-center text-xs text-site-text-dim">{e.seed}</span>
                  )
                )}
                <UserAvatar
                  src={e.user?.image ?? null}
                  alt={e.user?.name ?? ''}
                  size={24}
                  fallbackName={e.user?.name ?? '?'}
                />
                <span className="truncate text-sm">{e.user?.name}</span>
                {(tourney.status === 'LIVE' || tourney.status === 'COMPLETE') && (
                  <span className="ml-auto text-xs text-site-text-dim">
                    {e.wins}–{e.losses}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
