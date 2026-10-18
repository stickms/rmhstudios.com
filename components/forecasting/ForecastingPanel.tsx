'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { useSession } from '@/components/Providers';
import { SeasonAdminForm } from './SeasonAdminForm';

interface Bucket {
  from: number;
  to: number;
  count: number;
  meanForecast: number;
  observed: number;
}
interface Calibration {
  n: number;
  brier: number;
  skill: number;
  buckets: Bucket[];
  enough: boolean;
}
interface SeasonSummary {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  marketCount: number;
}
interface Board {
  season: SeasonSummary;
  resolvedCount: number;
  leaderboard: {
    userId: string;
    points: number;
    scored: number;
    brier: number;
    user: { name: string | null; handle: string | null } | null;
  }[];
}

const MIN_FOR_PROFILE = 20;

function CalibrationCurve({ buckets }: { buckets: Bucket[] }) {
  const { t } = useTranslation('f-forecasting');
  const S = 160;
  return (
    <svg
      viewBox={`0 0 ${S} ${S}`}
      className="w-40 h-40 shrink-0"
      role="img"
      aria-label={t('curve-aria', {
        defaultValue: 'Calibration curve: forecast against observed frequency',
      })}
    >
      <line x1="0" y1={S} x2={S} y2="0" className="stroke-site-border" strokeDasharray="3 3" />
      <polyline
        fill="none"
        className="stroke-site-accent"
        strokeWidth="2"
        points={buckets.map((b) => `${b.meanForecast * S},${S - b.observed * S}`).join(' ')}
      />
      {buckets.map((b) => (
        <circle
          key={b.from}
          cx={b.meanForecast * S}
          cy={S - b.observed * S}
          r={2 + Math.min(4, b.count / 5)}
          className="fill-site-accent"
        />
      ))}
    </svg>
  );
}

function CalibrationCard() {
  const { t } = useTranslation('f-forecasting');
  const [cal, setCal] = useState<Calibration | null>(null);
  useEffect(() => {
    fetch('/api/forecasting/calibration')
      .then((r) => r.json())
      .then((d) => setCal(d.calibration ?? null))
      .catch(() => setCal(null));
  }, []);
  return (
    <section className="rounded-site glass-pane p-4 flex flex-col gap-3">
      <h2 className="font-semibold text-site-text">
        {t('calibration', { defaultValue: 'Your calibration' })}
      </h2>
      {!cal ? (
        <Loader2 className="w-4 h-4 animate-spin text-site-text-dim" />
      ) : !cal.enough ? (
        <p className="text-sm text-site-text-dim">
          {t('not-enough', {
            defaultValue: 'Not enough data yet: {{n}} of {{min}} resolved forecasts.',
            n: cal.n,
            min: MIN_FOR_PROFILE,
          })}
        </p>
      ) : (
        <div className="flex items-center gap-4 flex-wrap">
          <CalibrationCurve buckets={cal.buckets} />
          <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-1 text-sm">
            <dt className="text-site-text-dim">{t('forecasts', { defaultValue: 'Forecasts' })}</dt>
            <dd className="tabular-nums">{cal.n}</dd>
            <dt className="text-site-text-dim">{t('brier', { defaultValue: 'Brier score' })}</dt>
            <dd className="tabular-nums">{cal.brier.toFixed(3)}</dd>
            <dt className="text-site-text-dim">{t('skill', { defaultValue: 'Skill vs 50%' })}</dt>
            <dd className="tabular-nums">{Math.round(cal.skill * 100)}%</dd>
          </dl>
        </div>
      )}
    </section>
  );
}

function SeasonCard({ isAdmin }: { isAdmin: boolean }) {
  const { t } = useTranslation('f-forecasting');
  const [data, setData] = useState<{ seasons: SeasonSummary[]; board: Board | null } | null>(null);
  const load = () =>
    fetch('/api/forecasting/seasons')
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData({ seasons: [], board: null }));
  useEffect(() => {
    load();
  }, []);
  const board = data?.board;
  return (
    <section className="rounded-site glass-pane p-4 flex flex-col gap-3">
      <h2 className="font-semibold text-site-text">
        {t('season', { defaultValue: 'Forecasting season' })}
      </h2>
      {!data ? (
        <Loader2 className="w-4 h-4 animate-spin text-site-text-dim" />
      ) : !board ? (
        <p className="text-sm text-site-text-dim">
          {t('no-season', { defaultValue: 'No season is running yet.' })}
        </p>
      ) : (
        <>
          <p className="text-sm text-site-text-dim">
            {t('season-meta', {
              defaultValue:
                '{{title}}: {{resolved}} of {{total}} markets resolved. Points only, no coins.',
              title: board.season.title,
              resolved: board.resolvedCount,
              total: board.season.marketCount,
            })}
          </p>
          {board.leaderboard.length === 0 ? (
            <p className="text-sm text-site-text-dim">
              {t('no-scores', { defaultValue: 'Scores appear once a season market resolves.' })}
            </p>
          ) : (
            <ol className="flex flex-col gap-1">
              {board.leaderboard.map((r, i) => (
                <li key={r.userId} className="flex items-center gap-3 text-sm">
                  <span className="w-6 text-site-text-dim tabular-nums">{i + 1}</span>
                  <span className="flex-1 min-w-0 truncate">
                    {r.user?.name ?? r.user?.handle ?? ''}
                  </span>
                  <span className="text-xs text-site-text-dim tabular-nums">
                    {t('scored', { defaultValue: '{{n}} scored', n: r.scored })}
                  </span>
                  <span className="w-16 text-right font-semibold tabular-nums">{r.points}</span>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
      {isAdmin && <SeasonAdminForm onCreated={load} />}
    </section>
  );
}

export function ForecastingPanel({ signedIn }: { signedIn: boolean }) {
  const { data: session } = useSession();
  const isAdmin = Boolean((session?.user as { isAdmin?: boolean } | undefined)?.isAdmin);
  return (
    <div className="flex flex-col gap-4 p-3 sm:p-4">
      <SeasonCard isAdmin={isAdmin} />
      {signedIn && <CalibrationCard />}
    </div>
  );
}
