/**
 * The loadout builder: pick a class, fill its weapon, cosmetic, taunt and
 * action slots from the live item catalog, paint and add effects, then keep it
 * as a per-class draft in this browser or save and share it from your account.
 */
'use client';

import { Link, useNavigate } from '@tanstack/react-router';
import {
  AlertTriangle,
  Check,
  Copy,
  FolderOpen,
  Globe,
  Plus,
  RotateCcw,
  Save,
  Search,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  X,
  Eye,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import Tf2Header from '@/components/tf2-hud/Tf2Header';
import { SignInRequiredDialog } from '@/components/shared/SignInRequiredDialog';
import { useSession } from '@/components/Providers';
import { TfTabs, type TfTab } from '@/components/tf2-hud/TfTabs';
import {
  Btn,
  EmptyNote,
  Field,
  Modal,
  PanelHead,
  Pill,
  SelectField,
  TextField,
  Toggle,
} from '@/components/tf2-hud/ui';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useSentinel } from '@/hooks/useSentinel';
import { useClipboard } from '@/hooks/useClipboard';
import { ApiError } from '@/lib/tf2-hud/api';
import { cn } from '@/lib/utils';
import { loadoutApi } from '@/lib/tf2-loadout/api';
import type { Visibility } from '@/lib/tf2-loadout/api-types';
import {
  COSMETIC_SLOTS,
  MAX_COSMETIC_SLOTS,
  cosmeticKey,
  cosmeticSlotKeys,
  modelItemId,
  qualityAccent,
  TAUNT_KEYS,
  TF_CLASSES,
  itemsForSlot,
  slotFor,
  weaponSlotsFor,
  type CatalogItem,
  type LoadoutEntry,
  type LoadoutSlotKey,
  type LoadoutSlots,
  type TfClass,
} from '@/lib/tf2-loadout/catalog-types';
import { hasDraft, loadDraft, saveDraft } from '@/lib/tf2-loadout/local-drafts';
import { WEAR_NAMES } from '@/lib/tf2-loadout/fx';
import {
  equipInto,
  legalize,
  loadoutWarnings,
  stockLoadout,
  withSupportedOptions,
} from '@/lib/tf2-loadout/rules';
import type { AiAction } from '@/lib/tf2-loadout/ai-core';
import { useCatalog, type CatalogIndex } from '@/lib/tf2-loadout/use-catalog';
import ItemModelViewer from './ItemModelViewer';
import ItemCustomizeModal from './ItemCustomizeModal';
import LoadoutAssistant from './LoadoutAssistant';
import { kitOf, warPaintOf } from '@/lib/tf2-loadout/warpaint';
import { rarityColor, tierName } from '@/lib/tf2-loadout/rarity';
import PlayerViewer from './PlayerViewer';
import {
  effectSpecOf,
  isHeldSlot,
  tauntEffectOf,
  tauntItemOf,
  wornItems,
  type HeldSlot,
} from './worn';
import ItemTile from './ItemTile';
import ItemPreviewModal from './ItemPreviewModal';
import { IconButton } from '@/components/ui/icon-button';
import WarningList from './WarningList';
import { CLASS_DEFAULT } from './labels';

const SITE = () => (typeof window === 'undefined' ? '' : window.location.origin);
const PAGE = 60;
const LAST_CLASS_KEY = 'rmh-tf2-loadout-class';
const UNRESTRICTED_KEY = 'rmh-tf2-loadout-unrestricted';

function lastClass(): TfClass {
  try {
    const v = localStorage.getItem(LAST_CLASS_KEY);
    if (v && (TF_CLASSES as readonly string[]).includes(v)) return v as TfClass;
  } catch {
    /* storage unavailable */
  }
  return 'scout';
}

export default function Tf2LoadoutBuilder({
  initialClass,
  loadoutId,
}: {
  initialClass?: TfClass;
  loadoutId?: string;
}) {
  const { t } = useTranslation('c-tf2-hud');
  const cat = useCatalog();

  return (
    <div className="app-page flex min-h-dvh flex-col bg-(--app-bg) text-(--app-text)">
      <Tf2Header
        title={t('loadout-title', { defaultValue: 'Loadout Builder' })}
        backLabel={t('tf2-hub', { defaultValue: 'TF2 Hub' })}
        backHref="/tf2"
        rightActions={
          <Link
            to="/tf2/loadout/mine"
            className="inline-flex h-8 items-center gap-1.5 rounded-(--app-radius-sm) border border-(--app-border-bright) px-3 text-xs font-semibold hover:bg-(--app-surface-hover)"
          >
            <FolderOpen className="size-4" aria-hidden />
            {t('my-loadouts', { defaultValue: 'My loadouts' })}
          </Link>
        }
      />
      {cat.status === 'loading' ? (
        <p role="status" className="p-10 text-center text-sm text-(--app-text-muted)">
          {t('catalog-loading', { defaultValue: 'Loading the item catalog…' })}
        </p>
      ) : cat.status === 'error' ? (
        <p role="alert" className="p-10 text-center text-sm text-(--app-danger)">
          {t('catalog-error', { defaultValue: 'Could not load the item catalog.' })}{' '}
          <button type="button" className="underline" onClick={cat.retry}>
            {t('retry', { defaultValue: 'Retry' })}
          </button>
        </p>
      ) : (
        <Builder idx={cat.index} initialClass={initialClass} loadoutId={loadoutId} />
      )}
    </div>
  );
}

