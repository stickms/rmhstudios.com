/** The computed D&D 5e sheet, with the trackers you use at the table. */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import * as R from '@features/rmhcharacters/engine/dnd5e/rules';
import { ABILITIES, ABILITY_NAMES, type Dnd5eCharacter, type Dnd5eData } from '@features/rmhcharacters/engine/types';
import { Chip, Issues, Muted, Section, StatRow, Stepper } from '../controls';

/** SRD 5.2 conditions. */
export const DND5E_CONDITIONS = [
  'Blinded', 'Charmed', 'Deafened', 'Frightened', 'Grappled', 'Incapacitated', 'Invisible',
  'Paralyzed', 'Petrified', 'Poisoned', 'Prone', 'Restrained', 'Stunned', 'Unconscious',
];

type Set5e = (fn: (c: Dnd5eCharacter) => Dnd5eCharacter) => void;

export function Sheet5e({ c, d, set }: { c: Dnd5eCharacter; d: Dnd5eData; set: Set5e }) {
  const { t } = useTranslation('c-rmhcharacters');
  const [amount, setAmount] = useState('');
  const scores = R.abilityScores(c, d);
  const level = R.totalLevel(c);
  const pb = R.proficiencyBonus(level);
  const saves = R.saveProficiencies(c, d);
  const maxHp = R.maxHp(c, d);
  const ac = R.armorClass(c, d);
  const skills = R.skillLines(c, d);
  const perception = skills.find((s) => s.id === 'perception')?.bonus ?? 0;
  const dice = R.hitDice(c, d);
  const totalDice = dice.reduce((n, x) => n + x.count, 0);

  const applyHp = (sign: 1 | -1) => {
    const n = Math.max(0, Math.floor(Number(amount) || 0));
    if (!n) return;
    set((x) => {
      if (sign === 1) return { ...x, hp: { ...x.hp, current: Math.min(maxHp, x.hp.current + n) }, deathSaves: { successes: 0, failures: 0 } };
      const fromTemp = Math.min(x.hp.temp, n);
      return { ...x, hp: { temp: x.hp.temp - fromTemp, current: Math.max(0, x.hp.current - (n - fromTemp)) } };
    });
    setAmount('');
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="rmhc-abilities">
        {ABILITIES.map((a) => {
          const mod = R.abilityMod(scores[a]);
          return (
            <div key={a} className="rmhc-stat">
              <div className="text-xs font-medium text-app-text-muted">{ABILITY_NAMES[a]}</div>
              <div className="font-mono text-2xl tabular-nums text-app-text">{R.signed(mod)}</div>
              <div className="font-mono text-xs text-app-text-muted">{scores[a]}</div>
              <div className="mt-1 border-t border-app-border pt-1 font-mono text-xs text-app-text-muted">
                {t('s5.save', { defaultValue: 'Save' })} {R.signed(mod + (saves.includes(a) ? pb : 0))}
                {saves.includes(a) ? ' ●' : ''}
              </div>
            </div>
          );
        })}
      </div>

      <div className="rmhc-columns">
        <div>
          <Section title={t('s5.combat', { defaultValue: 'Combat' })}>
            <StatRow label={t('s5.ac', { defaultValue: 'Armor Class' })} value={ac.value} note={ac.formula} />
            <StatRow label={t('s5.hp', { defaultValue: 'Hit Points' })} value={`${c.hp.current} / ${maxHp}${c.hp.temp ? ` (+${c.hp.temp})` : ''}`} />
            <StatRow label={t('s5.init', { defaultValue: 'Initiative' })} value={R.signed(R.initiative(c, d))} />
            <StatRow label={t('s5.speed', { defaultValue: 'Speed' })} value={`${R.speed(c, d)} ft`} />
            <StatRow label={t('s5.pb', { defaultValue: 'Proficiency Bonus' })} value={R.signed(pb)} />
            <StatRow label={t('s5.passive', { defaultValue: 'Passive Perception' })} value={10 + perception} />
            <StatRow label={t('s5.hitDice', { defaultValue: 'Hit Dice' })} value={`${totalDice - c.hitDiceUsed} / ${totalDice}`} note={dice.map((x) => `${x.count}d${x.die}`).join(' + ')} />
          </Section>

          <Section title={t('s5.tracker', { defaultValue: 'Hit point tracker' })} className="rmhc-noprint">
            <div className="flex flex-wrap items-end gap-2">
              <Input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} aria-label={t('s5.amount', { defaultValue: 'Amount' })} className="w-24" />
              <Button type="button" onClick={() => applyHp(-1)}>{t('s5.damage', { defaultValue: 'Damage' })}</Button>
              <Button type="button" onClick={() => applyHp(1)}>{t('s5.heal', { defaultValue: 'Heal' })}</Button>
              <Button type="button" variant="ghost" onClick={() => set((x) => ({ ...x, hp: { current: maxHp, temp: x.hp.temp } }))}>{t('s5.full', { defaultValue: 'Full' })}</Button>
            </div>
            <div className="mt-3 flex flex-wrap gap-4">
              <div className="flex items-center gap-2 text-sm text-app-text-muted">
                {t('s5.temp', { defaultValue: 'Temporary HP' })}
                <Stepper label={t('s5.temp', { defaultValue: 'Temporary HP' })} value={c.hp.temp} max={999} onChange={(n) => set((x) => ({ ...x, hp: { ...x.hp, temp: n } }))} />
              </div>
              <div className="flex items-center gap-2 text-sm text-app-text-muted">
                {t('s5.hitDiceUsed', { defaultValue: 'Hit Dice spent' })}
                <Stepper label={t('s5.hitDiceUsed', { defaultValue: 'Hit Dice spent' })} value={c.hitDiceUsed} max={totalDice} onChange={(n) => set((x) => ({ ...x, hitDiceUsed: n }))} />
              </div>
            </div>
            {c.hp.current === 0 ? (
              <div className="mt-3 flex flex-wrap gap-4">
                <div className="flex items-center gap-2 text-sm text-app-text-muted">
                  {t('s5.successes', { defaultValue: 'Death save successes' })}
                  <Stepper label={t('s5.successes', { defaultValue: 'Death save successes' })} value={c.deathSaves.successes} max={3} onChange={(n) => set((x) => ({ ...x, deathSaves: { ...x.deathSaves, successes: n } }))} />
                </div>
                <div className="flex items-center gap-2 text-sm text-app-text-muted">
                  {t('s5.failures', { defaultValue: 'Failures' })}
                  <Stepper label={t('s5.failures', { defaultValue: 'Failures' })} value={c.deathSaves.failures} max={3} onChange={(n) => set((x) => ({ ...x, deathSaves: { ...x.deathSaves, failures: n } }))} />
                </div>
              </div>
            ) : null}
            <div className="mt-3 flex flex-wrap items-center gap-4">
              <Chip on={c.heroicInspiration} onToggle={() => set((x) => ({ ...x, heroicInspiration: !x.heroicInspiration }))}>
                {t('s5.inspiration', { defaultValue: 'Heroic Inspiration' })}
              </Chip>
              <div className="flex items-center gap-2 text-sm text-app-text-muted">
                {t('s5.exhaustion', { defaultValue: 'Exhaustion' })}
                <Stepper label={t('s5.exhaustion', { defaultValue: 'Exhaustion' })} value={c.exhaustion} max={6} onChange={(n) => set((x) => ({ ...x, exhaustion: n }))} />
              </div>
              <Button
                type="button"
                variant="ghost"
                onClick={() =>
                  set((x) => ({
                    ...x,
                    hp: { current: maxHp, temp: 0 },
                    hitDiceUsed: Math.max(0, x.hitDiceUsed - Math.max(1, Math.floor(totalDice / 2))),
                    spells: { ...x.spells, slotsUsed: x.spells.slotsUsed.map(() => 0), pactSlotsUsed: 0 },
                    exhaustion: Math.max(0, x.exhaustion - 1),
                    deathSaves: { successes: 0, failures: 0 },
                  }))
                }
              >
                {t('s5.longRest', { defaultValue: 'Long Rest' })}
              </Button>
              <Button type="button" variant="ghost" onClick={() => set((x) => ({ ...x, spells: { ...x.spells, pactSlotsUsed: 0 } }))}>
                {t('s5.shortRest', { defaultValue: 'Short Rest' })}
              </Button>
            </div>
            {c.exhaustion ? <Muted className="mt-2">{t('s5.exhaustionRule', { defaultValue: 'Exhaustion: −{{n}} to every d20 test and −{{speed}} ft speed.', n: c.exhaustion * 2, speed: c.exhaustion * 5 })}</Muted> : null}
          </Section>

          <Section title={t('s5.conditions', { defaultValue: 'Conditions' })}>
            <div className="flex flex-wrap gap-2">
              {DND5E_CONDITIONS.map((cond) => (
                <Chip key={cond} on={c.conditions.includes(cond)} onToggle={() => set((x) => ({ ...x, conditions: x.conditions.includes(cond) ? x.conditions.filter((y) => y !== cond) : [...x.conditions, cond] }))}>
                  {cond}
                </Chip>
              ))}
            </div>
          </Section>

          <Section title={t('s5.attacks', { defaultValue: 'Attacks' })}>
            {R.attacks(c, d).map((a) => (
              <StatRow key={a.name} label={a.name} value={`${R.signed(a.toHit)} · ${a.damage}`} note={a.notes} />
            ))}
          </Section>

          {R.resources(c, d).length ? (
            <Section title={t('s5.resources', { defaultValue: 'Class resources' })}>
              {R.resources(c, d).map((r) => (
                <StatRow key={r.name} label={r.name} value={r.value} {...(r.recharge ? { note: r.recharge } : {})} />
              ))}
            </Section>
          ) : null}
        </div>

        <div>
          <Section title={t('s5.skills', { defaultValue: 'Skills' })}>
            {skills.map((s) => (
              <StatRow key={s.id} label={`${s.proficient ? (s.expertise ? '◆ ' : '● ') : ''}${s.name} (${s.ability.toUpperCase()})`} value={R.signed(s.bonus)} />
            ))}
          </Section>
          <Section title={t('s5.check', { defaultValue: 'Rules check' })} className="rmhc-noprint">
            <Issues issues={R.validate(c, d)} />
          </Section>
          <Section title={t('s5.features', { defaultValue: 'Features and traits' })}>
            <ul className="flex flex-col">
              {R.features(c, d).map((f, i) => (
                <li key={`${f.source}-${f.name}-${i}`} className="border-b border-app-border py-2 text-sm last:border-b-0">
                  <span className="font-medium text-app-text">{f.name}</span> <span className="font-mono text-xs text-app-text-muted">{f.source}{f.level > 1 ? ` ${f.level}` : ''}</span>
                  <p className="text-app-text-muted">{f.text}</p>
                </li>
              ))}
              {c.custom.map((e) => (
                <li key={e.id} className="border-b border-app-border py-2 text-sm last:border-b-0">
                  <span className="font-medium text-app-text">{e.name}</span> <span className="font-mono text-xs text-app-text-muted">{e.kind}</span>
                  <p className="rmhc-prose text-app-text-muted">{e.text}</p>
                </li>
              ))}
            </ul>
          </Section>
        </div>
      </div>
    </div>
  );
}
