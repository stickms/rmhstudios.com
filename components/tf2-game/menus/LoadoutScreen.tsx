/**
 * TF2's character loadout screen (Items): the class select row, the 3D class (the loadout builder's
 * PlayerViewer) where the game's `resource/ui/classloadoutpanel.res` puts its `classmodelpanel`, and
 * the equipped items around it where CClassLoadoutPanel's code puts its item panels (the file's
 * `item_xpos_offcenter_a/b`, `item_ypos`, `item_ydelta`, `modelpanels_kv` — lib/tf2-game/client/menus/
 * loadout-layout.ts), over the panel file's own labels and lines painted by the HUD editor's painter.
 * Choosing a slot opens the builder's item picker (with its Customize dialog).
 *
 * From the main menu it edits this device's per-class drafts (what the next match wears); in a match
 * Equip sends the loadout to it (use-loadout-editor.ts). Where the file's layout does not fit (a phone
 * held upright, a narrow window), or before the file is published, the slots are a plain grid in the
 * same order.
 */
'use client';

import { AlertTriangle, ExternalLink, Info, RotateCcw, Shirt, X } from 'lucide-react';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Btn, EmptyNote, Modal, Pill, SelectField } from '@/components/tf2-hud/ui';
import { TfTabs, type TfTab } from '@/components/tf2-hud/TfTabs';
import { Picker } from '@/components/tf2-hud/loadout/Tf2LoadoutBuilder';
import PlayerViewer from '@/components/tf2-hud/loadout/PlayerViewer';
import WarningList from '@/components/tf2-hud/loadout/WarningList';
import { ItemIcon } from '@/components/tf2-hud/loadout/ItemTile';
import { CLASS_DEFAULT } from '@/components/tf2-hud/loadout/labels';
import { buildLoadoutPanel } from '@/lib/tf2-game/client/menus/loadout-layout';
import type { MenuSource } from '@/lib/tf2-game/client/menus/source';
import { COSMETIC_KEYS, TF_CLASSES, type LoadoutSlotKey, type TfClass } from '@/lib/tf2-loadout/catalog-types';
import type { CatalogIndex } from '@/lib/tf2-loadout/use-catalog';
import { cn } from '@/lib/utils';
import LoadoutQuickAi from '../ai/LoadoutQuickAi';
import MenuCanvas from './MenuCanvas';
import { useLoadoutEditor, type LoadoutMatch } from './use-loadout-editor';
import './menus.css';

/** A finger's target (phone-check). */
const MIN_SLOT = 44;