function Builder({
  idx,
  initialClass,
  loadoutId,
}: {
  idx: CatalogIndex;
  initialClass?: TfClass;
  loadoutId?: string;
}) {
  const { t } = useTranslation('c-tf2-hud');
  const navigate = useNavigate();
  const { data: session } = useSession();
  const { copy } = useClipboard();
  const { catalog } = idx;

  const [cls, setCls] = useState<TfClass>(initialClass ?? 'scout');
  // The initial, untouched slots object: autosave ignores it, so an empty draft is only ever written
  // for a loadout the player (or a load) actually set.
  const initialSlots = useRef<LoadoutSlots>({}).current;
  const [slots, setSlots] = useState<LoadoutSlots>(initialSlots);
  const [selected, setSelected] = useState<LoadoutSlotKey | null>(null);
  const [activeTauntSlot, setActiveTauntSlot] = useState<LoadoutSlotKey | null>(null);
  // The weapon the player holds: the last weapon slot picked. Picking one also ends the taunt, so the
  // player stands holding it; picking a taunt slot performs that taunt instead.
  const [heldSlot, setHeldSlot] = useState<HeldSlot | null>(null);
  // An animation picked from the list, played in place of the taunt until a slot is selected again.
  const [animation, setAnimation] = useState<string | null>(null);
  const showSlot = (key: LoadoutSlotKey) => {
    setAnimation(null);
    if (key.startsWith('taunt')) setActiveTauntSlot(key);
    else if (isHeldSlot(key)) {
      setHeldSlot(key);
      setActiveTauntSlot(null);
    }
  };
  const selectSlot = (key: LoadoutSlotKey) => {
    setSelected(key);
    showSlot(key);
  };
  const [remote, setRemote] = useState<{
    id: string;
    slug: string;
    title: string;
    description: string;
    visibility: Visibility;
  } | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [signIn, setSignIn] = useState<'save' | 'ai' | null>(null);
  const [ready, setReady] = useState(false);
  // "Allow any combination": off keeps to what the game allows; on lets the player equip anything
  // (the warnings panel then says what the game could not do).
  const [unrestricted, setUnrestrictedState] = useState(false);
  const [extraCosmetics, setExtraCosmetics] = useState(0);
  const [assistantOpen, setAssistantOpen] = useState(false);
  // What the loadout was before the assistant last changed it, so one tap undoes the batch.
  const [undoSlots, setUndoSlots] = useState<LoadoutSlots | null>(null);
  // Screen readers: what the last change did (the picker is a separate region from the slots).
  const [announce, setAnnounce] = useState('');
  // Wide screens show the picker beside the slots; narrower ones open it as a sheet.
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const hydrated = useRef(false);

  // Boot: an existing loadout, or this class's local draft.
  useEffect(() => {
    let alive = true;
    if (loadoutId) {
      loadoutApi
        .get(loadoutId)
        .then((d) => {
          if (!alive) return;
          if (!d.isOwner) {
            void navigate({ to: '/tf2/loadout/l/$slug', params: { slug: d.slug }, replace: true });
            return;
          }
          setCls(d.tfClass);
          setSlots(withSupportedOptions(catalog, d.slots));
          setRemote({
            id: d.id,
            slug: d.slug,
            title: d.title,
            description: d.description,
            visibility: d.visibility,
          });
          setReady(true);
          hydrated.current = true;
        })
        .catch(() => {
          if (!alive) return;
          toast.error(t('loadout-missing', { defaultValue: 'That loadout could not be opened.' }));
          void navigate({ to: '/tf2/loadout', search: {}, replace: true });
        });
    } else {
      const c = initialClass ?? lastClass();
      setCls(c);
      setSlots(draftOrStock(c));
      setReady(true);
      hydrated.current = true;
    }
    return () => {
      alive = false;
    };
    // Boot once per target loadout; `t` and `navigate` are stable enough to ignore.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadoutId]);

  // Unsaved work lives in a per-class draft.
  useEffect(() => {
    if (!hydrated.current || remote || slots === initialSlots) return;
    saveDraft(cls, slots);
  }, [cls, slots, remote, initialSlots]);

  const changeClass = (next: TfClass) => {
    if (remote || next === cls) return;
    try {
      localStorage.setItem(LAST_CLASS_KEY, next);
    } catch {
      /* storage unavailable */
    }
    setCls(next);
    setActiveTauntSlot(null);
    setHeldSlot(null);
    setAnimation(null);
    setSlots(draftOrStock(next));
    setExtraCosmetics(0);
    setSelected(null);
  };

  const weaponKeys = useMemo(() => weaponSlotsFor(catalog, cls), [catalog, cls]);

  // A class that has never been edited here starts from its stock weapons; one the player emptied
  // on purpose stays empty.
  const draftOrStock = (c: TfClass): LoadoutSlots =>
    hasDraft(c) ? withSupportedOptions(catalog, loadDraft(c)) : stockLoadout(catalog, c);

  useEffect(() => {
    try {
      setUnrestrictedState(localStorage.getItem(UNRESTRICTED_KEY) === '1');
    } catch {
      /* storage unavailable: the rules stay on */
    }
  }, []);
  const setUnrestricted = (on: boolean) => {
    setUnrestrictedState(on);
    try {
      localStorage.setItem(UNRESTRICTED_KEY, on ? '1' : '0');
    } catch {
      /* not kept */
    }
  };

  // The game's three cosmetic slots; more only while "allow any combination" is on (or the loadout already
  // holds more), up to the builder's cap.
  const cosmeticKeys = useMemo(
    () => cosmeticSlotKeys(slots, unrestricted ? COSMETIC_SLOTS + extraCosmetics : COSMETIC_SLOTS),
    [slots, unrestricted, extraCosmetics],
  );
  const warnings = useMemo(() => loadoutWarnings(catalog, cls, slots), [catalog, cls, slots]);

  // What the 3D player wears: the cosmetics, with their paint, and the held weapon.
  const worn = useMemo(
    () => wornItems(idx, cls, slots, cosmeticKeys, heldSlot),
    [slots, idx, cosmeticKeys, cls, heldSlot],
  );
  const activeTaunt = activeTauntSlot ? slots[activeTauntSlot] : undefined;
  // Before anything is picked the first equipped taunt plays; once a weapon slot is picked, none does.
  const idleDefault = heldSlot === null;
  const tauntItem = activeTaunt?.item ?? (idleDefault ? tauntItemOf(slots) : undefined);
  const tauntEffect = activeTaunt
    ? effectSpecOf(idx, activeTaunt, 'taunt')
    : idleDefault
      ? tauntEffectOf(idx, slots)
      : undefined;

  const slotLabel = useCallback(
    (key: LoadoutSlotKey): string => {
      if (key.startsWith('cosmetic'))
        return t('slot-cosmetic', { defaultValue: 'Cosmetic {{n}}', n: key.slice(8) });
      if (key.startsWith('taunt'))
        return t('slot-taunt', { defaultValue: 'Taunt {{n}}', n: key.slice(5) });
      switch (key) {
        case 'primary':
          return t('slot-primary', { defaultValue: 'Primary' });
        case 'secondary':
          return t('slot-secondary', { defaultValue: 'Secondary' });
        case 'melee':
          return t('slot-melee', { defaultValue: 'Melee' });
        case 'building':
          return t('slot-building', { defaultValue: 'Sapper / Toolbox' });
        case 'pda':
          return t('slot-pda', { defaultValue: 'PDA' });
        case 'pda2':
          return t('slot-pda2', { defaultValue: 'PDA 2' });
        case 'action':
          return t('slot-action', { defaultValue: 'Action' });
        default:
          return key;
      }
    },
    [t],
  );

  const edit = (next: LoadoutSlots) => {
    setSlots(next);
    setDirty(true);
  };

  const equip = (key: LoadoutSlotKey, item: CatalogItem) => {
    showSlot(key);
    const { slots: next, removed } = equipInto(catalog, slots, key, item, unrestricted);
    edit(next);
    setAnnounce(
      t('announce-equipped', {
        defaultValue: '{{item}} equipped in {{slot}}.',
        item: item.n,
        slot: slotLabel(key),
      }),
    );
    if (removed.length) {
      toast.info(
        t('removed-overlap', {
          defaultValue: 'Removed {{names}} — it overlaps {{item}}.',
          names: removed.map((r) => r.n).join(', '),
          item: item.n,
        }),
      );
    }
  };

  const patch = (key: LoadoutSlotKey, change: Partial<LoadoutEntry>) => {
    const cur = slots[key];
    if (!cur) return;
    const merged: LoadoutEntry = { ...cur, ...change };
    // A field set to undefined means "clear it".
    for (const k of Object.keys(merged) as (keyof LoadoutEntry)[]) {
      if (merged[k] === undefined) delete merged[k];
    }
    edit({ ...slots, [key]: merged });
  };

  const clear = (key: LoadoutSlotKey) => {
    const next = { ...slots };
    delete next[key];
    edit(next);
    setAnnounce(t('announce-emptied', { defaultValue: '{{slot}} emptied.', slot: slotLabel(key) }));
  };

  const clearAll = () => {
    edit({});
    setSelected(null);
  };

  const resetToStock = () => {
    edit(stockLoadout(catalog, cls));
    setExtraCosmetics(0);
    setSelected(null);
    setAnnounce(t('announce-stock', { defaultValue: 'Back to the stock loadout.' }));
  };

  const makePlayable = () => {
    const fixed = legalize(catalog, cls, slots);
    edit(fixed.slots);
    setExtraCosmetics(0);
    setAnnounce(
      t('announce-playable', {
        defaultValue: 'Removed {{count}} so the loadout fits the game.',
        count: fixed.dropped.length,
      }),
    );
  };

  // The assistant's suggestions land through the same rules as a tap on a tile.
  const applyActions = (actions: AiAction[]) => {
    let next: LoadoutSlots = { ...slots };
    const names: string[] = [];
    const removed: string[] = [];
    let skipped = 0;
    for (const a of actions) {
      const item = idx.item(a.item);
      if (!item) continue;
      const n = /^cosmetic(\d+)$/.exec(a.slot)?.[1];
      if (!unrestricted && n && Number(n) > COSMETIC_SLOTS) {
        skipped++;
        continue;
      }
      const r = equipInto(catalog, next, a.slot, item, unrestricted);
      next = r.slots;
      removed.push(...r.removed.map((x) => x.n));
      next[a.slot] = {
        item: item.id,
        ...(a.paint !== undefined ? { paint: a.paint } : {}),
        ...(a.effect !== undefined ? { effect: a.effect } : {}),
      };
      names.push(item.n);
    }
    if (!names.length) {
      if (skipped) {
        toast.info(
          t('ai-skipped-limit', {
            defaultValue:
              'The game only has three cosmetic slots. Turn on "Allow any combination" to wear more.',
          }),
        );
      }
      return;
    }
    setUndoSlots(slots);
    edit(next);
    const extra = Math.max(
      0,
      ...Object.keys(next).map((k) => Number(/^cosmetic(\d+)$/.exec(k)?.[1] ?? 0)),
    );
    if (unrestricted && extra > COSMETIC_SLOTS) setExtraCosmetics(extra - COSMETIC_SLOTS);
    const msg = t('ai-equipped-toast', {
      defaultValue: 'Equipped {{names}}.',
      names: names.join(', '),
    });
    setAnnounce(msg);
    toast.success(
      removed.length
        ? `${msg} ${t('ai-removed-toast', { defaultValue: 'Replaced {{names}}.', names: removed.join(', ') })}`
        : msg,
    );
    if (skipped) {
      toast.info(
        t('ai-skipped-limit', {
          defaultValue:
            'The game only has three cosmetic slots. Turn on "Allow any combination" to wear more.',
        }),
      );
    }
  };

  const undoApply = () => {
    if (!undoSlots) return;
    edit(undoSlots);
    setUndoSlots(null);
    setAnnounce(t('ai-undone', { defaultValue: 'Undone.' }));
  };

  const filled = Object.keys(slots).length;

  const classTabs: TfTab[] = TF_CLASSES.map((c) => ({
    id: c,
    label: t(`class-${c}`, { defaultValue: CLASS_DEFAULT[c] }),
    disabled: Boolean(remote) && c !== cls,
  }));

  const shareUrl =
    remote && remote.visibility !== 'PRIVATE' ? `${SITE()}/tf2/loadout/l/${remote.slug}` : null;

  const afterSave = (saved: NonNullable<typeof remote>) => {
    setRemote(saved);
    setDirty(false);
    setSaveOpen(false);
    toast.success(t('loadout-saved', { defaultValue: 'Loadout saved.' }));
  };

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 px-4 pb-16 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <TfTabs
          tabs={classTabs}
          value={cls}
          onChange={(id) => changeClass(id as TfClass)}
          aria-label={t('class', { defaultValue: 'Class' })}
          className="max-w-full"
        />
        <div className="flex flex-wrap items-center gap-2">
          {remote ? (
            <>
              <span className="max-w-48 truncate text-sm font-semibold">{remote.title}</span>
              {remote.visibility !== 'PRIVATE' ? (
                <Pill tone={remote.visibility === 'PUBLIC' ? 'success' : 'info'}>
                  {remote.visibility === 'PUBLIC'
                    ? t('public', { defaultValue: 'Public' })
                    : t('unlisted', { defaultValue: 'Unlisted' })}
                </Pill>
              ) : null}
              <Btn
                size="sm"
                variant="ghost"
                icon={Plus}
                onClick={() => {
                  setRemote(null);
                  void navigate({ to: '/tf2/loadout', search: { class: cls }, replace: true });
                }}
              >
                {t('new-loadout', { defaultValue: 'New' })}
              </Btn>
            </>
          ) : null}
          {shareUrl ? (
            <Btn
              size="sm"
              icon={Copy}
              onClick={() =>
                void copy(shareUrl).then(() =>
                  toast.success(t('link-copied', { defaultValue: 'Link copied.' })),
                )
              }
            >
              {t('copy-link', { defaultValue: 'Copy link' })}
            </Btn>
          ) : null}
          <Btn size="sm" icon={Sparkles} onClick={() => setAssistantOpen(true)}>
            {t('ai-open', { defaultValue: 'Ask AI' })}
          </Btn>
          <Btn size="sm" variant="ghost" icon={RotateCcw} onClick={resetToStock}>
            {t('reset-stock', { defaultValue: 'Stock' })}
          </Btn>
          <Btn size="sm" variant="ghost" icon={Trash2} disabled={filled === 0} onClick={clearAll}>
            {t('clear-all', { defaultValue: 'Clear' })}
          </Btn>
          <Btn
            size="sm"
            variant="primary"
            icon={Save}
            disabled={filled === 0 || (remote !== null && !dirty)}
            onClick={() => (session ? setSaveOpen(true) : setSignIn('save'))}
          >
            {remote
              ? t('save-changes', { defaultValue: 'Save changes' })
              : t('save-loadout', { defaultValue: 'Save loadout' })}
          </Btn>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
        <section
          aria-label={t('loadout-slots', { defaultValue: 'Loadout slots' })}
          className="flex flex-col gap-4"
        >
          {/* The player sits right under the class bar; the options follow it. */}
          <PlayerViewer
            cls={cls}
            worn={worn}
            tauntEffect={tauntEffect}
            taunt={tauntItem}
            animation={animation}
            onAnimationChange={setAnimation}
          />
          <RulesPanel
            warnings={warnings}
            idx={idx}
            unrestricted={unrestricted}
            onToggle={setUnrestricted}
            onFix={makePlayable}
          />
          <SlotGroup title={t('weapons', { defaultValue: 'Weapons' })}>
            {weaponKeys.map((k) => (
              <SlotCell
                key={k}
                slotKey={k}
                label={slotLabel(k)}
                idx={idx}
                entry={slots[k]}
                selected={selected === k}
                onSelect={() => selectSlot(k)}
                ready={ready}
              />
            ))}
          </SlotGroup>
          <SlotGroup title={t('cosmetics', { defaultValue: 'Cosmetics' })}>
            {cosmeticKeys.map((k) => (
              <SlotCell
                key={k}
                slotKey={k}
                label={slotLabel(k)}
                idx={idx}
                entry={slots[k]}
                selected={selected === k}
                onSelect={() => selectSlot(k)}
                ready={ready}
              />
            ))}
            {unrestricted && cosmeticKeys.length < MAX_COSMETIC_SLOTS ? (
              <button
                type="button"
                onClick={() => {
                  setExtraCosmetics(Math.max(0, cosmeticKeys.length - COSMETIC_SLOTS) + 1);
                  setSelected(cosmeticKey(cosmeticKeys.length));
                }}
                className="flex aspect-square min-w-0 flex-col items-center justify-center gap-1 rounded-(--app-radius-sm) border border-dashed border-(--app-border) text-xs text-(--app-text-dim) hover:border-(--app-accent) hover:text-(--app-text)"
              >
                <Plus className="size-5" aria-hidden />
                {t('add-cosmetic-slot', { defaultValue: 'Add slot' })}
              </button>
            ) : null}
          </SlotGroup>
          <SlotGroup title={t('action-and-taunts', { defaultValue: 'Action & taunts' })}>
            {['action', ...TAUNT_KEYS].map((k) => (
              <SlotCell
                key={k}
                slotKey={k}
                label={slotLabel(k)}
                idx={idx}
                entry={slots[k]}
                selected={selected === k}
                onSelect={() => selectSlot(k)}
                ready={ready}
              />
            ))}
          </SlotGroup>
          <p className="text-xs text-(--app-text-dim)">
            {t('catalog-source', {
              defaultValue: 'Items from {{source}}, updated automatically.',
              source: catalog.source.label,
            })}
          </p>
        </section>

        {isDesktop ? (
          <section
            aria-label={t('item-picker', { defaultValue: 'Item picker' })}
            className="min-h-96 overflow-y-auto rounded-(--app-radius) border border-(--app-border) bg-(--app-bg-subtle) lg:sticky lg:top-4 lg:max-h-[calc(100dvh-2rem)]"
          >
            {selected ? (
              <Picker
                key={`${cls}:${selected}`}
                idx={idx}
                cls={cls}
                slotKey={selected}
                label={slotLabel(selected)}
                entry={slots[selected]}
                onEquip={(item) => equip(selected, item)}
                onPatch={(change) => patch(selected, change)}
                onClear={() => clear(selected)}
                onClose={() => setSelected(null)}
              />
            ) : (
              <EmptyNote>
                {t('pick-a-slot', {
                  defaultValue: 'Pick a slot on the left to choose an item for it.',
                })}
              </EmptyNote>
            )}
          </section>
        ) : null}
      </div>

      {!isDesktop ? (
        <Modal
          sheet
          open={selected !== null}
          onOpenChange={(o) => !o && setSelected(null)}
          title={selected ? slotLabel(selected) : ''}
          description={t('sheet-desc', {
            defaultValue: 'Choose an item for this slot. Close the sheet when you are done.',
          })}
        >
          {selected ? (
            <Picker
              key={`${cls}:${selected}`}
              idx={idx}
              cls={cls}
              slotKey={selected}
              label={slotLabel(selected)}
              entry={slots[selected]}
              embedded
              onEquip={(item) => equip(selected, item)}
              onPatch={(change) => patch(selected, change)}
              onClear={() => clear(selected)}
              onClose={() => setSelected(null)}
            />
          ) : null}
        </Modal>
      ) : null}

      <p role="status" aria-live="polite" className="sr-only">
        {announce}
      </p>

      <SaveDialog
        open={saveOpen}
        onOpenChange={setSaveOpen}
        cls={cls}
        slots={slots}
        remote={remote}
        onSaved={(saved) => {
          afterSave(saved);
          if (!remote) {
            void navigate({
              to: '/tf2/loadout',
              search: { id: saved.id, class: cls },
              replace: true,
            });
          }
        }}
        onNeedSignIn={() => {
          setSaveOpen(false);
          setSignIn('save');
        }}
      />
      <LoadoutAssistant
        open={assistantOpen}
        onOpenChange={setAssistantOpen}
        sheet={!isDesktop}
        cls={cls}
        slots={slots}
        idx={idx}
        signedIn={Boolean(session)}
        onNeedSignIn={() => {
          setAssistantOpen(false);
          setSignIn('ai');
        }}
        onApply={applyActions}
        canUndo={undoSlots !== null}
        onUndo={undoApply}
      />
      {signIn ? (
        <SignInRequiredDialog
          open
          onClose={() => setSignIn(null)}
          feature={
            signIn === 'ai'
              ? t('feature-loadout-ai', { defaultValue: 'Use the loadout assistant' })
              : t('feature-save-loadouts', { defaultValue: 'Save loadouts to your account' })
          }
        />
      ) : null}
    </main>
  );
}

function RulesPanel({
  warnings,
  idx,
  unrestricted,
  onToggle,
  onFix,
}: {
  warnings: ReturnType<typeof loadoutWarnings>;
  idx: CatalogIndex;
  unrestricted: boolean;
  onToggle: (on: boolean) => void;
  onFix: () => void;
}) {
  const { t } = useTranslation('c-tf2-hud');
  return (
    <div className="rounded-(--app-radius) border border-(--app-border) bg-(--app-bg-subtle) p-3 text-xs">
      {/* eslint-disable-next-line jsx-a11y/label-has-associated-control -- Toggle renders the native checkbox */}
      <label className="flex cursor-pointer items-start gap-2.5">
        <Toggle
          checked={unrestricted}
          onChange={onToggle}
          label={t('allow-any', { defaultValue: 'Allow any combination' })}
        />
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-(--app-text)">
            {t('allow-any', { defaultValue: 'Allow any combination' })}
          </span>
          <span className="block text-(--app-text-dim)">
            {t('allow-any-desc', {
              defaultValue:
                'Off: only what the game allows. On: equip as many items as you like; anything the game could not do is flagged.',
            })}
          </span>
        </span>
      </label>
      {warnings.length ? (
        <div
          role="status"
          className="mt-3 rounded-(--app-radius-sm) border border-(--app-warning)/50 bg-(--app-warning)/10 p-2.5"
        >
          <p className="flex items-center gap-1.5 font-semibold text-(--app-warning)">
            <AlertTriangle className="size-4 shrink-0" aria-hidden />
            {t('not-possible', { defaultValue: 'Not possible in the game' })}
          </p>
          <WarningList warnings={warnings} idx={idx} />
          <Btn size="sm" className="mt-2" onClick={onFix}>
            {t('make-playable', { defaultValue: 'Make it playable' })}
          </Btn>
        </div>
      ) : null}
    </div>
  );
}

function SlotGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-(--app-radius) border border-(--app-border) bg-(--app-bg-subtle)">
      <PanelHead title={title} />
      <div className="grid grid-cols-3 gap-2 p-3 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-3">
        {children}
      </div>
    </div>
  );
}

