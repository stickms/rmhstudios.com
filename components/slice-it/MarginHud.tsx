'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useHudReadout } from '@/components/slice-it/HUD';
import { BOTTOM_BAR_MIN, type MarginRoom } from '@/components/slice-it/useMarginRoom';
import type { GameEngine } from '@/lib/slice-it/engine';
import { JUDGEMENT_ORDER } from '@/lib/slice-it/constants';
import { calculateScoreMultiplier } from '@/lib/slice-it/scoring';
import { useSliceItStore } from '@/lib/slice-it/store';
import type { Difficulty, RunStats } from '@/lib/slice-it/types';

const PRESSING_CODE: Record<Difficulty, string> = {
  easy: 'EZ',
  normal: 'NM',
  hard: 'HD',
  expert: 'EX',
};

function fmt(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

/** The run's judgement tally, a few times a second — it changes on a hit, not a frame. */
function useRunTally(engine: GameEngine | null | undefined): RunStats | null {
  const [stats, setStats] = useState<RunStats | null>(null);
  useEffect(() => {
    if (!engine) return;
    const id = window.setInterval(() => setStats(engine.getRunStats()), 150);
    return () => window.clearInterval(id);
  }, [engine]);
  return stats;
}

/**
 * The readouts, moved out of the field into the room the window leaves around it.
 *
 * A window taller than 16:9 leaves a band above and below the playfield. Instead of
 * leaving it empty and drawing the score over the lanes, the band carries them: on top
 * the song (cover, title, artist, pressing), the score with its grade stamp and
 * accuracy, the speed, and the progress groove along the field's edge; beneath it the
 * tally — each judgement, the longest chain, the lamp and, if the run opted in, the
 * gauge. The field is left with the notes and the combo.
 *
 * Only mounted when the band is tall enough (see `TOP_BAR_MIN`); a short or narrow
 * window keeps the in-field HUD exactly as it was. No pointer events: it is print.
 */
export function MarginHud({
  engine,
  room,
}: {
  engine: GameEngine | null | undefined;
  room: MarginRoom;
}) {
  const { t } = useTranslation('c-game');
  const { t: ts } = useTranslation('r-slice-it');
  const nowPlaying = useSliceItStore((s) => s.nowPlaying);
  const r = useHudReadout(engine, true);
  const stats = useRunTally(engine);
  const multiplier = calculateScoreMultiplier(r.modifiers);
  const geometry = { left: room.stageLeft, width: room.stageWidth };

  return (
    <>
      <div className="slice-mh slice-mh--top" style={{ ...geometry, height: room.top }}>
        <div className="slice-mh__row">
          <div className="slice-mh__song">
            <div className="slice-mh__cover slice-duotone">
              {nowPlaying?.coverUrl ? (
                <img src={nowPlaying.coverUrl} alt="" />
              ) : (
                <span className="slice-dots-cyan absolute inset-0" aria-hidden />
              )}
            </div>
            <div className="min-w-0">
              <div className="slice-label">
                {t('now-playing', { defaultValue: 'Now playing' })} ·{' '}
                {PRESSING_CODE[r.modifiers.difficulty]}
              </div>
              <div className="slice-mh__title">{nowPlaying?.title ?? '—'}</div>
              <div className="slice-mh__artist">{nowPlaying?.artist ?? ''}</div>
            </div>
          </div>

          <div className="slice-mh__score">
            <div className="flex items-center gap-4">
              <span className="slice-mh__figure">{r.score.toLocaleString()}</span>
              <span className="slice-hud-stamp">{r.grade}</span>
            </div>
            <span className="slice-figure text-[13px] text-slice-text">
              {(r.sample.accuracy * 100).toFixed(2)}%
            </span>
          </div>

          <div className="slice-mh__aside">
            <div className="slice-mh__speed">{r.modifiers.speed.toFixed(1)}×</div>
            <div className="slice-label">×{multiplier.toFixed(2)}</div>
          </div>
        </div>

        {/* Progress: the groove, with a needle, along the field's top edge. */}
        {r.duration > 0 && (
          <div className="slice-mh__progress">
            <span className="slice-label w-10 text-right shrink-0">{fmt(r.elapsed)}</span>
            <div className="slice-hud-groove">
              {r.sections
                .filter((s) => s.start > 0)
                .map((s) => (
                  <span
                    key={s.start}
                    className="slice-hud-groove__tick"
                    style={{ left: `${Math.min(100, (s.start / r.duration) * 100)}%` }}
                  />
                ))}
              <div className="slice-hud-groove__fill" style={{ width: `${r.progress * 100}%` }} />
              <div className="slice-hud-groove__needle" style={{ left: `${r.progress * 100}%` }} />
            </div>
            <span className="slice-label w-10 shrink-0">{fmt(r.duration)}</span>
          </div>
        )}
      </div>

      {room.bottom >= BOTTOM_BAR_MIN && (
        <div className="slice-mh slice-mh--bottom" style={{ ...geometry, height: room.bottom }}>
          <dl className="slice-mh__tally">
            {stats &&
              JUDGEMENT_ORDER.map((judgement) => (
                <div key={judgement}>
                  <dt className="slice-label">{judgement}</dt>
                  <dd
                    className={
                      judgement === 'MISS' && stats.judgements[judgement] > 0
                        ? 'text-slice-accent'
                        : judgement === 'MARVELOUS' || judgement === 'PERFECT'
                          ? 'text-slice-primary'
                          : undefined
                    }
                  >
                    {stats.judgements[judgement]}
                  </dd>
                </div>
              ))}
            <div>
              <dt className="slice-label">{t('max-chain', { defaultValue: 'Max Chain' })}</dt>
              <dd>{stats && stats.maxCombo > 0 ? `${stats.maxCombo}×` : '--'}</dd>
            </div>
          </dl>
          <div className="slice-mh__lamp">
            {r.showChain && (
              <span
                className={`slice-label ${r.sample.isPerfect ? 'text-slice-primary' : 'text-slice-text-muted'}`}
              >
                {r.sample.isPerfect
                  ? ts('lamp-perfect', { defaultValue: 'Perfect' })
                  : ts('lamp-full-combo', { defaultValue: 'Full Combo' })}
              </span>
            )}
            {r.modifiers.healthGauge && (
              <div className="flex items-center gap-2">
                <span className="slice-label shrink-0">
                  {r.sample.gaugeBroken
                    ? ts('gauge-broken', { defaultValue: 'Gauge broken' })
                    : ts('gauge', { defaultValue: 'Gauge' })}
                </span>
                <div className="slice-hud-groove w-40">
                  <div
                    className={`h-full origin-left transition-transform duration-150 ${
                      r.sample.gaugeBroken
                        ? 'bg-slice-text-light'
                        : r.healthRatio < 0.5
                          ? 'bg-slice-accent'
                          : 'bg-slice-primary'
                    }`}
                    style={{ width: '100%', transform: `scaleX(${r.healthRatio})` }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
