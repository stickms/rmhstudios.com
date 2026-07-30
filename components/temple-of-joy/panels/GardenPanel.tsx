/**
 * The Garden of Eden.
 *
 * A 6×6 bed you sow, wait on, and harvest. Growth is a height on the plot
 * rather than a number, so the whole garden's state reads at a glance — and a
 * plant that is ripe animates, because "which of these thirty-six squares can
 * I click" should never require arithmetic.
 *
 * Every plot is a real button with a real label; a grid of divs would make the
 * garden mouse-only, and it is the part of the game people will spend the most
 * evenings in.
 */
'use client';

import { useTranslation } from 'react-i18next';
import { useTempleStore } from '@/lib/temple-of-joy/store';
import { templeAudio } from '@/lib/temple-of-joy/audio';
import { fmt, formatDuration } from '@/lib/temple-of-joy/numbers';
import type { SeedId, SoilId } from '@/lib/temple-of-joy/types';
import {
  GARDEN_SIZE,
  SEEDS,
  SEED_MAP,
  SOILS,
  SOIL_MAP,
  freshness,
  gardenEffects,
  sowCost,
  unlockedPlots,
} from '@/lib/temple-of-joy/minigames/garden';
import { computeGrossJps } from '@/lib/temple-of-joy/engine';
import { useTempleSnapshot } from '../hooks';
import { TempleButton, TempleSection, Glyph } from '../ui';

