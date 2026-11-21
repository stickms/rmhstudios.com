import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { firstDayOfWeek } from '@/lib/locale-week';
import { heatLevel } from '@/lib/profile/activity';

/** Share of the ink in each shade, mixed into the page ground; level 0 is the empty cell. */
const LEVEL_MIX = [8, 28, 48, 72, 100] as const;
const CELL_MAX_PX = 14;

interface Day {
  date: string;
  count: number;
}

/**
 * A grid of days (one column per week, weeks starting on the locale's first day), shaded by
 * count. Flat solid fills of `--heat-ink` (default `--site-text`) mixed into `--heat-ground`
 * (default `--site-bg`); an app-tier page sets both. The cells are `aria-hidden`: a visually
 * hidden summary and table carry the same numbers.
 *
 * `days` is oldest first and consecutive. The component owns no strings: `label` (table
 * caption), `summary` (the one-line text alternative) and `columns` (table headers) are
 * passed already translated. Only the active language is read, for `Intl`.
 *
 * `marked` flags days (a streak, say): the cell gets a 1px ink outline, and the table, which is
 * what a screen reader reads, gains a column carrying `label` for each marked day.
 */
export function DayHeatmap({
  days,
  label,
  summary,
  columns: headers,
  marked,
  weeks = 53,
}: {
  days: Day[];
  label: string;
  summary: string;
  columns: { date: string; count: string };
  marked?: { days: ReadonlySet<string>; label: string; column: string };
  weeks?: number;
}) {
  const { i18n } = useTranslation();
  const locale = i18n.language;

  const { columns, max } = useMemo(() => {
    const first = days[0];
    const offset = first
      ? (new Date(`${first.date}T00:00:00Z`).getUTCDay() - firstDayOfWeek(locale) + 7) % 7
      : 0;
    const cells: (Day | null)[] = [...Array<null>(offset).fill(null), ...days];
    const cols: (Day | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) cols.push(cells.slice(i, i + 7));
    const shown = cols.slice(-weeks);
    return { columns: shown, max: Math.max(0, ...days.map((d) => d.count)) };
  }, [days, weeks, locale]);

  const dateFormat = useMemo(
    () => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }),
    [locale],
  );
  const number = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const formatDate = (key: string) => dateFormat.format(new Date(`${key}T00:00:00Z`));

  return (
    <figure className="m-0">
      <figcaption className="sr-only">{summary}</figcaption>
      <div
        aria-hidden
        className="grid w-full gap-0.5"
        style={{
          gridTemplateColumns: `repeat(${columns.length || 1}, minmax(0, 1fr))`,
          maxWidth: `${columns.length * (CELL_MAX_PX + 2)}px`,
        }}
      >
        {columns.map((week, wi) => (
          // One fixed-width track: an implicit `auto` track sizes to the cells' own aspect-ratio width and
          // spills out of a narrow column (seen as horizontal overflow at 390 px in Arabic).
          <div key={wi} className="grid min-w-0 gap-0.5" style={{ gridTemplateColumns: 'minmax(0, 1fr)' }}>
            {week.map((cell, ci) =>
              cell ? (
                <div
                  key={cell.date}
                  className={`aspect-square w-full rounded-site-sm ${marked?.days.has(cell.date) ? 'border border-site-text' : ''}`}
                  style={{
                    background: `color-mix(in srgb, var(--heat-ink, var(--site-text)) ${LEVEL_MIX[heatLevel(cell.count, max)]}%, var(--heat-ground, var(--site-bg)))`,
                  }}
                />
              ) : (
                <div key={`pad-${ci}`} className="aspect-square w-full" />
              ),
            )}
          </div>
        ))}
      </div>
      {/* A table ignores a 1px width, so the clipping box is a wrapper, not the table itself. */}
      <div className="sr-only">
        <table>
          <caption>{label}</caption>
          <thead>
            <tr>
              <th scope="col">{headers.date}</th>
              <th scope="col">{headers.count}</th>
              {marked && <th scope="col">{marked.column}</th>}
            </tr>
          </thead>
          <tbody>
            {days.map((d) => (
              <tr key={d.date}>
                <th scope="row">{formatDate(d.date)}</th>
                <td>{number.format(d.count)}</td>
                {marked && <td>{marked.days.has(d.date) ? marked.label : ''}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
