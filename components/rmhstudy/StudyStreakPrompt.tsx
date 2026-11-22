import { useQuery } from '@tanstack/react-query';
import { Flame } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useArrival } from '@/components/ui/arrive';
import { api } from '@/lib/contract/client';
import { getFocusHistoryApi } from '@/lib/rmhstudy/history.contract';

function viewerTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}

/**
 * Landing prompt: "Study today to keep your 4-day streak". Shown only when yesterday kept a
 * streak alive and today has no session yet. Signed out, loading and failed all render nothing:
 * the landing works without it.
 */
export default function StudyStreakPrompt() {
  const { t } = useTranslation('rmhstudy-streaks');
  const timeZone = viewerTimeZone();
  const query = useQuery({
    queryKey: [getFocusHistoryApi.path, 'landing', timeZone],
    queryFn: ({ signal }) =>
      api(getFocusHistoryApi, {
        query: {
          ...(timeZone
            ? {
                tz: timeZone,
              }
            : {}),
        },
        signal,
      }),
    retry: false,
    staleTime: 60_000,
  });
  const streak = query.data?.streak;
  const show = !!streak && streak.current > 0 && !streak.studiedToday;
  const arrival = useArrival(show);
  if (!streak || !show) return null;
  return (
    <p className={`flex items-center gap-3 rounded-app surface-card p-4 text-sm ${arrival ?? ''}`}>
      <Flame className="h-5 w-5 shrink-0 text-app-accent" aria-hidden />
      {t('study-today', {
        defaultValue: 'Study today to keep your {{count}}-day streak',
        count: streak.current,
      })}
    </p>
  );
}
