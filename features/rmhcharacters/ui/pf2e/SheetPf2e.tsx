/** The computed Pathfinder 2e sheet, with HP, hero points, dying/wounded and conditions. */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import * as R from '@features/rmhcharacters/engine/pf2e/rules';
import { ABILITIES, ABILITY_NAMES, type Pf2eCharacter, type Pf2eData } from '@features/rmhcharacters/engine/types';
import { PF2E_CONDITIONS } from '@features/rmhcharacters/engine/conditions';
import { Chip, Issues, Muted, Section, StatRow, Stepper } from '../controls';
import { RollButton } from '../RollButton';
import { RollsContext } from '../useRolls';

type SetPf = (fn: (c: Pf2eCharacter) => Pf2eCharacter) => void;

/**
 * `readOnly` is the game master's view of a player's shared sheet: no tracker, no condition toggles, no rules check and
 * no roll buttons (an empty roll context makes each one show its value only). `set` is then never called.
 */
export function SheetPf2e(props: { c: Pf2eCharacter; d: Pf2eData; set: SetPf; readOnly?: boolean }) {
  return props.readOnly ? (
    <RollsContext.Provider value={null}>
      <SheetPf2eBody {...props} />
    </RollsContext.Provider>
  ) : (
    <SheetPf2eBody {...props} />
  );
}

