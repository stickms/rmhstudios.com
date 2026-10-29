/**
 * The pause menu's Loadout view (TF2): the loadout builder's own pieces — class tabs, the 3D
 * player, the slot tiles, the item picker with its Customize dialog (paint, unusual effect, style,
 * festive, war paint) — over the player's per-class drafts (the builder's localStorage drafts, so
 * the two stay in step) and, signed in, their saved loadouts. "Equip" sends the class's loadout
 * to the match (HudCommand `loadout` → MatchCommand `loadout`), where it is checked against the
 * catalog and the game's rules and goes on at the next respawn or resupply — at once in the
 * team's own respawn room. Items the game does not fully simulate say so.
 *
 * Loaded on first open (three.js and the catalog are not part of the game bundle's first load).
 */
'use client';

import { AlertTriangle, ExternalLink, Info, RotateCcw, Shirt } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSession } from '@/components/Providers';
import { Btn, EmptyNote, Pill, SelectField } from '@/components/tf2-hud/ui';
import { TfTabs, type TfTab } from '@/components/tf2-hud/TfTabs';
import { Picker, SlotCell, SlotGroup } from '@/components/tf2-hud/loadout/Tf2LoadoutBuilder';
import PlayerViewer from '@/components/tf2-hud/loadout/PlayerViewer';
import WarningList from '@/components/tf2-hud/loadout/WarningList';
import { CLASS_DEFAULT } from '@/components/tf2-hud/loadout/labels';
import { wornItems, type HeldSlot } from '@/components/tf2-hud/loadout/worn';
import { CLASS_NAMES } from '@/lib/tf2-game/core/constants';
import { loadoutApi } from '@/lib/tf2-loadout/api';
import type { LoadoutSummary } from '@/lib/tf2-loadout/api-types';
import {
  COSMETIC_KEYS,
  TF_CLASSES,
  weaponSlotsFor,
  type CatalogItem,
  type LoadoutEntry,
  type LoadoutSlotKey,
  type LoadoutSlots,
  type TfClass,
} from '@/lib/tf2-loadout/catalog-types';
import { hasDraft, loadDraft, saveDraft } from '@/lib/tf2-loadout/local-drafts';
import {
  equipInto,
  loadoutWarnings,
  stockLoadout,
  withSupportedOptions,
} from '@/lib/tf2-loadout/rules';
import { useCatalog, type CatalogIndex } from '@/lib/tf2-loadout/use-catalog';
import { setItemCatalog } from '@/lib/tf2-game/sim/items/registry';
import { resolveItem } from '@/lib/tf2-game/sim/items/resolve';
import { useHudContext, useHudState } from '../use-hud';

const classIndexOf = (cls: TfClass): number => (CLASS_NAMES as readonly string[]).indexOf(cls);

export default function LoadoutPauseView() {
  const { t } = useTranslation('c-tf2-game');
  const cat = useCatalog();
  if (cat.status === 'loading') {
    return (
      <p role="status" className="p-6 text-center text-sm text-(--app-text-muted)">
        {t('loadout_catalog_loading', { defaultValue: 'Loading the item catalog…' })}
      </p>
    );
  }
  if (cat.status === 'error') {
    return (
      <p role="alert" className="p-6 text-center text-sm text-(--app-danger)">
        {t('loadout_catalog_error', { defaultValue: 'Could not load the item catalog.' })}{' '}
        <button type="button" className="underline" onClick={cat.retry}>
          {t('loadout_retry', { defaultValue: 'Retry' })}
        </button>
      </p>
    );
  }
  return <LoadoutEditor idx={cat.index} />;
}

