'use client';

/**
 * Isleworks — the build palette.
 *
 * A category dock along the bottom, and a drawer of cards for whichever category
 * is open. Two decisions in here are load-bearing:
 *
 *  - **The drawer opens and closes.** A city builder's palette is the biggest
 *    piece of UI on screen and the player spends most of their time *looking at
 *    the city*, so the default state is closed with only the dock showing.
 *  - **Locked buildings are not listed.** A palette that shows twenty greyed-out
 *    cards teaches the player to ignore the palette. The dock instead names the
 *    single next unlock and the population it needs, which is a goal rather than
 *    a wall.
 *
 * Bulldoze and Buy Land live in the dock beside the categories because they are
 * tools in exactly the same sense — they arm, they show a cursor, and Escape
 * cancels them.
 *
 * Catalogue text (building names, blurbs) is authored data rather than i18n
 * keys, the same way the RMHBox content packs are: it is content, it ships in
 * the module, and a key per building would put forty-five near-identical
 * `t()` calls in front of a list that is already data.
 */

import { useMemo, useState } from 'react';
import { Hammer, LandPlot, RotateCw, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { CATEGORY_LABELS, CATEGORY_ORDER, nextUnlock, unlockedIn } from '@/lib/isleworks/catalog';
import { parcelPrice } from '@/lib/isleworks/grid';
import { buildableTilesIn, purchasableParcels } from '@/lib/isleworks/city';
import { CATEGORY_COLORS } from '@/lib/isleworks/palette';
import { useIsleworks } from '@/lib/isleworks/store';
import type { BuildingCategory } from '@/lib/isleworks/types';

import { CatalogIcon } from './icons';

export function BuildPalette() {
  const { t } = useTranslation('c-isleworks');
  const city = useIsleworks((s) => s.city);
  const tool = useIsleworks((s) => s.tool);
  const setTool = useIsleworks((s) => s.setTool);
  const rotateTool = useIsleworks((s) => s.rotateTool);
  const cancelTool = useIsleworks((s) => s.cancelTool);

  // Open on a desktop (the palette is the first thing to learn), closed on a
  // phone (where it would cover the island the player came to look at).
  const [open, setOpen] = useState<BuildingCategory | null>(() =>
    typeof window !== 'undefined' && window.innerWidth < 780 ? null : 'transport',
  );

  const peak = Math.max(city.peakPopulation, city.stats.population);
  const upcoming = useMemo(() => nextUnlock(peak), [peak]);
  const listed = useMemo(() => (open ? unlockedIn(open, peak) : []), [open, peak]);

  const landPrice = useMemo(() => {
    const next = purchasableParcels(city)[0];
    return next === undefined
      ? null
      : parcelPrice(city.ownedParcels.length, buildableTilesIn(city, next));
  }, [city]);

  return (
    <div className="isw-build">
      {open && listed.length > 0 && (
        <div className="isw-panel isw-drawer" role="group" aria-label={CATEGORY_LABELS[open]}>
          {listed.map((def) => {
            const armed = tool.kind === 'place' && tool.definitionId === def.id;
            const affordable = city.money >= def.cost;
            return (
              <button
                key={def.id}
                type="button"
                className={`isw-card${armed ? ' is-active' : ''}`}
                aria-pressed={armed}
                title={def.description}
                onClick={() =>
                  armed
                    ? cancelTool()
                    : setTool({ kind: 'place', definitionId: def.id, rotation: 0 })
                }
              >
                <span
                  className="isw-card-swatch"
                  style={{ background: CATEGORY_COLORS[def.category] }}
                >
                  <CatalogIcon id={def.iconId} />
                </span>
                <span style={{ minWidth: 0 }}>
                  <span className="isw-card-name">{def.name}</span>
                  <span className="isw-card-meta">
                    <span
                      className={affordable ? 'isw-card-cost' : ''}
                      style={affordable ? undefined : { color: 'var(--isw-bad)' }}
                    >
                      {def.cost}
                    </span>
                    {def.housing ? (
                      <span>
                        {t('meta-homes', { defaultValue: '{{n}} homes', n: def.housing })}
                      </span>
                    ) : null}
                    {def.jobs ? (
                      <span>{t('meta-jobs', { defaultValue: '{{n}} jobs', n: def.jobs })}</span>
                    ) : null}
                    {def.powerGeneration ? (
                      <span>
                        {t('meta-power', { defaultValue: '+{{n}} power', n: def.powerGeneration })}
                      </span>
                    ) : null}
                    {def.waterGeneration ? (
                      <span>
                        {t('meta-water', { defaultValue: '+{{n}} water', n: def.waterGeneration })}
                      </span>
                    ) : null}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div
        className="isw-panel isw-dock"
        role="toolbar"
        aria-label={t('build', { defaultValue: 'Build' })}
      >
        {CATEGORY_ORDER.map((category) => {
          const available = unlockedIn(category, peak).length;
          if (!available) return null;
          const first = unlockedIn(category, peak)[0];
          const active = open === category;
          return (
            <button
              key={category}
              type="button"
              className={`isw-dock-btn${active ? ' is-active' : ''}`}
              aria-pressed={active}
              onClick={() => setOpen(active ? null : category)}
            >
              <span className="isw-dock-dot" style={{ background: CATEGORY_COLORS[category] }}>
                <CatalogIcon id={first.iconId} size={14} />
              </span>
              {CATEGORY_LABELS[category]}
            </button>
          );
        })}

        <button
          type="button"
          className={`isw-dock-btn${tool.kind === 'bulldoze' ? ' is-active' : ''}`}
          aria-pressed={tool.kind === 'bulldoze'}
          onClick={() => (tool.kind === 'bulldoze' ? cancelTool() : setTool({ kind: 'bulldoze' }))}
        >
          <span className="isw-dock-dot" style={{ background: 'var(--isw-bad)' }}>
            <Hammer size={14} aria-hidden />
          </span>
          {t('tool-demolish', { defaultValue: 'Demolish' })}
        </button>

        <button
          type="button"
          className={`isw-dock-btn${tool.kind === 'buy-land' ? ' is-active' : ''}`}
          aria-pressed={tool.kind === 'buy-land'}
          disabled={landPrice === null}
          onClick={() => (tool.kind === 'buy-land' ? cancelTool() : setTool({ kind: 'buy-land' }))}
        >
          <span className="isw-dock-dot" style={{ background: 'var(--isw-good)' }}>
            <LandPlot size={14} aria-hidden />
          </span>
          {landPrice === null
            ? t('tool-land-none', { defaultValue: 'No land' })
            : t('tool-land', { defaultValue: 'Land {{price}}', price: landPrice })}
        </button>

        {tool.kind === 'place' && (
          <>
            <button
              type="button"
              className="isw-dock-btn"
              onClick={() => rotateTool(1)}
              title={t('rotate-hint', { defaultValue: 'Rotate (R)' })}
            >
              <span
                className="isw-dock-dot"
                style={{ background: 'rgb(255 255 255 / 22%)', color: 'var(--isw-ink)' }}
              >
                <RotateCw size={14} aria-hidden />
              </span>
              {t('rotate', { defaultValue: 'Rotate' })}
            </button>
            <button type="button" className="isw-dock-btn" onClick={cancelTool}>
              <span
                className="isw-dock-dot"
                style={{ background: 'rgb(255 255 255 / 22%)', color: 'var(--isw-ink)' }}
              >
                <X size={14} aria-hidden />
              </span>
              {t('cancel', { defaultValue: 'Cancel' })}
            </button>
          </>
        )}
      </div>

      {upcoming && (
        <p
          className="isw-panel isw-section"
          style={{ fontSize: 11, padding: '7px 11px', margin: 0 }}
        >
          <span style={{ color: 'var(--isw-ink-faint)' }}>
            {t('next-unlock', {
              defaultValue: 'Next: {{name}} at {{n}} residents',
              name: upcoming.name,
              n: upcoming.unlockPopulation,
            })}
          </span>
        </p>
      )}
    </div>
  );
}
