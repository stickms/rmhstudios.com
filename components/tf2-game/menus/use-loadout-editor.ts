/**
 * The loadout screen's state, shared by the main menu's Items screen and the in-game Loadout view: the
 * class being equipped, its slots (this device's per-class drafts — the loadout builder's, so the two
 * stay in step — or stock), the signed-in player's saved loadouts, what the game does not simulate of
 * the chosen weapons, and — in a match — Equip (HudCommand `loadout` → MatchCommand `loadout`: checked
 * against the catalog and the game's rules, it goes on at the next respawn or resupply, at once in the
 * team's respawn room) and the match's answer.
 */
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSession } from '@/components/Providers';
import { CLASS_DEFAULT } from '@/components/tf2-hud/loadout/labels';
import { wornItems, type HeldSlot } from '@/components/tf2-hud/loadout/worn';
import { CLASS_NAMES } from '@/lib/tf2-game/core/constants';
import type { HudState } from '@/lib/tf2-game/client/hud-state';
import type { HudStore } from '@/lib/tf2-game/client/hud-store';
import { setItemCatalog } from '@/lib/tf2-game/sim/items/registry';
import { resolveItem } from '@/lib/tf2-game/sim/items/resolve';
import { loadoutApi } from '@/lib/tf2-loadout/api';
import type { LoadoutSummary } from '@/lib/tf2-loadout/api-types';
import {
  COSMETIC_KEYS,
  weaponSlotsFor,
  type CatalogItem,
  type LoadoutEntry,
  type LoadoutSlotKey,
  type LoadoutSlots,
  type TfClass,
} from '@/lib/tf2-loadout/catalog-types';
import { hasDraft, loadDraft, saveDraft } from '@/lib/tf2-loadout/local-drafts';
import { equipInto, loadoutWarnings, stockLoadout, withSupportedOptions } from '@/lib/tf2-loadout/rules';
import type { CatalogIndex } from '@/lib/tf2-loadout/use-catalog';

const classIndexOf = (cls: TfClass): number => (CLASS_NAMES as readonly string[]).indexOf(cls);

/** The match the loadout goes to (absent: the main menu — the drafts are what the next match uses). */
export interface LoadoutMatch {
  store: HudStore;
  state: HudState;
}

export function useLoadoutEditor(idx: CatalogIndex, match: LoadoutMatch | null) {
  const { t } = useTranslation('c-tf2-game');
  const { t: th } = useTranslation('c-tf2-hud');
  const { data: session } = useSession();
  const { catalog } = idx;
  const local = match?.state.local ?? null;
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
  const worn = useMemo(() => wornItems(idx, cls, slots, COSMETIC_KEYS, heldSlot), [idx, cls, slots, heldSlot]);
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
      if (play && play.unsupported.length) out.push({ key, item, fallback: play.kind === 'fallback', missing: play.unsupported });
    }
    return out;
  }, [weaponKeys, slots, idx, clsIndex, catalog]);

  const slotLabel = (key: LoadoutSlotKey): string => {
    if (key.startsWith('cosmetic')) return th('slot-cosmetic', { defaultValue: 'Cosmetic {{n}}', n: key.slice(8) });
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
  const equipItem = (key: LoadoutSlotKey, item: CatalogItem) => edit(equipInto(catalog, slots, key, item, false).slots);
  const patch = (key: LoadoutSlotKey, change: Partial<LoadoutEntry>) => {
    const cur = slots[key];
    if (!cur) return;
    const merged: LoadoutEntry = { ...cur, ...change };
    for (const k of Object.keys(merged) as (keyof LoadoutEntry)[]) if (merged[k] === undefined) delete merged[k];
    edit({ ...slots, [key]: merged });
  };
  const clear = (key: LoadoutSlotKey) => {
    const next = { ...slots };
    delete next[key];
    edit(next);
  };

  const canEquip = !!match && !!local && local.team >= 2 && warnings.length === 0;
  const equip = () => {
    if (!canEquip || !match) return;
    match.store.send({ kind: 'loadout', cls, slots });
    setSent({ cls: clsIndex, at: match.state.now });
  };

  // What happened to the last equip: the match's answer, then the pending / applied state.
  const answer =
    match?.state.loadout && sent && match.state.loadout.cls === sent.cls && match.state.loadout.at >= sent.at
      ? match.state.loadout
      : null;
  const status = ((): { tone: 'danger' | 'info' | 'success'; text: string } | null => {
    if (answer?.status === 'refused') {
      return { tone: 'danger', text: t('loadout_refused', { defaultValue: 'The game refused this loadout ({{reason}}).', reason: answer.reason ?? '?' }) };
    }
    if (!answer) return null;
    if (answer.cls !== local?.cls) {
      return {
        tone: 'info',
        text: t('loadout_other_class', {
          defaultValue: 'Saved for the {{cls}}: it goes on when you next spawn as one.',
          cls: CLASS_DEFAULT[(CLASS_NAMES[answer.cls] as TfClass) ?? 'scout'],
        }),
      };
    }
    if (local?.loadoutPending) {
      return {
        tone: 'info',
        text: local.alive
          ? t('loadout_applies_resupply', { defaultValue: 'Applies at next resupply.' })
          : t('loadout_applies_respawn', { defaultValue: 'Applies when you respawn.' }),
      };
    }
    return { tone: 'success', text: t('loadout_equipped', { defaultValue: 'Equipped.' }) };
  })();
  const hint = !match
    ? t('loadout_menu_rule', { defaultValue: 'Saved on this device: you wear it in your next match (Equip in game applies it there).' })
    : local?.inSpawnRoom && playing === cls
      ? t('loadout_in_spawn', { defaultValue: "You're in your respawn room: it goes on at once." })
      : t('loadout_rule', { defaultValue: 'A new loadout goes on at your next resupply or respawn.' });

  return {
    catalog,
    session,
    local,
    cls,
    changeClass,
    slots,
    edit,
    selected,
    setSelected,
    selectSlot,
    saved,
    weaponKeys,
    warnings,
    worn,
    support,
    slotLabel,
    equipItem,
    patch,
    clear,
    canEquip,
    equip,
    status,
    hint,
    resetStock: () => edit(stockLoadout(catalog, cls)),
    loadSaved: (id: string) => {
      const pick = saved?.find((s) => s.id === id);
      if (pick) edit(withSupportedOptions(catalog, pick.slots));
    },
  };
}

export type LoadoutEditor = ReturnType<typeof useLoadoutEditor>;
