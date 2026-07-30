/**
 * The overview — where every number on screen comes from.
 *
 * The itemised multiplier is the important half. An idle game that shows you
 * "×4,182,003" and nothing else stops being a game you can play and becomes a
 * game you watch; showing which layer contributed what is what lets a player
 * decide whether to chase trophies, plant a garden, or just buy more Acolytes.
 */
'use client';

import { useTranslation } from 'react-i18next';
import { fmt, formatDuration } from '@/lib/temple-of-joy/numbers';
import {
  computeAscensionGrace,
  computeDevotion,
  computeGrossJps,
  computeJps,
  computeMultipliers,
  computeSinnerDrain,
  computeTotalLevels,
  computeTotalSources,
  computeTouch,
  computeVigil,
} from '@/lib/temple-of-joy/engine';
import { TROPHIES } from '@/lib/temple-of-joy/data/trophies';
import { BLESSINGS } from '@/lib/temple-of-joy/data/blessings';
import { useTempleSnapshot } from '../hooks';
import { TempleSection } from '../ui';

export function OverviewPanel() {
  const { t } = useTranslation('c-temple-of-joy');

  const s = useTempleSnapshot((state) => {
    const m = computeMultipliers(state);
    const vigil = computeVigil(state);
    return {
      format: state.numberFormat,
      touch: computeTouch(state),
      jps: computeJps(state),
      gross: computeGrossJps(state),
      drain: computeSinnerDrain(state),
      devotion: computeDevotion(state),
      mult: m,
      lifetime: state.lifetimeJoy,
      run: state.runJoy,
      sources: computeTotalSources(state),
      levels: computeTotalLevels(state),
      blessings: state.blessings.size,
      trophies: state.trophies.size,
      touches: state.totalTouches,
      halos: state.halosCaught,
      sinners: state.sinnersStruck,
      harvest: state.sinnerHarvest,
      playtime: state.playtime,
      runPlaytime: state.runPlaytime,
      ascensions: state.ascensions,
      grace: state.grace,
      nextGrace: computeAscensionGrace(state),
      vigilEfficiency: vigil.efficiency,
      vigilHours: vigil.hours,
    };
  }, 500);

  const rate = [
    [t('per-offering', { defaultValue: 'Per offering' }), fmt(s.touch, s.format)],
    [t('per-second-short', { defaultValue: 'Per second' }), fmt(s.jps, s.format)],
    ...(s.drain > 0
      ? ([
          [
            t('held-by-sinners', { defaultValue: 'Held by Sinners' }),
            `${Math.round(s.drain * 100)}% of ${fmt(s.gross, s.format)}`,
          ],
        ] as [string, string][])
      : []),
  ] as [string, string][];

  // Only the layers that are actually doing something. A row reading "×1.00"
  // is noise, and hiding it is how the panel teaches what unlocked what.
  const layers: [string, number][] = [
    [t('mult-blessings', { defaultValue: 'Blessings' }), s.mult.blessings],
    [t('mult-devotion', { defaultValue: 'Cherubim × Devotion' }), s.mult.devotion],
    [t('mult-grace', { defaultValue: 'Grace' }), s.mult.grace],
    [t('mult-legacy', { defaultValue: 'The Ladder' }), s.mult.legacy],
    [t('mult-garden', { defaultValue: 'Garden' }), s.mult.garden],
    [t('mult-choir', { defaultValue: 'Choir' }), s.mult.choir],
    [t('mult-buffs', { defaultValue: 'Halo blessings' }), s.mult.buffs],
  ];

  const totals: [string, string][] = [
    [t('lifetime-joy', { defaultValue: 'Joy, all time' }), fmt(s.lifetime, s.format)],
    [t('run-joy', { defaultValue: 'Joy, this run' }), fmt(s.run, s.format)],
    [t('sources-owned', { defaultValue: 'Sources owned' }), fmt(s.sources, s.format)],
    [t('levels-raised', { defaultValue: 'Manna levels' }), String(s.levels)],
    [t('blessings-bought', { defaultValue: 'Blessings' }), `${s.blessings} / ${BLESSINGS.length}`],
    [t('trophies-earned', { defaultValue: 'Trophies' }), `${s.trophies} / ${TROPHIES.length}`],
    [t('devotion', { defaultValue: 'Devotion' }), `+${Math.round(s.devotion * 100)}%`],
  ];

  const deeds: [string, string][] = [
    [t('offerings-made', { defaultValue: 'Offerings by hand' }), s.touches.toLocaleString('en-US')],
    [t('halos-caught', { defaultValue: 'Halos caught' }), s.halos.toLocaleString('en-US')],
    [t('sinners-struck', { defaultValue: 'Sinners struck' }), s.sinners.toLocaleString('en-US')],
    ...(s.harvest > 0
      ? ([
          [
            t('sinner-harvest', { defaultValue: 'Reclaimed from Sinners' }),
            fmt(s.harvest, s.format),
          ],
        ] as [string, string][])
      : []),
    [t('time-in-temple', { defaultValue: 'Time in the temple' }), formatDuration(s.playtime)],
    [t('time-this-run', { defaultValue: 'Time this run' }), formatDuration(s.runPlaytime)],
    [t('ascensions', { defaultValue: 'Ascensions' }), String(s.ascensions)],
    [t('grace-held', { defaultValue: 'Grace held' }), String(s.grace)],
    ...(s.nextGrace > 0
      ? ([[t('grace-waiting', { defaultValue: 'Grace waiting' }), `+${s.nextGrace}`]] as [
          string,
          string,
        ][])
      : []),
  ];

  return (
    <>
      <TempleSection>{t('section-rate', { defaultValue: 'Rate' })}</TempleSection>
      {rate.map(([label, value]) => (
        <Line key={label} label={label} value={value} />
      ))}

      <TempleSection>
        {t('section-multiplier', { defaultValue: 'Where the multiplier comes from' })}
      </TempleSection>
      {layers
        .filter(([, value]) => Math.abs(value - 1) > 0.0005)
        .map(([label, value]) => (
          <Line key={label} label={label} value={`×${formatMultiplier(value)}`} />
        ))}
      <Line
        label={t('mult-total', { defaultValue: 'All together' })}
        value={`×${formatMultiplier(s.mult.total)}`}
      />

      <TempleSection>{t('section-vigil', { defaultValue: 'While you are away' })}</TempleSection>
      <Line
        label={t('vigil-rate', { defaultValue: 'Share of rate kept' })}
        value={`${Math.round(s.vigilEfficiency * 100)}%`}
      />
      <Line
        label={t('vigil-window', { defaultValue: 'Hours that count' })}
        value={formatDuration(s.vigilHours * 3600)}
      />
      <p className="toj-panel-note">
        {t('vigil-note', {
          defaultValue:
            'The garden, the market, the manna and the Sinners are not capped — they run for the whole time you are gone. A night away is worth more than the number above suggests.',
        })}
      </p>

      <TempleSection>{t('section-totals', { defaultValue: 'The temple' })}</TempleSection>
      {totals.map(([label, value]) => (
        <Line key={label} label={label} value={value} />
      ))}

      <TempleSection>{t('section-deeds', { defaultValue: 'Deeds' })}</TempleSection>
      {deeds.map(([label, value]) => (
        <Line key={label} label={label} value={value} />
      ))}
    </>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="toj-setting">
      <span className="toj-setting-label">
        <span className="toj-setting-name">{label}</span>
      </span>
      <span className="toj-setting-value">{value}</span>
    </div>
  );
}

/** Multipliers get more decimals when they are small, where they matter most. */
function formatMultiplier(value: number): string {
  if (value < 10) return value.toFixed(2);
  if (value < 1_000) return value.toFixed(1);
  return fmt(value);
}