function SheetPf2eBody({
  c,
  d,
  set,
  readOnly = false,
}: {
  c: Pf2eCharacter;
  d: Pf2eData;
  set: SetPf;
  readOnly?: boolean;
}) {
  const { t } = useTranslation('c-rmhcharacters');
  const [amount, setAmount] = useState('');
  const mods = R.attributeMods(c);
  const maxHp = R.maxHp(c, d);
  const ac = R.armorClass(c, d);
  const per = R.perception(c, d);
  const klass = R.classOf(d, c);
  const bulk = R.bulk(c);
  const saveRow = (k: 'fortitude' | 'reflex' | 'will', label: string) => {
    const s = R.save(c, d, k);
    return (
      <StatRow
        label={`${label} (${R.RANK_LETTER[s.rank]})`}
        value={
          <RollButton kind="save" name={label} bonus={s.bonus} which={k}>
            {R.signed(s.bonus)}
          </RollButton>
        }
      />
    );
  };
  const applyHp = (sign: 1 | -1) => {
    const n = Math.max(0, Math.floor(Number(amount) || 0));
    if (!n) return;
    set((x) => {
      if (sign === 1) return { ...x, hp: { ...x.hp, current: Math.min(maxHp, x.hp.current + n) } };
      const fromTemp = Math.min(x.hp.temp, n);
      const current = Math.max(0, x.hp.current - (n - fromTemp));
      // Dropping to 0 HP: dying 1 + wounded (Player Core, "Dying").
      const dying = current === 0 && x.hp.current > 0 ? Math.min(4, 1 + x.wounded) : x.dying;
      return { ...x, hp: { temp: x.hp.temp - fromTemp, current }, dying };
    });
    setAmount('');
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="rmhc-abilities">
        {ABILITIES.map((a) => (
          <div key={a} className="rmhc-stat">
            <div className="text-xs font-medium text-app-text-muted">{ABILITY_NAMES[a]}</div>
            <div className="font-mono text-2xl tabular-nums text-app-text">
              <RollButton kind="check" name={ABILITY_NAMES[a]} bonus={mods[a]} which={a}>
                {R.signed(mods[a])}
              </RollButton>
              {R.partialBoosts(c).includes(a) ? '½' : ''}
            </div>
          </div>
        ))}
      </div>
      <div className="rmhc-columns">
        <div>
          <Section title={t('sp.defense', { defaultValue: 'Defenses' })}>
            <StatRow
              label={`${t('s5.ac', { defaultValue: 'Armor Class' })} (${R.RANK_LETTER[ac.rank]})`}
              value={ac.value}
              note={ac.formula}
            />
            <StatRow
              label={t('s5.hp', { defaultValue: 'Hit Points' })}
              value={`${c.hp.current} / ${maxHp}${c.hp.temp ? ` (+${c.hp.temp})` : ''}`}
            />
            {saveRow('fortitude', t('sp.fort', { defaultValue: 'Fortitude' }))}
            {saveRow('reflex', t('sp.ref', { defaultValue: 'Reflex' }))}
            {saveRow('will', t('sp.will', { defaultValue: 'Will' }))}
            <StatRow
              label={`${t('sp.perception', { defaultValue: 'Perception' })} (${R.RANK_LETTER[per.rank]})`}
              value={
                <RollButton kind="perception" bonus={per.bonus}>
                  {R.signed(per.bonus)}
                </RollButton>
              }
              note={R.ancestryOf(d, c)?.senses}
            />
            <StatRow label={t('sp.classDc', { defaultValue: 'Class DC' })} value={R.classDc(c, d).value} />
            <StatRow label={t('s5.speed', { defaultValue: 'Speed' })} value={`${R.speed(c, d)} ft`} />
            <StatRow
              label={t('sp.bulk', { defaultValue: 'Bulk' })}
              value={`${bulk.carried} / ${bulk.encumbered}`}
              note={t('sp.bulkMax', {
                defaultValue: 'Encumbered above {{e}}, maximum {{m}}',
                e: bulk.encumbered,
                m: bulk.max,
              })}
            />
          </Section>

          {readOnly ? null : (
            <Section title={t('s5.tracker', { defaultValue: 'Hit point tracker' })} className="rmhc-noprint">
              <div className="flex flex-wrap items-end gap-2">
                <Input
                  type="number"
                  min={0}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  aria-label={t('s5.amount', { defaultValue: 'Amount' })}
                  className="w-24"
                />
                <Button type="button" onClick={() => applyHp(-1)}>
                  {t('s5.damage', { defaultValue: 'Damage' })}
                </Button>
                <Button type="button" onClick={() => applyHp(1)}>
                  {t('s5.heal', { defaultValue: 'Heal' })}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => set((x) => ({ ...x, hp: { current: maxHp, temp: x.hp.temp } }))}
                >
                  {t('s5.full', { defaultValue: 'Full' })}
                </Button>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {(
                  [
                    ['temp', t('s5.temp', { defaultValue: 'Temporary HP' }), c.hp.temp, 999],
                    ['heroPoints', t('sp.hero', { defaultValue: 'Hero Points' }), c.heroPoints, 3],
                    [
                      'focusPoints',
                      t('sp.focus', { defaultValue: 'Focus Points' }),
                      c.focusPoints,
                      Math.max(0, R.focusPointsMax(c)),
                    ],
                    ['dying', t('sp.dying', { defaultValue: 'Dying' }), c.dying, 4],
                    ['wounded', t('sp.wounded', { defaultValue: 'Wounded' }), c.wounded, 4],
                  ] as const
                ).map(([key, label, value, max]) => (
                  <div key={key} className="flex items-center justify-between gap-2 text-sm text-app-text-muted">
                    {label}
                    <Stepper
                      label={label}
                      value={value}
                      max={max}
                      onChange={(n) =>
                        set((x) => (key === 'temp' ? { ...x, hp: { ...x.hp, temp: n } } : { ...x, [key]: n }))
                      }
                    />
                  </div>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Chip on={c.shieldRaised} onToggle={() => set((x) => ({ ...x, shieldRaised: !x.shieldRaised }))}>
                  {t('sp.raise', { defaultValue: 'Shield raised' })}
                </Chip>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() =>
                    set((x) => ({
                      ...x,
                      hp: { current: Math.min(maxHp, x.hp.current + Math.max(1, mods.con) * x.level), temp: 0 },
                      spells: { ...x.spells, slotsUsed: {} },
                      focusPoints: R.focusPointsMax(x),
                      wounded: 0,
                    }))
                  }
                >
                  {t('sp.rest', { defaultValue: 'Rest 8 hours' })}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => set((x) => ({ ...x, focusPoints: Math.min(R.focusPointsMax(x), x.focusPoints + 1) }))}
                >
                  {t('sp.refocus', { defaultValue: 'Refocus' })}
                </Button>
              </div>
            </Section>
          )}

          <Section title={t('s5.conditions', { defaultValue: 'Conditions' })}>
            {readOnly ? (
              <Muted>
                {c.conditions.filter((x) => (PF2E_CONDITIONS as readonly string[]).includes(x)).join(', ') || '—'}
              </Muted>
            ) : (
              <div className="flex flex-wrap gap-2">
                {PF2E_CONDITIONS.map((cond) => (
                  <Chip
                    key={cond}
                    on={c.conditions.includes(cond)}
                    onToggle={() =>
                      set((x) => ({
                        ...x,
                        conditions: x.conditions.includes(cond)
                          ? x.conditions.filter((y) => y !== cond)
                          : [...x.conditions, cond],
                      }))
                    }
                  >
                    {cond}
                  </Chip>
                ))}
              </div>
            )}
          </Section>

          <Section title={t('sp.strikes', { defaultValue: 'Strikes' })}>
            {R.strikes(c, d).map((s, strikeIndex) => (
              <StatRow
                key={s.name}
                label={s.name}
                value={
                  <span className="inline-flex flex-wrap items-center justify-end gap-2">
                    {s.attack.map((bonus, i) => (
                      <RollButton
                        key={i}
                        kind="strike"
                        name={s.name}
                        bonus={bonus}
                        damage={s.damage}
                        step={(i + 1) as 1 | 2 | 3}
                        which={strikeIndex}
                      >
                        {R.signed(bonus)}
                      </RollButton>
                    ))}
                    <RollButton kind="damage" name={s.name} damage={s.damage} which={strikeIndex}>
                      {s.damage}
                    </RollButton>
                  </span>
                }
                note={s.traits}
              />
            ))}
          </Section>
        </div>

        <div>
          <Section title={t('s5.skills', { defaultValue: 'Skills' })}>
            {R.skillLines(c, d).map((s) => (
              <StatRow
                key={s.id}
                label={`${s.name} (${R.RANK_LETTER[s.rank]})`}
                value={
                  <RollButton kind="skill" name={s.name} bonus={s.bonus} which={s.id}>
                    {R.signed(s.bonus)}
                  </RollButton>
                }
                {...(s.armorPenalty
                  ? { note: t('sp.armorPenalty', { defaultValue: 'armor {{n}}', n: s.armorPenalty }) }
                  : {})}
              />
            ))}
          </Section>
          {readOnly ? null : (
            <Section title={t('s5.check', { defaultValue: 'Rules check' })} className="rmhc-noprint">
              <Issues issues={R.validate(c, d)} />
            </Section>
          )}
          <Section title={t('sp.featsTitle', { defaultValue: 'Feats' })}>
            <ul className="flex flex-col">
              {c.feats.map((f) => {
                const feat = d.feats.find((x) => x.id === f.featId);
                return (
                  <li key={f.slot} className="border-b border-app-border py-2 text-sm last:border-b-0">
                    <span className="font-medium text-app-text">{feat?.name ?? f.customName}</span>{' '}
                    <span className="font-mono text-xs text-app-text-muted">{f.slot}</span>
                    {feat ? <p className="text-app-text-muted">{feat.text}</p> : null}
                  </li>
                );
              })}
            </ul>
          </Section>
          <Section title={t('sp.classFeatures', { defaultValue: 'Class and ancestry features' })}>
            <ul className="flex flex-col">
              {[
                ...(R.ancestryOf(d, c)?.features ?? []).map((f) => ({ ...f, level: 1 })),
                ...(R.heritageOf(d, c)
                  ? [{ name: R.heritageOf(d, c)!.name, text: R.heritageOf(d, c)!.text, level: 1 }]
                  : []),
                ...(klass?.features ?? []).filter((f) => f.level <= c.level),
              ].map((f, i) => (
                <li key={`${f.name}-${i}`} className="border-b border-app-border py-2 text-sm last:border-b-0">
                  <span className="font-medium text-app-text">{f.name}</span>{' '}
                  <span className="font-mono text-xs text-app-text-muted">{f.level}</span>
                  <p className="text-app-text-muted">{f.text}</p>
                </li>
              ))}
              {c.custom.map((e) => (
                <li key={e.id} className="border-b border-app-border py-2 text-sm last:border-b-0">
                  <span className="font-medium text-app-text">{e.name}</span>{' '}
                  <span className="font-mono text-xs text-app-text-muted">{e.kind}</span>
                  <p className="rmhc-prose text-app-text-muted">{e.text}</p>
                </li>
              ))}
            </ul>
            {!klass ? <Muted>{t('sp.noClass', { defaultValue: 'Choose a class on the Build tab.' })}</Muted> : null}
          </Section>
        </div>
      </div>
    </div>
  );
}
