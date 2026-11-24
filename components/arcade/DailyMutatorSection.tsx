import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Flame, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { useSession } from '@/components/Providers';
import { SEEDED_GAMES } from '@/lib/arcade/seeded';
import { dailyMutatorQuery } from '@/lib/arcade/daily.queries';
import { useArrival } from '@/components/ui/arrive';
import { cn } from '@/lib/utils';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';

function untilReset(): string {
  const ms = 86_400_000 - (Date.now() % 86_400_000);
  const h = Math.floor(ms / 3_600_000);
  return `${h}h ${Math.floor((ms % 3_600_000) / 60_000)}m`;
}

/**
 * The Mutator section of `/daily`: one arcade game, one twist and one seed for
 * everyone each UTC day, with one counted attempt and today's board. It was the
 * `/daily-mutator` page until the 2026-11-19 consolidation put the daily things
 * on one page.
 */
export function DailyMutatorSection() {
  const fmt = useLocaleFormat();
  const { t } = useTranslation('f-arcade');
  const session = useSession();
  const signedIn = !!session.data?.user;
  // Seeded by the route loader (the same key, so no second fetch on hydrate).
  const daily = useQuery(dailyMutatorQuery());
  const data = daily.data ?? null;
  const failed = daily.isError;

  const game = data ? SEEDED_GAMES[data.mutator.gameId] : null;
  const used = !!data?.mine;
  // Usually seeded by the loader (no wait, no fade); fetched here, it fades in over the spinner (M9).
  const arrival = useArrival(failed || (!!data && !!game));

  return (
    <div className="space-y-4 pb-12">
      <p className="t-body text-site-text-muted">
        {t('page-desc', {
          defaultValue: 'One game, one twist and one seed for everyone, once per UTC day. You get one counted attempt.',
        })}
      </p>
      {failed ? (
        <EmptyState
          className={arrival}
          description={t('load-failed', { defaultValue: 'Could not load today’s challenge.' })}
        />
      ) : !data || !game ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : (
        // One block with the column's own rhythm, so the challenge fades in as a whole.
        <div className={cn('space-y-4', arrival)}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 text-xs font-semibold text-site-text-muted">
                <Flame className="h-4 w-4 text-site-accent" aria-hidden />
                {data.mutator.day}
              </p>
              <h2 className="mt-1 text-xl font-semibold text-site-text">{game.label}</h2>
              <p className="text-sm text-site-text-muted">{data.mutator.modifier.label}</p>
              <p className="mt-1 text-xs text-site-text-muted">
                {t('resets-in', { defaultValue: 'Resets in {{time}}', time: untilReset() })}
              </p>
            </div>
            <div className="flex flex-col items-start gap-2 sm:items-end">
              {signedIn ? (
                <Button asChild variant="default">
                  <a href={`${game.path}?daily=1`}>
                    <Play className="h-4 w-4" aria-hidden />
                    {used
                      ? t('practice', { defaultValue: 'Practice run' })
                      : t('play-daily', { defaultValue: 'Play today’s challenge' })}
                  </a>
                </Button>
              ) : (
                <Button asChild variant="default">
                  <a href="/login">{t('sign-in', { defaultValue: 'Sign in to play' })}</a>
                </Button>
              )}
              {used ? (
                <span className="text-xs text-site-text-muted">
                  {data.mine?.score != null
                    ? t('your-score', {
                        defaultValue: 'Your score: {{score}}',
                        score: fmt.number(data.mine.score),
                      })
                    : t('attempt-open', {
                        defaultValue: 'Attempt started. Finish the run to post it.',
                      })}
                </span>
              ) : null}
            </div>
          </div>

          <section>
            <h2 className="site-section-label mb-3">{t('board-title', { defaultValue: 'Today’s leaderboard' })}</h2>
            {data.board.length === 0 ? (
              <EmptyState
                description={t('board-empty', {
                  defaultValue: 'No finished runs yet. Be the first.',
                })}
              />
            ) : (
              <ol className="space-y-2">
                {data.board.map((r) => (
                  <li key={r.rank}>
                    <div
                      className={cn('flex justify-between border-b border-site-border py-3', r.isMe && 'font-semibold')}
                    >
                      <span className="text-sm text-site-text">
                        {r.rank}. {r.user.name ?? r.user.handle}
                      </span>
                      <span className="font-mono text-sm text-site-text">{fmt.number(r.score)}</span>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
