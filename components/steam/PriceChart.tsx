'use client';

import { useTranslation } from 'react-i18next';
import type { DayBucket } from '@/lib/cards/price-history';

const W = 640;
const H = 180;
const PAD = { l: 44, r: 12, t: 12, b: 24 };

/**
 * Average sale price per day (a line) with the day's volume (bars), over the last 30
 * days. Drawn from `bucketDaily`; a day with no sales leaves a gap in the line. Colours
 * are the Steam skin's tokens; nothing animates.
 */
export function PriceChart({ history }: { history: DayBucket[] }) {
  const { t } = useTranslation('games-hub');
  const priced = history.filter((d) => d.avg !== null);
  if (priced.length === 0) {
    return (
      <p className="stm-web-pad stm-muted">
        {t('steam-chart-empty', { defaultValue: 'No sales in the last 30 days.' })}
      </p>
    );
  }
  const lo = Math.min(...priced.map((d) => d.min as number));
  const hi = Math.max(...priced.map((d) => d.max as number));
  const span = hi - lo || 1;
  const maxVol = Math.max(...history.map((d) => d.volume), 1);
  const x = (i: number) => PAD.l + (i / Math.max(history.length - 1, 1)) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - (v - lo) / span) * (H - PAD.t - PAD.b);

  // One path segment per run of days that have sales, so a quiet day is a gap.
  let path = '';
  let pen = false;
  history.forEach((d, i) => {
    if (d.avg === null) {
      pen = false;
      return;
    }
    path += `${pen ? 'L' : 'M'}${x(i).toFixed(1)} ${y(d.avg).toFixed(1)} `;
    pen = true;
  });

  const label = t('steam-chart-label', {
    defaultValue: 'Daily average price, last 30 days: low {{lo}}, high {{hi}} coins',
    lo,
    hi,
  });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="stm-chart" role="img" aria-label={label}>
      {history.map((d, i) =>
        d.volume > 0 ? (
          <rect
            key={d.day}
            x={x(i) - 3}
            width={6}
            y={H - PAD.b - (d.volume / maxVol) * 28}
            height={(d.volume / maxVol) * 28}
            fill="var(--stm-raised)"
          />
        ) : null,
      )}
      <path d={path} fill="none" stroke="var(--stm-link)" strokeWidth={2} />
      {history.map((d, i) =>
        d.avg !== null ? <circle key={d.day} cx={x(i)} cy={y(d.avg)} r={2.5} fill="var(--stm-link)" /> : null,
      )}
      <text x={PAD.l - 6} y={y(hi) + 4} textAnchor="end" className="stm-chart-axis">{hi}</text>
      <text x={PAD.l - 6} y={y(lo) + 4} textAnchor="end" className="stm-chart-axis">{lo}</text>
      <text x={PAD.l} y={H - 6} className="stm-chart-axis">{history[0].day.slice(5)}</text>
      <text x={W - PAD.r} y={H - 6} textAnchor="end" className="stm-chart-axis">{history[history.length - 1].day.slice(5)}</text>
    </svg>
  );
}
