import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Flat vertical bars with a label under the first and last, in `--chart-ink` (default
 * `--site-text`; an app-tier page sets it). Values may be negative: when any is, bars rise above
 * or hang below a 1px zero rule, so the sign is never told by colour. With none, the baseline is the
 * chart's bottom edge, as before. No animation and no canvas. The bars are
 * `aria-hidden`: a visually hidden summary and table carry the same numbers. The component
 * owns no strings: `summary` and `columns` (table headers) are passed already translated.
 */
export function BarChart({
  bars,
  label,
  summary,
  columns,
  format,
}: {
  bars: { label: string; value: number }[];
  label: string;
  summary: string;
  columns: { label: string; value: string };
  format?: (n: number) => string;
}) {
  const { i18n } = useTranslation();
  const number = useMemo(() => new Intl.NumberFormat(i18n.language), [i18n.language]);
  const show = format ?? ((n: number) => number.format(n));

  const max = Math.max(0, ...bars.map((b) => b.value));
  const min = Math.min(0, ...bars.map((b) => b.value));
  const signed = min < 0;
  const span = max - min;
  const first = bars[0];
  const last = bars[bars.length - 1];

  return (
    <figure className="m-0">
      <figcaption className="sr-only">{summary}</figcaption>
      {signed ? (
        <div aria-hidden className="relative flex h-28 gap-0.5">
          {bars.map((bar) => (
            <div key={bar.label} className="relative min-w-0 flex-1">
              <div
                className="absolute inset-x-0"
                style={{
                  background: 'var(--chart-ink, var(--site-text))',
                  height: `${(Math.abs(bar.value) / span) * 100}%`,
                  minHeight: bar.value === 0 ? 0 : 2,
                  ...(bar.value >= 0 ? { bottom: `${(-min / span) * 100}%` } : { top: `${(max / span) * 100}%` }),
                }}
              />
            </div>
          ))}
          <div className="absolute inset-x-0 border-t border-site-border" style={{ top: `${(max / span) * 100}%` }} />
        </div>
      ) : (
        <div aria-hidden className="flex h-28 items-end gap-0.5 border-b border-site-border">
          {bars.map((bar) => (
            <div
              key={bar.label}
              className="min-w-0 flex-1"
              style={{
                height: max > 0 ? `${(bar.value / max) * 100}%` : 0,
                minHeight: bar.value > 0 ? 2 : 0,
                background: 'var(--chart-ink, var(--site-text))',
              }}
            />
          ))}
        </div>
      )}
      {first && last ? (
        <div aria-hidden className="t-meta mt-1 flex justify-between">
          <span>{first.label}</span>
          <span>{last.label}</span>
        </div>
      ) : null}
      {/* A table ignores a 1px width, so the clipping box is a wrapper, not the table itself. */}
      <div className="sr-only">
        <table>
          <caption>{label}</caption>
          <thead>
            <tr>
              <th scope="col">{columns.label}</th>
              <th scope="col">{columns.value}</th>
            </tr>
          </thead>
          <tbody>
            {bars.map((bar) => (
              <tr key={bar.label}>
                <th scope="row">{bar.label}</th>
                <td>{show(bar.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
