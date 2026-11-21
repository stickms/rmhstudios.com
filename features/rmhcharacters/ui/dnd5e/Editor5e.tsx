/** Wires the D&D 5e panels into the shared editor frame. */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as R from '@features/rmhcharacters/engine/dnd5e/rules';
import { useAdvisor } from '@features/rmhcharacters/engine/advisor-store';
import { pending } from '@features/rmhcharacters/engine/pending';
import { useRoster } from '@features/rmhcharacters/engine/store';
import type { Dnd5eCharacter, InventoryItem } from '@features/rmhcharacters/engine/types';
import { Advisor } from '../Advisor';
import { EditorFrame, type EditorTab } from '../Editor';
import { Inventory } from '../Inventory';
import { Story } from '../Story';
import { useDnd5eData } from '../useData';
import { Build5e } from './Build5e';
import { LevelUp5e } from './LevelUp5e';
import { Sheet5e } from './Sheet5e';
import { Spells5e } from './Spells5e';

export function Editor5e({ c, onBack }: { c: Dnd5eCharacter; onBack: () => void }) {
  const { t } = useTranslation('c-rmhcharacters');
  const d = useDnd5eData();
  const update = useRoster((s) => s.update);
  const [tab, setTab] = useState<EditorTab>(c.classes.length ? 'sheet' : 'build');
  const [levelling, setLevelling] = useState(false);
  const askAdvisor = useAdvisor((s) => s.ask);
  const set = (fn: (x: Dnd5eCharacter) => Dnd5eCharacter) => update(c.id, (x) => (x.system === 'dnd5e' ? fn(x) : x));

  if (!d)
    return (
      <p className="py-8 text-sm text-app-text-muted">
        {t('common.loadingRules', { defaultValue: 'Loading the rules…' })}
      </p>
    );

  const level = R.totalLevel(c);
  const species = d.species.find((s) => s.id === c.speciesId)?.name ?? '';
  const classes = c.classes
    .map((k) => `${d.classes.find((x) => x.id === k.classId)?.name ?? k.classId} ${k.level}`)
    .join(' / ');
  const scores = R.abilityScores(c, d);
  const carried = c.inventory.reduce((n, i) => n + (i.weight ?? 0) * i.quantity, 0);

  const catalog = [
    ...d.weapons.map((w) => ({
      id: w.id,
      name: w.name,
      weight: w.weight,
      meta: `${w.category} ${w.kind} · ${w.damage} ${w.damageType} · ${w.mastery}`,
      text: `${w.properties.join(', ')}${w.range ? ` · ${w.range}` : ''} · ${w.cost}`,
    })),
    ...d.armor.map((a) => ({
      id: a.id,
      name: a.name,
      weight: a.weight,
      meta: `${a.category} armor · AC ${a.ac}${a.dexCap === undefined ? ' + Dex' : a.dexCap ? ` + Dex (max ${a.dexCap})` : ''}`,
      text: `${a.strength ? `Str ${a.strength} · ` : ''}${a.stealthDisadvantage ? 'Stealth disadvantage · ' : ''}${a.cost}`,
    })),
    ...d.gear.map((g) => ({
      id: g.id,
      name: g.name,
      weight: g.weight,
      meta: g.cost,
      ...(g.text ? { text: g.text } : {}),
    })),
  ];

  const onEquip = (x: Dnd5eCharacter, item: InventoryItem, equipped: boolean): Dnd5eCharacter => {
    const armor = d.armor.find((a) => a.id === item.refId);
    if (!armor) return x;
    if (armor.category === 'shield') return { ...x, shield: equipped };
    if (equipped) {
      return {
        ...x,
        armorId: armor.id,
        inventory: x.inventory.map((i) =>
          i.id !== item.id && d.armor.some((a) => a.id === i.refId && a.category !== 'shield')
            ? { ...i, equipped: false }
            : i,
        ),
      };
    }
    if (x.armorId === armor.id) {
      const { armorId: _a, ...rest } = x;
      void _a;
      return rest as Dnd5eCharacter;
    }
    return x;
  };

  return (
    <>
      <EditorFrame
        character={c}
        subtitle={
          level && classes
            ? t('e5.subtitle', { defaultValue: 'Level {{level}} {{species}} {{classes}}', level, species, classes })
            : t('e5.new', { defaultValue: 'New character — start on the Build tab' })
        }
        tab={tab}
        onTab={setTab}
        onBack={onBack}
        onLevelUp={c.classes.length && level < 20 ? () => setLevelling(true) : null}
        pending={pending(c, d)}
        panels={{
          build: <Build5e c={c} d={d} set={set} />,
          sheet: <Sheet5e c={c} d={d} set={set} />,
          spells: <Spells5e c={c} d={d} set={set} />,
          inventory: (
            <Inventory
              c={c}
              set={set}
              catalog={catalog}
              onEquip={onEquip}
              load={t('e5.carry', {
                defaultValue: '{{w}} / {{max}} lb',
                w: Math.round(carried * 10) / 10,
                max: scores.str * 15,
              })}
            />
          ),
          story: <Story c={c} set={set} />,
          advisor: <Advisor c={c} data={d} onApply={(fn) => update(c.id, fn)} />,
        }}
      />
      {levelling ? (
        <LevelUp5e
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