function SlotCell({
  slotKey,
  label,
  idx,
  entry,
  selected,
  onSelect,
  ready,
}: {
  slotKey: LoadoutSlotKey;
  label: string;
  idx: CatalogIndex;
  entry: LoadoutEntry | undefined;
  selected: boolean;
  onSelect: () => void;
  ready: boolean;
}) {
  const { t } = useTranslation('c-tf2-hud');
  const item = entry ? idx.item(entry.item) : undefined;
  const effect = entry?.effect !== undefined ? idx.effect(entry.effect) : undefined;
  return (
    <div className="flex min-w-0 flex-col gap-1" data-slot={slotKey}>
      <span className="truncate text-[11px] font-semibold uppercase tracking-wider text-(--app-text-dim)">
        {label}
      </span>
      {item ? (
        <ItemTile
          item={item}
          paint={entry?.paint !== undefined ? idx.paint(entry.paint) : undefined}
          selected={selected}
          onClick={onSelect}
          label={`${label}: ${item.n}`}
        />
      ) : (
        <button
          type="button"
          onClick={onSelect}
          aria-pressed={selected}
          aria-label={
            entry
              ? t('unknown-item-slot', {
                  defaultValue: '{{slot}}: item {{id}} (no longer in the game)',
                  slot: label,
                  id: entry.item,
                })
              : t('empty-slot', { defaultValue: '{{slot}}: empty', slot: label })
          }
          className={`flex aspect-[5/4] w-full items-center justify-center rounded-(--app-radius-sm) border-2 border-dashed text-xs text-(--app-text-dim) transition-[box-shadow] duration-(--app-duration-fast) hover:ring-2 hover:ring-(--app-border-bright) ${
            selected
              ? 'border-(--app-accent) ring-2 ring-(--app-accent)'
              : 'border-(--app-border-bright)'
          }`}
          disabled={!ready}
        >
          {entry ? `#${entry.item}` : <Plus className="size-4" aria-hidden />}
        </button>
      )}
      <span className="min-h-4 truncate text-xs text-(--app-text-muted)">
        {item?.n ?? ''}
        {effect ? ` · ${effect.n}` : ''}
      </span>
    </div>
  );
}

