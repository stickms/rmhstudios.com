import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { ElectionDayEntry } from '@/lib/elections/calendar-days';
import { stateName } from '@/lib/elections/states';
import { api } from '@/lib/contract/client';
import { getElectionCalendarApi } from '@/lib/elections/elections.contract';
import { useArrival } from '@/components/ui/arrive';
import { cn } from '@/lib/utils';

interface CalendarResponse {
  year: number;
  days: ElectionDayEntry[];
  fec:
    | 'ok'
    | 'rate-limited'
    | 'unavailable';
}

const fmt =
  (
    date: string,
  ) =>
    new Intl.DateTimeFormat(
      'en-US',
      {
        timeZone:
          'UTC',
        weekday:
          'short',
        month:
          'short',
        day: 'numeric',
      },
    ).format(
      new Date(
        `${date}T12:00:00Z`,
      ),
    );

/**
 * Browse the year's primaries, runoffs and specials. A day opens its own results page when a government
 * results feed covers it (North Carolina today); for the rest it says plainly that there is no feed yet.
 */
export function CalendarPanel({
  year,
  current,
  onOpen,
}: {
  year: number;
  /** The `?cycle=` value currently open, to highlight it. */
  current: string;
  onOpen: (
    date: string,
  ) => void;
}) {
  const {
    t,
  } =
    useTranslation(
      'c-elections',
    );
  const {
    data,
    isError,
  } =
    useQuery<CalendarResponse>(
      {
        queryKey:
          [
            'elections-calendar',
            year,
          ],
        queryFn:
          async () => {
            return api(
              getElectionCalendarApi,
              {
                query:
                  {
                    year,
                  },
                retries: 0,
              },
            );
          },
        staleTime:
          10 *
          60_000,
        retry: 1,
      },
    );
  const arrival =
    useArrival(
      isError ||
        !!data,
    );

  if (
    isError
  ) {
    return (
      <p
        className={cn(
          'el-eyebrow',
          arrival,
        )}
      >
        {t(
          'days.error',
          {
            defaultValue:
              'The calendar is unavailable right now.',
          },
        )}
      </p>
    );
  }
  if (
    !data
  )
    return (
      <div
        className="el-box el-skel"
        aria-busy
      />
    );

  return (
    <div
      className={
        arrival
      }
    >
      <div className="el-cards">
        {data.days.map(
          (
            d,
          ) => (
            <article
              key={
                d.date
              }
              className="el-race el-box"
              aria-label={fmt(
                d.date,
              )}
              style={
                d.date ===
                current
                  ? {
                      outline:
                        '4px solid var(--el-ink)',
                    }
                  : undefined
              }
            >
              <header className="el-race__head">
                <h3 className="el-race__label">
                  {fmt(
                    d.date,
                  )}
                </h3>
                <span className="el-chip el-chip--yellow">
                  {d.kinds.join(
                    ' · ',
                  )}
                </span>
              </header>
              <div
                className="el-pick-row"
                style={{
                  margin:
                    '12px 0 0',
                }}
              >
                {d.states.map(
                  (
                    s,
                  ) => (
                    <span
                      key={
                        s
                      }
                      className="el-chip"
                      title={stateName(
                        s,
                      )}
                    >
                      {
                        s
                      }
                    </span>
                  ),
                )}
              </div>
              <footer className="el-race__foot">
                <span>
                  {d.official
                    ? t(
                        'days.official',
                        {
                          defaultValue:
                            'Official results available',
                        },
                      )
                    : t(
                        'days.noFeed',
                        {
                          defaultValue:
                            'No results feed yet',
                        },
                      )}
                </span>
                <button
                  type="button"
                  className="el-btn el-btn--sm el-btn--pink"
                  disabled={
                    !d.official ||
                    d.date ===
                      current
                  }
                  onClick={() =>
                    onOpen(
                      d.date,
                    )
                  }
                >
                  {d.date ===
                  current
                    ? t(
                        'days.open',
                        {
                          defaultValue:
                            'Open now',
                        },
                      )
                    : t(
                        'days.view',
                        {
                          defaultValue:
                            'View results',
                        },
                      )}
                </button>
              </footer>
            </article>
          ),
        )}
      </div>
      <p
        className="el-eyebrow"
        style={{
          marginTop: 16,
        }}
      >
        {data.fec ===
        'ok'
          ? t(
              'days.src',
              {
                defaultValue:
                  'Dates from the results feed and the Federal Election Commission.',
              },
            )
          : t(
              'days.srcFeed',
              {
                defaultValue:
                  'Dates from the results feed (the FEC calendar is not answering right now).',
              },
            )}
      </p>
    </div>
  );
}
