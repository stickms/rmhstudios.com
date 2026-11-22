/**
 * PlayerStatsPage — one player's RMHBox record (full-screen app tier, `--app-*`).
 *
 * Totals, a per-minigame table and the most recent matches. What is shown is
 * decided by the server (`access` in the response): `full`, `totals` for a
 * signed-out visitor to a public record, or `private`. A blocked, banned or
 * unknown player answers 404 and reads as "player not found".
 */
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import RMHboxHeader from '@/components/rmhbox/RMHboxHeader';
import { useSession } from '@/components/Providers';
import { useArrival } from '@/components/ui/arrive';
import { MINIGAME_REGISTRY } from '@/lib/rmhbox/minigame-registry';
import { formatPlayTime, ordinalCategory, sortMinigameRows, type RecentMatch } from '@/lib/rmhbox/player-stats';
import { playerStatsQuery } from '@/lib/rmhbox/player-stats.queries';
import { cn } from '@/lib/utils';

const bar = 'h-4 rounded-app-sm bg-app-surface-hover';

function gameName(id: string): string {
  return MINIGAME_REGISTRY[id]?.displayName ?? id;
}

export default function PlayerStatsPage({ userId }: { userId: string }) {
  const { t, i18n } = useTranslation('rmhbox-stats');
  const locale = i18n.language;
  const { data: session } = useSession();
  const { data, isPending, isError } = useQuery(playerStatsQuery(userId));
  const arrival = useArrival(!isPending);

  const num = new Intl.NumberFormat(locale);
  const percent = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  const one = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const isSelf = !!data && session?.user?.id === data.player.id;

  const placing = (m: Pick<RecentMatch, 'rank' | 'playerCount'>): string => {
    const vars = { rank: num.format(m.rank), count: m.playerCount };
    switch (ordinalCategory(m.rank, locale)) {
      case 'one':
        return t('placing-one', { defaultValue: '{{rank}}st of {{count}}', ...vars });
      case 'two':
        return t('placing-two', { defaultValue: '{{rank}}nd of {{count}}', ...vars });
      case 'few':
        return t('placing-few', { defaultValue: '{{rank}}rd of {{count}}', ...vars });
      default:
        return t('placing-other', { defaultValue: '{{rank}}th of {{count}}', ...vars });
    }
  };

  const when = (iso: string) =>
    new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));

  let body: React.ReactNode;
  if (isPending) {
    body = (
      <div className="space-y-3" role="status" aria-live="polite">
        <span className="sr-only">{t('loading', { defaultValue: 'Loading stats' })}</span>
        <div className={cn(bar, 'h-7 w-48')} />
        <div className={cn(bar, 'w-full')} />
        <div className={cn(bar, 'w-full')} />
        <div className={cn(bar, 'w-2/3')} />
      </div>
    );
  } else if (isError || !data) {
    body = (
      <div className={cn('py-8', arrival)}>
        <h2 className="text-lg font-semibold text-app-text">
          {t('not-found-title', { defaultValue: 'Player not found' })}
        </h2>
        <p className="mt-1 text-sm text-app-text-muted">
          {t('not-found-body', { defaultValue: 'There is no RMHBox player at this address.' })}
        </p>
        <Link
          to="/rmhbox"
          className="mt-4 inline-flex min-h-11 items-center text-sm font-medium text-app-accent underline"
        >
          {t('back-to-rmhbox', { defaultValue: 'Back to RMHBox' })}
        </Link>
      </div>
    );
  } else if (data.access === 'private') {
    body = (
      <p className={cn('py-8 text-sm text-app-text-muted', arrival)}>
        {t('private', {
          defaultValue: '{{name}} keeps their game activity private.',
          name: data.player.name,
        })}
      </p>
    );
  } else if (!data.global || data.global.totalGamesPlayed === 0) {
    body = (
      <div className={cn('py-8', arrival)}>
        <h2 className="text-lg font-semibold text-app-text">
          {t('empty-title', { defaultValue: 'No RMHBox matches yet' })}
        </h2>
        <Link
          to="/rmhbox"
          className="mt-4 inline-flex min-h-11 items-center text-sm font-medium text-app-accent underline"
        >
          {t('start-lobby', { defaultValue: 'Start a lobby' })}
        </Link>
      </div>
    );
  } else {
    const g = data.global;
    const rows = sortMinigameRows(data.minigames);
    const totals: Array<[string, string]> = [
      [t('stat-played', { defaultValue: 'Games played' }), num.format(g.totalGamesPlayed)],
      [t('stat-wins', { defaultValue: 'Wins' }), num.format(g.totalWins)],
      [t('stat-win-rate', { defaultValue: 'Win rate' }), `${percent.format(g.winRate)}%`],
      [t('stat-streak', { defaultValue: 'Current win streak' }), num.format(g.currentWinStreak)],
      [t('stat-best-streak', { defaultValue: 'Best win streak' }), num.format(g.bestWinStreak)],
      [t('stat-time', { defaultValue: 'Time played' }), formatPlayTime(g.totalPlayTimeMs, locale)],
      [
        t('stat-favorite', { defaultValue: 'Favourite minigame' }),
        g.favoriteMinigame ? gameName(g.favoriteMinigame) : t('none', { defaultValue: 'None yet' }),
      ],
    ];
    body = (
      <div className={cn('space-y-8', arrival)}>
        <section aria-labelledby="rmhbox-stats-totals">
          <h2 id="rmhbox-stats-totals" className="sr-only">
            {t('totals-heading', { defaultValue: 'Totals' })}
          </h2>
          <dl className="grid grid-cols-2 gap-x-6 sm:grid-cols-3">
            {totals.map(([label, value]) => (
              <div key={label} className="border-b border-app-border py-3">
                <dt className="text-xs text-app-text-muted">{label}</dt>
                <dd className="mt-0.5 text-lg font-semibold text-app-text">{value}</dd>
              </div>
            ))}
          </dl>
        </section>

        {data.access === 'totals' ? (
          <p className="text-sm text-app-text-muted">
            <Link to="/login" className="font-medium text-app-accent underline">
              {t('sign-in-link', { defaultValue: 'Sign in' })}
            </Link>{' '}
            {t('sign-in-rest', { defaultValue: 'to see their minigames and recent matches.' })}
          </p>
        ) : (
          <>
            <section aria-labelledby="rmhbox-stats-games">
              <h2 id="rmhbox-stats-games" className="mb-2 text-lg font-semibold text-app-text">
                {t('minigames-heading', { defaultValue: 'Minigames' })}
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <caption className="sr-only">
                    {t('minigames-caption', { defaultValue: 'Record in each minigame' })}
                  </caption>
                  <thead>
                    <tr className="border-b border-app-border text-left text-app-text-muted">
                      <th scope="col" className="py-2 pe-3 font-medium">
                        {t('col-game', { defaultValue: 'Minigame' })}
                      </th>
                      <th scope="col" className="py-2 pe-3 text-end font-medium">
                        {t('col-played', { defaultValue: 'Played' })}
                      </th>
                      <th scope="col" className="py-2 pe-3 text-end font-medium">
                        {t('col-wins', { defaultValue: 'Wins' })}
                      </th>
                      <th scope="col" className="py-2 pe-3 text-end font-medium">
                        {t('col-best', { defaultValue: 'Best score' })}
                      </th>
                      <th scope="col" className="py-2 text-end font-medium">
                        {t('col-average', { defaultValue: 'Average placing' })}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(([id, s]) => (
                      <tr key={id} className="border-b border-app-border">
                        <th scope="row" className="py-2 pe-3 text-start font-medium">
                          <Link
                            to="/rmhbox/minigames/$minigameId/history"
                            params={{ minigameId: id }}
                            search={{ player: data.player.id }}
                            className="inline-flex min-h-11 items-center text-app-accent underline"
                          >
                            {gameName(id)}
                          </Link>
                        </th>
                        <td className="py-2 pe-3 text-end font-mono">{num.format(s.gamesPlayed)}</td>
                        <td className="py-2 pe-3 text-end font-mono">{num.format(s.wins)}</td>
                        <td className="py-2 pe-3 text-end font-mono">{num.format(s.bestScore)}</td>
                        <td className="py-2 text-end font-mono">
                          {s.averageRank === null ? '–' : one.format(s.averageRank)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section aria-labelledby="rmhbox-stats-recent">
              <h2 id="rmhbox-stats-recent" className="mb-2 text-lg font-semibold text-app-text">
                {t('recent-heading', { defaultValue: 'Recent matches' })}
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <caption className="sr-only">
                    {t('recent-caption', { defaultValue: 'The most recent matches' })}
                  </caption>
                  <thead>
                    <tr className="border-b border-app-border text-left text-app-text-muted">
                      <th scope="col" className="py-2 pe-3 font-medium">
                        {t('col-game', { defaultValue: 'Minigame' })}
                      </th>
                      <th scope="col" className="py-2 pe-3 font-medium">
                        {t('col-placing', { defaultValue: 'Placing' })}
                      </th>
                      <th scope="col" className="py-2 pe-3 text-end font-medium">
                        {t('col-score', { defaultValue: 'Score' })}
                      </th>
                      <th scope="col" className="py-2 text-end font-medium">
                        {t('col-when', { defaultValue: 'When' })}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentMatches.map((m) => (
                      <tr key={m.matchId} className="border-b border-app-border">
                        <th scope="row" className="py-2 pe-3 text-start font-medium">
                          <Link
                            to="/rmhbox/minigames/$minigameId/history"
                            params={{ minigameId: m.minigameId }}
                            search={{ player: data.player.id, match: m.matchId }}
                            className="inline-flex min-h-11 items-center text-app-accent underline"
                          >
                            {gameName(m.minigameId)}
                          </Link>
                        </th>
                        <td className="py-2 pe-3">{placing(m)}</td>
                        <td className="py-2 pe-3 text-end font-mono">{num.format(m.score)}</td>
                        <td className="py-2 text-end text-app-text-muted">{when(m.playedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}

        {isSelf && (
          <p className="text-sm text-app-text-muted">
            {t('privacy-line', { defaultValue: 'Who can see this page follows your game activity setting.' })}{' '}
            <Link to="/settings/privacy" className="font-medium text-app-accent underline">
              {t('privacy-link', { defaultValue: 'Change it in privacy settings' })}
            </Link>
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="app-page">
      <RMHboxHeader
        context="history"
        backHref="/rmhbox"
        backLabel={t('home', { defaultValue: 'Home' })}
        title={data?.player.name ?? t('title', { defaultValue: 'Player stats' })}
      />
      <main className="mx-auto w-full max-w-4xl px-4 pt-4 pb-12 md:px-8 md:pt-8">{body}</main>
    </div>
  );
}