function LoadoutEditor({ idx }: { idx: CatalogIndex }) {
  const { t } = useTranslation('c-tf2-game');
  const { t: th } = useTranslation('c-tf2-hud');
  const { store } = useHudContext();
  const state = useHudState();
  const { data: session } = useSession();
  const { catalog } = idx;
  const local = state.local;
  const playing = local && local.cls > 0 ? (CLASS_NAMES[local.cls] as TfClass) : null;

  const [cls, setCls] = useState<TfClass>(playing ?? 'scout');
  const draftOrStock = (c: TfClass): LoadoutSlots =>
    hasDraft(c) ? withSupportedOptions(catalog, loadDraft(c)) : stockLoadout(catalog, c);
  const [slots, setSlots] = useState<LoadoutSlots>(() => draftOrStock(playing ?? 'scout'));
  const [selected, setSelected] = useState<LoadoutSlotKey | null>(null);
  const [heldSlot, setHeldSlot] = useState<HeldSlot | null>(null);
  const [sent, setSent] = useState<{ cls: number; at: number } | null>(null);
  const [saved, setSaved] = useState<LoadoutSummary[] | null>(null);

  const edit = (next: LoadoutSlots) => {
    setSlots(next);
    saveDraft(cls, next);
  };
  const changeClass = (next: TfClass) => {
    setCls(next);
    setSlots(draftOrStock(next));
    setSelected(null);
    setHeldSlot(null);
  };

  // Signed in: the saved loadouts for this class, to load into the editor.
  useEffect(() => {
    if (!session) return undefined;
    let alive = true;
    setSaved(null);
    loadoutApi.list({ mine: true, tfClass: cls, sort: 'new', limit: 48 }).then(
      (r) => alive && setSaved(r.items),
      () => alive && setSaved([]),
    );
    return () => {
      alive = false;
    };
  }, [session, cls]);

  const weaponKeys = useMemo(() => weaponSlotsFor(catalog, cls), [catalog, cls]);
  const warnings = useMemo(() => loadoutWarnings(catalog, cls, slots), [catalog, cls, slots]);
  const worn = useMemo(
    () => wornItems(idx, cls, slots, COSMETIC_KEYS, heldSlot),
    [idx, cls, slots, heldSlot],
  );
  const clsIndex = classIndexOf(cls);
  // What the game does not simulate of the chosen weapons.
  const support = useMemo(() => {
    // The game resolves items by the same schema the builder shows (installing it is idempotent).
    setItemCatalog(catalog);
    const out: Array<{ key: string; item: CatalogItem; fallback: boolean; missing: string[] }> = [];
    for (const key of weaponKeys) {
      const e = slots[key];
      const item = e ? idx.item(e.item) : undefined;
      if (!e || !item) continue;
      const play = resolveItem(e.item, clsIndex);
      if (play && play.unsupported.length) {
        out.push({ key, item, fallback: play.kind === 'fallback', missing: play.unsupported });
      }
    }
    return out;
  }, [weaponKeys, slots, idx, clsIndex, catalog]);

  const slotLabel = (key: LoadoutSlotKey): string => {
    if (key.startsWith('cosmetic'))
      return th('slot-cosmetic', { defaultValue: 'Cosmetic {{n}}', n: key.slice(8) });
    switch (key) {
      case 'primary':
        return th('slot-primary', { defaultValue: 'Primary' });
      case 'secondary':
        return th('slot-secondary', { defaultValue: 'Secondary' });
      case 'melee':
        return th('slot-melee', { defaultValue: 'Melee' });
      case 'building':
        return th('slot-building', { defaultValue: 'Sapper / Toolbox' });
      case 'pda':
        return th('slot-pda', { defaultValue: 'PDA' });
      case 'pda2':
        return th('slot-pda2', { defaultValue: 'PDA 2' });
      case 'action':
        return th('slot-action', { defaultValue: 'Action' });
      default:
        return key;
    }
  };

  const selectSlot = (key: LoadoutSlotKey) => {
    setSelected(key);
    if (key === 'primary' || key === 'secondary' || key === 'melee') setHeldSlot(key);
  };
  const equipItem = (key: LoadoutSlotKey, item: CatalogItem) =>
    edit(equipInto(catalog, slots, key, item, false).slots);
  const patch = (key: LoadoutSlotKey, change: Partial<LoadoutEntry>) => {
    const cur = slots[key];
    if (!cur) return;
    const merged: LoadoutEntry = { ...cur, ...change };
    for (const k of Object.keys(merged) as (keyof LoadoutEntry)[])
      if (merged[k] === undefined) delete merged[k];
    edit({ ...slots, [key]: merged });
  };
  const clear = (key: LoadoutSlotKey) => {
    const next = { ...slots };
    delete next[key];
    edit(next);
  };

  const canEquip = !!local && local.team >= 2 && warnings.length === 0;
  const equip = () => {
    if (!canEquip) return;
    store.send({ kind: 'loadout', cls, slots });
    setSent({ cls: clsIndex, at: state.now });
  };

  // What happened to the last equip: the match's answer, then the pending / applied state.
  const answer =
    state.loadout && sent && state.loadout.cls === sent.cls && state.loadout.at >= sent.at
      ? state.loadout
      : null;
  const status = (() => {
    if (answer?.status === 'refused') {
      return {
        tone: 'danger' as const,
        text: t('loadout_refused', {
          defaultValue: 'The game refused this loadout ({{reason}}).',
          reason: answer.reason ?? '?',
        }),
      };
    }
    if (!answer) return null;
    if (answer.cls !== local?.cls) {
      return {
        tone: 'info' as const,
        text: t('loadout_other_class', {
          defaultValue: 'Saved for the {{cls}}: it goes on when you next spawn as one.',
          cls: CLASS_DEFAULT[(CLASS_NAMES[answer.cls] as TfClass) ?? 'scout'],
        }),
      };
    }
    if (local?.loadoutPending) {
      return {
        tone: 'info' as const,
        text: local.alive
          ? t('loadout_applies_resupply', { defaultValue: 'Applies at next resupply.' })
          : t('loadout_applies_respawn', { defaultValue: 'Applies when you respawn.' }),
      };
    }
    return { tone: 'success' as const, text: t('loadout_equipped', { defaultValue: 'Equipped.' }) };
  })();

  const classTabs: TfTab[] = TF_CLASSES.map((c) => ({
    id: c,
    label: th(`class-${c}`, { defaultValue: CLASS_DEFAULT[c] }),
  }));

  return (
    <div className="flex flex-col gap-3" data-testid="tf2-loadout-view">
      <TfTabs
        tabs={classTabs}
        value={cls}
        onChange={(id) => changeClass(id as TfClass)}
        aria-label={th('class', { defaultValue: 'Class' })}
        size="sm"
        className="max-w-full"
      />
      <div className="grid gap-3 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
        <section
          aria-label={th('loadout-slots', { defaultValue: 'Loadout slots' })}
          className="flex min-w-0 flex-col gap-3"
        >
          <PlayerViewer cls={cls} worn={worn} className="h-56" />
          {session ? (
            <SelectField
              value=""
              aria-label={t('loadout_saved_label', { defaultValue: 'Load a saved loadout' })}
              disabled={!saved?.length}
              onChange={(e) => {
                const pick = saved?.find((s) => s.id === e.target.value);
                if (pick) edit(withSupportedOptions(catalog, pick.slots));
              }}
              className="h-9 text-sm"
            >
              <option value="">
                {saved === null
                  ? t('loadout_saved_loading', { defaultValue: 'Loading your saved loadouts…' })
                  : saved.length
                    ? t('loadout_saved_pick', { defaultValue: 'Load a saved loadout…' })
                    : t('loadout_saved_none', { defaultValue: 'No saved loadouts for this class' })}
              </option>
              {(saved ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </SelectField>
          ) : null}
          <SlotGroup title={th('weapons', { defaultValue: 'Weapons' })}>
            {weaponKeys.map((k) => (
              <SlotCell
                key={k}
                slotKey={k}
                label={slotLabel(k)}
                idx={idx}
                entry={slots[k]}
                selected={selected === k}
                onSelect={() => selectSlot(k)}
                ready
              />
            ))}
          </SlotGroup>
          <SlotGroup title={th('cosmetics', { defaultValue: 'Cosmetics' })}>
            {[...COSMETIC_KEYS, 'action'].map((k) => (
              <SlotCell
                key={k}
                slotKey={k}
                label={slotLabel(k)}
                idx={idx}
                entry={slots[k]}
                selected={selected === k}
                onSelect={() => selectSlot(k)}
                ready
              />
            ))}
          </SlotGroup>
        </section>
        <section
          aria-label={th('item-picker', { defaultValue: 'Item picker' })}
          className="min-h-64 min-w-0 rounded-(--app-radius) border border-(--app-border) bg-(--app-bg-subtle)"
        >
          {selected ? (
            <Picker
              key={`${cls}:${selected}`}
              idx={idx}
              cls={cls}
              slotKey={selected}
              label={slotLabel(selected)}
              entry={slots[selected]}
              slots={slots}
              onEquip={(item) => equipItem(selected, item)}
              onPatch={(change) => patch(selected, change)}
              onClear={() => clear(selected)}
              onClose={() => setSelected(null)}
            />
          ) : (
            <EmptyNote>
              {t('loadout_pick_slot', { defaultValue: 'Pick a slot to choose an item for it.' })}
            </EmptyNote>
          )}
        </section>
      </div>

      {support.length ? (
        <ul className="flex flex-col gap-1 text-xs text-(--app-text-muted)">
          {support.map((s) => (
            <li key={s.key} className="flex items-start gap-1.5" title={s.missing.join(', ')}>
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              {s.fallback
                ? t('loadout_not_simulated', {
                    defaultValue:
                      "{{item}} isn't simulated yet: you'll carry the stock weapon for that slot instead.",
                    item: s.item.n,
                  })
                : t('loadout_partly_simulated', {
                    defaultValue: "{{item}}: some of this item's effects aren't simulated yet.",
                    item: s.item.n,
                  })}
            </li>
          ))}
        </ul>
      ) : null}
      {warnings.length ? (
        <div
          role="status"
          className="rounded-(--app-radius-sm) border border-(--app-warning)/50 bg-(--app-warning)/10 p-2.5 text-xs"
        >
          <p className="flex items-center gap-1.5 font-semibold text-(--app-warning)">
            <AlertTriangle className="size-4 shrink-0" aria-hidden />
            {t('loadout_not_allowed', { defaultValue: "The game won't accept this loadout yet" })}
          </p>
          <WarningList warnings={warnings} idx={idx} />
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Btn size="sm" variant="primary" icon={Shirt} disabled={!canEquip} onClick={equip}>
          {t('loadout_equip', { defaultValue: 'Equip' })}
        </Btn>
        <Btn
          size="sm"
          variant="ghost"
          icon={RotateCcw}
          onClick={() => edit(stockLoadout(catalog, cls))}
        >
          {th('reset-stock', { defaultValue: 'Stock' })}
        </Btn>
        <a
          href={`/tf2/loadout?class=${cls}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-8 items-center gap-1.5 rounded-(--app-radius-sm) px-2 text-xs text-(--app-text-muted) hover:text-(--app-text)"
        >
          <ExternalLink className="size-3.5" aria-hidden />
          {t('loadout_open_builder', { defaultValue: 'Open the full builder' })}
        </a>
        <p role="status" aria-live="polite" className="ms-auto text-xs">
          {status ? (
            <Pill tone={status.tone}>{status.text}</Pill>
          ) : local?.inSpawnRoom && playing === cls ? (
            <span className="text-(--app-text-muted)">
              {t('loadout_in_spawn', {
                defaultValue: "You're in your respawn room: it goes on at once.",
              })}
            </span>
          ) : (
            <span className="text-(--app-text-muted)">
              {t('loadout_rule', {
                defaultValue: 'A new loadout goes on at your next resupply or respawn.',
              })}
            </span>
          )}
        </p>
      </div>
    </div>
  );
}
