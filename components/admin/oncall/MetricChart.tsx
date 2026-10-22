import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatValue } from '@/lib/ops/alarm-rules';
import type { ChartSeries } from '@/lib/ops/series';

// The SVG draws only lines and is stretched to the plot box
// (preserveAspectRatio="none" + non-scaling strokes); every label and the
// hover dot are HTML, so text keeps one size at every width.
const W = 1000;
const H = 160; // = the plot box's CSS height (h-40), so y is in real pixels
const PAD_Y = 8;

/** The next 1 / 2 / 2.5 / 5 × 10^n at or above v, so axis ticks read cleanly. */
function niceCeil(v: number): number {
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

const fmtTime = (t: number, withDate: boolean) =>
  new Date(t).toLocaleString(undefined, {
    ...(withDate ? { month: 'short', day: 'numeric' } : {}),
    hour: 'numeric',
    minute: '2-digit',
  });

/**
 * One metric over time as an inline-SVG line, with each alarm rule's threshold
 * as a dashed reference line. Single series, so no legend — the card title
 * names it. The y-axis is pinned at zero (latencies and rates are magnitudes)
 * and always reaches the highest threshold, so "how close to paging" reads at a
 * glance. A crosshair snaps to the nearest point on hover, touch, or the arrow
 * keys; every value is also in the "Show data" table.
 */
export function MetricChart({ series, withDate }: { series: ChartSeries; withDate: boolean }) {
  const { t } = useTranslation('f-oncall');
  const [active, setActive] = useState<number | null>(null);
  const pts = series.points;
  const latest = pts.length ? pts[pts.length - 1]!.v : null;
  const fmt = (v: number | null) => formatValue(v, series.unit);

  const title = series.worstOf
    ? t('chart-worst', { defaultValue: '{{title}} — worst of each', title: series.title })
    : series.title;

  if (pts.length < 2) {
    return (
      <div className="glass-fill rounded-site p-4">
        <h3 className="text-sm font-semibold text-site-text">{title}</h3>
        <p className="mt-6 mb-6 text-center text-sm text-site-text-muted">
          {t('chart-empty-2', {
            defaultValue:
              'No data for this metric yet. It appears a few minutes after the metric first sees traffic.',
          })}
        </p>
      </div>
    );
  }

  const top = niceCeil(
    Math.max(...pts.map((p) => p.v), ...series.thresholds.map((th) => th.value), 1e-9) * 1.05,
  );
  const t0 = pts[0]!.t;
  const t1 = pts[pts.length - 1]!.t;
  const x = (ts: number) => ((ts - t0) / Math.max(t1 - t0, 1)) * W;
  const y = (v: number) => PAD_Y + (1 - v / top) * (H - PAD_Y * 2);
  const px = pts.map((p) => x(p.t));
  const line = pts
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${px[i]!.toFixed(1)} ${y(p.v).toFixed(1)}`)
    .join(' ');
  const cur = active === null ? null : pts[active]!;
  const over = (v: number) => series.thresholds.some((th) => !th.muted && v > th.value);
  const ticks = [1, 0.5, 0].map((f) => top * f);

  const nearest = (vx: number) => {
    let best = 0;
    for (let i = 1; i < px.length; i++)
      if (Math.abs(px[i]! - vx) < Math.abs(px[best]! - vx)) best = i;
    return best;
  };
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setActive(nearest(((e.clientX - rect.left) / rect.width) * W));
  };
  const onKey = (e: React.KeyboardEvent<SVGSVGElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const i = active ?? pts.length - 1;
    setActive(Math.min(pts.length - 1, Math.max(0, i + (e.key === 'ArrowRight' ? 1 : -1))));
  };

  return (
    <div className="glass-fill min-w-0 rounded-site p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="min-w-0 text-sm font-semibold text-site-text">{title}</h3>
        <p className="text-xs tabular-nums text-site-text-muted" aria-live="polite">
          {cur ? (
            <>
              <span
                className={
                  over(cur.v) ? 'font-semibold text-site-danger' : 'font-semibold text-site-text'
                }
              >
                {fmt(cur.v)}
              </span>{' '}
              {fmtTime(cur.t, withDate)}
            </>
          ) : (
            <>
              {t('chart-latest', { defaultValue: 'Latest' })}{' '}
              <span
                className={
                  latest !== null && over(latest)
                    ? 'font-semibold text-site-danger'
                    : 'font-semibold text-site-text'
                }
              >
                {fmt(latest)}
              </span>
            </>
          )}
        </p>
      </div>

      <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-site-text-muted">
        {series.thresholds.map((th) => (
          <li key={th.label} className="flex items-center gap-1.5">
            <svg
              aria-hidden
              width="16"
              height="2"
              className={th.muted ? 'text-site-text-dim' : 'text-site-danger'}
            >
              <line
                x1="0"
                x2="16"
                y1="1"
                y2="1"
                stroke="currentColor"
                strokeWidth="2"
                strokeDasharray="4 3"
              />
            </svg>
            {th.muted
              ? t('chart-threshold-muted', { defaultValue: '{{rule}} (muted)', rule: th.label })
              : t('chart-threshold', {
                  defaultValue: 'Alarm above {{value}} · {{rule}}',
                  value: fmt(th.value),
                  rule: th.label,
                })}
          </li>
        ))}
      </ul>

      <div className="mt-3 flex gap-2">
        <div
          className="relative h-40 w-12 shrink-0 text-right text-[10px] tabular-nums text-site-text-dim"
          aria-hidden
        >
          {ticks.map((v) => (
            <span key={v} className="absolute right-0 -translate-y-1/2" style={{ top: y(v) }}>
              {fmt(v)}
            </span>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <div className="relative h-40">
            <svg
              role="img"
              tabIndex={0}
              aria-label={t('chart-label', {
                defaultValue:
                  '{{title}}, latest {{value}}. Use the arrow keys to read earlier points.',
                title,
                value: fmt(latest),
              })}
              viewBox={`0 0 ${W} ${H}`}
              preserveAspectRatio="none"
              className="absolute inset-0 h-full w-full touch-pan-y overflow-visible rounded-[var(--site-control-radius)] text-site-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-site-accent/40"
              onPointerMove={onMove}
              onPointerLeave={() => setActive(null)}
              onKeyDown={onKey}
              onBlur={() => setActive(null)}
            >
              {ticks.map((v) => (
                <line
                  key={v}
                  x1={0}
                  x2={W}
                  y1={y(v)}
                  y2={y(v)}
                  className="text-site-border"
                  stroke="currentColor"
                  strokeOpacity={0.6}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              {series.thresholds.map((th) => (
                <line
                  key={th.label}
                  x1={0}
                  x2={W}
                  y1={y(th.value)}
                  y2={y(th.value)}
                  className={th.muted ? 'text-site-text-dim' : 'text-site-danger'}
                  stroke="currentColor"
                  strokeDasharray="5 4"
                  strokeOpacity={th.muted ? 0.5 : 0.8}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              <path
                d={line}
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
              {cur && active !== null && (
                <line
                  x1={px[active]}
                  x2={px[active]}
                  y1={0}
                  y2={H}
                  className="text-site-text-muted"
                  stroke="currentColor"
                  strokeOpacity={0.5}
                  vectorEffect="non-scaling-stroke"
                />
              )}
            </svg>
            {cur && active !== null && (
              <span
                aria-hidden
                className="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-site-accent ring-2 ring-site-surface"
                style={{ left: `${(px[active]! / W) * 100}%`, top: y(cur.v) }}
              />
            )}
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-site-text-dim" aria-hidden>
            <span>{fmtTime(t0, withDate)}</span>
            <span>{fmtTime(t1, withDate)}</span>
          </div>
        </div>
      </div>

      <details className="mt-2 text-xs text-site-text-muted">
        <summary className="cursor-pointer select-none">
          {t('chart-table', { defaultValue: 'Show data' })}
        </summary>
        <div className="mt-2 max-h-48 overflow-auto">
          <table className="w-full text-left tabular-nums">
            <thead>
              <tr>
                <th className="py-1 pr-4 font-medium">
                  {t('chart-col-time', { defaultValue: 'Time' })}
                </th>
                <th className="py-1 font-medium">
                  {t('chart-col-value', { defaultValue: 'Value' })}
                </th>
              </tr>
            </thead>
            <tbody>
              {[...pts].reverse().map((p) => (
                <tr key={p.t}>
                  <td className="py-0.5 pr-4">{fmtTime(p.t, withDate)}</td>
                  <td className={over(p.v) ? 'py-0.5 text-site-danger' : 'py-0.5 text-site-text'}>
                    {fmt(p.v)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
