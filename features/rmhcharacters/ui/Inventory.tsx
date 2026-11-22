/** Inventory and coins, shared by both systems. Items come from the rules data or are written in. */
import { useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { newId } from '@features/rmhcharacters/engine/factory';
import type { Character, Currency, InventoryItem } from '@features/rmhcharacters/engine/types';
import { Field, Muted, Picker, Section, type PickerItem } from './controls';

export interface CatalogItem extends PickerItem {
  weight?: number;
  bulk?: number;
}

export function Inventory<C extends Character>({
  c,
  set,
  catalog,
  load,
  onEquip,
}: {
  c: C;
  set: (fn: (c: C) => C) => void;
  catalog: CatalogItem[];
  /** "Weight 23 / 150 lb" or "Bulk 4 / 7". */
  load: string;
  /** Equipping an item may also set worn armor; the system editor decides. */
  onEquip?: (c: C, item: InventoryItem, equipped: boolean) => C;
}) {
  const { t } = useTranslation('c-rmhcharacters');
  const [custom, setCustom] = useState('');
  const owned = useMemo(() => c.inventory.map((i) => i.refId).filter((x): x is string => Boolean(x)), [c.inventory]);
  const coins: (keyof Currency)[] = c.system === 'dnd5e' ? ['pp', 'gp', 'ep', 'sp', 'cp'] : ['pp', 'gp', 'sp', 'cp'];

  const addRef = (id: string) => {
    const ref = catalog.find((x) => x.id === id);
    if (!ref) return;
    set((x) => {
      const existing = x.inventory.find((i) => i.refId === id);
      if (existing) return { ...x, inventory: x.inventory.filter((i) => i.id !== existing.id) };
      const item: InventoryItem = {
        id: newId(),
        name: ref.name,
        quantity: 1,
        equipped: false,
        refId: id,
        ...(ref.weight !== undefined ? { weight: ref.weight } : {}),
        ...(ref.bulk !== undefined ? { bulk: ref.bulk } : {}),
      };
      return { ...x, inventory: [...x.inventory, item] };
    });
  };

  const patchItem = (id: string, patch: Partial<InventoryItem>) =>
    set((x) => {
      const item = x.inventory.find((i) => i.id === id);
      if (!item) return x;
      const next = { ...item, ...patch };
      let out = { ...x, inventory: x.inventory.map((i) => (i.id === id ? next : i)) };
      if (patch.equipped !== undefined && onEquip) out = onEquip(out, next, patch.equipped);
      return out;
    });

  return (
    <div className="rmhc-columns">
      <div>
        <Section
          title={t('inv.carried', { defaultValue: 'Carried' })}
          action={<span className="font-mono text-xs text-app-text-muted">{load}</span>}
        >
          {c.inventory.length === 0 ? (
            <Muted>
              {t('inv.empty', { defaultValue: 'Nothing carried yet. Add gear from the list or write an item in.' })}
            </Muted>
          ) : null}
          <ul className="flex flex-col">
            {c.inventory.map((i) => (
              <li
                key={i.id}
                className="flex flex-wrap items-center gap-2 border-b border-app-border py-2 last:border-b-0"
              >
                <Input
                  value={i.name}
                  onChange={(e) => patchItem(i.id, { name: e.target.value.slice(0, 200) })}
                  aria-label={t('inv.name', { defaultValue: 'Item name' })}
                  className="min-w-0 flex-1"
                />
                <Input
                  type="number"
                  min={0}
                  value={i.quantity}
                  onChange={(e) => patchItem(i.id, { quantity: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
                  aria-label={t('inv.quantity', { defaultValue: 'Quantity' })}
                  className="w-20"
                />
                <label className="inline-flex items-center gap-1.5 text-sm text-app-text-muted">
                  <input
                    type="checkbox"
                    checked={i.equipped}
                    onChange={(e) => patchItem(i.id, { equipped: e.target.checked })}
                  />
                  {t('inv.equipped', { defaultValue: 'Equipped' })}
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={t('inv.remove', { defaultValue: 'Remove {{name}}', name: i.name })}
                  onClick={() => set((x) => ({ ...x, inventory: x.inventory.filter((y) => y.id !== i.id) }))}
                >
                  <Trash2 aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const name = custom.trim();
              if (!name) return;
              set((x) => ({
                ...x,
                inventory: [...x.inventory, { id: newId(), name: name.slice(0, 200), quantity: 1, equipped: false }],
              }));
              setCustom('');
            }}
          >
            <Input
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder={t('inv.customPlaceholder', { defaultValue: 'Write in an item' })}
              aria-label={t('inv.customPlaceholder', { defaultValue: 'Write in an item' })}
            />
            <Button type="submit">{t('inv.add', { defaultValue: 'Add' })}</Button>
          </form>
        </Section>
        <Section title={t('inv.coins', { defaultValue: 'Coins' })}>
          <div className="grid grid-cols-5 gap-2">
            {coins.map((k) => (
              <Field key={k} label={k.toUpperCase()}>
                <Input
                  type="number"
                  min={0}
                  value={c.currency[k]}
                  onChange={(e) => {
                    const v = Math.max(0, Math.floor(Number(e.target.value) || 0));
                    set((x) => ({ ...x, currency: { ...x.currency, [k]: v } }));
                  }}
                />
              </Field>
            ))}
          </div>
        </Section>
      </div>
      <Section title={t('inv.catalog', { defaultValue: 'Equipment list' })}>
        <Picker
          items={catalog}
          selected={owned}
          onToggle={addRef}
          placeholder={t('inv.search', { defaultValue: 'Search weapons, armor and gear' })}
          emptyText={t('inv.noMatch', { defaultValue: 'No equipment matches.' })}
        />
      </Section>
    </div>
  );
}
