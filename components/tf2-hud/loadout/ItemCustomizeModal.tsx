/**
 * Customize one equipped item in a modal with a live preview: paint, style, an unusual effect and where
 * it sits, and a war paint with its wear and seed. Every change goes straight to the loadout (the
 * preview is the same model the builder shows), so closing the modal is just closing it.
 */
'use client';

import { RotateCcw, Shuffle } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Btn,
  Field,
  Modal,
  NumberField,
  RangeField,
  SearchSelect,
  SelectField,
} from '@/components/tf2-hud/ui';
import {
  MAX_SEED,
  WEAR_LEVELS,
  slotFor,
  type CatalogItem,
  type LoadoutEntry,
  type TfClass,
  modelItemId,
  effectCategory,
  effectsForItem,
} from '@/lib/tf2-loadout/catalog-types';
import { compactPlacement, resolvePlacement, WEAR_NAMES } from '@/lib/tf2-loadout/fx';
import type { CatalogIndex } from '@/lib/tf2-loadout/use-catalog';
import { warPaintOf } from '@/lib/tf2-loadout/warpaint';
import { useParticleBundle } from '@/lib/tf2-loadout/particles/client';
import ItemModelViewer from './ItemModelViewer';

export default function ItemCustomizeModal({
  open,
  onOpenChange,
  sheet,
  item,
  entry,
  cls,
  idx,
  onPatch,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sheet: boolean;
  item: CatalogItem;
  entry: LoadoutEntry;
  cls: TfClass;
  idx: CatalogIndex;
  onPatch: (change: Partial<LoadoutEntry>) => void;
}) {
  const { t } = useTranslation('c-tf2-hud');
  const { catalog } = idx;
  const slot = slotFor(item, cls);
  const canEffect = effectCategory(item, slot) !== null;
  const canWarPaint = slot === 'primary' || slot === 'secondary' || slot === 'melee';
  // A decorated weapon has its pattern built in: the player sets its wear and seed, not the kit.
  const decorated = !!item.sk;
  const kind = slot === 'head' ? 'head' : slot === 'taunt' ? 'taunt' : 'misc';

  const paintOptions = useMemo(
    () => catalog.paints.map((p) => ({ id: p.id, label: p.n, swatch: p.rgb })),
    [catalog.paints],
  );
  const effectOptions = useMemo(
    () => effectsForItem(catalog, item, cls).map((f) => ({ id: f.id, label: f.n })),
    [catalog, item, cls],
  );
  // Only the war paints that exist for this weapon.
  const kitOptions = useMemo(
    () =>
      (catalog.kits ?? [])
        .filter((k) => item.wk && k.w[item.wk])
        .map((k) => ({ id: k.id, label: k.n })),
    [catalog.kits, item.wk],
  );

  const effect = entry.effect !== undefined ? idx.effect(entry.effect) : undefined;
  const particle = useParticleBundle(effect?.id, item.ps);
  const placement = resolvePlacement(entry.fx, kind);
  const effectSpec = effect ? { id: effect.id, placement, suffix: item.ps } : undefined;
  const setPlacement = (next: Partial<typeof placement>) =>
    onPatch({ fx: compactPlacement({ ...placement, ...next }, kind) });
  const pct = (v: number) => `${Math.round(v * 100)}%`;

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      sheet={sheet}
      wide
      title={item.n}
      description={t('customize-desc', {
        defaultValue: 'Changes apply to your loadout as you make them.',
      })}
      footer={
        <Btn variant="primary" onClick={() => onOpenChange(false)}>
          {t('done', { defaultValue: 'Done' })}
        </Btn>
      }
    >
      <div className="grid gap-4 md:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
        <div className="flex flex-col gap-2 md:sticky md:top-0 md:self-start">
          <ItemModelViewer
            itemId={modelItemId(item)}
            cls={cls}
            taunt={slot === 'taunt'}
            festive={entry.festive}
            style={entry.style}
            paint={warPaintOf(idx, entry)}
            tint={item.p && entry.paint !== undefined ? idx.paint(entry.paint)?.rgb : undefined}
            effect={effectSpec}
            className="h-64 md:h-72"
          />
          {effect && particle.status !== 'ready' ? (
            <p className="text-[11px] text-(--app-text-dim)">
              {particle.status === 'loading'
                ? t('effect-loading', { defaultValue: 'Loading the game’s particle effect…' })
                : particle.status === 'error'
                  ? t('effect-load-error', {
                      defaultValue: 'The particle effect could not be loaded.',
                    })
                  : t('effect-not-synced', {
                      defaultValue: 'This particle effect has not been synced yet.',
                    })}
            </p>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          {item.p ? (
            <Field label={t('paint', { defaultValue: 'Paint' })}>
              <SearchSelect
                value={entry.paint}
                options={paintOptions}
                onChange={(id) => onPatch({ paint: id })}
                noneLabel={t('no-paint', { defaultValue: 'No paint' })}
                placeholder={t('search-paints', { defaultValue: 'Search paints' })}
                label={t('paint', { defaultValue: 'Paint' })}
              />
            </Field>
          ) : null}

          {item.st ? (
            <Field label={t('style', { defaultValue: 'Style' })}>
              <SelectField
                value={entry.style ?? ''}
                onChange={(e) =>
                  onPatch({ style: e.target.value === '' ? undefined : Number(e.target.value) })
                }
                aria-label={t('style', { defaultValue: 'Style' })}
              >
                <option value="">{t('style-default', { defaultValue: 'Default' })}</option>
                {item.st.map((s) => (
                  <option key={s.k} value={s.k}>
                    {s.n}
                  </option>
                ))}
              </SelectField>
            </Field>
          ) : null}

          {canEffect ? (
            <div className="flex flex-col gap-3">
              <Field label={t('unusual-effect', { defaultValue: 'Unusual effect' })}>
                <SearchSelect
                  value={entry.effect}
                  options={effectOptions}
                  onChange={(id) =>
                    onPatch({ effect: id, ...(id === undefined ? { fx: undefined } : {}) })
                  }
                  noneLabel={t('no-effect', { defaultValue: 'None' })}
                  placeholder={t('search-effects', { defaultValue: 'Search effects' })}
                  label={t('unusual-effect', { defaultValue: 'Unusual effect' })}
                />
              </Field>
              {effect ? (
                <fieldset className="flex flex-col gap-2 rounded-(--app-radius-sm) border border-(--app-border) p-3">
                  <legend className="px-1 text-xs font-semibold text-(--app-text-muted)">
                    {t('effect-position', { defaultValue: 'Effect position' })}
                  </legend>
                  {(
                    [
                      ['x', t('pos-x', { defaultValue: 'Left / right' }), -1, 1],
                      ['y', t('pos-y', { defaultValue: 'Up / down' }), -1, 1],
                      ['z', t('pos-z', { defaultValue: 'Front / back' }), -1, 1],
                      ['s', t('pos-size', { defaultValue: 'Size' }), 0.25, 3],
                    ] as const
                  ).map(([k, name, min, max]) => (
                    <label key={k} className="flex items-center gap-3 text-xs">
                      <span className="w-24 shrink-0 text-(--app-text-muted)">{name}</span>
                      <RangeField
                        label={name}
                        min={min}
                        max={max}
                        step={0.01}
                        value={placement[k]}
                        onChange={(v) => setPlacement({ [k]: v })}
                      />
                      <span className="w-10 shrink-0 text-end tabular-nums text-(--app-text-dim)">
                        {k === 's' ? `${placement.s.toFixed(1)}×` : pct(placement[k])}
                      </span>
                    </label>
                  ))}
                  <div>
                    <Btn
                      size="sm"
                      variant="ghost"
                      icon={RotateCcw}
                      disabled={entry.fx === undefined}
                      onClick={() => onPatch({ fx: undefined })}
                    >
                      {t('reset-position', { defaultValue: 'Default position' })}
                    </Btn>
                  </div>
                </fieldset>
              ) : null}
            </div>
          ) : null}

          {canWarPaint ? (
            <fieldset className="flex flex-col gap-3 rounded-(--app-radius-sm) border border-(--app-border) p-3">
              <legend className="px-1 text-xs font-semibold text-(--app-text-muted)">
                {t('war-paint', { defaultValue: 'War paint' })}
              </legend>
              {decorated ? (
                <p className="text-xs text-(--app-text-muted)">
                  {t('decorated-pattern', {
                    defaultValue: 'This weapon is a {{pattern}} skin; its pattern is fixed.',
                    pattern: idx.kit(item.sk!.kit)?.n ?? '',
                  })}
                </p>
              ) : kitOptions.length ? (
                <Field label={t('war-paint-pattern', { defaultValue: 'Pattern' })}>
                  <SearchSelect
                    value={entry.kit}
                    options={kitOptions}
                    onChange={(id) =>
                      onPatch(
                        id === undefined
                          ? { kit: undefined, wear: undefined, seed: undefined }
                          : { kit: id, wear: entry.wear ?? 1 },
                      )
                    }
                    noneLabel={t('no-war-paint', { defaultValue: 'No war paint' })}
                    placeholder={t('search-war-paints', { defaultValue: 'Search war paints' })}
                    label={t('war-paint-pattern', { defaultValue: 'Pattern' })}
                  />
                </Field>
              ) : (
                <p className="text-xs text-(--app-text-dim)">
                  {t('war-paint-unavailable', {
                    defaultValue: 'War paints appear here once the game files have been synced.',
                  })}
                </p>
              )}
              {entry.kit !== undefined || decorated ? (
                <>
                  <Field label={t('wear', { defaultValue: 'Wear' })}>
                    <SelectField
                      value={entry.wear ?? 1}
                      onChange={(e) => onPatch({ wear: Number(e.target.value) })}
                      aria-label={t('wear', { defaultValue: 'Wear' })}
                    >
                      {WEAR_LEVELS.map((w) => (
                        <option key={w} value={w}>
                          {WEAR_NAMES[w - 1]}
                        </option>
                      ))}
                    </SelectField>
                  </Field>
                  <Field label={t('pattern-seed', { defaultValue: 'Pattern seed' })}>
                    <div className="flex items-center gap-2">
                      <NumberField
                        value={entry.seed ?? 0}
                        min={0}
                        max={MAX_SEED}
                        onChange={(v) => onPatch({ seed: Math.round(v) })}
                        label={t('pattern-seed', { defaultValue: 'Pattern seed' })}
                      />
                      <Btn
                        size="sm"
                        icon={Shuffle}
                        onClick={() => onPatch({ seed: Math.floor(Math.random() * MAX_SEED) })}
                      >
                        {t('randomize', { defaultValue: 'Randomize' })}
                      </Btn>
                    </div>
                  </Field>
                  <p className="text-[11px] text-(--app-text-dim)">
                    {t('war-paint-preview-approx', {
                      defaultValue:
                        "The preview paints the weapon with the game's own pattern for this war paint. The pattern's random parts come from the seed here, so the same seed can differ from the game in detail.",
                    })}
                  </p>
                </>
              ) : null}
            </fieldset>
          ) : null}

          {item.fz ? (
            <Field label={t('festivized', { defaultValue: 'Festivized' })}>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!!entry.festive}
                  onChange={(e) => onPatch({ festive: e.target.checked || undefined })}
                />
                {t('festivize-weapon', { defaultValue: 'Festivize this weapon' })}
              </label>
            </Field>
          ) : null}

          {!item.p && !item.st && !canEffect && !canWarPaint && !item.fz ? (
            <p className="text-sm text-(--app-text-dim)">
              {t('nothing-to-customize', { defaultValue: 'This item has nothing to customize.' })}
            </p>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
