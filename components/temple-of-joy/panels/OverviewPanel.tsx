/**
 * The overview — where every number on screen comes from.
 *
 * The itemised multiplier is the important half. An idle game that shows you
 * "×4,182,003" and nothing else stops being a game you can play and becomes a
 * game you watch; showing which layer contributed what is what lets a player
 * decide whether to chase trophies, plant a garden, or just buy more Acolytes.
 *
 * ## The ledger, and why it is here
 *
 * The same argument applies one level down, and the game was not making it. You
 * could read "Sources owned: 412" here and the price of the next Acolyte in the
 * shop, and nowhere at all could you read what you actually HAVE — how many of
 * each, how far each had been raised, and which of them was carrying the run.
 * The shop is a list of things to buy; it hides everything you already own
 * behind a price, and it hides a source entirely once it is no longer visible
 * for purchase.
 *
 * So `Holdings` is an inventory rather than a shop: every source with a count,
 * its Manna level, what it makes, and its SHARE of the rate — which is the one
 * number that turns a wall of figures into a decision, because it is the only
 * one that says where the next purchase should go.
 */
'use client';

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { fmt, fmtCount, formatDuration, sharePercent } from '@/lib/temple-of-joy/numbers';
import {
  computeAscensionGrace,
  computeDevotion,
  computeGlobes,
  computeGrossJps,
  computeJps,
  computeMultipliers,
  computeSinnerDrain,
  computeTotalLevels,
  computeSourceJps,
  computeTotalSources,
  computeTouch,
  computeVigil,
} from '@/lib/temple-of-joy/engine';
import { TROPHIES } from '@/lib/temple-of-joy/data/trophies';
import { BLESSINGS } from '@/lib/temple-of-joy/data/blessings';
import { SOURCES } from '@/lib/temple-of-joy/data/sources';
import { SEEDS } from '@/lib/temple-of-joy/minigames/garden';
import { MAX_GLOBES } from '@/lib/temple-of-joy/data/globes';
import { useTempleSnapshot } from '../hooks';
import { TempleSection, Glyph } from '../ui';

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
      peak: state.peakJoy,
      sources: computeTotalSources(state),
      globesBought: state.globesBought,
      graceEarned: state.graceEarned,
      graceSpent: state.graceSpent,
      haloStreak: state.haloStreak,
      rapture: state.rapture,
      mannaGathered: state.manna.gathered,
      seedsKnown: state.garden.known.length,
      choirSwaps: state.choir.swaps,
      marketProfit: state.exchange.lifetimeProfit,
      prayersSaid: state.hours.said,
      keepsakes: state.keepsakes.length,
      globes: computeGlobes(state),
      levels: computeTotalLevels(state),
      bowlFrames: state.bowl.frames,
      bowlBest: state.bowl.bestPins,
      bowlStrikes: state.bowl.strikes,
      bowlCooldown: state.bowl.cooldown,
      bowlRemaining: state.bowl.remaining,
      bowlSeen: state.bowl.revealed,
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
    [t('mult-globes', { defaultValue: 'The globes' }), s.mult.globes],
    [t('mult-bowl', { defaultValue: 'The Lane' }), s.mult.bowl],
  ];

  const totals: [string, string][] = [
    [t('lifetime-joy', { defaultValue: 'Joy, all time' }), fmt(s.lifetime, s.format)],
    [t('run-joy', { defaultValue: 'Joy, this run' }), fmt(s.run, s.format)],
    [t('peak-joy', { defaultValue: 'Most joy held at once' }), fmt(s.peak, s.format)],
    [t('sources-owned', { defaultValue: 'Sources owned' }), fmt(s.sources, s.format)],
    [t('globes-turning', { defaultValue: 'Globes turning' }), `${s.globes} / ${MAX_GLOBES}`],
    [t('globes-bought', { defaultValue: 'Globes bought this run' }), String(s.globesBought)],
    [t('levels-raised', { defaultValue: 'Manna levels' }), String(s.levels)],
    [t('manna-gathered', { defaultValue: 'Gathered, all time' }), String(s.mannaGathered)],
    [t('blessings-bought', { defaultValue: 'Blessings' }), `${s.blessings} / ${BLESSINGS.length}`],
    [t('trophies-earned', { defaultValue: 'Trophies' }), `${s.trophies} / ${TROPHIES.length}`],
    [t('devotion', { defaultValue: 'Devotion' }), `+${Math.round(s.devotion * 100)}%`],
  ];

  /**
   * The rooms off the nave. Each line only appears once its room has been
   * opened — a ledger of four zeroes for mechanics a player has not met is the
   * same mistake as a rail of locked tabs.
   */
  const rooms: [string, string][] = [
    ...(s.seedsKnown > 0
      ? ([
          [
            t('seeds-known', { defaultValue: 'Seeds discovered' }),
            `${s.seedsKnown} / ${SEEDS.length}`,
          ],
        ] as [string, string][])
      : []),
    ...(s.choirSwaps > 0
      ? ([[t('choir-swaps', { defaultValue: 'Choir re-seatings' }), String(s.choirSwaps)]] as [
          string,
          string,
        ][])
      : []),
    ...(s.marketProfit > 0
      ? ([
          [
            t('exchange-profit', { defaultValue: 'Taken in all time' }),
            fmt(s.marketProfit, s.format),
          ],
        ] as [string, string][])
      : []),
    ...(s.prayersSaid > 0
      ? ([[t('prayers-said', { defaultValue: 'Prayers said' }), String(s.prayersSaid)]] as [
          string,
          string,
        ][])
      : []),
    ...(s.rapture > 0
      ? ([[t('rapture-stage', { defaultValue: 'Rapture reached' }), String(s.rapture)]] as [
          string,
          string,
        ][])
      : []),
  ];

  const deeds: [string, string][] = [
    [t('offerings-made', { defaultValue: 'Offerings by hand' }), s.touches.toLocaleString('en-US')],
    [t('halos-caught', { defaultValue: 'Halos caught' }), s.halos.toLocaleString('en-US')],
    ...(s.haloStreak > 0
      ? ([[t('halo-streak', { defaultValue: 'Halos in a row' }), String(s.haloStreak)]] as [
          string,
          string,
        ][])
      : []),
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
    ...(s.graceEarned > 0
      ? ([
          [t('grace-earned', { defaultValue: 'Grace earned, all time' }), String(s.graceEarned)],
          [
            t('grace-spent-total', { defaultValue: 'Grace spent on the Ladder' }),
            String(s.graceSpent),
          ],
        ] as [string, string][])
      : []),
    ...(s.keepsakes > 0
      ? ([[t('keepsakes-carried', { defaultValue: 'Keepsakes carried' }), String(s.keepsakes)]] as [
          string,
          string,
        ][])
      : []),
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

      {rooms.length > 0 && (
        <>
          <TempleSection>{t('section-rooms', { defaultValue: 'The rooms' })}</TempleSection>
          {rooms.map(([label, value]) => (
            <Line key={label} label={label} value={value} />
          ))}
        </>
      )}

      <TempleSection>{t('section-deeds', { defaultValue: 'Deeds' })}</TempleSection>
      {deeds.map(([label, value]) => (
        <Line key={label} label={label} value={value} />
      ))}

      <Holdings />

      {/* The lane only appears in the ledger once it has been used. A row of
          zeroes for a mechanic nobody has met yet teaches nothing. */}
      {s.bowlSeen && (
        <>
          <TempleSection>{t('section-bowl', { defaultValue: 'The Lane' })}</TempleSection>
          <Line
            label={t('bowl-frames', { defaultValue: 'Frames bowled' })}
            value={String(s.bowlFrames)}
          />
          <Line
            label={t('bowl-best', { defaultValue: 'Best frame' })}
            value={t('bowl-pins', { pins: s.bowlBest, defaultValue: '{{pins}} pins' })}
          />
          <Line
            label={t('bowl-strikes', { defaultValue: 'Strikes' })}
            value={String(s.bowlStrikes)}
          />
          <Line
            label={
              s.bowlRemaining > 0
                ? t('bowl-boost-left', { defaultValue: 'Boost ends in' })
                : t('bowl-next', { defaultValue: 'Lane reopens in' })
            }
            value={
              s.bowlRemaining > 0
                ? formatDuration(s.bowlRemaining)
                : s.bowlCooldown > 0
                  ? formatDuration(s.bowlCooldown)
                  : t('bowl-open-now', { defaultValue: 'Now' })
            }
          />
        </>
      )}
    </>
  );
}

