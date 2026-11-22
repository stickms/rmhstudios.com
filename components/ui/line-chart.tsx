import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

/**
 * Flat line chart: inline SVG, no animation, no canvas, no observer. It is sized by `viewBox`, so it scales with its
 * container and nothing measures it.
 *
 * Ink comes from CSS custom properties, so any tier can reuse it: `--chart-ink` (first series, solid),
 * `--chart-ink-2` (second series, dashed so the two are never told apart by colour alone) and `--chart-rule` (axes and
 * grid). They default to the site tokens; a full-screen app sets them to its own ink on the container.
 *
 * Every point is reachable with the keyboard (one tab stop; arrow keys, Home and End move along the days), a polite
 * live region reads out the focused day and its values, and "Show as table" swaps the drawing for the same numbers
 * in a table. The drawing itself is `role="img"` with a text summary.
 *
 * Presentational: the caller fetches, formats and translates what it passes in. The component owns no strings:
 * `labels` carries every word it shows, already translated (as `BarChart` takes `summary` and `columns`).
 */

export interface LineChartLabels {
  showChart: string;
  showTable: string;
  /** Header of the first table column (the x values). */
  day: string;
  /** Accessible name of the keyboard-reachable point layer. */
  points: string;
  /** One sentence per series, with its numbers already formatted. */
  seriesSummary: (v: { label: string; first: string; last: string; min: string; max: string }) => string;
}

export interface LineSeries {
  id: string;
  label: string;
  points: {
    x: string;
    y: number;
  }[];
}

interface LineChartProps {
  series: LineSeries[];
  /** What the chart shows; the accessible name and the table caption. */
  label: string;
  labels: LineChartLabels;
  formatY?: (n: number) => string;
  formatX?: (x: string) => string;
}

const W = 640;
const H = 260;
const PAD = {
  left: 48,
  right: 14,
  top: 14,
  bottom: 30,
};
const INK = ['var(--chart-ink, var(--site-text))', 'var(--chart-ink-2, var(--site-text-muted))'];
const RULE = 'var(--chart-rule, var(--site-border))';

/** Round tick positions covering [min, max]. */
function niceTicks(min: number, max: number, count = 4): number[] {
  if (min === max) {
    const pad = Math.abs(min) * 0.1 || 1;
    min -= pad;
    max += pad;
  }
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
  const ticks: number[] = [];
  for (let v = Math.floor(min / step) * step; v <= Math.ceil(max / step) * step + step / 2; v += step) {
    ticks.push(Math.round(v / step) * step);
  }
  return ticks;
}