function Picker({
  idx,
  cls,
  slotKey,
  label,
  entry,
  onEquip,
  onPatch,
  onClear,
  onClose,
  embedded = false,
}: {
  idx: CatalogIndex;
  cls: TfClass;
  slotKey: LoadoutSlotKey;
  label: string;
  entry: LoadoutEntry | undefined;
  onEquip: (item: CatalogItem) => void;
  onPatch: (change: Partial<LoadoutEntry>) => void;
  onClear: () => void;
  onClose: () => void;
  /** Inside a sheet that already has a title and a close button. */
  embedded?: boolean;
}) {
  const { t } = useTranslation('c-tf2-hud');
  const { catalog } = idx;
  const [query, setQuery] = useState('');
  const [type, setType] = useState('');
  const [shown, setShown] = useState(PAGE);
  const [previewing, setPreviewing] = useState<CatalogItem | null>(null);

  const all = useMemo(() => itemsForSlot(catalog, cls, slotKey), [catalog, cls, slotKey]);
  const types = useMemo(() => [...new Set(all.map((i) => i.t).filter(Boolean))].sort(), [all]);
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter(
      (i) =>
        (!type || i.t === type) &&
        (!q || i.n.toLowerCase().includes(q) || i.t.toLowerCase().includes(q)),
    );
  }, [all, query, type]);

  useEffect(() => setShown(PAGE), [query, type]);
  const more = useSentinel(() => setShown((n) => n + PAGE), {
    enabled: shown < matches.length,
    watch: shown,
  });

  const current = entry ? idx.item(entry.item) : undefined;
  const slot = current ? slotFor(current, cls) : null;
  const customizable = Boolean(
    current &&
    (current.p ||
      current.st ||
      slot === 'head' ||
      slot === 'misc' ||
      slot === 'taunt' ||
      slot === 'primary' ||
      slot === 'secondary' ||
      slot === 'melee'),
  );
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const wide = useMediaQuery('(min-width: 1024px)');

  return (
    <div className="flex flex-col">
      {embedded ? (
        entry ? (
          <div className="flex justify-end px-3 pt-1">
            <Btn size="sm" variant="ghost" icon={Trash2} onClick={onClear}>
              {t('empty-the-slot', { defaultValue: 'Empty' })}
            </Btn>
          </div>
        ) : null
      ) : (
        <PanelHead
          title={label}
          className="sticky top-0 z-10 bg-(--app-bg-subtle)"
          actions={
            <>
              {entry ? (
                <Btn size="xs" variant="ghost" icon={Trash2} onClick={onClear}>
                  {t('empty-the-slot', { defaultValue: 'Empty' })}
                </Btn>
              ) : null}
              <button
                type="button"
                onClick={onClose}
                aria-label={t('close', { defaultValue: 'Close' })}
                className="inline-flex size-7 items-center justify-center rounded-(--app-radius-sm) text-(--app-text-muted) hover:bg-(--app-surface-hover) hover:text-(--app-text)"
              >
                <X className="size-4" aria-hidden />
              </button>
            </>
          }
        />
      )}

      {current ? (
        <div className="grid gap-3 border-b border-(--app-border) p-3 sm:grid-cols-[13rem_minmax(0,1fr)]">
          <ItemModelViewer
            itemId={modelItemId(current)}
            cls={cls}
            taunt={current.s === 'taunt'}
            festive={entry?.festive}
            style={entry?.style}
            paint={entry ? warPaintOf(idx, entry) : undefined}
            tint={current.p && entry?.paint !== undefined ? idx.paint(entry.paint)?.rgb : undefined}
          />
          <div className="flex min-w-0 flex-col gap-3">
            <div className="min-w-0">
              <p
                className="truncate text-sm font-semibold"
                style={{ color: qualityAccent(current.q) ?? undefined }}
              >
                {current.n}
              </p>
              <p className="truncate text-xs text-(--app-text-dim)">{current.t}</p>
            </div>
            {customizable && entry ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <Btn size="sm" icon={SlidersHorizontal} onClick={() => setCustomizeOpen(true)}>
                  {t('customize', { defaultValue: 'Customize' })}
                </Btn>
                {entry.paint !== undefined && idx.paint(entry.paint) ? (
                  <Pill>
                    <span
                      aria-hidden
                      className="me-1 inline-block size-2.5 rounded-full border border-(--app-border-bright)"
                      style={{ background: idx.paint(entry.paint)!.rgb }}
                    />
                    {idx.paint(entry.paint)!.n}
                  </Pill>
                ) : null}
                {entry.style !== undefined && current?.st?.find((x) => x.k === entry.style) ? (
                  <Pill>{current.st!.find((x) => x.k === entry.style)!.n}</Pill>
                ) : null}
                {entry.effect !== undefined && idx.effect(entry.effect) ? (
                  <Pill tone="accent">{idx.effect(entry.effect)!.n}</Pill>
                ) : null}
                {kitOf(current, entry) !== undefined ? (
                  <Pill>
                    {(catalog.kits ?? []).find((k) => k.id === kitOf(current, entry))?.n ??
                      '#' + kitOf(current, entry)}
                    {entry.wear ? ` · ${WEAR_NAMES[entry.wear - 1]}` : ''}
                  </Pill>
                ) : current.sk && entry.wear ? (
                  <Pill>{WEAR_NAMES[entry.wear - 1]}</Pill>
                ) : null}
                {entry.festive ? (
                  <Pill tone="accent">{t('festivized', { defaultValue: 'Festivized' })}</Pill>
                ) : null}
                {current.rt ? (
                  <Pill>
                    <span
                      aria-hidden
                      className="me-1 inline-block size-2.5 rounded-full border border-(--app-border-bright)"
                      style={{ background: rarityColor(current.rt) }}
                    />
                    {tierName(current)}
                  </Pill>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <div
        className={cn(
          'sticky z-10 flex flex-wrap gap-2 border-b border-(--app-border) bg-(--app-bg-subtle) p-3',
          embedded ? 'top-0' : 'top-9',
        )}
      >
        <div className="relative min-w-40 flex-1">
          <Search
            className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-(--app-text-dim)"
            aria-hidden
          />
          <TextField
            type="search"
            // Opening a slot moves focus to the search box on wide screens; on a phone that
            // would raise the keyboard over the sheet before anything is seen.
            autoFocus={!embedded}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('search-items', {
              defaultValue: 'Search {{count}} items',
              count: all.length,
            })}
            aria-label={t('search-items-label', { defaultValue: 'Search items' })}
            className="h-9 ps-8 text-sm"
          />
        </div>
        {types.length > 1 ? (
          <SelectField
            value={type}
            onChange={(e) => setType(e.target.value)}
            aria-label={t('item-type', { defaultValue: 'Item type' })}
            className="h-9 w-40 text-sm"
          >
            <option value="">{t('all-types', { defaultValue: 'All types' })}</option>
            {types.map((ty) => (
              <option key={ty} value={ty}>
                {ty}
              </option>
            ))}
          </SelectField>
        ) : null}
        <p role="status" className="basis-full text-[11px] text-(--app-text-dim)">
          {t('showing-count', {
            defaultValue: 'Showing {{shown}} of {{total}}',
            shown: Math.min(shown, matches.length),
            total: matches.length,
          })}
        </p>
      </div>

      {matches.length === 0 ? (
        <EmptyNote>{t('no-items-match', { defaultValue: 'No items match.' })}</EmptyNote>
      ) : (
        <ul className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3 xl:grid-cols-4">
          {matches.slice(0, shown).map((it) => {
            const active = entry?.item === it.id;
            return (
              <li
                key={it.id}
                className="flex min-w-0 flex-col gap-1 [contain-intrinsic-size:auto_9rem] [content-visibility:auto]"
              >
                <ItemTile item={it} selected={active} onClick={() => onEquip(it)} />
                <div className="flex items-center gap-1">
                  <span
                    aria-hidden
                    className="flex min-w-0 flex-1 items-center gap-1 truncate text-xs"
                    style={{ color: qualityAccent(it.q) ?? undefined }}
                  >
                    {active ? <Check className="size-3 shrink-0" aria-hidden /> : null}
                    <span className="truncate">{it.n}</span>
                  </span>
                  <IconButton
                    icon={Eye}
                    label={t('preview-item', { defaultValue: 'Preview {{name}}', name: it.n })}
                    showTooltip={false}
                    size="icon-sm"
                    onClick={() => setPreviewing(it)}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {shown < matches.length ? <div ref={more} aria-hidden className="h-8" /> : null}
      {previewing ? (
        <ItemPreviewModal
          item={previewing}
          cls={cls}
          idx={idx}
          sheet={!wide}
          equipped={entry?.item === previewing.id}
          onEquip={() => onEquip(previewing)}
          onClose={() => setPreviewing(null)}
        />
      ) : null}
      {customizeOpen && current && entry ? (
        <ItemCustomizeModal
          open
          onOpenChange={setCustomizeOpen}
          sheet={!wide}
          item={current}
          entry={entry}
          cls={cls}
          idx={idx}
          onPatch={onPatch}
        />
      ) : null}
    </div>
  );
}

function SaveDialog({
  open,
  onOpenChange,
  cls,
  slots,
  remote,
  onSaved,
  onNeedSignIn,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  cls: TfClass;
  slots: LoadoutSlots;
  remote: {
    id: string;
    slug: string;
    title: string;
    description: string;
    visibility: Visibility;
  } | null;
  onSaved: (saved: {
    id: string;
    slug: string;
    title: string;
    description: string;
    visibility: Visibility;
  }) => void;
  onNeedSignIn: () => void;
}) {
  const { t } = useTranslation('c-tf2-hud');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<Visibility>('PRIVATE');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(remote?.title ?? `${CLASS_DEFAULT[cls]} loadout`);
    setDescription(remote?.description ?? '');
    setVisibility(remote?.visibility ?? 'PRIVATE');
  }, [open, remote, cls]);

  const save = async () => {
    setBusy(true);
    try {
      const body = { title: title.trim(), description, tfClass: cls, slots, visibility };
      const d = remote ? await loadoutApi.update(remote.id, body) : await loadoutApi.create(body);
      onSaved({
        id: d.id,
        slug: d.slug,
        title: d.title,
        description: d.description,
        visibility: d.visibility,
      });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) onNeedSignIn();
      else
        toast.error(
          e instanceof ApiError
            ? e.message
            : t('loadout-save-failed', { defaultValue: 'Could not save the loadout.' }),
        );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={
        remote
          ? t('save-changes', { defaultValue: 'Save changes' })
          : t('save-loadout', { defaultValue: 'Save loadout' })
      }
      description={t('save-loadout-desc', {
        defaultValue:
          'Name it, then choose who can see it. Public loadouts appear in the workshop.',
      })}
      footer={
        <>
          <Btn variant="ghost" onClick={() => onOpenChange(false)}>
            {t('cancel', { defaultValue: 'Cancel' })}
          </Btn>
          <Btn variant="primary" disabled={busy || !title.trim()} onClick={() => void save()}>
            {busy ? t('saving', { defaultValue: 'Saving…' }) : t('save', { defaultValue: 'Save' })}
          </Btn>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label={t('title', { defaultValue: 'Title' })}>
          <TextField
            value={title}
            maxLength={80}
            onChange={(e) => setTitle(e.target.value)}
            aria-label={t('title', { defaultValue: 'Title' })}
          />
        </Field>
        <Field label={t('description', { defaultValue: 'Description' })}>
          <textarea
            value={description}
            maxLength={2000}
            rows={3}
            onChange={(e) => setDescription(e.target.value)}
            aria-label={t('description', { defaultValue: 'Description' })}
            className="w-full rounded-(--app-radius-sm) border border-(--app-border-bright) bg-(--app-bg) p-2 text-xs text-(--app-text) focus-visible:border-(--app-accent)"
          />
        </Field>
        <Field
          label={t('visibility', { defaultValue: 'Visibility' })}
          hint={t('visibility-hint', {
            defaultValue: 'Unlisted loadouts are reachable by link but not listed in the workshop.',
          })}
        >
          <SelectField
            value={visibility}
            aria-label={t('visibility', { defaultValue: 'Visibility' })}
            onChange={(e) => setVisibility(e.target.value as Visibility)}
          >
            <option value="PRIVATE">{t('private', { defaultValue: 'Private' })}</option>
            <option value="UNLISTED">{t('unlisted', { defaultValue: 'Unlisted' })}</option>
            <option value="PUBLIC">
              {t('public-workshop', { defaultValue: 'Public (workshop)' })}
            </option>
          </SelectField>
        </Field>
        {visibility === 'PUBLIC' ? (
          <p className="flex items-center gap-1.5 text-xs text-(--app-text-muted)">
            <Globe className="size-3.5" aria-hidden />
            {t('public-note', { defaultValue: 'Anyone can find, like and copy this loadout.' })}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
