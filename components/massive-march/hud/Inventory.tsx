/**
 * Massive March — what you are carrying, and where.
 *
 * One thing in your hands, two on your belt, four more only if somebody in the
 * group is wearing a backpack — and the wearer cannot reach their own (§10).
 * That last rule is the one this panel exists to make visible: your own pack
 * shows as sealed, with the note that somebody else has to open it, because
 * discovering that mid-puzzle by pressing a button that does nothing would be a
 * bug report rather than a design.
 *
 * The strip along the bottom of the HUD is the same data at a glance; this is
 * the full sheet you open to rearrange things.
 */

'use client';

import { useTranslation } from 'react-i18next';
import { Hand, Backpack, PackageOpen } from 'lucide-react';
import { ITEMS, type ItemKind, type Slot } from '@/lib/massive-march/items';
import { live } from '@/lib/massive-march/live';
import { mm } from '@/lib/massive-march/net/client';
import { useMmStore } from '@/lib/massive-march/store';
import { TOY } from '@/lib/massive-march/palette';
import { BOARD, Chip, INK, MarchButton, Panel } from '../ui';

export interface CarriedItem {
  id: number;
  kind: ItemKind;
  where: Slot;
  label: string;
}

/** Read the player's pockets straight out of the live item table. */
export function carriedItems(): CarriedItem[] {
  const out: CarriedItem[] = [];
  for (const item of live.items.values()) {
    if (item.holder !== live.selfSlot) continue;
    out.push({ id: item.id, kind: item.kind, where: item.where, label: item.label });
  }
  return out;
}

function ItemRow({ item, canEquip }: { item: CarriedItem; canEquip: boolean }) {
  const { t } = useTranslation('c-massive-march');
  const def = ITEMS[item.kind];

  return (
    <li
      className="flex flex-wrap items-center gap-2 border-2 px-2 py-1.5"
      style={{ borderColor: 'rgba(34,32,29,0.3)', borderRadius: 3 }}
    >
      <span
        aria-hidden
        className="size-4 shrink-0 border-2"
        style={{ background: def.color, borderColor: INK, borderRadius: 2 }}
      />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold">{def.name}</span>
        <span className="block text-[11px] leading-snug opacity-65">{def.blurb}</span>
      </span>
      {canEquip && item.where !== 'hands' && item.where !== 'pack' ? (
        <MarchButton className="px-2 py-1 text-[11px]" onClick={() => mm.equip(item.id)}>
          {t('to-hands', { defaultValue: 'Hold' })}
        </MarchButton>
      ) : null}
      {item.where === 'hands' ? (
        <>
          <MarchButton className="px-2 py-1 text-[11px]" onClick={() => mm.stow(item.id, 'belt')}>
            {t('to-belt', { defaultValue: 'Belt' })}
          </MarchButton>
          <MarchButton
            tone="danger"
            className="px-2 py-1 text-[11px]"
            onClick={() => mm.drop()}
          >
            {t('drop', { defaultValue: 'Drop' })}
          </MarchButton>
        </>
      ) : null}
    </li>
  );
}

function Section({
  title,
  icon,
  items,
  capacity,
  note,
  canEquip = true,
}: {
  title: string;
  icon: React.ReactNode;
  items: CarriedItem[];
  capacity: number;
  note?: string;
  canEquip?: boolean;
}) {
  const { t } = useTranslation('c-massive-march');
  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-2 text-[11px] font-black tracking-[0.14em] uppercase opacity-70">
        {icon}
        {title}
        <span className="opacity-60">
          {items.length}/{capacity}
        </span>
      </h3>
      {note ? <p className="text-xs leading-snug opacity-70">{note}</p> : null}
      {items.length === 0 ? (
        <p className="text-xs opacity-50">{t('empty', { defaultValue: 'Empty.' })}</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((item) => (
            <ItemRow key={item.id} item={item} canEquip={canEquip} />
          ))}
        </ul>
      )}
    </section>
  );
}

