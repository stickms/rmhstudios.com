import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { layoutLines, type SeriesPoint } from '@/lib/elections/history';
import type { Party, Race } from '@/lib/elections/types';

const COLOR: Record<Party, string> = {
  DEM: 'var(--el-dem)',
  GOP: 'var(--el-gop)',
  OTH: 'var(--el-oth)',
};
const W = 300;
const H = 150;
const PAD = { l: 28, r: 6, t: 8, b: 16 };

/**
 * Vote share over the count: one line per leading candidate, one point per change in the vote total.
 * Falls back to plain bars ("share now") until the server has seen the count move twice — before polls
 * report, after a restart, and for finished elections.
 */
export function VoteChart({ race, cycle, live }: { race: Race; cycle: string; live: boolean }) {
  const { t } = useTranslation('c-elections');
  const { data } = useQuery<{ points: SeriesPoint[] }>({
    queryKey: ['elections-history', cycle, race.id],
    queryFn: async () => {
      const r = await fetch(
        `/api/elections/history?cycle=${encodeURIComponent(cycle)}&race=${encodeURIComponent(race.id)}`,
      );
      if (!r.ok) throw new Error(String(r.status));
      return r.json();
    },
    refetchInterval: live ? 15_000 : false,
    staleTime: 5_000,
    retry: 1,
  });

  const top = race.candidates.slice(0, 3);
  const { lines, yMax } = layoutLines(
    data?.points ?? [],
    top.map((c) => c.id),
  );

  if (!lines.length) {
    return (
      <div role="img" aria-label={t('graph.bars', { defaultValue: 'Vote share now' })}>
        <p className="el-eyebrow" style={{ margin: '0 0 8px' }}>
          {race.totalVotes > 0
            ? t('graph.barsNow', {
                defaultValue: 'Vote share now — the line appears once the count moves.',
              })
            : t('graph.none', { defaultValue: 'No votes counted yet.' })}
        </p>
        {top.map((c) => (
          <div key={c.id} style={{ marginBottom: 6 }}>
            <span style={{ fontWeight: 700 }}>{c.name}</span>{' '}
            <span className="el-race__pct">
              {race.totalVotes > 0 ? `${c.pct.toFixed(1)}%` : '—'}
            </span>
            <div className={`el-bar2 el-bar2--${c.party}`} aria-hidden>
              <i style={{ width: `${race.totalVotes > 0 ? c.pct : 0}%` }} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  const x = (v: number) => PAD.l + v * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - v / yMax) * (H - PAD.t - PAD.b);
  const ticks = [0, yMax / 2, yMax];
  return (
    <figure style={{ margin: 0 }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        role="img"
        aria-label={t('graph.label', { defaultValue: 'Vote share over the count' })}
        style={{
          display: 'block',
          maxHeight: 220,
          background: 'var(--el-paper)',
          border: '2px solid var(--el-ink)',
        }}
      >
        {ticks.map((v) => (
          <g key={v}>
            <line
              x1={PAD.l}
              x2={W - PAD.r}
              y1={y(v)}
              y2={y(v)}
              stroke="var(--el-grey)"
              strokeWidth="1"
              strokeDasharray={v === 0 ? undefined : '3 3'}
            />
            <text
              x={PAD.l - 4}
              y={y(v) + 3}
              textAnchor="end"
              fontSize="8"
              fontFamily="var(--el-mono)"
            >
              {Math.round(v)}%
            </text>
          </g>
        ))}
        {lines.map((l) => {
          const cand = top.find((c) => c.id === l.id)!;
          return (
            <polyline
              key={l.id}
              fill="none"
              stroke={COLOR[cand.party]}
              strokeWidth="2.5"
              strokeLinejoin="miter"
              points={l.points.map((p) => `${x(p.x).toFixed(1)},${y(p.y).toFixed(1)}`).join(' ')}
            />
          );
        })}
        {lines.map((l) => {
          const cand = top.find((c) => c.id === l.id)!;
          const last = l.points[l.points.length - 1];
          return (
            <circle
              key={`${l.id}-d`}
              cx={x(last.x)}
              cy={y(last.y)}
              r="3.5"
              fill={COLOR[cand.party]}
              stroke="var(--el-ink)"
              strokeWidth="1.5"
            />
          );
        })}
        <text x={W - PAD.r} y={H - 3} textAnchor="end" fontSize="8" fontFamily="var(--el-mono)">
          {t('graph.now', { defaultValue: 'now' })}
        </text>
      </svg>
      <figcaption
        className="el-eyebrow"
        style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: '4px 12px' }}
      >
        {top.map((c) => (
          <span key={c.id}>
            <i
              style={{
                display: 'inline-block',
                width: 10,
                height: 10,
                background: COLOR[c.party],
                border: '2px solid var(--el-ink)',
                marginRight: 4,
              }}
            />
            {c.lastName} {c.pct.toFixed(1)}%
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