export function GardenPanel() {
  const { t } = useTranslation('c-temple-of-joy');

  const garden = useTempleSnapshot((s) => {
    const jps = computeGrossJps(s);
    const open = unlockedPlots(s.sourceLevels.grove ?? 0);
    const effects = gardenEffects(s.garden);

    return {
      format: s.numberFormat,
      joy: s.joy,
      jps,
      selected: s.garden.selected,
      known: s.garden.known.join(','),
      soil: s.garden.soil,
      soilCooldown: s.garden.soilCooldown,
      groveLevel: s.sourceLevels.grove ?? 0,
      ripe: s.garden.plots.filter((p) => p.seed && p.growth >= 100).length,
      // Packed so the shallow compare in `useTempleSnapshot` can do its job:
      // an array of objects would never be equal to the last one.
      plots: s.garden.plots
        .map(
          (p, i) =>
            `${open.has(i) ? 1 : 0}:${p.seed ?? ''}:${Math.round(p.growth)}:${Math.round(
              freshness(p, s.garden.soil) * 100,
            )}`,
        )
        .join('|'),
      jpsBonus: effects.jpsMultiplier,
      touchBonus: effects.touchMultiplier,
      haloBonus: effects.haloFrequency,
      mannaBonus: effects.mannaSpeed,
    };
  }, 500);

  const plots = garden.plots.split('|');
  const known = garden.known.split(',').filter(Boolean) as SeedId[];
  const soil = SOIL_MAP[garden.soil];

  return (
    <>
      <p className="toj-panel-note">
        {t('garden-note', {
          defaultValue:
            'Plants grow in real time, whether or not this page is open. Mature plants standing next to each other sometimes make something new.',
        })}
      </p>

      <div
        className="toj-beds"
        role="grid"
        aria-label={t('garden-bed', { defaultValue: 'Garden bed' })}
      >
        {Array.from({ length: GARDEN_SIZE }, (_, i) => {
          const [openFlag, seedId, growthText, freshText] = (plots[i] ?? '0::0:100').split(':');
          const open = openFlag === '1';
          const seed = seedId ? SEED_MAP[seedId as SeedId] : null;
          const growth = Number(growthText);
          const fresh = Number(freshText);
          const ripe = growth >= 100;

          const label = !open
            ? t('plot-locked', { defaultValue: 'Locked — raise the Olive Grove with Manna' })
            : seed
              ? ripe
                ? fresh < 100
                  ? t('plot-harvest-stale', {
                      name: seed.name,
                      percent: fresh,
                      defaultValue: 'Harvest {{name}} — standing a while, worth {{percent}}%',
                    })
                  : t('plot-harvest', { name: seed.name, defaultValue: 'Harvest {{name}}' })
                : t('plot-growing', {
                    name: seed.name,
                    percent: Math.floor(growth),
                    defaultValue: '{{name}}, {{percent}}% grown — harvest early for less',
                  })
              : garden.selected
                ? t('plot-sow', {
                    name: SEED_MAP[garden.selected].name,
                    defaultValue: 'Sow {{name}}',
                  })
                : t('plot-empty', { defaultValue: 'Empty bed — choose a seed first' });

          return (
            <button
              key={i}
              type="button"
              className="toj-plot"
              role="gridcell"
              disabled={!open}
              data-ripe={ripe ? 'true' : undefined}
              data-stale={ripe && fresh < 100 ? 'true' : undefined}
              data-bane={seed?.bane ? 'true' : undefined}
              aria-label={label}
              title={label}
              onClick={() => {
                const store = useTempleStore.getState();
                if (seed) {
                  templeAudio.play('harvest');
                  store.harvest(i);
                } else {
                  templeAudio.play('sow');
                  store.sow(i);
                }
              }}
            >
              {seed && (
                <>
                  <span
                    className="toj-plot-growth"
                    style={{ height: `${Math.min(100, growth)}%` }}
                    aria-hidden
                  />
                  <span
                    className="toj-plot-seed"
                    // Seedlings are small and grow into their bed. It is the
                    // cheapest possible way to show three growth stages.
                    style={{ transform: `scale(${0.5 + Math.min(1, growth / 100) * 0.5})` }}
                  >
                    <Glyph>{seed.icon}</Glyph>
                  </span>
                </>
              )}
            </button>
          );
        })}
      </div>

      <div className="toj-toolbar">
        <span className="toj-panel-sub">
          {t('garden-ripe', { count: garden.ripe, defaultValue: '{{count}} ripe' })}
        </span>
        <TempleButton
          size="sm"
          variant={garden.ripe > 0 ? 'gold' : 'plain'}
          disabled={garden.ripe === 0}
          tone={null}
          onClick={() => {
            templeAudio.play('harvest');
            useTempleStore.getState().harvestAll();
          }}
        >
          {t('harvest-all', { defaultValue: 'Harvest all' })}
        </TempleButton>
      </div>

      <TempleSection>{t('garden-seeds', { defaultValue: 'Seeds' })}</TempleSection>
      <div className="toj-seedbar">
        {SEEDS.filter((seed) => known.includes(seed.id)).map((seed) => {
          const cost = sowCost(seed.id, garden.jps);
          return (
            <button
              key={seed.id}
              type="button"
              className="toj-seed"
              aria-pressed={garden.selected === seed.id}
              title={`${seed.description} — ${fmt(cost, garden.format)}`}
              onClick={() => {
                templeAudio.play('tick');
                useTempleStore.getState().selectSeed(seed.id);
              }}
            >
              <Glyph>{seed.icon}</Glyph>
              {seed.name}
              <span className="toj-row-count">{fmt(cost, garden.format)}</span>
            </button>
          );
        })}
      </div>
      <p className="toj-panel-note">
        {t('garden-known', {
          known: known.length,
          total: SEEDS.length,
          defaultValue: '{{known}} of {{total}} seeds discovered.',
        })}
      </p>

      <TempleSection>{t('garden-soil', { defaultValue: 'Soil' })}</TempleSection>
      <p className="toj-panel-note">
        {garden.soilCooldown > 0
          ? t('soil-cooldown', {
              time: formatDuration(garden.soilCooldown / 1000),
              defaultValue: 'The ground can be turned again in {{time}}.',
            })
          : soil.description}
      </p>
      <div className="toj-seedbar">
        {SOILS.map((option) => {
          const locked = garden.groveLevel < option.requiresLevel;
          return (
            <button
              key={option.id}
              type="button"
              className="toj-seed"
              aria-pressed={garden.soil === option.id}
              disabled={locked || garden.soilCooldown > 0}
              title={
                locked
                  ? t('soil-locked', {
                      level: option.requiresLevel,
                      defaultValue: 'Needs Grove level {{level}}',
                    })
                  : option.description
              }
              onClick={() => {
                templeAudio.play('sow');
                useTempleStore.getState().till(option.id as SoilId);
              }}
            >
              <Glyph>{option.icon}</Glyph>
              {option.name}
            </button>
          );
        })}
      </div>

      <TempleSection>{t('garden-standing', { defaultValue: 'What is standing' })}</TempleSection>
      <Effect label={t('mult-jps', { defaultValue: 'Joy per second' })} value={garden.jpsBonus} />
      <Effect label={t('mult-touch', { defaultValue: 'Per offering' })} value={garden.touchBonus} />
      <Effect
        label={t('mult-halos', { defaultValue: 'Halo frequency' })}
        value={garden.haloBonus}
      />
      <Effect label={t('mult-manna', { defaultValue: 'Manna speed' })} value={garden.mannaBonus} />
    </>
  );
}

function Effect({ label, value }: { label: string; value: number }) {
  // A row reading "×1.00" tells the player nothing, so it does not appear.
  if (Math.abs(value - 1) < 0.0005) return null;
  return (
    <div className="toj-setting">
      <span className="toj-setting-label">
        <span className="toj-setting-name">{label}</span>
      </span>
      <span className="toj-setting-value">×{value.toFixed(2)}</span>
    </div>
  );
}
