import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { firstDayOfWeek } from '@/lib/locale-week';
import { heatLevel } from '@/lib/profile/activity';
import { busiestSlots, type EngagementGrid } from '@/lib/social/audience';

/** Share of the ink in each step, mixed into the page ground; step 0 is the empty cell. */
const LEVEL_MIX = [8, 28, 48, 72, 100] as const;
const HOURS = Array.from(
  {
    length: 24,
  },
  (_, h) => h,
);
/** Hours that get a label under the grid. */
const LABELLED_HOURS = [0, 6, 12, 18];
const BUSIEST = 3;

/**
 * Day of week by hour of engagement on the member's posts: flat stepped fills of `--site-text`
 * on the page ground (no gradient), the three busiest slots spelled out under it, and a table
 * carrying every number. The cells are `aria-hidden`; the figure caption and the table are
 * the text alternative. Weekday and hour names come from `Intl`, rows start on the locale's
 * first day of the week. `grid` is 7 rows from Sunday of 24 hours, in the viewer's time zone.
 */
export function EngagementHoursGrid({ grid }: { grid: EngagementGrid }) {
  const { t, i18n } = useTranslation('audience');
  const locale = i18n.language;

  const names = useMemo(() => {
    // 2023-01-01 was a Sunday, so day offset `dow` is that weekday and `hour` is read as UTC.
    const long = new Intl.DateTimeFormat(locale, {
      weekday: 'long',
      timeZone: 'UTC',
    });
    const short = new Intl.DateTimeFormat(locale, {
      weekday: 'short',
      timeZone: 'UTC',
    });
    const time = new Intl.DateTimeFormat(locale, {
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      timeZone: 'UTC',
    });
    return {
      longDay: (dow: number) => long.format(new Date(Date.UTC(2023, 0, 1 + dow))),
      shortDay: (dow: number) => short.format(new Date(Date.UTC(2023, 0, 1 + dow))),
      hour: (hour: number) => time.format(new Date(Date.UTC(2023, 0, 1, hour))),
    };
  }, [locale]);
  const number = useMemo(() => new Intl.NumberFormat(locale), [locale]);

  const first = firstDayOfWeek(locale);
  const order = useMemo(
    () =>
      Array.from(
        {
          length: 7,
        },
        (_, i) => (first + i) % 7,
      ),
    [first],
  );
  const max = useMemo(() => Math.max(0, ...grid.flat()), [grid]);
  const slots = useMemo(() => busiestSlots(grid, BUSIEST), [grid]);

  const slotText = (slot: { dow: number; hour: number }) =>
    t('slot', {
      defaultValue: '{{day}} at {{time}}',
      day: names.longDay(slot.dow),
      time: names.hour(slot.hour),
    });
  const summary = slots.length
    ? t('grid-summary', {
        defaultValue: 'Your audience engages most on {{slots}}.',
        slots: new Intl.ListFormat(locale, {
          style: 'long',
          type: 'conjunction',
        }).format(slots.map(slotText)),
      })
    : t('grid-empty', {
        defaultValue: 'No engagement on your posts in the last 90 days.',
      });

  return (
    <figure className="m-0">
      <figcaption className="sr-only">{summary}</figcaption>
      <div aria-hidden className="flex gap-2">
        <div className="t-meta grid shrink-0 grid-rows-7 gap-0.5">
          {order.map((dow) => (
            <span key={dow} className="flex items-center leading-none">
              {names.shortDay(dow)}
            </span>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <div
            className="grid gap-0.5"
            style={{
              gridTemplateColumns: 'repeat(24, minmax(0, 1fr))',
            }}
          >
            {order.flatMap((dow) =>
              HOURS.map((hour) => (
                <div
                  key={`${dow}-${hour}`}
                  className="aspect-square w-full rounded-site-sm"
                  style={{
                    background: `color-mix(in srgb, var(--site-text) ${LEVEL_MIX[heatLevel(grid[dow]?.[hour] ?? 0, max)]}%, var(--site-bg))`,
                  }}
                />
              )),
            )}
          </div>
          <div className="t-meta relative mt-1 h-4">
            {LABELLED_HOURS.map((hour) => (
              <span
                key={hour}
                className="absolute"
                style={{
                  insetInlineStart: `${(hour / 24) * 100}%`,
                }}
              >
                {names.hour(hour)}
              </span>
            ))}
          </div>
        </div>
      </div>

      {slots.length > 0 ? (
        <ol className="mt-3 list-none p-0">
          {slots.map((slot) => (
            <li
              key={`${slot.dow}-${slot.hour}`}
              className="t-body flex justify-between gap-3 border-b border-site-border py-2"
            >
              <span>{slotText(slot)}</span>
              <span className="t-meta">
                {t('slot-count', {
                  defaultValue: '{{n}} interactions',
                  n: number.format(slot.count),
                })}
              </span>
            </li>
          ))}
        </ol>
      ) : null}

      <table className="sr-only">
        <caption>
          {t('grid-label', {
            defaultValue: 'Interactions on your posts by day and hour',
          })}
        </caption>
        <thead>
          <tr>
            <th scope="col">
              {t('grid-day', {
                defaultValue: 'Day',
              })}
            </th>
            {HOURS.map((hour) => (
              <th key={hour} scope="col">
                {names.hour(hour)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {order.map((dow) => (
            <tr key={dow}>
              <th scope="row">{names.longDay(dow)}</th>
              {HOURS.map((hour) => (
                <td key={hour}>{number.format(grid[dow]?.[hour] ?? 0)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
