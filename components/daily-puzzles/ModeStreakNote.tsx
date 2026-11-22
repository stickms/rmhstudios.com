/**
 * Under a finished puzzle: the mode's streak including this run, and the way to the
 * statistics page.
 *
 * The local store already holds the run (it is saved before the result shows), so the
 * streak is read from it at once. A signed-in member also asks the server, whose history
 * may reach back further than this device's; the larger of the two is shown, because the
 * score POST that carries today's run is still in flight when the screen opens.
 */
import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useSession } from '@/components/Providers';
import { useModeTitle } from '@/components/daily-puzzles/mode-title';
import { apiQuery } from '@/lib/contract/client';
import { readLocalRows } from '@/lib/daily-puzzles/local-rows';
import { formatDateKey, getTodayEST } from '@/lib/daily-puzzles/seed';
import { computeDailyStats } from '@/lib/daily-puzzles/stats';
import { getDailyStatsApi } from '@/lib/daily-puzzles/stats.contract';

export function ModeStreakNote({ gameMode }: { gameMode: string }) {
  const { t } = useTranslation('daily-stats');
  const modeTitle = useModeTitle();
  const { data: session } = useSession();
  const signedIn = !!session?.user;

  const [localStreak, setLocalStreak] = useState(0);
  useEffect(() => {
    const stats = computeDailyStats(readLocalRows(), formatDateKey(getTodayEST()));
    setLocalStreak(stats.modes.find((m) => m.mode === gameMode)?.currentStreak ?? 0);
  }, [gameMode]);

  const server = useQuery({
    ...apiQuery(getDailyStatsApi, {}),
    enabled: signedIn,
    retry: false,
    staleTime: 0,
    refetchOnMount: 'always',
  });
  const serverStreak = server.data?.modes.find((m) => m.mode === gameMode)?.currentStreak ?? 0;
  const streak = Math.max(localStreak, serverStreak);

  return (
    <p className="t-meta flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
      {streak > 0 ? (
        <span>
          {t('mode-streak', {
            mode: modeTitle(gameMode),
            count: streak,
            defaultValue_one: '{{mode}} streak: {{count}} day',
            defaultValue_other: '{{mode}} streak: {{count}} days',
          })}
        </span>
      ) : null}
      <Link to="/daily/stats" className="underline">
        {t('see-statistics', {
          defaultValue: 'See statistics',
        })}
      </Link>
    </p>
  );
}