export function LineChart({ series, label, labels, formatY, formatX }: LineChartProps) {
  const { i18n } = useTranslation();
  const number = useMemo(() => new Intl.NumberFormat(i18n.language), [i18n.language]);
  const fy = formatY ?? ((n: number) => number.format(n));
  const fx = formatX ?? ((x: string) => x);
  const [asTable, setAsTable] = useState(false);
  const [active, setActive] = useState<number | null>(null);
  const targets = useRef<(SVGCircleElement | null)[]>([]);

  const model = useMemo(() => {
    const xs = [...new Set(series.flatMap((s) => s.points.map((p) => p.x)))].sort();
    const values = series.flatMap((s) => s.points.map((p) => p.y));
    const ticks = values.length ? niceTicks(Math.min(...values), Math.max(...values)) : [0, 1];
    const lo = ticks[0] ?? 0;
    const hi = ticks[ticks.length - 1] ?? 1;
    const px = (i: number) =>
      PAD.left + (xs.length > 1 ? (i / (xs.length - 1)) * (W - PAD.left - PAD.right) : (W - PAD.left - PAD.right) / 2);
    const py = (y: number) => PAD.top + (1 - (y - lo) / (hi - lo || 1)) * (H - PAD.top - PAD.bottom);
    const lookup = series.map((s) => new Map(s.points.map((p) => [p.x, p.y])));
    return {
      xs,
      ticks,
      px,
      py,
      lookup,
    };
  }, [series]);

  const { xs, ticks, px, py, lookup } = model;
  if (xs.length === 0) return null;

  const reading = (i: number) =>
    `${fx(xs[i] ?? '')}: ${series
      .map((s, si) => {
        const y = lookup[si]?.get(xs[i] ?? '');
        return y === undefined ? null : `${s.label} ${fy(y)}`;
      })
      .filter(Boolean)
      .join(', ')}`;

  const summary = series
    .map((s) => {
      const ys = s.points.map((p) => p.y);
      if (ys.length === 0) return '';
      return labels.seriesSummary({
        label: s.label,
        first: fy(ys[0] ?? 0),
        last: fy(ys[ys.length - 1] ?? 0),
        min: fy(Math.min(...ys)),
        max: fy(Math.max(...ys)),
      });
    })
    .join(' ');

  const stop = active ?? xs.length - 1;
  const focusAt = (i: number) => {
    const next = Math.max(0, Math.min(xs.length - 1, i));
    setActive(next);
    targets.current[next]?.focus();
  };
  const onKey = (e: KeyboardEvent, i: number) => {
    const to =
      e.key === 'ArrowLeft' || e.key === 'ArrowUp'
        ? i - 1
        : e.key === 'ArrowRight' || e.key === 'ArrowDown'
          ? i + 1
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? xs.length - 1
              : null;
    if (to === null) return;
    e.preventDefault();
    focusAt(to);
  };

  const labelIdx = [...new Set([0, Math.floor((xs.length - 1) / 2), xs.length - 1])];

  return (
    <figure className="m-0">
      <div className="flex items-center justify-between gap-3">
        <figcaption className="t-label">{label}</figcaption>
        <Button type="button" variant="ghost" size="xs" aria-pressed={asTable} onClick={() => setAsTable((v) => !v)}>
          {asTable ? labels.showChart : labels.showTable}
        </Button>
      </div>

      {asTable ? (
        <div className="mt-2 max-h-72 overflow-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">{label}</caption>
            <thead>
              <tr
                className="border-b"
                style={{
                  borderColor: RULE,
                }}
              >
                <th scope="col" className="py-1.5 pr-3 font-medium">
                  {labels.day}
                </th>
                {series.map((s) => (
                  <th key={s.id} scope="col" className="py-1.5 pr-3 text-right font-medium">
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {xs.map((x) => (
                <tr
                  key={x}
                  className="border-b"
                  style={{
                    borderColor: RULE,
                  }}
                >
                  <th scope="row" className="py-1.5 pr-3 font-normal">
                    {fx(x)}
                  </th>
                  {series.map((s, si) => {
                    const y = lookup[si]?.get(x);
                    return (
                      <td key={s.id} className="py-1.5 pr-3 text-right font-mono">
                        {y === undefined ? '' : fy(y)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <div className="relative mt-2">
            <svg
              viewBox={`0 0 ${W} ${H}`}
              preserveAspectRatio="xMidYMid meet"
              role="img"
              aria-label={`${label}. ${summary}`}
              className="block h-auto w-full"
            >
              {ticks.map((v) => (
                <g key={v}>
                  <line x1={PAD.left} x2={W - PAD.right} y1={py(v)} y2={py(v)} stroke={RULE} strokeWidth={1} />
                  <text
                    x={PAD.left - 6}
                    y={py(v)}
                    textAnchor="end"
                    dominantBaseline="middle"
                    fontSize={11}
                    fill={INK[1]}
                  >
                    {fy(v)}
                  </text>
                </g>
              ))}
              {labelIdx.map((i) => (
                <text
                  key={i}
                  x={px(i)}
                  y={H - 8}
                  textAnchor={
                    i === 0 && xs.length > 1 ? 'start' : i === xs.length - 1 && xs.length > 1 ? 'end' : 'middle'
                  }
                  fontSize={11}
                  fill={INK[1]}
                >
                  {fx(xs[i] ?? '')}
                </text>
              ))}
              {series.map((s, si) => {
                const stroke = INK[Math.min(si, 1)];
                const pts = s.points
                  .map((p) => ({
                    i: xs.indexOf(p.x),
                    y: p.y,
                  }))
                  .map((p) => `${px(p.i)},${py(p.y)}`)
                  .join(' ');
                return s.points.length > 1 ? (
                  <polyline
                    key={s.id}
                    points={pts}
                    fill="none"
                    stroke={stroke}
                    strokeWidth={si === 0 ? 1.5 : 2}
                    strokeDasharray={si === 0 ? undefined : '6 4'}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                ) : null;
              })}
              {active !== null ? (
                <g>
                  <line
                    x1={px(active)}
                    x2={px(active)}
                    y1={PAD.top}
                    y2={H - PAD.bottom}
                    stroke={RULE}
                    strokeWidth={1}
                  />
                  {series.map((s, si) => {
                    const y = lookup[si]?.get(xs[active] ?? '');
                    return y === undefined ? null : (
                      <circle key={s.id} cx={px(active)} cy={py(y)} r={4} fill={INK[Math.min(si, 1)]} />
                    );
                  })}
                </g>
              ) : null}
              {series.length > 0 && series[0]?.points.length === 1
                ? series.map((s, si) => {
                    const p = s.points[0];
                    return p ? (
                      <circle key={s.id} cx={px(xs.indexOf(p.x))} cy={py(p.y)} r={3} fill={INK[Math.min(si, 1)]} />
                    ) : null;
                  })
                : null}
            </svg>
            <svg
              viewBox={`0 0 ${W} ${H}`}
              preserveAspectRatio="xMidYMid meet"
              role="group"
              aria-label={labels.points}
              className="absolute inset-0 block h-full w-full"
            >
              {xs.map((x, i) => {
                const y = lookup.map((m) => m.get(x)).find((v) => v !== undefined) ?? 0;
                return (
                  <circle
                    key={x}
                    ref={(el) => {
                      targets.current[i] = el;
                    }}
                    role="img"
                    aria-label={reading(i)}
                    tabIndex={i === stop ? 0 : -1}
                    cx={px(i)}
                    cy={py(y)}
                    r={xs.length > 120 ? 5 : 8}
                    fill="transparent"
                    onMouseEnter={() => setActive(i)}
                    onMouseLeave={() => setActive(null)}
                    onFocus={() => setActive(i)}
                    onBlur={() => setActive(null)}
                    onKeyDown={(e) => onKey(e, i)}
                  />
                );
              })}
            </svg>
          </div>
          <p className="t-meta mt-1 min-h-[1.2em]" aria-live="polite">
            {active !== null ? reading(active) : ''}
          </p>
        </>
      )}
    </figure>
  );
}
