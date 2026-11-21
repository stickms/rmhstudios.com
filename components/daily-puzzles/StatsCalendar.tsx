import {
  useMemo,
  useState,
} from 'react';
import {
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { IconButton } from '@/components/ui/icon-button';
import { Select } from '@/components/ui/select';
import {
  addDays,
  dayString,
} from '@/lib/calendar/tz';
import { firstDayOfWeek } from '@/lib/locale-week';
import { DESK_MODES } from '@/lib/daily-puzzles/desk-modes';
import type { DailyStats } from '@/lib/daily-puzzles/stats';

const ALL =
  '';

/** `YYYY-MM` of a day key. */
const monthOf =
  (
    day: string,
  ) =>
    day.slice(
      0,
      7,
    );

/** The month before or after a `YYYY-MM`. */
function shiftMonth(
  month: string,
  by: number,
): string {
  const y =
    Number(
      month.slice(
        0,
        4,
      ),
    );
  const m =
    Number(
      month.slice(
        5,
        7,
      ),
    ) -
    1 +
    by;
  return `${String(y + Math.floor(m / 12)).padStart(4, '0')}-${String((((m % 12) + 12) % 12) + 1).padStart(2, '0')}`;
}

/**
 * A month of played days as a table: weekday column headers, a row header per week, and a
 * cell per day that says in words how many puzzles were solved (the count is also printed,
 * so nothing rests on colour). `mode` narrows it to one puzzle; month navigation stops at
 * the first played month and at the current one.
 */
export function StatsCalendar({
  days,
  firstDay,
  todayKey,
  modeTitles,
}: {
  days: DailyStats['days'];
  firstDay:
    | string
    | null;
  todayKey: string;
  /** Mode id -> its translated name, for the filter. */
  modeTitles: Record<
    string,
    string
  >;
}) {
  const {
    t,
    i18n,
  } =
    useTranslation(
      'daily-stats',
    );
  const locale =
    i18n.language;
  const [
    month,
    setMonth,
  ] =
    useState(
      () =>
        monthOf(
          todayKey,
        ),
    );
  const [
    mode,
    setMode,
  ] =
    useState(
      ALL,
    );

  const countOf =
    (
      key: string,
    ) => {
      const modes =
        days[
          key
        ];
      if (
        !modes
      )
        return 0;
      return mode ===
        ALL
        ? modes.length
        : modes.includes(
              mode,
            )
          ? 1
          : 0;
    };

  const fmt =
    useMemo(
      () => ({
        month:
          new Intl.DateTimeFormat(
            locale,
            {
              month:
                'long',
              year: 'numeric',
              timeZone:
                'UTC',
            },
          ),
        weekday:
          new Intl.DateTimeFormat(
            locale,
            {
              weekday:
                'short',
              timeZone:
                'UTC',
            },
          ),
        weekdayLong:
          new Intl.DateTimeFormat(
            locale,
            {
              weekday:
                'long',
              timeZone:
                'UTC',
            },
          ),
        day: new Intl.DateTimeFormat(
          locale,
          {
            day: 'numeric',
            month:
              'long',
            timeZone:
              'UTC',
          },
        ),
        number:
          new Intl.NumberFormat(
            locale,
          ),
      }),
      [
        locale,
      ],
    );
  const at =
    (
      key: string,
    ) =>
      new Date(
        `${key}T00:00:00Z`,
      );

  const first =
    monthOf(
      firstDay ??
        todayKey,
    );
  const last =
    monthOf(
      todayKey,
    );
  const weekStart =
    firstDayOfWeek(
      locale,
    );

  const weeks =
    useMemo(() => {
      const y =
        Number(
          month.slice(
            0,
            4,
          ),
        );
      const m =
        Number(
          month.slice(
            5,
            7,
          ),
        );
      const firstOfMonth =
        dayString(
          y,
          m,
          1,
        );
      const lead =
        (new Date(
          `${firstOfMonth}T00:00:00Z`,
        ).getUTCDay() -
          weekStart +
          7) %
        7;
      let cursor =
        addDays(
          firstOfMonth,
          -lead,
        );
      const rows: string[][] =
        [];
      do {
        const row: string[] =
          [];
        for (
          let i = 0;
          i <
          7;
          i++,
            cursor =
              addDays(
                cursor,
                1,
              )
        )
          row.push(
            cursor,
          );
        rows.push(
          row,
        );
      } while (
        monthOf(
          cursor,
        ) ===
        month
      );
      return rows;
    }, [
      month,
      weekStart,
    ]);

  const headers =
    weeks[0].map(
      (
        d,
      ) => ({
        short:
          fmt.weekday.format(
            at(
              d,
            ),
          ),
        long: fmt.weekdayLong.format(
          at(
            d,
          ),
        ),
      }),
    );

  return (
    <section
      aria-labelledby="daily-stats-calendar"
      className="flex flex-col gap-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2
          id="daily-stats-calendar"
          className="t-heading text-site-text"
        >
          {t(
            'calendar-heading',
            {
              defaultValue:
                'Calendar',
            },
          )}
        </h2>
        <Select
          aria-label={t(
            'calendar-filter',
            {
              defaultValue:
                'Show puzzle',
            },
          )}
          controlSize="sm"
          value={
            mode
          }
          onChange={(
            e,
          ) =>
            setMode(
              e
                .target
                .value,
            )
          }
        >
          <option
            value={
              ALL
            }
          >
            {t(
              'calendar-all-puzzles',
              {
                defaultValue:
                  'All puzzles',
              },
            )}
          </option>
          {DESK_MODES.map(
            (
              m,
            ) => (
              <option
                key={
                  m.id
                }
                value={
                  m.id
                }
              >
                {
                  modeTitles[
                    m
                      .id
                  ]
                }
              </option>
            ),
          )}
        </Select>
      </div>

      <div className="flex items-center justify-between">
        <IconButton
          icon={
            ChevronLeft
          }
          label={t(
            'calendar-prev',
            {
              defaultValue:
                'Previous month',
            },
          )}
          disabled={
            month <=
            first
          }
          onClick={() =>
            setMonth(
              (
                cur,
              ) =>
                shiftMonth(
                  cur,
                  -1,
                ),
            )
          }
        />
        <p
          className="t-label text-site-text"
          aria-live="polite"
        >
          {fmt.month.format(
            at(
              `${month}-01`,
            ),
          )}
        </p>
        <IconButton
          icon={
            ChevronRight
          }
          label={t(
            'calendar-next',
            {
              defaultValue:
                'Next month',
            },
          )}
          disabled={
            month >=
            last
          }
          onClick={() =>
            setMonth(
              (
                cur,
              ) =>
                shiftMonth(
                  cur,
                  1,
                ),
            )
          }
        />
      </div>

      <table className="w-full table-fixed border-collapse">
        <caption className="sr-only">
          {fmt.month.format(
            at(
              `${month}-01`,
            ),
          )}
        </caption>
        <thead>
          <tr>
            <th
              scope="col"
              className="w-0 overflow-hidden p-0"
            >
              <span className="sr-only">
                {t(
                  'calendar-week',
                  {
                    defaultValue:
                      'Week',
                  },
                )}
              </span>
            </th>
            {headers.map(
              (
                h,
              ) => (
                <th
                  key={
                    h.long
                  }
                  scope="col"
                  className="t-meta pb-2 text-center font-normal"
                >
                  <abbr
                    title={
                      h.long
                    }
                    className="no-underline"
                  >
                    {
                      h.short
                    }
                  </abbr>
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {weeks.map(
            (
              week,
            ) => (
              <tr
                key={
                  week[0]
                }
              >
                <th
                  scope="row"
                  className="w-0 overflow-hidden p-0"
                >
                  <span className="sr-only">
                    {t(
                      'calendar-week-of',
                      {
                        defaultValue:
                          'Week of {{date}}',
                        date: fmt.day.format(
                          at(
                            week[0],
                          ),
                        ),
                      },
                    )}
                  </span>
                </th>
                {week.map(
                  (
                    key,
                  ) => {
                    const inMonth =
                      monthOf(
                        key,
                      ) ===
                      month;
                    const count =
                      inMonth
                        ? countOf(
                            key,
                          )
                        : 0;
                    const date =
                      fmt.day.format(
                        at(
                          key,
                        ),
                      );
                    return (
                      <td
                        key={
                          key
                        }
                        className={`h-12 border-t border-site-border p-1 text-center align-top ${
                          count >
                          0
                            ? 'bg-site-bg-subtle'
                            : ''
                        } ${key === todayKey ? 'font-semibold' : ''}`}
                      >
                        {inMonth ? (
                          <>
                            <span
                              aria-hidden
                              className="t-meta block text-site-text"
                            >
                              {Number(
                                key.slice(
                                  8,
                                ),
                              )}
                            </span>
                            {count >
                            0 ? (
                              <span
                                aria-hidden
                                className="t-meta block text-site-text"
                              >
                                {fmt.number.format(
                                  count,
                                )}
                              </span>
                            ) : null}
                            <span className="sr-only">
                              {count >
                              0
                                ? t(
                                    'calendar-day-solved',
                                    {
                                      date,
                                      count,
                                      defaultValue_one:
                                        '{{date}}: {{count}} puzzle solved',
                                      defaultValue_other:
                                        '{{date}}: {{count}} puzzles solved',
                                    },
                                  )
                                : t(
                                    'calendar-day-none',
                                    {
                                      date,
                                      defaultValue:
                                        '{{date}}: no puzzles solved',
                                    },
                                  )}
                            </span>
                          </>
                        ) : null}
                      </td>
                    );
                  },
                )}
              </tr>
            ),
          )}
        </tbody>
      </table>
    </section>
  );
}