export default function LoadoutScreen({
  idx,
  match,
  source,
  onClose,
  layer,
}: {
  idx: CatalogIndex;
  match: LoadoutMatch | null;
  source: MenuSource | null;
  onClose: () => void;
  /** Over the game (scrolls inside itself) rather than a page of its own. */
  layer?: boolean;
}) {
  const { t } = useTranslation('c-tf2-game');
  const { t: th } = useTranslation('c-tf2-hud');
  const ed = useLoadoutEditor(idx, match);
  const rootRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const footRef = useRef<HTMLDivElement>(null);
  const aiRef = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState<{ w: number; h: number } | null>(null);

  // The room the file's layout has: the screen (or the game area) below the class row and above the
  // footer — measured the same in both layouts, so the file's layout comes back as soon as it fits.
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const measure = () => {
      const total = layer ? (root.parentElement?.clientHeight ?? root.clientHeight) : window.innerHeight;
      const w = Math.round(root.clientWidth);
      const chrome = [barRef, aiRef, footRef].reduce((sum, r) => sum + (r.current?.offsetHeight ?? 0), 0);
      const h = Math.max(0, Math.round(total - chrome));
      setStage((cur) => (cur && cur.w === w && cur.h === h ? cur : { w, h }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    if (barRef.current) ro.observe(barRef.current);
    if (footRef.current) ro.observe(footRef.current);
    if (aiRef.current) ro.observe(aiRef.current);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [layer]);

  const slotKeys = useMemo(() => [...ed.weaponKeys, ...COSMETIC_KEYS, 'action'], [ed.weaponKeys]);
  const className = th(`class-${ed.cls}`, { defaultValue: CLASS_DEFAULT[ed.cls] });
  const panel = useMemo(() => {
    if (!source || !stage || stage.w < 2 || stage.h < 2) return null;
    return buildLoadoutPanel({ source: source.source, screen: stage, cls: ed.cls, className, slots: slotKeys });
  }, [source, stage, ed.cls, className, slotKeys]);
  // The file's layout when every slot is on screen and big enough for a finger; otherwise a grid.
  const fits =
    !!panel &&
    !!stage &&
    panel.slots.length > 0 &&
    panel.slots.every((s) => s.rect.x >= 0 && s.rect.y >= 0 && s.rect.x + s.rect.w <= stage.w && s.rect.y + s.rect.h <= stage.h && s.rect.h >= MIN_SLOT);
  const layout = fits ? 'res' : 'grid';

  const classTabs: TfTab[] = TF_CLASSES.map((c) => ({ id: c, label: th(`class-${c}`, { defaultValue: CLASS_DEFAULT[c] }) }));

  const slotButton = (key: LoadoutSlotKey, style?: React.CSSProperties) => {
    const entry = ed.slots[key];
    const item = entry ? idx.item(entry.item) : undefined;
    const label = ed.slotLabel(key);
    return (
      <button
        key={key}
        type="button"
        className="tf2m-slot"
        style={style}
        data-slot={key}
        aria-pressed={ed.selected === key}
        aria-label={item ? `${label}: ${item.n}` : `${label}: ${t('loadout_slot_empty', { defaultValue: 'Empty' })}`}
        onClick={() => ed.selectSlot(key)}
      >
        {item ? <ItemIcon item={item} /> : null}
        <span className={item ? 'tf2m-slot-name' : 'tf2m-slot-empty'}>{item ? item.n : label}</span>
      </button>
    );
  };

  const viewer = (style?: React.CSSProperties) => (
    <div className="tf2m-loadout-model" style={style}>
      <PlayerViewer cls={ed.cls} worn={ed.worn} team={ed.local?.team === 3 ? 'blu' : 'red'} className="size-full" />
    </div>
  );

  return (
    <div
      ref={rootRef}
      className={cn('tf2m-loadout', layer && 'tf2m-loadout-layer')}
      data-layout={layout}
      data-testid="tf2-loadout-view"
      role="region"
      aria-label={t('loadout', { defaultValue: 'Loadout' })}
    >
      <div ref={barRef} className="tf2m-loadout-bar">
        <div className="min-w-0 flex-1">
          <TfTabs tabs={classTabs} value={ed.cls} onChange={(id) => ed.changeClass(id as TfClass)} aria-label={th('class', { defaultValue: 'Class' })} size="sm" className="max-w-full" />
        </div>
        <Btn size="sm" variant="ghost" icon={X} onClick={onClose}>
          {t('loadout_close', { defaultValue: 'Close' })}
        </Btn>
      </div>
      <div ref={aiRef}>
        <LoadoutQuickAi idx={idx} cls={ed.cls} slots={ed.slots} onChange={ed.edit} />
      </div>
      {layout === 'res' && panel && stage ? (
        <div className="tf2m-loadout-stage" style={{ height: stage.h }}>
          {source ? <MenuCanvas scene={panel.scene} images={source.images} listeners={source.imageListeners} width={stage.w} height={stage.h} className="tf2m-canvas" /> : null}
          {panel.model ? viewer({ left: panel.model.x, top: panel.model.y, width: panel.model.w, height: panel.model.h }) : null}
          {panel.slots.map((s) => slotButton(s.slot, { left: s.rect.x, top: s.rect.y, width: s.rect.w, height: s.rect.h }))}
        </div>
      ) : (
        <div className="tf2m-loadout-grid">
          <p className="tf2hud-title col-span-full text-2xl">{className}</p>
          {viewer()}
          {(panel?.slots.map((s) => s.slot) ?? slotKeys).map((k) => slotButton(k))}
        </div>
      )}
      <div ref={footRef} className="tf2m-loadout-foot">
        {match ? (
          <Btn size="sm" variant="primary" icon={Shirt} disabled={!ed.canEquip} onClick={ed.equip}>
            {t('loadout_equip', { defaultValue: 'Equip' })}
          </Btn>
        ) : null}
        <Btn size="sm" variant="ghost" icon={RotateCcw} onClick={ed.resetStock}>
          {th('reset-stock', { defaultValue: 'Stock' })}
        </Btn>
        {ed.session ? (
          <div className="min-w-44">
            <SelectField value="" aria-label={t('loadout_saved_label', { defaultValue: 'Load a saved loadout' })} disabled={!ed.saved?.length} onChange={(e) => ed.loadSaved(e.target.value)}>
              <option value="">
                {ed.saved === null
                  ? t('loadout_saved_loading', { defaultValue: 'Loading your saved loadouts…' })
                  : ed.saved.length
                    ? t('loadout_saved_pick', { defaultValue: 'Load a saved loadout…' })
                    : t('loadout_saved_none', { defaultValue: 'No saved loadouts for this class' })}
              </option>
              {(ed.saved ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </SelectField>
          </div>
        ) : null}
        <a
          href={`/tf2/loadout?class=${ed.cls}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-8 items-center gap-1.5 rounded-(--app-radius-sm) px-2 text-xs text-(--app-text-muted) hover:text-(--app-text) pointer-coarse:h-11"
        >
          <ExternalLink className="size-3.5" aria-hidden />
          {t('loadout_open_builder', { defaultValue: 'Open the full builder' })}
        </a>
        <p role="status" aria-live="polite" className="ms-auto text-xs">
          {ed.status ? <Pill tone={ed.status.tone}>{ed.status.text}</Pill> : <span className="text-(--app-text-muted)">{ed.hint}</span>}
        </p>
        {ed.support.length ? (
          <ul className="flex w-full flex-col gap-1 text-xs text-(--app-text-muted)">
            {ed.support.map((s) => (
              <li key={s.key} className="flex items-start gap-1.5" title={s.missing.join(', ')}>
                <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                {s.fallback
                  ? t('loadout_not_simulated', { defaultValue: "{{item}} isn't simulated yet: you'll carry the stock weapon for that slot instead.", item: s.item.n })
                  : t('loadout_partly_simulated', { defaultValue: "{{item}}: some of this item's effects aren't simulated yet.", item: s.item.n })}
              </li>
            ))}
          </ul>
        ) : null}
        {ed.warnings.length ? (
          <div role="status" className="w-full rounded-(--app-radius-sm) border border-(--app-warning)/50 bg-(--app-warning)/10 p-2.5 text-xs">
            <p className="flex items-center gap-1.5 font-semibold text-(--app-warning)">
              <AlertTriangle className="size-4 shrink-0" aria-hidden />
              {t('loadout_not_allowed', { defaultValue: "The game won't accept this loadout yet" })}
            </p>
            <WarningList warnings={ed.warnings} idx={idx} />
          </div>
        ) : null}
      </div>
      <Modal open={ed.selected !== null} onOpenChange={(o) => !o && ed.setSelected(null)} title={ed.selected ? ed.slotLabel(ed.selected) : ''} wide>
        {ed.selected ? (
          <Picker
            key={`${ed.cls}:${ed.selected}`}
            idx={idx}
            cls={ed.cls}
            slotKey={ed.selected}
            label={ed.slotLabel(ed.selected)}
            entry={ed.slots[ed.selected]}
            slots={ed.slots}
            onEquip={(item) => ed.equipItem(ed.selected!, item)}
            onPatch={(change) => ed.patch(ed.selected!, change)}
            onClear={() => ed.clear(ed.selected!)}
            onClose={() => ed.setSelected(null)}
            embedded
          />
        ) : (
          <EmptyNote>{t('loadout_pick_slot', { defaultValue: 'Pick a slot to choose an item for it.' })}</EmptyNote>
        )}
      </Modal>
    </div>
  );
}
