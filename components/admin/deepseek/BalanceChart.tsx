import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { HourlyPoint } from '@/lib/deepseek/balance';
import { fmtHour, fmtMoney } from './format';

const W = 640;
const H = 220;
const PAD = { top: 12, right: 12, bottom: 24, left: 56 };

interface BalanceChartProps {
  points: HourlyPoint[];
  currency: string;
}

/**
 * Hourly total balance as an inline-SVG line. Unlike the perf sparkline the
 * y-axis is NOT pinned to zero: a balance that drains slowly would read as a
 * flat line otherwise, and the axis labels carry the scale. Hovering (or
 * touching) shows the nearest hour.
 */
export function BalanceChart({ points, currency }: BalanceChartProps) {
  const { t } = useTranslation('f-deepseek');
  const [active, setActive] = useState<number | null>(null);

  if (points.length < 2) {
    return (
      <p className="glass-fill rounded-site p-6 text-center text-sm text-site-text-muted">
        {t('chart-empty', {
          defaultValue: 'Not enough samples in this window yet. One is recorded every hour.',
        })}
      </p>
    );
  }

  const values = points.map((p) => p.total);
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (max - min < 1e-6) {
    min -= 1;
    max += 1;
  }
  const span = max - min;
  min -= span * 0.05;
  max += span * 0.05;

  const t0 = new Date(points[0].hour).getTime();
  const t1 = new Date(points[points.length - 1].hour).getTime();
  const x = (ts: number) =>
    PAD.left + ((ts - t0) / Math.max(t1 - t0, 1)) * (W - PAD.left - PAD.right);
  const y = (v: number) => PAD.top + (1 - (v - min) / (max - min)) * (H - PAD.top - PAD.bottom);
  const px = points.map((p) => x(new Date(p.hour).getTime()));

  const line = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${px[i].toFixed(1)} ${y(p.total).toFixed(1)}`)
    .join(' ');
  const base = H - PAD.bottom;
  const area = `${line} L${px[px.length - 1].toFixed(1)} ${base} L${px[0].toFixed(1)} ${base} Z`;
  const ticks = [0, 0.5, 1].map((f) => min + (max - min) * f);
  const cur = active === null ? null : points[active];

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const vx = ((e.clientX - rect.left) / rect.width) * W;
    let best = 0;
    for (let i = 1; i < px.length; i++) {
      if (Math.abs(px[i] - vx) < Math.abs(px[best] - vx)) best = i;
    }
    setActive(best);
  };

  const label = t('chart-label', {
    defaultValue: 'Hourly {{currency}} balance, latest {{value}}',
    currency,
    value: fmtMoney(values[values.length - 1], currency),
  });

  return (
    <div className="glass-fill rounded-site p-4">
      <div className="mb-2 flex min-h-5 flex-wrap items-center justify-between gap-2 text-xs text-site-text-muted">
        <span>{t('chart-title', { defaultValue: 'Total balance per hour' })}</span>
        {cur && (
          <span className="tabular-nums text-site-text">
            {fmtHour(cur.hour)} · {fmtMoney(cur.total, currency)}
          </span>
        )}
      </div>
      <svg
        role="img"
        aria-label={label}
        viewBox={`0 0 ${W} ${H}`}
        className="h-56 w-full touch-pan-y text-site-accent"
        onPointerMove={onMove}
        onPointerLeave={() => setActive(null)}
      >
        {ticks.map((v) => (
          <g key={v}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(v)}
              y2={y(v)}
              className="text-site-border"
              stroke="currentColor"
              strokeOpacity={0.6}
              strokeDasharray="3 3"
            />
            <text
              x={PAD.left - 6}
              y={y(v) + 3}
              textAnchor="end"
              fontSize={10}
              className="text-site-text-dim"
              fill="currentColor"
            >
              {v.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </text>
          </g>
        ))}
        <text
          x={PAD.left}
          y={H - 6}
          fontSize={10}
          className="text-site-text-dim"
          fill="currentColor"
        >
          {fmtHour(points[0].hour)}
        </text>
        <text
          x={W - PAD.right}
          y={H - 6}
          textAnchor="end"
          fontSize={10}
          className="text-site-text-dim"
          fill="currentColor"
        >
          {fmtHour(points[points.length - 1].hour)}
        </text>
        <path d={area} fill="currentColor" fillOpacity={0.12} />
        <path
          d={line}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.75}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {cur && active !== null && (
          <>
            <line
              x1={px[active]}
              x2={px[active]}
              y1={PAD.top}
              y2={base}
              stroke="currentColor"
              strokeOpacity={0.4}
            />
            <circle cx={px[active]} cy={y(cur.total)} r={3.5} fill="currentColor" />
          </>
        )}
      </svg>
    </div>
  );
}
