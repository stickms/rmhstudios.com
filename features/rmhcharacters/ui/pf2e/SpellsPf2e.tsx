/** Pathfinder 2e spellcasting: attack and DC, slots per rank, repertoire/spellbook and focus spells. */
import { useTranslation } from 'react-i18next';
import * as R from '@features/rmhcharacters/engine/pf2e/rules';
import type { Pf2eCharacter, Pf2eData } from '@features/rmhcharacters/engine/types';
import { pending } from '@features/rmhcharacters/engine/pending';
import { Muted, Picker, Section, StatRow } from '../controls';

type SetPf = (fn: (c: Pf2eCharacter) => Pf2eCharacter) => void;

export function SpellsPf2e({ c, d, set }: { c: Pf2eCharacter; d: Pf2eData; set: SetPf }) {
  const { t } = useTranslation('c-rmhcharacters');
  const sc = R.spellcasting(c, d);
  const focus = d.spells.filter((s) => s.focus && (!s.owner || s.owner === c.classId));
  const toggleIn = (key: 'known' | 'focusSpells') => (id: string) =>
    set((x) => ({ ...x, spells: { ...x.spells, [key]: x.spells[key].includes(id) ? x.spells[key].filter((s) => s !== id) : [...x.spells[key], id] } }));

  return (
    <div className="flex flex-col gap-2">
      {sc ? (
        <>
          <Section title={t('pfs.title', { defaultValue: 'Spellcasting' })} needs={pending(c, d).spells}>
            <StatRow label={t('pfs.tradition', { defaultValue: '{{tradition}} {{type}} ({{rank}})', tradition: sc.tradition, type: sc.type, rank: R.RANK_NAMES[sc.rank] })} value={t('pfs.dc', { defaultValue: 'DC {{dc}} · {{attack}} attack', dc: sc.dc, attack: R.signed(sc.attack) })} />
            <StatRow label={t('pfs.cantrips', { defaultValue: 'Cantrips (heightened to rank {{r}})', r: sc.maxRank })} value={sc.cantrips} />
            {sc.slots.map((n, i) =>
              n ? (
                <div key={i} className="flex items-center justify-between border-b border-app-border py-2 last:border-b-0">
                  <span className="text-sm text-app-text-muted">{t('pfs.rank', { defaultValue: 'Rank {{n}}', n: i + 1 })}</span>
                  <div className="flex items-center gap-1.5" role="group" aria-label={t('pfs.rank', { defaultValue: 'Rank {{n}}', n: i + 1 })}>
                    {Array.from({ length: n }, (_, j) => {
                      const used = c.spells.slotsUsed[String(i + 1)] ?? 0;
                      return (
                        <input
                          key={j}
                          type="checkbox"
                          className="size-5"
                          checked={j < used}
                          aria-label={`${t('pfs.rank', { defaultValue: 'Rank {{n}}', n: i + 1 })} ${j + 1}`}
                          onChange={() => set((x) => ({ ...x, spells: { ...x.spells, slotsUsed: { ...x.spells.slotsUsed, [String(i + 1)]: j < used ? j : j + 1 } } }))}
                        />
                      );
                    })}
                  </div>
                </div>
              ) : null,
            )}
          </Section>
          <Section title={sc.type === 'prepared' ? t('pfs.book', { defaultValue: 'Spellbook / prepared list' }) : t('pfs.repertoire', { defaultValue: 'Repertoire' })}>
            <Muted className="mb-2">{t('pfs.listHint', { defaultValue: 'Spells of the {{tradition}} tradition up to rank {{r}}.', tradition: sc.tradition, r: sc.maxRank })}</Muted>
            <Picker
              items={d.spells
                .filter((s) => !s.focus && s.traditions.map((x) => x.toLowerCase()).includes(sc.tradition) && s.rank <= sc.maxRank)
                .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name))
                .map((s) => ({
                  id: s.id,
                  name: s.name,
                  meta: `${s.rank === 0 ? t('sp5.cantrip', { defaultValue: 'Cantrip' }) : t('pfs.rank', { defaultValue: 'Rank {{n}}', n: s.rank })} · ${s.actions} · ${s.traits.join(', ')}`,
                  text: [s.range && `Range ${s.range}`, s.area && `Area ${s.area}`, s.targets && `Targets ${s.targets}`, s.defense && `Defense ${s.defense}`, s.duration && `Duration ${s.duration}`].filter(Boolean).join(' · ') + `\n\n${s.text}${s.heightened ? `\n\n${s.heightened}` : ''}`,
                }))}
              selected={c.spells.known}
              onToggle={toggleIn('known')}
              placeholder={t('sp5.search', { defaultValue: 'Search spells by name or school' })}
              emptyText={t('sp5.noMatch', { defaultValue: 'No spells match.' })}
            />
          </Section>
        </>
      ) : (
        <Section title={t('pfs.title', { defaultValue: 'Spellcasting' })}>
          <Muted>{t('pfs.none', { defaultValue: 'This class does not cast spells. Focus spells from a class feature or an archetype go below.' })}</Muted>
        </Section>
      )}
      <Section title={t('pfs.focus', { defaultValue: 'Focus spells' })} action={<span className="font-mono text-xs text-app-text-muted">{t('pfs.pool', { defaultValue: 'Pool {{n}}', n: R.focusPointsMax(c) })}</span>}>
        <Picker
          items={focus.map((s) => ({ id: s.id, name: s.name, meta: `${s.owner ?? ''} · ${s.actions}`, text: `${s.text}${s.heightened ? `\n\n${s.heightened}` : ''}` }))}
          selected={c.spells.focusSpells}
          onToggle={toggleIn('focusSpells')}
          placeholder={t('pfs.focusSearch', { defaultValue: 'Search focus spells' })}
          emptyText={t('pfs.noFocus', { defaultValue: 'No focus spells for this class in the data set. Add one under Story → Homebrew.' })}
        />
      </Section>
    </div>
  );
}
