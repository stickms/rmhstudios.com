'use client';

/**
 * **RMH Fashion** — a wardrobe built around the person wearing it.
 *
 * The figure is not a mannequin the clothes were modelled onto. It is the other
 * way round: every garment in `lib/fashion/garments.ts` is a description of
 * WHICH PART OF A BODY IT COVERS, and the geometry is that body plus a
 * thickness. Move the height slider and the coat gets longer, because the coat
 * was never anything but the torso and the top of the thighs, plus 46 mm.
 *
 * So this page has three controls and they are all the same control:
 *
 *   the figure   — who is wearing it
 *   the wardrobe — what they have on
 *   the swatches — what colour it is
 *
 * ## Why the labels are written out
 *
 * `i18next-parser` reads `defaultValue` literally. A `t(key, { defaultValue:
 * garment.name })` extracts as an empty default, lands in `locales/en/` as `""`,
 * and i18next then serves that empty string to every locale — English included.
 * So all forty-three garment names are spelled out below. It is more lines than
 * a loop over the catalogue and it is the only version that is translated.
 */

import { Suspense, lazy, useCallback, useMemo, useState, type ReactNode } from 'react';
import { RotateCcw, Shirt, Sparkles, User, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { FIGURE_LIMITS } from '@/lib/fashion/figure';
import { FIGURE_TONES, SWATCHES, swatchVar, type SwatchId } from '@/lib/fashion/palette';
import type { Category } from '@/lib/fashion/garments';
import {
  applyPreset,
  byCategory,
  defaultOutfit,
  dye,
  isWorn,
  layered,
  PRESETS,
  remove,
  setFigure,
  setTone,
  wear,
  type Outfit,
} from '@/lib/fashion/wardrobe';
import './fashion.css';

/**
 * The stage pulls in three.js — around a megabyte of vendor JS — so it is split
 * out and only fetched once somebody opens this tab. The wardrobe below it works
 * without it, which is also what a machine with no WebGL gets.
 */
const FashionStage = lazy(() =>
  import('./FashionStage').then((m) => ({ default: m.FashionStage })),
);

function useLabels() {
  const { t } = useTranslation('c-rmhfashion');
  const garments: Record<string, string> = {
    cap: t('garment-cap', { defaultValue: 'Cap' }),
    beanie: t('garment-beanie', { defaultValue: 'Beanie' }),
    'bucket-hat': t('garment-bucket-hat', { defaultValue: 'Bucket hat' }),
    headband: t('garment-headband', { defaultValue: 'Headband' }),
    hood: t('garment-hood', { defaultValue: 'Hood' }),
    'face-mask': t('garment-face-mask', { defaultValue: 'Face mask' }),
    scarf: t('garment-scarf', { defaultValue: 'Scarf' }),
    'tank-top': t('garment-tank-top', { defaultValue: 'Tank top' }),
    't-shirt': t('garment-t-shirt', { defaultValue: 'T-shirt' }),
    'long-sleeve-tee': t('garment-long-sleeve-tee', { defaultValue: 'Long-sleeve tee' }),
    'polo-shirt': t('garment-polo-shirt', { defaultValue: 'Polo shirt' }),
    shirt: t('garment-shirt', { defaultValue: 'Shirt' }),
    blouse: t('garment-blouse', { defaultValue: 'Blouse' }),
    jumper: t('garment-jumper', { defaultValue: 'Jumper' }),
    hoodie: t('garment-hoodie', { defaultValue: 'Hoodie' }),
    cardigan: t('garment-cardigan', { defaultValue: 'Cardigan' }),
    sweatshirt: t('garment-sweatshirt', { defaultValue: 'Sweatshirt' }),
    jacket: t('garment-jacket', { defaultValue: 'Jacket' }),
    blazer: t('garment-blazer', { defaultValue: 'Blazer' }),
    coat: t('garment-coat', { defaultValue: 'Coat' }),
    parka: t('garment-parka', { defaultValue: 'Parka' }),
    raincoat: t('garment-raincoat', { defaultValue: 'Raincoat' }),
    gilet: t('garment-gilet', { defaultValue: 'Gilet' }),
    trousers: t('garment-trousers', { defaultValue: 'Trousers' }),
    jeans: t('garment-jeans', { defaultValue: 'Jeans' }),
    joggers: t('garment-joggers', { defaultValue: 'Joggers' }),
    shorts: t('garment-shorts', { defaultValue: 'Shorts' }),
    skirt: t('garment-skirt', { defaultValue: 'Skirt' }),
    leggings: t('garment-leggings', { defaultValue: 'Leggings' }),
    dress: t('garment-dress', { defaultValue: 'Dress' }),
    jumpsuit: t('garment-jumpsuit', { defaultValue: 'Jumpsuit' }),
    socks: t('garment-socks', { defaultValue: 'Socks' }),
    trainers: t('garment-trainers', { defaultValue: 'Trainers' }),
    boots: t('garment-boots', { defaultValue: 'Boots' }),
    'dress-shoes': t('garment-dress-shoes', { defaultValue: 'Dress shoes' }),
    sandals: t('garment-sandals', { defaultValue: 'Sandals' }),
    gloves: t('garment-gloves', { defaultValue: 'Gloves' }),
    watch: t('garment-watch', { defaultValue: 'Watch' }),
    bracelet: t('garment-bracelet', { defaultValue: 'Bracelet' }),
    belt: t('garment-belt', { defaultValue: 'Belt' }),
    backpack: t('garment-backpack', { defaultValue: 'Backpack' }),
    'tote-bag': t('garment-tote-bag', { defaultValue: 'Tote bag' }),
    'crossbody-bag': t('garment-crossbody-bag', { defaultValue: 'Crossbody bag' }),
  };
  const categories: Record<Category, string> = {
    headwear: t('category-headwear', { defaultValue: 'Headwear' }),
    eyewear: t('category-eyewear', { defaultValue: 'Eyewear' }),
    top: t('category-top', { defaultValue: 'Tops' }),
    midlayer: t('category-midlayer', { defaultValue: 'Mid layers' }),
    outerwear: t('category-outerwear', { defaultValue: 'Outerwear' }),
    bottom: t('category-bottom', { defaultValue: 'Bottoms' }),
    onepiece: t('category-onepiece', { defaultValue: 'One-pieces' }),
    footwear: t('category-footwear', { defaultValue: 'Footwear' }),
    accessory: t('category-accessory', { defaultValue: 'Accessories' }),
    jewellery: t('category-jewellery', { defaultValue: 'Jewellery' }),
  };
  const swatches: Record<SwatchId, string> = {
    ink: t('swatch-ink', { defaultValue: 'Ink' }),
    bone: t('swatch-bone', { defaultValue: 'Bone' }),
    slate: t('swatch-slate', { defaultValue: 'Slate' }),
    sand: t('swatch-sand', { defaultValue: 'Sand' }),
    clay: t('swatch-clay', { defaultValue: 'Clay' }),
    moss: t('swatch-moss', { defaultValue: 'Moss' }),
    sky: t('swatch-sky', { defaultValue: 'Sky' }),
    indigo: t('swatch-indigo', { defaultValue: 'Indigo' }),
    plum: t('swatch-plum', { defaultValue: 'Plum' }),
    rose: t('swatch-rose', { defaultValue: 'Rose' }),
    ochre: t('swatch-ochre', { defaultValue: 'Ochre' }),
    accent: t('swatch-accent', { defaultValue: 'Site accent' }),
  };
  const presets: Record<string, string> = {
    everyday: t('preset-everyday', { defaultValue: 'Everyday' }),
    layered: t('preset-layered', { defaultValue: 'Layered' }),
    formal: t('preset-formal', { defaultValue: 'Formal' }),
    summer: t('preset-summer', { defaultValue: 'Summer' }),
    winter: t('preset-winter', { defaultValue: 'Winter' }),
  };
  return { t, garments, categories, swatches, presets };
}

export function FashionStudio() {
  const { t, garments, categories, swatches, presets } = useLabels();
  const [outfit, setOutfit] = useState<Outfit>(defaultOutfit);

  const worn = useMemo(() => layered(outfit), [outfit]);
  const rail = useMemo(() => byCategory(), []);

  const describe = useCallback(
    (o: Outfit) =>
      t('stage-description', {
        defaultValue: 'A {{height}} cm figure on a turntable, wearing {{outfit}}.',
        height: Math.round(o.figure.height * 100),
        outfit:
          layered(o).length > 0
            ? layered(o)
                .map((l) => garments[l.garment.id] ?? l.garment.id)
                .join(', ')
            : t('nothing', { defaultValue: 'nothing yet' }),
      }),
    [t, garments],
  );

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h2 className="font-display text-2xl font-semibold tracking-[-0.02em] text-site-text">
          {t('title', { defaultValue: 'RMH Fashion' })}
        </h2>
        <p className="max-w-prose text-site-text-muted">
          {t('lede', {
            defaultValue:
              'A wardrobe built around the person wearing it. Nothing here has a shape of its own — every garment is the part of the body it covers, plus its own thickness, so change the figure and the clothes change with it. Dress it, dye it, turn it, and poke it to send a wave across the whole outfit.',
          })}
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        <section aria-label={t('stage-label', { defaultValue: 'Figure viewer' })}>
          <Suspense
            fallback={
              <div className="rmhfash-stage glass-pane glass-bevel-sm rounded-site flex items-center justify-center">
                <p className="px-6 text-center text-xs text-site-text-dim">
                  {t('loading', { defaultValue: 'Preparing the fitting room…' })}
                </p>
              </div>
            }
          >
            <FashionStage outfit={outfit} description={describe(outfit)} />
          </Suspense>
        </section>

        <div className="flex flex-col gap-6">
          {/* ── Looks ───────────────────────────────────────────────────── */}
          <section className="flex flex-col gap-3">
            <SectionHeading icon={Sparkles}>
              {t('looks-heading', { defaultValue: 'Looks' })}
            </SectionHeading>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((preset) => (
                <Button
                  key={preset.id}
                  variant="ghost"
                  size="sm"
                  onClick={() => setOutfit((o) => applyPreset(o, preset.id))}
                >
                  {presets[preset.id] ?? preset.id}
                </Button>
              ))}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setOutfit(defaultOutfit())}
                title={t('start-over', { defaultValue: 'Start over' })}
              >
                <RotateCcw className="size-3.5" aria-hidden />
                {t('start-over', { defaultValue: 'Start over' })}
              </Button>
            </div>
          </section>

          {/* ── The figure ──────────────────────────────────────────────── */}
          <section className="glass-fill rounded-site flex flex-col gap-4 p-4">
            <SectionHeading icon={User}>
              {t('figure-heading', { defaultValue: 'Your figure' })}
            </SectionHeading>

            <FigureSlider
              label={t('figure-height', { defaultValue: 'Height' })}
              value={outfit.figure.height}
              limits={FIGURE_LIMITS.height}
              format={(v) =>
                t('figure-height-value', { defaultValue: '{{cm}} cm', cm: Math.round(v * 100) })
              }
              onChange={(height) => setOutfit((o) => setFigure(o, { height }))}
            />
            <FigureSlider
              label={t('figure-build', { defaultValue: 'Build' })}
              value={outfit.figure.build}
              limits={FIGURE_LIMITS.build}
              format={(v) => `${Math.round(v * 100)}%`}
              onChange={(build) => setOutfit((o) => setFigure(o, { build }))}
            />
            <FigureSlider
              label={t('figure-taper', { defaultValue: 'Shoulders' })}
              value={outfit.figure.taper}
              limits={FIGURE_LIMITS.taper}
              format={(v) => `${Math.round(v * 100)}%`}
              onChange={(taper) => setOutfit((o) => setFigure(o, { taper }))}
            />

            <Swatches
              legend={t('figure-tone', { defaultValue: 'Tone' })}
              options={FIGURE_TONES}
              value={outfit.tone}
              names={swatches}
              onPick={(tone) => setOutfit((o) => setTone(o, tone))}
            />
          </section>

          {/* ── Wearing ─────────────────────────────────────────────────── */}
          <section className="flex flex-col gap-3">
            <SectionHeading icon={Shirt}>
              {t('wearing-heading', { defaultValue: 'Wearing' })}
              <span className="ml-1 text-site-text-dim">({worn.length})</span>
            </SectionHeading>
            {worn.length === 0 ? (
              <p className="text-sm text-site-text-dim">
                {t('wearing-empty', {
                  defaultValue: 'Nothing on. Pick something from the wardrobe below.',
                })}
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {worn.map(({ item, garment }) => (
                  <li key={garment.id} className="glass-fill rounded-site flex flex-col gap-2 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-site-text">
                        {garments[garment.id] ?? garment.id}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => setOutfit((o) => remove(o, garment.id))}
                        aria-label={t('take-off', {
                          defaultValue: 'Take off {{garment}}',
                          garment: garments[garment.id] ?? garment.id,
                        })}
                      >
                        <X className="size-3" aria-hidden />
                      </Button>
                    </div>
                    <Swatches
                      legend={t('colour-of', {
                        defaultValue: 'Colour of {{garment}}',
                        garment: garments[garment.id] ?? garment.id,
                      })}
                      hideLegend
                      options={SWATCHES}
                      value={item.swatch}
                      names={swatches}
                      onPick={(swatch) => setOutfit((o) => dye(o, garment.id, swatch))}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* ── The wardrobe ────────────────────────────────────────────── */}
          <section className="flex flex-col gap-4">
            <SectionHeading icon={Shirt}>
              {t('wardrobe-heading', { defaultValue: 'Wardrobe' })}
            </SectionHeading>
            {rail.map((group) => (
              <div key={group.category} className="flex flex-col gap-2">
                <h4 className="text-xs font-semibold uppercase tracking-[0.08em] text-site-text-dim">
                  {categories[group.category]}
                </h4>
                <div
                  role="group"
                  aria-label={categories[group.category]}
                  className="flex flex-wrap gap-1.5"
                >
                  {group.garments.map((garment) => {
                    const on = isWorn(outfit, garment.id);
                    return (
                      <button
                        key={garment.id}
                        type="button"
                        onClick={() => setOutfit((o) => wear(o, garment.id))}
                        aria-pressed={on}
                        data-fluid-press=""
                        // Worn is marked twice — an accent tint AND a heavier
                        // outline — so the state does not depend on hue under
                        // the colour-vision modes (§13).
                        className={`glass-fill rounded-site px-2.5 py-1.5 text-xs transition-colors ${
                          on
                            ? 'text-site-accent ring-2 ring-site-accent'
                            : 'text-site-text-muted hover:text-site-text'
                        }`}
                      >
                        {garments[garment.id] ?? garment.id}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </section>
        </div>
      </div>
    </div>
  );
}

function SectionHeading({ icon: Icon, children }: { icon: typeof Shirt; children: ReactNode }) {
  return (
    <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.08em] text-site-text-dim">
      <Icon className="size-3.5" aria-hidden />
      {children}
    </h3>
  );
}

function FigureSlider({
  label,
  value,
  limits,
  format,
  onChange,
}: {
  label: string;
  value: number;
  limits: { min: number; max: number; step: number };
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex items-center justify-between text-xs text-site-text-muted">
        {label}
        <span className="font-semibold text-site-text">{format(value)}</span>
      </span>
      <Slider
        value={[value]}
        min={limits.min}
        max={limits.max}
        step={limits.step}
        onValueChange={([v]) => onChange(v)}
        aria-label={label}
      />
    </label>
  );
}

function Swatches({
  legend,
  hideLegend,
  options,
  value,
  names,
  onPick,
}: {
  legend: string;
  hideLegend?: boolean;
  options: readonly SwatchId[];
  value: SwatchId;
  names: Record<SwatchId, string>;
  onPick: (id: SwatchId) => void;
}) {
  return (
    <div role="group" aria-label={legend} className="flex flex-col gap-1.5">
      {!hideLegend && <span className="text-xs text-site-text-muted">{legend}</span>}
      <div className="flex flex-wrap gap-1.5">
        {options.map((id) => {
          const on = id === value;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onPick(id)}
              aria-pressed={on}
              title={names[id]}
              aria-label={names[id]}
              // The chip IS the colour, so selection cannot be a tint — it is a
              // ring, which reads under every colour-vision mode.
              className={`rmhfash-chip size-6 rounded-full transition-transform ${
                on ? 'ring-2 ring-site-accent scale-110' : 'hover:scale-105'
              }`}
              style={{ background: `var(${swatchVar(id)})` }}
            />
          );
        })}
      </div>
    </div>
  );
}
