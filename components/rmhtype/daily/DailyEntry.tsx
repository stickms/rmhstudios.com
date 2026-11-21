/** The RMHType landing page's card for the daily challenge: whether today's attempt is done (strings in `rmhtype-daily`). */
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { CalendarCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { rmhTypeDailyQuery } from '@/lib/rmhtype/rmhtype.queries';

export function DailyEntry() {
  const {
    t,
  } =
    useTranslation(
      'rmhtype-daily',
    );
  const { data: state } =
    useQuery(
      rmhTypeDailyQuery(),
    );

  let status:
    | string
    | null =
    null;
  if (
    state?.status ===
      'done' &&
    state.result
  ) {
    status =
      t(
        'entry-done',
        {
          wpm: Math.round(
            state
              .result
              .wpm,
          ),
          defaultValue:
            'Done today: {{wpm}} wpm',
        },
      );
  } else if (
    state?.status ===
    'running'
  ) {
    status =
      t(
        'entry-running',
        {
          defaultValue:
            'In progress',
        },
      );
  } else if (
    state?.status ===
    'missed'
  ) {
    status =
      t(
        'entry-missed',
        {
          defaultValue:
            'Missed today',
        },
      );
  } else if (
    state
  ) {
    status =
      t(
        'entry-not-done',
        {
          defaultValue:
            'Not done today',
        },
      );
  }

  return (
    <Link
      to="/rmhtype/daily"
      className="rounded-app surface-card p-6 text-left transition-colors hover:border-app-accent hover:bg-app-surface-hover"
    >
      <CalendarCheck
        className="h-8 w-8 mb-4 text-app-accent"
        aria-hidden="true"
      />
      <h3 className="text-xl font-semibold mb-2">
        {t(
          'entry-title',
          {
            defaultValue:
              'Daily Challenge',
          },
        )}
      </h3>
      <p className="text-sm text-app-text-muted">
        {t(
          'entry-desc',
          {
            defaultValue:
              'One passage a day for everyone, one scored attempt and a daily leaderboard.',
          },
        )}
      </p>
      {status ? (
        <p
          role="status"
          className="mt-3 text-sm font-medium"
        >
          {
            status
          }
        </p>
      ) : null}
    </Link>
  );
}
