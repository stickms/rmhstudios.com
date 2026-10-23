import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Coins, Users, Play, Trophy, Medal } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { PageLayout } from '@/components/feed/PageLayout';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { useSession } from '@/components/Providers';
import { BracketView } from '@/components/tournaments/BracketView';
import { SwissStandings } from '@/components/competitive/SwissStandings';
import { PickemPanel } from '@/components/competitive/PickemPanel';
import type { SerializedTournament } from '@/lib/tournaments/tournament.server';
import { prisma } from '@/lib/prisma.server';
import { getWagerGame } from '@/lib/wager/eligible-games';
import { buildCanonical, buildMeta } from '@/lib/seo';

/**
 * A meta-only loader.
 *
 * The page itself fetches the full tournament client-side (below), which is
 * fine for the UI but leaves nothing in the server-rendered `<head>` — so every
 * tournament shared the title "Tournament | RMH Studios" and unfurled as the
 * site default. This fetches just enough for the head, and deliberately does
 * not replace the client fetch: the bracket updates live, and a loader would
 * only serve a snapshot the component immediately overwrites.
 */
const fetchTournamentMeta = createServerFn({ method: 'GET' })
  .validator((id: string) => id)
  .handler(async ({ data: id }) => {
    // A direct select rather than `getTournament`, which pulls every entrant,
    // match and payout — none of which a `<title>` needs.
    const t = await prisma.tournament
      .findUnique({
        where: { id },
        select: {
          name: true,
          gameId: true,
          visibility: true,
          maxPlayers: true,
          prizePoolCoins: true,
          _count: { select: { entrants: true } },
        },
      })
      .catch(() => null);
    if (!t) return null;
    return {
      name: t.name,
      gameTitle: getWagerGame(t.gameId)?.title ?? null,
      visibility: t.visibility,
      playerCount: t._count.entrants,
      maxPlayers: t.maxPlayers,
      prizePoolCoins: t.prizePoolCoins,
    };
  });

export const Route = createFileRoute('/_site/tournaments/$id')({
  loader: ({ params }) => fetchTournamentMeta({ data: params.id }),
  head: ({ loaderData, params }) => {
    const path = `/tournaments/${params.id}`;
    if (!loaderData || loaderData.visibility !== 'public') {
      return {
        meta: [
          { title: loaderData ? `${loaderData.name} | RMH Studios` : 'Tournament | RMH Studios' },
          { name: 'robots', content: 'noindex, follow' },
        ],
      };
    }
    const game = loaderData.gameTitle ?? 'RMH Studios';
    return {
      meta: buildMeta({
        title: `${loaderData.name} — ${game} tournament | RMH Studios`,
        description: `A ${game} tournament on RMH Studios: ${loaderData.playerCount} of ${loaderData.maxPlayers} players, ${loaderData.prizePoolCoins} coins in the prize pool.`,
        path,
      }),
      links: [buildCanonical(path)],
    };
  },
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
      <PageLayout title={t('title-tournaments-id', { defaultValue: 'Tournament' })} backTo="/tournaments" wide>
        <Skeleton className="h-64 rounded-site" />
      </PageLayout>
    );
  }
  if (!tourney) {
    return (
      <PageLayout title={t('title-tournaments-id', { defaultValue: 'Tournament' })} backTo="/tournaments" wide>
        <EmptyState
          icon={Trophy}
          title={t('not-found', { defaultValue: 'This tournament no longer exists.' })}
        />
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
        <Badge
          variant={
            tourney.status === 'LIVE'
              ? 'accent'
              : tourney.status === 'COMPLETE'
                ? 'success'
                : 'outline'
          }
        >
          {tourney.status === 'REGISTRATION'
            ? t('registering', { defaultValue: 'Registering' })
            : tourney.status === 'LIVE'
              ? t('live', { defaultValue: 'Live' })
              : t('done-tournaments-id', { defaultValue: 'Finished' })}
        </Badge>
      }
    >
      <div className="max-w-4xl space-y-4">
        {/* Summary */}
        <Card className="flex-row flex-wrap items-center gap-x-6 gap-y-3 px-4 py-4" pane>
          <div>
            <div className="text-xs font-medium text-site-text-muted">
              {t('game', { defaultValue: 'Game' })}
            </div>
            <div className="font-medium">{tourney.gameTitle ?? tourney.gameId}</div>
          </div>
          <div>
            <div className="text-xs font-medium text-site-text-muted">
              {t('prize-pool', { defaultValue: 'Prize pool' })}
            </div>
            <div className="flex items-center gap-2 font-medium">
              <Coins className="size-4 text-site-warning" aria-hidden />
              {tourney.prizePoolCoins || tourney.seedPoolCoins}
            </div>
          </div>
          <div>
            <div className="text-xs font-medium text-site-text-muted">
              {t('players', { defaultValue: 'Players' })}
            </div>
            <div className="flex items-center gap-2 font-medium">
              <Users className="size-4" aria-hidden />
              {tourney.playerCount}/{tourney.maxPlayers}
            </div>
          </div>
          <div>
            <div className="text-xs font-medium text-site-text-muted">
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
          <Card className="flex-row items-center gap-3 px-4 py-4" pane>
            <Trophy className="size-8 shrink-0 text-site-warning" aria-hidden />
            <div>
              <div className="text-xs font-medium text-site-text-muted">
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
                  t('registered', { defaultValue: "You're in!" }),
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
                act(
                  `/api/tournaments/${id}/start`,
                  t('started', { defaultValue: 'Bracket started!' }),
                )
              }
              loading={busy}
              disabled={tourney.playerCount < 2}
            >
              <Play className="size-4" aria-hidden />
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
              {t('cancel-tournaments-id', { defaultValue: 'Cancel & refund' })}
            </Button>
          )}
        </div>

        {/* Bracket (live / complete) */}
        {(tourney.status === 'LIVE' || tourney.status === 'COMPLETE') && (
          <div>
            <h2 className="site-section-label mb-3">
              {t('bracket-tournaments-id', { defaultValue: 'Bracket' })}
            </h2>
            <BracketView
              tournament={tourney}
              canReport={canReport}
              reportingId={reportingId}
              onReport={report}
            />
            {canReport && (
              <p className="mt-3 text-xs text-site-text-dim">
                {t('report-hint', {
                  defaultValue: 'Tap the winner of each match to advance the bracket.',
                })}
              </p>
            )}
          </div>
        )}

        {tourney.format === 'SWISS' && tourney.status !== 'REGISTRATION' && (
          <SwissStandings tournament={tourney} />
        )}

        {tourney.format === 'SINGLE_ELIM' && tourney.status !== 'CANCELLED' && (
          <PickemPanel tournament={tourney} signedIn={!!viewerId} />
        )}

        {/* Entrants */}
        <div>
          <h2 className="site-section-label mb-3">
            {t('entrants', { defaultValue: 'Entrants' })} ({tourney.playerCount})
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {(tourney.entrants ?? []).map((e) => (
              <div key={e.id} className="glass-fill flex items-center gap-2 rounded-site px-4 py-3">
                {e.placement ? (
                  <span className="w-5 text-center text-sm font-semibold text-site-text-dim">
                    {e.placement === 1 ? (
                      <Trophy role="img" className="inline size-4 text-site-warning" aria-label={t('champion', { defaultValue: 'Champion' })} />
                    ) : e.placement <= 3 ? (
                      <Medal className="inline size-4 text-site-text-dim" aria-hidden />
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
