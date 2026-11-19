/** D&D 5e spellcasting: DCs, slot tracking and the prepared list (2024: every caster prepares). */
import { useTranslation } from 'react-i18next';
import * as R from '@features/rmhcharacters/engine/dnd5e/rules';
import { ABILITY_NAMES, type Dnd5eCharacter, type Dnd5eData } from '@features/rmhcharacters/engine/types';
import { Muted, Picker, Section, StatRow } from '../controls';

type Set5e = (fn: (c: Dnd5eCharacter) => Dnd5eCharacter) => void;

function SlotBoxes({ total, used, onChange, label }: { total: number; used: number; onChange: (n: number) => void; label: string }) {
  return (
    <div className="flex items-center gap-1.5" role="group" aria-label={label}>
      {Array.from({ length: total }, (_, i) => (
        <input
          key={i}
          type="checkbox"
          className="size-5"
          checked={i < used}
          aria-label={`${label} ${i + 1}`}
          onChange={() => onChange(i < used ? i : i + 1)}
        />
      ))}
    </div>
  );
}

export function Spells5e({ c, d, set }: { c: Dnd5eCharacter; d: Dnd5eData; set: Set5e }) {
  const { t } = useTranslation('c-rmhcharacters');
  const casters = R.casters(c, d);
  const slots = R.spellSlots(c, d);
  const pact = R.pactSlots(c);
  const maxLevel = R.maxSpellLevel(c, d);
  const always = new Set(R.alwaysPreparedSpells(c, d));

  if (!casters.length) {
    return (
      <Section title={t('sp5.title', { defaultValue: 'Spellcasting' })}>
        <Muted>{t('sp5.none', { defaultValue: 'This character has no Spellcasting feature yet. Feats like Magic Initiate, or species traits, grant spells you can note under Story → Homebrew.' })}</Muted>
      </Section>
    );
  }

  const toggle = (id: string) =>
    set((x) => {
      const on = x.spells.prepared.includes(id);
      return {
        ...x,
        spells: {
          ...x.spells,
          prepared: on ? x.spells.prepared.filter((s) => s !== id) : [...x.spells.prepared, id],
          known: on || x.spells.known.includes(id) ? x.spells.known : [...x.spells.known, id],
        },
      };
    });

  return (
    <div className="flex flex-col gap-2">
      <Section title={t('sp5.title', { defaultValue: 'Spellcasting' })}>
        {casters.map((k) => {
          const cantrips = c.spells.prepared.filter((id) => d.spells.find((s) => s.id === id && s.level === 0 && s.classes.includes(k.casting.list))).length;
          const prepared = c.spells.prepared.filter((id) => d.spells.find((s) => s.id === id && s.level > 0 && s.classes.includes(k.casting.list))).length;
          return (
            <StatRow
              key={k.classId}
              label={`${k.name} ${k.level} · ${ABILITY_NAMES[k.ability]}`}
              value={t('sp5.dcAttack', { defaultValue: 'DC {{dc}} · {{attack}} to hit', dc: k.saveDc, attack: R.signed(k.attack) })}
              note={t('sp5.counts', { defaultValue: 'Cantrips {{c}}/{{cmax}} · Prepared {{p}}/{{pmax}}', c: cantrips, cmax: k.cantrips, p: prepared, pmax: k.prepared })}
            />
          );
        })}
      </Section>
      <Section title={t('sp5.slots', { defaultValue: 'Spell slots' })}>
        {slots.map((n, i) => (
          <div key={i} className="flex items-center justify-between border-b border-app-border py-2 last:border-b-0">
            <span className="text-sm text-app-text-muted">{t('sp5.level', { defaultValue: 'Level {{n}}', n: i + 1 })}</span>
            <SlotBoxes
              total={n}
              used={c.spells.slotsUsed[i] ?? 0}
              label={t('sp5.level', { defaultValue: 'Level {{n}}', n: i + 1 })}
              onChange={(u) => set((x) => ({ ...x, spells: { ...x.spells, slotsUsed: x.spells.slotsUsed.map((v, j) => (j === i ? u : v)) } }))}
            />
          </div>
        ))}
        {pact ? (
          <div className="flex items-center justify-between py-2">
            <span className="text-sm text-app-text-muted">{t('sp5.pact', { defaultValue: 'Pact Magic (level {{n}})', n: pact.level })}</span>
            <SlotBoxes total={pact.slots} used={c.spells.pactSlotsUsed} label={t('sp5.pactShort', { defaultValue: 'Pact slot' })} onChange={(u) => set((x) => ({ ...x, spells: { ...x.spells, pactSlotsUsed: u } }))} />
          </div>
        ) : null}
        {!slots.length && !pact ? <Muted>{t('sp5.noSlots', { defaultValue: 'No spell slots at this level.' })}</Muted> : null}
      </Section>
      {always.size ? (
        <Section title={t('sp5.always', { defaultValue: 'Always prepared' })}>
          <Muted>{[...always].map((id) => d.spells.find((s) => s.id === id)?.name ?? id).join(', ')}</Muted>
        </Section>
      ) : null}
      {casters.map((k) => {
        const list = d.spells
          .filter((s) => s.classes.includes(k.casting.list) && s.level <= maxLevel && !always.has(s.id))
          .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name))
          .map((s) => ({
            id: s.id,
            name: s.name,
            meta: `${s.level === 0 ? t('sp5.cantrip', { defaultValue: 'Cantrip' }) : t('sp5.level', { defaultValue: 'Level {{n}}', n: s.level })} · ${s.school} · ${s.castingTime}${s.concentration ? ' · C' : ''}${s.ritual ? ' · R' : ''}`,
            text: `${s.range} · ${s.components} · ${s.duration}\n\n${s.text}${s.higher ? `\n\n${s.higher}` : ''}`,
          }));
        return (
          <Section key={k.classId} title={t('sp5.listFor', { defaultValue: '{{name}} spells', name: k.name })}>
            <Picker
              items={list}
              selected={c.spells.prepared}
              onToggle={toggle}
              placeholder={t('sp5.search', { defaultValue: 'Search spells by name or school' })}
              emptyText={t('sp5.noMatch', { defaultValue: 'No spells match.' })}
            />
          </Section>
        );
      })}
    </div>
  );
}