/**
 * Everything you own, and what each of it is doing.
 *
 * Packed into a STRING rather than returned as an array of objects, because
 * `useTempleSnapshot` compares shallowly: a fresh array of fresh row objects is
 * never equal to the last one, so the panel would re-render on every beat
 * whether or not a single figure had moved. One string of rounded figures
 * compares by value, so a temple standing still costs nothing to display.
 *
 * The rate is rounded to three significant figures before it goes into the key
 * for the same reason — an untouched source's raw output still drifts in the
 * sixteenth decimal, and comparing that is the same as not comparing at all.
 */
function Holdings() {
  const { t } = useTranslation('c-temple-of-joy');

  const packed = useTempleSnapshot((state) => {
    const rows: string[] = [];
    let total = 0;
    for (const source of SOURCES) {
      const owned = state.sources[source.id] ?? 0;
      if (owned <= 0) continue;
      const jps = computeSourceJps(state, source.id);
      total += jps;
      rows.push(
        `${source.id}|${owned}|${state.sourceLevels[source.id] ?? 0}|${jps.toPrecision(3)}`,
      );
    }
    return { rows: rows.join(','), total, format: state.numberFormat };
  }, 700);

  const rows = useMemo(() => {
    if (!packed.rows) return [];
    return packed.rows.split(',').map((entry) => {
      const [id, owned, level, jps] = entry.split('|');
      const def = SOURCES.find((source) => source.id === id);
      return {
        id: id!,
        name: def?.name ?? id!,
        icon: def?.icon ?? '•',
        owned: Number(owned),
        level: Number(level),
        jps: Number(jps),
      };
    });
  }, [packed.rows]);

  if (rows.length === 0) return null;

  return (
    <>
      <TempleSection>{t('section-holdings', { defaultValue: 'What you own' })}</TempleSection>
      <p className="toj-panel-note">
        {t('holdings-note', {
          defaultValue:
            'Every source you hold, what it makes, and its share of your rate. The share is the one to read: it is where your next purchase is worth the most.',
        })}
      </p>
      {rows.map((row) => {
        const share = sharePercent(row.jps, packed.total);
        return (
          <div
            className="toj-holding"
            key={row.id}
            // The bar behind the row IS the share, drawn rather than only
            // written: twenty rows of percentages is a table you read one line
            // at a time, and the question — which of these is carrying the run —
            // is answered by the shape of the column in one glance.
            style={
              packed.total > 0
                ? ({ '--toj-holding-share': `${(row.jps / packed.total) * 100}%` } as React.CSSProperties)
                : undefined
            }
          >
            <span className="toj-holding-icon" aria-hidden>
              <Glyph>{row.icon}</Glyph>
            </span>
            <span className="toj-holding-name">
              <b>{row.name}</b>
              <small>
                {row.level > 0
                  ? t('holding-owned-level', {
                      owned: fmtCount(row.owned),
                      level: row.level,
                      defaultValue: '{{owned}} owned · level {{level}}',
                    })
                  : t('holding-owned', {
                      owned: fmtCount(row.owned),
                      defaultValue: '{{owned}} owned',
                    })}
              </small>
            </span>
            <span className="toj-holding-figures">
              <b>{fmt(row.jps, packed.format)}</b>
              <small>
                {share
                  ? t('holding-share', {
                      percent: share,
                      defaultValue: '{{percent}}% of rate',
                    })
                  : t('holding-idle', { defaultValue: 'idle' })}
              </small>
            </span>
          </div>
        );
      })}
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
