/** Wires the Pathfinder 2e panels into the shared editor frame. */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as R from '@features/rmhcharacters/engine/pf2e/rules';
import { useAdvisor } from '@features/rmhcharacters/engine/advisor-store';
import { pending } from '@features/rmhcharacters/engine/pending';
import { useRoster } from '@features/rmhcharacters/engine/store';
import type { InventoryItem, Pf2eCharacter } from '@features/rmhcharacters/engine/types';
import { Advisor } from '../Advisor';
import { EditorFrame, type EditorTab } from '../Editor';
import { Inventory } from '../Inventory';
import { Story } from '../Story';
import { usePf2eData } from '../useData';
import { BuildPf2e } from './BuildPf2e';
import { LevelUpPf2e } from './LevelUpPf2e';
import { SheetPf2e } from './SheetPf2e';
import { SpellsPf2e } from './SpellsPf2e';

const bulkLabel = (b: number) => (b === 0 ? '—' : b < 1 ? 'L' : String(b));

export function EditorPf2e({ c, onBack }: { c: Pf2eCharacter; onBack: () => void }) {
  const { t } = useTranslation('c-rmhcharacters');
  const d = usePf2eData();
  const update = useRoster((s) => s.update);
  const [tab, setTab] = useState<EditorTab>(c.classId ? 'sheet' : 'build');
  const [levelling, setLevelling] = useState(false);
  const askAdvisor = useAdvisor((s) => s.ask);
  const set = (fn: (x: Pf2eCharacter) => Pf2eCharacter) => update(c.id, (x) => (x.system === 'pf2e' ? fn(x) : x));

  if (!d) return <p className="py-8 text-sm text-app-text-muted">{t('common.loadingRules', { defaultValue: 'Loading the rules…' })}</p>;

  const klass = R.classOf(d, c);
  const bulk = R.bulk(c);
  const subtitle = klass
    ? t('ep.subtitle', { defaultValue: 'Level {{level}} {{heritage}} {{ancestry}} {{klass}}', level: c.level, heritage: R.heritageOf(d, c)?.name ?? '', ancestry: R.ancestryOf(d, c)?.name ?? '', klass: klass.name })
    : t('e5.new', { defaultValue: 'New character — start on the Build tab' });

  const catalog = [
    ...d.weapons.map((w) => ({ id: w.id, name: w.name, bulk: w.bulk, meta: `${w.category} ${w.kind} · ${w.damage} ${w.damageType} · ${w.group}`, text: `${w.traits.join(', ')} · hands ${w.hands}${w.range ? ` · range ${w.range} ft` : ''} · bulk ${bulkLabel(w.bulk)} · ${w.price}` })),
    ...d.armor.map((a) => ({ id: a.id, name: a.name, bulk: a.bulk, meta: `${a.category} · +${a.acBonus} AC${a.dexCap !== undefined ? ` · Dex cap ${a.dexCap}` : ''}`, text: `${a.strength !== undefined ? `Str +${a.strength} · ` : ''}check ${a.checkPenalty} · speed ${a.speedPenalty} · ${a.traits.join(', ')} · bulk ${bulkLabel(a.bulk)} · ${a.price}` })),
    ...d.gear.map((g) => ({ id: g.id, name: g.name, bulk: g.bulk, meta: `${g.price} · bulk ${bulkLabel(g.bulk)}`, ...(g.text ? { text: g.text } : {}) })),
  ];

  const onEquip = (x: Pf2eCharacter, item: InventoryItem, equipped: boolean): Pf2eCharacter => {
    const armor = d.armor.find((a) => a.id === item.refId);
    if (!armor || armor.category === 'shield') return x;
    if (equipped) return { ...x, armorId: armor.id, inventory: x.inventory.map((i) => (i.id !== item.id && d.armor.some((a) => a.id === i.refId && a.category !== 'shield') ? { ...i, equipped: false } : i)) };
    if (x.armorId === armor.id) {
      const { armorId: _a, ...rest } = x;
      void _a;
      return rest as Pf2eCharacter;
    }
    return x;
  };

  return (
    <>
      <EditorFrame
        character={c}
        subtitle={subtitle}
        tab={tab}
        onTab={setTab}
        onBack={onBack}
        onLevelUp={klass && c.level < 20 ? () => setLevelling(true) : null}
        pending={pending(c, d)}
        panels={{
          build: <BuildPf2e c={c} d={d} set={set} />,
          sheet: <SheetPf2e c={c} d={d} set={set} />,
          spells: <SpellsPf2e c={c} d={d} set={set} />,
          inventory: <Inventory c={c} set={set} catalog={catalog} onEquip={onEquip} load={t('ep.bulk', { defaultValue: 'Bulk {{b}} / {{e}}', b: bulk.carried, e: bulk.encumbered })} />,
          story: <Story c={c} set={set} />,
          advisor: <Advisor c={c} data={d} onApply={(fn) => update(c.id, fn)} />,
        }}
      />
      {levelling ? (
        <LevelUpPf2e
          c={c}
          d={d}
          open={levelling}
          onOpenChange={setLevelling}
          onApply={(next) => update(c.id, () => next)}
          onAsk={() => {
            setTab('advisor');
            void askAdvisor(c, t('advisor.q.levelUp', { defaultValue: 'What should I take when I level up?' }));
          }}
        />
      ) : null}
    </>
  );
}