export function InventorySheet() {
  const { t } = useTranslation('c-massive-march');
  const pack = useMmStore((s) => s.pack);
  const members = useMmStore((s) => s.session?.members ?? []);
  const items = carriedItems();

  const hands = items.filter((item) => item.where === 'hands');
  const belt = items.filter((item) => item.where === 'belt');
  const inPack = items.filter((item) => item.where === 'pack');
  const worn = items.filter((item) => item.where === 'worn');
  const wearingPack = worn.some((item) => item.kind === 'backpack');

  const packOwner = pack ? members.find((m) => m.socketId === pack.target) : null;

  return (
    <Panel className="max-h-[min(34rem,76vh)] w-[min(26rem,90vw)] space-y-4 overflow-y-auto">
      <h2 className="text-lg font-black tracking-tight">
        {t('carrying', { defaultValue: 'What you are carrying' })}
      </h2>

      <Section
        title={t('hands', { defaultValue: 'Hands' })}
        icon={<Hand aria-hidden className="size-3.5" />}
        items={hands}
        capacity={1}
      />
      <Section
        title={t('belt', { defaultValue: 'Belt' })}
        icon={<Chip className="px-1 py-0">·</Chip>}
        items={belt}
        capacity={2}
      />
      <Section
        title={t('worn', { defaultValue: 'Worn' })}
        icon={<Backpack aria-hidden className="size-3.5" />}
        items={worn}
        capacity={2}
      />
      <Section
        title={t('pack', { defaultValue: 'Your backpack' })}
        icon={<PackageOpen aria-hidden className="size-3.5" />}
        items={inPack}
        capacity={4}
        canEquip={false}
        note={
          wearingPack
            ? t('pack-sealed', {
                defaultValue:
                  'It is on your back. Somebody else has to walk over and get things out of it.',
              })
            : t('pack-none', { defaultValue: 'Nobody has given you a backpack.' })
        }
      />

      {pack && packOwner ? (
        <section className="space-y-2 border-t-[3px] pt-3" style={{ borderColor: INK }}>
          <h3 className="text-[11px] font-black tracking-[0.14em] uppercase opacity-70">
            {t('their-pack', { defaultValue: '{{name}}’s backpack', name: packOwner.name })}
          </h3>
          {pack.items.length === 0 ? (
            <p className="text-xs opacity-60">{t('empty', { defaultValue: 'Empty.' })}</p>
          ) : (
            <ul className="space-y-1.5">
              {pack.items.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center gap-2 border-2 px-2 py-1.5"
                  style={{ borderColor: 'rgba(34,32,29,0.3)', borderRadius: 3 }}
                >
                  <span
                    aria-hidden
                    className="size-4 shrink-0 border-2"
                    style={{
                      background: ITEMS[item.kind].color,
                      borderColor: INK,
                      borderRadius: 2,
                    }}
                  />
                  <span className="flex-1 text-sm font-bold">{ITEMS[item.kind].name}</span>
                  <MarchButton
                    className="px-2 py-1 text-[11px]"
                    onClick={() => mm.takeFromPack(pack.target, item.id)}
                  >
                    {t('take-out', { defaultValue: 'Take' })}
                  </MarchButton>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </Panel>
  );
}

/** The always-on strip: hands first, then belt, in the order you can reach them. */
export function InventoryStrip() {
  const items = carriedItems();
  const ordered = [
    ...items.filter((item) => item.where === 'hands'),
    ...items.filter((item) => item.where === 'belt'),
    ...items.filter((item) => item.where === 'worn'),
  ];
  if (ordered.length === 0) return null;

  return (
    <ul className="pointer-events-none flex flex-wrap justify-end gap-1.5">
      {ordered.map((item) => (
        <li
          key={item.id}
          className="flex items-center gap-1.5 border-2 px-2 py-1"
          style={{
            background: item.where === 'hands' ? BOARD : 'rgba(20,18,16,0.7)',
            color: item.where === 'hands' ? INK : BOARD,
            borderColor: item.where === 'hands' ? INK : 'rgba(247,243,232,0.25)',
            borderRadius: 3,
          }}
        >
          <span
            aria-hidden
            className="size-3 border"
            style={{ background: ITEMS[item.kind].color, borderColor: INK, borderRadius: 1 }}
          />
          <span className="text-xs font-bold">{ITEMS[item.kind].name}</span>
          {item.kind === 'orb' ? (
            <span aria-hidden className="size-2 rounded-full" style={{ background: TOY.red }} />
          ) : null}
        </li>
      ))}
    </ul>
  );
}
