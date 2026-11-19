/** D&D 5e (2024) build: species, background, classes, abilities, improvements, skills, mastery. */
import { useState } from 'react';
import { Dices, Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import * as R from '@features/rmhcharacters/engine/dnd5e/rules';
import { DND5E_SKILLS } from '@features/rmhcharacters/engine/dnd5e/skills';
import { ABILITIES, ABILITY_NAMES, type Ability, type Dnd5eAsiChoice, type Dnd5eCharacter, type Dnd5eData } from '@features/rmhcharacters/engine/types';
import { Chip, Field, Muted, nativeSelectClass, Needs, Section, Stepper, warnIf } from '../controls';

type Set5e = (fn: (c: Dnd5eCharacter) => Dnd5eCharacter) => void;

function roll4d6(): number {
  const r = Array.from({ length: 4 }, () => 1 + Math.floor(Math.random() * 6)).sort((a, b) => a - b);
  return r[1]! + r[2]! + r[3]!;
}

export function Build5e({ c, d, set }: { c: Dnd5eCharacter; d: Dnd5eData; set: Set5e }) {
  const { t } = useTranslation('c-rmhcharacters');
  const species = d.species.find((s) => s.id === c.speciesId);
  const bg = d.backgrounds.find((b) => b.id === c.backgroundId);
  const scores = R.abilityScores(c, d);
  const level = R.totalLevel(c);
  const originFeats = d.feats.filter((f) => f.category === 'origin');

  /* ---------------- background ---------------- */
  const setBackground = (id: string) =>
    set((x) => {
      const old = d.backgrounds.find((b) => b.id === x.backgroundId);
      const next = d.backgrounds.find((b) => b.id === id);
      const skills = x.skills.filter((s) => !old?.skills.includes(s as never));
      const origin = x.originFeats.filter((f) => f !== old?.featId);
      return {
        ...x,
        backgroundId: id,
        backgroundIncreases: next ? [next.abilities[0], next.abilities[0], next.abilities[1]] : [],
        skills: next ? [...new Set([...skills, ...next.skills])] : skills,
        originFeats: next ? [next.featId, ...origin.filter((f) => f !== next.featId)] : origin,
        tools: next ? [...new Set([...x.tools.filter((tl) => tl !== old?.tool), next.tool])] : x.tools,
      };
    });
  const incMode = new Set(c.backgroundIncreases).size === 3 ? 'spread' : 'focus';
  const plus2 = incMode === 'focus' ? c.backgroundIncreases.find((a, i, arr) => arr.indexOf(a) !== i) : undefined;
  const plus1 = incMode === 'focus' ? c.backgroundIncreases.find((a) => a !== plus2) : undefined;

  /* ---------------- classes ---------------- */
  const setClassLevel = (classId: string, lvl: number) =>
    set((x) => ({ ...x, classes: x.classes.map((k) => (k.classId === classId ? { ...k, level: lvl, hpRolls: k.hpRolls.slice(0, x.classes[0]?.classId === classId ? lvl - 1 : lvl) } : k)) }));
  const addClass = (classId: string) =>
    set((x) => {
      if (!classId || x.classes.some((k) => k.classId === classId)) return x;
      const next = { ...x, classes: [...x.classes, { classId, level: 1, hpRolls: [] }] };
      // A new character starts at full HP; a multiclass level adds what it grants.
      const gained = R.maxHp(next, d) - (x.classes.length ? R.maxHp(x, d) : 0);
      return { ...next, hp: { ...x.hp, current: Math.max(0, x.hp.current) + gained } };
    });
  const removeClass = (classId: string) =>
    set((x) => ({
      ...x,
      classes: x.classes.filter((k) => k.classId !== classId),
      asi: x.asi.filter((a) => !a.slot.startsWith(`${classId}:`)),
    }));
  const multiclassOptions = d.classes.filter((k) => !c.classes.some((x) => x.classId === k.id));

  /* ---------------- ASIs ---------------- */
  const slots = R.asiSlots(c, d);
  const setAsi = (slot: string, patch: Partial<Dnd5eAsiChoice> | null) =>
    set((x) => {
      const rest = x.asi.filter((a) => a.slot !== slot);
      if (!patch) return { ...x, asi: rest };
      const cur = x.asi.find((a) => a.slot === slot) ?? { slot, kind: 'asi' as const, abilities: [] };
      return { ...x, asi: [...rest, { ...cur, ...patch }] };
    });

  /* ---------------- skills ---------------- */
  const first = c.classes[0] ? d.classes.find((k) => k.id === c.classes[0]!.classId) : undefined;
  const classPicks = c.skills.filter((s) => !bg?.skills.includes(s as never));
  const pickAllowance = (first?.skillChoices.count ?? 0) + (species?.skillChoice?.count ?? 0) + (c.originFeats.includes('skilled') ? 3 : 0);
  const toggleSkill = (id: string) =>
    set((x) => ({
      ...x,
      skills: x.skills.includes(id) ? x.skills.filter((s) => s !== id) : [...x.skills, id],
      expertise: x.skills.includes(id) ? x.expertise.filter((s) => s !== id) : x.expertise,
    }));

  const masteryCount = c.classes.reduce((n, k) => {
    const klass = d.classes.find((x) => x.id === k.classId);
    return n + (klass?.weaponMastery?.[k.level - 1] ?? 0);
  }, 0);

  const extraOrigin = c.originFeats.find((f) => f !== bg?.featId);
  const needSpecies = Number(!c.speciesId) + Number(Boolean(species?.options) && !c.speciesOption) + Number(Boolean(species?.extraOriginFeat) && !extraOrigin);
  const needClasses =
    Number(c.classes.length === 0) +
    c.classes.filter((k) => {
      const klass = d.classes.find((x) => x.id === k.classId);
      return klass && k.level >= klass.subclassLevel && !k.subclassId && !k.customSubclass;
    }).length;
  const needAsi = slots.filter((slot) => {
    const ch = c.asi.find((a) => a.slot === slot);
    if (!ch) return true;
    if (ch.kind === 'asi') return (ch.abilities?.length ?? 0) < 2;
    const f = d.feats.find((x) => x.id === ch.featId);
    return !f || (Boolean(f.abilityIncrease?.length) && !ch.featAbilities?.length);
  }).length;
  const needSkills = Math.max(0, pickAllowance - classPicks.length);
  const fightingStyleClasses = c.classes.filter((k) => {
    const klass = d.classes.find((x) => x.id === k.classId);
    return klass?.features.some((f) => f.name.toLowerCase().startsWith('fighting style') && f.level <= k.level);
  });

  return (
    <div className="rmhc-columns">
      <div>
        <Section title={t('b5.species', { defaultValue: 'Species' })} needs={needSpecies}>
          <div className="flex flex-col gap-3">
            <select
              className={nativeSelectClass + warnIf(!c.speciesId)}
              aria-invalid={!c.speciesId}
              value={c.speciesId}
              aria-label={t('b5.species', { defaultValue: 'Species' })}
              onChange={(e) => {
                const s = d.species.find((x) => x.id === e.target.value);
                set((x) => ({ ...x, speciesId: e.target.value, size: s?.sizes[0] ?? 'Medium', speciesOption: '' }));
              }}
            >
              <option value="">{t('common.choose', { defaultValue: 'Choose…' })}</option>
              {d.species.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            {species ? (
              <>
                <div className="flex flex-wrap gap-3">
                  {species.sizes.length > 1 ? (
                    <Field label={t('b5.size', { defaultValue: 'Size' })}>
                      <select className={nativeSelectClass} value={c.size ?? species.sizes[0]} onChange={(e) => set((x) => ({ ...x, size: e.target.value as 'Small' | 'Medium' }))}>
                        {species.sizes.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </Field>
                  ) : null}
                  {species.options ? (
                    <Field label={species.options.label}>
                      <select className={nativeSelectClass + warnIf(!c.speciesOption)} aria-invalid={!c.speciesOption} value={c.speciesOption ?? ''} onChange={(e) => set((x) => ({ ...x, speciesOption: e.target.value }))}>
                        <option value="">{t('common.choose', { defaultValue: 'Choose…' })}</option>
                        {species.options.choices.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                  ) : null}
                </div>
                <ul className="flex flex-col">
                  {species.traits.map((tr) => (
                    <li key={tr.name} className="border-b border-app-border py-1.5 text-sm last:border-b-0">
                      <span className="font-medium text-app-text">{tr.name}.</span> <span className="text-app-text-muted">{tr.text}</span>
                    </li>
                  ))}
                </ul>
                {species.extraOriginFeat ? (
                  <Field label={t('b5.extraOrigin', { defaultValue: 'Extra Origin feat (Versatile)' })}>
                    <select
                      className={nativeSelectClass + warnIf(!extraOrigin)}
                      aria-invalid={!extraOrigin}
                      value={extraOrigin ?? ''}
                      onChange={(e) => set((x) => ({ ...x, originFeats: [...x.originFeats.filter((f) => f === bg?.featId), ...(e.target.value ? [e.target.value] : [])] }))}
                    >
                      <option value="">{t('common.choose', { defaultValue: 'Choose…' })}</option>
                      {originFeats.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                ) : null}
              </>
            ) : null}
          </div>
        </Section>

        <Section title={t('b5.background', { defaultValue: 'Background' })} needs={Number(!c.backgroundId)}>
          <div className="flex flex-col gap-3">
            <select className={nativeSelectClass + warnIf(!c.backgroundId)} aria-invalid={!c.backgroundId} value={c.backgroundId} aria-label={t('b5.background', { defaultValue: 'Background' })} onChange={(e) => setBackground(e.target.value)}>
              <option value="">{t('common.choose', { defaultValue: 'Choose…' })}</option>
              {d.backgrounds.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            {bg ? (
              <>
                <Muted>
                  {t('b5.bgGrants', {
                    defaultValue: 'Skills: {{skills}} · Tool: {{tool}} · Origin feat: {{feat}}',
                    skills: bg.skills.map((s) => DND5E_SKILLS.find((k) => k.id === s)?.name ?? s).join(', '),
                    tool: bg.tool,
                    feat: d.feats.find((f) => f.id === bg.featId)?.name ?? bg.featId,
                  })}
                </Muted>
                <div className="flex flex-wrap gap-2">
                  <Chip on={incMode === 'focus'} onToggle={() => set((x) => ({ ...x, backgroundIncreases: [bg.abilities[0], bg.abilities[0], bg.abilities[1]] }))}>
                    {t('b5.focus', { defaultValue: '+2 and +1' })}
                  </Chip>
                  <Chip on={incMode === 'spread'} onToggle={() => set((x) => ({ ...x, backgroundIncreases: [...bg.abilities] }))}>
                    {t('b5.spread', { defaultValue: '+1 to all three' })}
                  </Chip>
                </div>
                {incMode === 'focus' ? (
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="+2">
                      <select className={nativeSelectClass} value={plus2 ?? ''} onChange={(e) => {
                        const a = e.target.value as Ability;
                        const other = plus1 && plus1 !== a ? plus1 : bg.abilities.find((x) => x !== a)!;
                        set((x) => ({ ...x, backgroundIncreases: [a, a, other] }));
                      }}>
                        {bg.abilities.map((a) => (
                          <option key={a} value={a}>
                            {ABILITY_NAMES[a]}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="+1">
                      <select className={nativeSelectClass} value={plus1 ?? ''} onChange={(e) => {
                        const a = e.target.value as Ability;
                        const two = plus2 && plus2 !== a ? plus2 : bg.abilities.find((x) => x !== a)!;
                        set((x) => ({ ...x, backgroundIncreases: [two, two, a] }));
                      }}>
                        {bg.abilities.filter((a) => a !== plus2).map((a) => (
                          <option key={a} value={a}>
                            {ABILITY_NAMES[a]}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
        </Section>

        <Section title={t('b5.classes', { defaultValue: 'Classes' })} needs={needClasses} action={<span className="font-mono text-xs text-app-text-muted">{t('b5.level', { defaultValue: 'Level {{level}}', level })}</span>}>
          <ul className="flex flex-col">
            {c.classes.map((k, i) => {
              const klass = d.classes.find((x) => x.id === k.classId);
              if (!klass) return null;
              const otherLevels = level - k.level;
              return (
                <li key={k.classId} className="flex flex-col gap-2 border-b border-app-border py-3 last:border-b-0">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="min-w-24 text-base font-medium text-app-text">{klass.name}</span>
                    {i === 0 ? <span className="font-mono text-xs text-app-text-muted">{t('b5.starting', { defaultValue: 'starting class' })}</span> : null}
                    <span className="flex-1" />
                    <Stepper label={t('b5.classLevel', { defaultValue: '{{name}} level', name: klass.name })} value={k.level} min={1} max={20 - otherLevels} onChange={(n) => setClassLevel(k.classId, n)} />
                    <Button type="button" variant="ghost" size="icon" aria-label={t('b5.removeClass', { defaultValue: 'Remove {{name}}', name: klass.name })} onClick={() => removeClass(k.classId)}>
                      <Trash2 aria-hidden />
                    </Button>
                  </div>
                  {k.level >= klass.subclassLevel ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Field label={t('b5.subclass', { defaultValue: 'Subclass' })}>
                        <select
                          className={nativeSelectClass + warnIf(!k.subclassId && !k.customSubclass)}
                          aria-invalid={!k.subclassId && !k.customSubclass}
                          value={k.subclassId ?? (k.customSubclass ? '__custom' : '')}
                          onChange={(e) => {
                            const v = e.target.value;
                            set((x) => ({
                              ...x,
                              classes: x.classes.map((y) => {
                                if (y.classId !== k.classId) return y;
                                const { subclassId: _s, customSubclass: _c, ...rest } = y;
                                void _s;
                                void _c;
                                if (v === '__custom') return { ...rest, customSubclass: k.customSubclass || 'Custom subclass' };
                                return v ? { ...rest, subclassId: v } : rest;
                              }),
                            }));
                          }}
                        >
                          <option value="">{t('common.choose', { defaultValue: 'Choose…' })}</option>
                          {klass.subclasses.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                          <option value="__custom">{t('b5.customSubclass', { defaultValue: 'Another book (write in)' })}</option>
                        </select>
                      </Field>
                      {k.customSubclass !== undefined && !k.subclassId ? (
                        <Field label={t('b5.customSubclassName', { defaultValue: 'Subclass name' })}>
                          <Input value={k.customSubclass} onChange={(e) => {
                            const v = e.target.value.slice(0, 120);
                            set((x) => ({ ...x, classes: x.classes.map((y) => (y.classId === k.classId ? { ...y, customSubclass: v } : y)) }));
                          }} />
                        </Field>
                      ) : null}
                    </div>
                  ) : (
                    <Muted>{t('b5.subclassAt', { defaultValue: 'Subclass at level {{level}}.', level: klass.subclassLevel })}</Muted>
                  )}
                  {k.subclassId ? <Muted>{klass.subclasses.find((s) => s.id === k.subclassId)?.summary}</Muted> : null}
                </li>
              );
            })}
          </ul>
          {level < 20 ? (
            <div className="mt-3">
              <Field label={c.classes.length ? t('b5.multiclass', { defaultValue: 'Add a class (multiclass)' }) : t('b5.chooseClass', { defaultValue: 'Choose a class' })}>
                <select className={nativeSelectClass + warnIf(c.classes.length === 0)} aria-invalid={c.classes.length === 0} value="" onChange={(e) => addClass(e.target.value)}>
                  <option value="">{t('common.choose', { defaultValue: 'Choose…' })}</option>
                  {multiclassOptions.map((k) => {
                    const ok = c.classes.length === 0 || R.meetsMulticlass(c, d, k);
                    return (
                      <option key={k.id} value={k.id}>
                        {k.name}
                        {ok ? '' : ` — ${t('b5.prereq', { defaultValue: 'needs 13 {{abilities}}', abilities: k.multiclass.abilities.map((a) => a.toUpperCase()).join(k.multiclass.any ? ' or ' : ' and ') })}`}
                      </option>
                    );
                  })}
                </select>
              </Field>
            </div>
          ) : null}
        </Section>
      </div>

      <div>
        <Section
          title={t('b5.abilities', { defaultValue: 'Ability scores' })}
          action={
            <select className={`${nativeSelectClass} w-auto`} value={c.abilityMethod} aria-label={t('b5.method', { defaultValue: 'Generation method' })} onChange={(e) => {
              const m = e.target.value as Dnd5eCharacter['abilityMethod'];
              set((x) => ({
                ...x,
                abilityMethod: m,
                baseAbilities: m === 'standard' ? { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 } : m === 'pointbuy' ? { str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 } : x.baseAbilities,
              }));
            }}>
              <option value="standard">{t('b5.standard', { defaultValue: 'Standard array' })}</option>
              <option value="pointbuy">{t('b5.pointbuy', { defaultValue: 'Point buy' })}</option>
              <option value="roll">{t('b5.roll', { defaultValue: 'Roll 4d6' })}</option>
              <option value="manual">{t('b5.manual', { defaultValue: 'Manual' })}</option>
            </select>
          }
        >
          {c.abilityMethod === 'pointbuy' ? (
            <Muted className="mb-2">{t('b5.points', { defaultValue: '{{spent}} of 27 points spent', spent: R.pointBuyCost(c.baseAbilities) ?? '—' })}</Muted>
          ) : null}
          {c.abilityMethod === 'roll' ? (
            <Button type="button" size="sm" className="mb-3" onClick={() => set((x) => ({ ...x, baseAbilities: Object.fromEntries(ABILITIES.map((a) => [a, roll4d6()])) as Record<Ability, number> }))}>
              <Dices aria-hidden /> {t('b5.rollAll', { defaultValue: 'Roll all six' })}
            </Button>
          ) : null}
          <ul className="flex flex-col">
            {ABILITIES.map((a) => (
              <li key={a} className="flex items-center gap-3 border-b border-app-border py-2 last:border-b-0">
                <span className="w-28 text-sm font-medium text-app-text">{ABILITY_NAMES[a]}</span>
                {c.abilityMethod === 'standard' ? (
                  <select
                    className={`${nativeSelectClass} w-24`}
                    value={c.baseAbilities[a]}
                    aria-label={ABILITY_NAMES[a]}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      set((x) => {
                        const swap = ABILITIES.find((b) => b !== a && x.baseAbilities[b] === v);
                        const next = { ...x.baseAbilities, [a]: v };
                        if (swap) next[swap] = x.baseAbilities[a];
                        return { ...x, baseAbilities: next };
                      });
                    }}
                  >
                    {R.STANDARD_ARRAY.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                ) : c.abilityMethod === 'pointbuy' ? (
                  <Stepper label={ABILITY_NAMES[a]} value={c.baseAbilities[a]} min={8} max={15} onChange={(n) => set((x) => ({ ...x, baseAbilities: { ...x.baseAbilities, [a]: n } }))} />
                ) : (
                  <Input type="number" min={1} max={30} value={c.baseAbilities[a]} aria-label={ABILITY_NAMES[a]} className="w-24" onChange={(e) => {
                    const n = Math.min(30, Math.max(1, Math.floor(Number(e.target.value) || 1)));
                    set((x) => ({ ...x, baseAbilities: { ...x.baseAbilities, [a]: n } }));
                  }} />
                )}
                <span className="flex-1" />
                <span className="font-mono text-sm tabular-nums text-app-text">
                  {scores[a]} ({R.signed(R.abilityMod(scores[a]))})
                </span>
              </li>
            ))}
          </ul>
        </Section>

        {slots.length ? (
          <Section title={t('b5.improvements', { defaultValue: 'Ability Score Improvements and feats' })} needs={needAsi}>
            <ul className="flex flex-col">
              {slots.map((slot) => {
                const [classId, lvl] = slot.split(':');
                const choice = c.asi.find((a) => a.slot === slot);
                const epic = lvl === '19';
                const feats = R.eligibleFeats({ ...c, asi: c.asi.filter((a) => a.slot !== slot) }, d, epic ? ['general', 'epic-boon'] : ['general']).filter((f) => f.id !== 'ability-score-improvement');
                const feat = d.feats.find((f) => f.id === choice?.featId);
                return (
                  <li key={slot} className="flex flex-col gap-2 border-b border-app-border py-3 last:border-b-0">
                    <span className="text-sm font-medium text-app-text">
                      {d.classes.find((k) => k.id === classId)?.name} {lvl}
                      {epic ? ` · ${t('b5.epicBoon', { defaultValue: 'Epic Boon' })}` : ''}{' '}
                      <Needs show={!choice} />
                    </span>
                    <div className="flex flex-wrap gap-2">
                      <select
                        className={`${nativeSelectClass} sm:w-auto${warnIf(!choice)}`}
                        aria-invalid={!choice}
                        aria-label={t('b5.improvementFor', { defaultValue: 'Improvement for {{slot}}', slot })}
                        value={choice ? (choice.kind === 'asi' ? '__asi' : (choice.featId ?? '')) : ''}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (!v) setAsi(slot, null);
                          else if (v === '__asi') setAsi(slot, { kind: 'asi', abilities: [], featId: undefined });
                          else setAsi(slot, { kind: 'feat', featId: v, abilities: undefined, featAbilities: [] });
                        }}
                      >
                        <option value="">{t('common.choose', { defaultValue: 'Choose…' })}</option>
                        <option value="__asi">{t('b5.asi', { defaultValue: 'Ability Score Improvement (+2 / +1 +1)' })}</option>
                        {feats.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.name}
                            {f.prerequisite ? ` (${f.prerequisite})` : ''}
                          </option>
                        ))}
                      </select>
                      {choice?.kind === 'asi'
                        ? [0, 1].map((i) => (
                            <select
                              key={i}
                              className={`${nativeSelectClass} w-auto${warnIf(!choice.abilities?.[i])}`}
                              aria-invalid={!choice.abilities?.[i]}
                              aria-label={t('b5.asiPick', { defaultValue: 'Increase {{n}}', n: i + 1 })}
                              value={choice.abilities?.[i] ?? ''}
                              onChange={(e) => {
                                const list = [...(choice.abilities ?? [])];
                                list[i] = e.target.value as Ability;
                                setAsi(slot, { abilities: list.filter(Boolean) });
                              }}
                            >
                              <option value="">+1…</option>
                              {ABILITIES.map((a) => (
                                <option key={a} value={a}>
                                  +1 {ABILITY_NAMES[a]}
                                </option>
                              ))}
                            </select>
                          ))
                        : null}
                      {feat?.abilityIncrease?.length ? (
                        <select
                          className={`${nativeSelectClass} w-auto${warnIf(!choice?.featAbilities?.[0])}`}
                          aria-invalid={!choice?.featAbilities?.[0]}
                          aria-label={t('b5.featAbility', { defaultValue: 'Feat ability increase' })}
                          value={choice?.featAbilities?.[0] ?? ''}
                          onChange={(e) => setAsi(slot, { featAbilities: e.target.value ? [e.target.value as Ability] : [] })}
                        >
                          <option value="">+1…</option>
                          {feat.abilityIncrease.map((a) => (
                            <option key={a} value={a}>
                              +1 {ABILITY_NAMES[a]}
                            </option>
                          ))}
                        </select>
                      ) : null}
                    </div>
                    {feat ? <Muted>{feat.text}</Muted> : null}
                  </li>
                );
              })}
            </ul>
          </Section>
        ) : null}

        {fightingStyleClasses.length ? (
          <Section title={t('b5.fightingStyle', { defaultValue: 'Fighting Style' })} needs={fightingStyleClasses.filter((k) => !c.choices[`${k.classId}:fighting-style`]).length}>
            {fightingStyleClasses.map((k) => {
              const key = `${k.classId}:fighting-style`;
              return (
                <Field key={key} label={d.classes.find((x) => x.id === k.classId)?.name ?? k.classId}>
                  <select className={nativeSelectClass + warnIf(!c.choices[key])} aria-invalid={!c.choices[key]} value={c.choices[key] ?? ''} onChange={(e) => set((x) => ({ ...x, choices: { ...x.choices, [key]: e.target.value } }))}>
                    <option value="">{t('common.choose', { defaultValue: 'Choose…' })}</option>
                    {d.feats.filter((f) => f.category === 'fighting-style').map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                </Field>
              );
            })}
          </Section>
        ) : null}

        <Section title={t('b5.skills', { defaultValue: 'Skills' })} needs={needSkills} action={<span className="font-mono text-xs text-app-text-muted">{t('b5.picks', { defaultValue: '{{used}} / {{max}} chosen', used: classPicks.length, max: pickAllowance })}</span>}>
          <Muted className="mb-2">
            {first
              ? t('b5.skillHint', { defaultValue: '{{name}} chooses {{count}} from: {{list}}. Background skills are added for you.', name: first.name, count: first.skillChoices.count, list: first.skillChoices.from.map((s) => DND5E_SKILLS.find((k) => k.id === s)?.name ?? s).join(', ') })
              : t('b5.skillNoClass', { defaultValue: 'Choose a class to see its skill list.' })}
          </Muted>
          <div className="flex flex-wrap gap-2">
            {DND5E_SKILLS.map((s) => (
              <Chip key={s.id} on={c.skills.includes(s.id)} onToggle={() => toggleSkill(s.id)} disabled={bg?.skills.includes(s.id as never)}>
                {s.name}
              </Chip>
            ))}
          </div>
          <p className="mb-2 mt-4 text-sm font-medium text-app-text-muted">{t('b5.expertise', { defaultValue: 'Expertise' })}</p>
          <div className="flex flex-wrap gap-2">
            {c.skills.map((id) => (
              <Chip key={id} on={c.expertise.includes(id)} onToggle={() => set((x) => ({ ...x, expertise: x.expertise.includes(id) ? x.expertise.filter((s) => s !== id) : [...x.expertise, id] }))}>
                {DND5E_SKILLS.find((k) => k.id === id)?.name ?? id}
              </Chip>
            ))}
          </div>
        </Section>

        {masteryCount ? (
          <Section title={t('b5.mastery', { defaultValue: 'Weapon Mastery' })} needs={Math.max(0, masteryCount - c.weaponMasteries.length)} action={<span className="font-mono text-xs text-app-text-muted">{c.weaponMasteries.length} / {masteryCount}</span>}>
            <div className="flex flex-wrap gap-2">
              {d.weapons.map((w) => (
                <Chip
                  key={w.id}
                  on={c.weaponMasteries.includes(w.id)}
                  disabled={!c.weaponMasteries.includes(w.id) && c.weaponMasteries.length >= masteryCount}
                  title={w.mastery}
                  onToggle={() => set((x) => ({ ...x, weaponMasteries: x.weaponMasteries.includes(w.id) ? x.weaponMasteries.filter((m) => m !== w.id) : [...x.weaponMasteries, w.id] }))}
                >
                  {w.name} · {w.mastery}
                </Chip>
              ))}
            </div>
          </Section>
        ) : null}

        <ToolsSection c={c} set={set} />
      </div>
    </div>
  );
}

function ToolsSection({ c, set }: { c: Dnd5eCharacter; set: Set5e }) {
  const { t } = useTranslation('c-rmhcharacters');
  const [draft, setDraft] = useState('');
  return (
    <Section title={t('b5.tools', { defaultValue: 'Tool proficiencies' })}>
      <div className="mb-2 flex flex-wrap gap-2">
        {c.tools.map((tl) => (
          <Button key={tl} type="button" size="xs" variant="ghost" onClick={() => set((x) => ({ ...x, tools: x.tools.filter((y) => y !== tl) }))} aria-label={t('story.removeLanguage', { defaultValue: 'Remove {{name}}', name: tl })}>
            {tl} ×
          </Button>
        ))}
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const v = draft.trim().slice(0, 80);
          if (v && !c.tools.includes(v)) set((x) => ({ ...x, tools: [...x.tools, v] }));
          setDraft('');
        }}
      >
        <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={t('b5.addTool', { defaultValue: 'Add a tool or instrument' })} aria-label={t('b5.addTool', { defaultValue: 'Add a tool or instrument' })} />
        <Button type="submit">
          <Plus aria-hidden /> {t('inv.add', { defaultValue: 'Add' })}
        </Button>
      </form>
    </Section>
  );
}
