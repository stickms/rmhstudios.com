/** Pathfinder 2e (Remaster) build: ancestry, heritage, background, class, boosts, skills, feats. */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import * as R from '@features/rmhcharacters/engine/pf2e/rules';
import { ABILITIES, ABILITY_NAMES, PF2E_SKILLS, type Ability, type Pf2eCharacter, type Pf2eData } from '@features/rmhcharacters/engine/types';
import { Chip, Field, Muted, nativeSelectClass, Section, Stepper } from '../controls';

type SetPf = (fn: (c: Pf2eCharacter) => Pf2eCharacter) => void;
const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);

export function BuildPf2e({ c, d, set }: { c: Pf2eCharacter; d: Pf2eData; set: SetPf }) {
  const { t } = useTranslation('c-rmhcharacters');
  const ancestry = R.ancestryOf(d, c);
  const bg = R.backgroundOf(d, c);
  const klass = R.classOf(d, c);
  const mods = R.attributeMods(c);
  const partial = R.partialBoosts(c);

  const setAncestry = (id: string) =>
    set((x) => {
      const a = d.ancestries.find((y) => y.id === id);
      return {
        ...x,
        ancestryId: id,
        heritageId: '',
        boosts: { ...x.boosts, ancestry: a ? a.boosts.map((b) => (b === 'free' ? ('' as unknown as Ability) : b)).filter(Boolean) as Ability[] : [], ancestryFlaws: a ? [...a.flaws] : [], ancestryAltFree: false },
        feats: x.feats.filter((f) => !f.slot.startsWith('ancestry-')),
        languages: a ? [...new Set(a.languages)] : x.languages,
      };
    });

  const ancestrySlots: ('fixed' | 'free')[] = c.boosts.ancestryAltFree ? ['free', 'free'] : (ancestry?.boosts ?? []).map((b) => (b === 'free' ? 'free' : 'fixed'));
  const fixed = c.boosts.ancestryAltFree ? [] : (ancestry?.boosts ?? []).filter((b): b is Ability => b !== 'free');
  const freeChosen = c.boosts.ancestry.filter((a) => !fixed.includes(a) || c.boosts.ancestry.filter((y) => y === a).length > 1);
  const setFreeAncestry = (i: number, a: Ability | '') =>
    set((x) => {
      const free = [...freeChosen];
      if (a) free[i] = a;
      else free.splice(i, 1);
      return { ...x, boosts: { ...x.boosts, ancestry: [...fixed, ...free.filter(Boolean)] } };
    });

  const setBackground = (id: string) =>
    set((x) => {
      const old = d.backgrounds.find((b) => b.id === x.backgroundId);
      const next = d.backgrounds.find((b) => b.id === id);
      const trained = x.trainedSkills.filter((s) => !old?.skills.includes(s));
      return {
        ...x,
        backgroundId: id,
        boosts: { ...x.boosts, background: next ? [next.boosts[0][0]!] : [] },
        trainedSkills: next ? [...new Set([...trained, ...next.skills])] : trained,
        lores: next ? [...new Set([...x.lores.filter((l) => l !== old?.lore), next.lore])] : x.lores,
        feats: [...x.feats.filter((f) => f.slot !== 'bonus-1'), ...(next ? [{ slot: 'bonus-1', featId: next.featId }] : [])],
      };
    });

  const setClass = (id: string) =>
    set((x) => {
      const old = d.classes.find((k) => k.id === x.classId);
      const next = d.classes.find((k) => k.id === id);
      const trained = x.trainedSkills.filter((s) => !old?.trainedSkills.includes(s));
      const { subclassId: _s, ...rest } = x;
      void _s;
      const out: Pf2eCharacter = {
        ...rest,
        classId: id,
        boosts: { ...x.boosts, class: next?.keyAbility.length === 1 ? next.keyAbility[0]! : (next?.keyAbility.includes(x.boosts.class as Ability) ? x.boosts.class : null) },
        trainedSkills: next ? [...new Set([...trained, ...next.trainedSkills.filter((s) => (PF2E_SKILLS as readonly string[]).includes(s))])] : trained,
        feats: x.feats.filter((f) => !f.slot.startsWith('class-')),
      };
      // Start at full HP when the class is first chosen.
      return x.hp.current > 0 ? out : { ...out, hp: { ...out.hp, current: R.maxHp(out, d) } };
    });

  const toggleLevelBoost = (lvl: number, a: Ability) =>
    set((x) => {
      const cur = x.boosts.levels[String(lvl)] ?? [];
      const next = cur.includes(a) ? cur.filter((y) => y !== a) : cur.length < 4 ? [...cur, a] : cur;
      return { ...x, boosts: { ...x.boosts, levels: { ...x.boosts.levels, [String(lvl)]: next } } };
    });

  const skillAllowance = klass ? klass.trainedSkills.length + klass.additionalSkills + Math.max(0, mods.int) + (bg?.skills.length ?? 0) : 0;
  const slots = R.featSlots(c, d);
  const incLevels = R.skillIncreaseLevels(c, d);

  return (
    <div className="rmhc-columns">
      <div>
        <Section title={t('bp.ancestry', { defaultValue: 'Ancestry and heritage' })}>
          <div className="flex flex-col gap-3">
            <select className={nativeSelectClass} value={c.ancestryId} aria-label={t('bp.ancestryLabel', { defaultValue: 'Ancestry' })} onChange={(e) => setAncestry(e.target.value)}>
              <option value="">{t('common.choose', { defaultValue: 'Choose…' })}</option>
              {d.ancestries.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            {ancestry ? (
              <>
                <Muted>
                  {t('bp.ancestryStats', { defaultValue: '{{hp}} HP · {{size}} · {{speed}} ft · {{senses}}', hp: ancestry.hp, size: ancestry.size, speed: ancestry.speed, senses: ancestry.senses ?? '' })}
                </Muted>
                <Field label={t('bp.heritage', { defaultValue: 'Heritage' })}>
                  <select className={nativeSelectClass} value={c.heritageId} onChange={(e) => set((x) => ({ ...x, heritageId: e.target.value }))}>
                    <option value="">{t('common.choose', { defaultValue: 'Choose…' })}</option>
                    <optgroup label={ancestry.name}>
                      {ancestry.heritages.map((h) => (
                        <option key={h.id} value={h.id}>
                          {h.name}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label={t('bp.versatile', { defaultValue: 'Versatile heritages' })}>
                      {d.versatileHeritages.map((h) => (
                        <option key={h.id} value={h.id}>
                          {h.name}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </Field>
                {R.heritageOf(d, c) ? <Muted>{R.heritageOf(d, c)?.text}</Muted> : null}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-app-text-muted">{t('bp.ancestryBoosts', { defaultValue: 'Ancestry boosts' })}</span>
                  {fixed.map((a) => (
                    <span key={a} className="rounded-app-sm border border-app-border px-2 py-1 text-sm">+ {ABILITY_NAMES[a]}</span>
                  ))}
                  {ancestrySlots.filter((s) => s === 'free').map((_, i) => (
                    <select key={i} className={`${nativeSelectClass} w-auto`} aria-label={t('bp.freeBoost', { defaultValue: 'Free boost {{n}}', n: i + 1 })} value={freeChosen[i] ?? ''} onChange={(e) => setFreeAncestry(i, e.target.value as Ability | '')}>
                      <option value="">{t('bp.free', { defaultValue: 'Free…' })}</option>
                      {ABILITIES.filter((a) => !fixed.includes(a) && (a === freeChosen[i] || !freeChosen.includes(a))).map((a) => (
                        <option key={a} value={a}>
                          + {ABILITY_NAMES[a]}
                        </option>
                      ))}
                    </select>
                  ))}
                  {!c.boosts.ancestryAltFree && ancestry.flaws.map((a) => (
                    <span key={a} className="rounded-app-sm border border-app-danger px-2 py-1 text-sm text-app-danger">− {ABILITY_NAMES[a]}</span>
                  ))}
                </div>
                <Chip on={c.boosts.ancestryAltFree} onToggle={() => set((x) => ({ ...x, boosts: { ...x.boosts, ancestryAltFree: !x.boosts.ancestryAltFree, ancestry: [] } }))}>
                  {t('bp.altBoosts', { defaultValue: 'Use two free boosts and no flaw' })}
                </Chip>
              </>
            ) : null}
          </div>
        </Section>

        <Section title={t('bp.background', { defaultValue: 'Background' })}>
          <div className="flex flex-col gap-3">
            <select className={nativeSelectClass} value={c.backgroundId} aria-label={t('bp.background', { defaultValue: 'Background' })} onChange={(e) => setBackground(e.target.value)}>
              <option value="">{t('common.choose', { defaultValue: 'Choose…' })}</option>
              {d.backgrounds.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            {bg ? (
              <>
                <Muted>{bg.text}</Muted>
                <Muted>{t('bp.bgGrants', { defaultValue: 'Trained: {{skills}}, {{lore}} · Skill feat: {{feat}}', skills: bg.skills.map(cap).join(', '), lore: bg.lore, feat: d.feats.find((f) => f.id === bg.featId)?.name ?? bg.featId })}</Muted>
                <div className="grid grid-cols-2 gap-3">
                  <Field label={t('bp.bgBoost1', { defaultValue: 'Boost (one of two)' })}>
                    <select className={nativeSelectClass} value={c.boosts.background[0] ?? ''} onChange={(e) => {
                      const a = e.target.value as Ability;
                      set((x) => ({ ...x, boosts: { ...x.boosts, background: [a, ...x.boosts.background.slice(1).filter((y) => y !== a)] } }));
                    }}>
                      {bg.boosts[0].map((a) => (
                        <option key={a} value={a}>
                          {ABILITY_NAMES[a]}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label={t('bp.bgBoost2', { defaultValue: 'Free boost' })}>
                    <select className={nativeSelectClass} value={c.boosts.background[1] ?? ''} onChange={(e) => {
                      const a = e.target.value as Ability;
                      set((x) => ({ ...x, boosts: { ...x.boosts, background: [x.boosts.background[0]!, ...(a ? [a] : [])] } }));
                    }}>
                      <option value="">{t('bp.free', { defaultValue: 'Free…' })}</option>
                      {ABILITIES.filter((a) => a !== c.boosts.background[0]).map((a) => (
                        <option key={a} value={a}>
                          {ABILITY_NAMES[a]}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
              </>
            ) : null}
          </div>
        </Section>

        <Section title={t('bp.class', { defaultValue: 'Class' })} action={<Stepper label={t('bp.level', { defaultValue: 'Level' })} value={c.level} min={1} max={20} onChange={(n) => set((x) => ({ ...x, level: n }))} />}>
          <div className="flex flex-col gap-3">
            <select className={nativeSelectClass} value={c.classId} aria-label={t('bp.class', { defaultValue: 'Class' })} onChange={(e) => setClass(e.target.value)}>
              <option value="">{t('common.choose', { defaultValue: 'Choose…' })}</option>
              {d.classes.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.name}
                </option>
              ))}
            </select>
            {klass ? (
              <>
                <Muted>{t('bp.classStats', { defaultValue: '{{hp}} + Con HP per level · key attribute {{key}}', hp: klass.hp, key: klass.keyAbility.map((a) => ABILITY_NAMES[a]).join(' or ') })}</Muted>
                {klass.keyAbility.length > 1 ? (
                  <Field label={t('bp.key', { defaultValue: 'Key attribute (class boost)' })}>
                    <select className={nativeSelectClass} value={c.boosts.class ?? ''} onChange={(e) => set((x) => ({ ...x, boosts: { ...x.boosts, class: (e.target.value || null) as Ability | null } }))}>
                      <option value="">{t('common.choose', { defaultValue: 'Choose…' })}</option>
                      {klass.keyAbility.map((a) => (
                        <option key={a} value={a}>
                          {ABILITY_NAMES[a]}
                        </option>
                      ))}
                    </select>
                  </Field>
                ) : null}
                {klass.subclasses?.length ? (
                  <Field label={klass.subclassLabel ?? t('bp.option', { defaultValue: 'Class option' })}>
                    <select className={nativeSelectClass} value={c.subclassId ?? ''} onChange={(e) => {
                      const v = e.target.value;
                      set((x) => {
                        const oldSkill = klass.subclasses?.find((s) => s.id === x.subclassId)?.skill;
                        const newSkill = klass.subclasses?.find((s) => s.id === v)?.skill;
                        let trained = oldSkill ? x.trainedSkills.filter((s) => s !== oldSkill) : x.trainedSkills;
                        if (newSkill && !trained.includes(newSkill)) trained = [...trained, newSkill];
                        const { subclassId: _s, ...rest } = x;
                        void _s;
                        return { ...rest, trainedSkills: trained, ...(v ? { subclassId: v } : {}) };
                      });
                    }}>
                      <option value="">{t('common.choose', { defaultValue: 'Choose…' })}</option>
                      {klass.subclasses.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                ) : null}
                {klass.subclasses?.find((s) => s.id === c.subclassId) ? <Muted>{klass.subclasses.find((s) => s.id === c.subclassId)?.text}</Muted> : null}
                {klass.spellcasting?.tradition === 'choice' ? (
                  <Field label={t('bp.tradition', { defaultValue: 'Tradition' })}>
                    <select className={nativeSelectClass} value={c.spells.tradition ?? ''} onChange={(e) => set((x) => ({ ...x, spells: { ...x.spells, tradition: (e.target.value || undefined) as Pf2eCharacter['spells']['tradition'] } }))}>
                      <option value="">{t('common.choose', { defaultValue: 'Choose…' })}</option>
                      {['arcane', 'divine', 'occult', 'primal'].map((tr) => (
                        <option key={tr} value={tr}>
                          {cap(tr)}
                        </option>
                      ))}
                    </select>
                  </Field>
                ) : null}
                <ChoiceField c={c} set={set} k="deity" label={t('bp.deity', { defaultValue: 'Deity or philosophy (optional)' })} />
              </>
            ) : null}
          </div>
        </Section>
      </div>

      <div>
        <Section title={t('bp.attributes', { defaultValue: 'Attribute boosts' })}>
          <div className="mb-3 grid grid-cols-6 gap-1 text-center">
            {ABILITIES.map((a) => (
              <div key={a} className="rmhc-stat">
                <div className="text-xs text-app-text-muted">{a.toUpperCase()}</div>
                <div className="font-mono text-lg tabular-nums">
                  {R.signed(mods[a])}
                  {partial.includes(a) ? '½' : ''}
                </div>
              </div>
            ))}
          </div>
          {R.BOOST_LEVELS.filter((l) => l <= c.level).map((lvl) => {
            const set4 = c.boosts.levels[String(lvl)] ?? [];
            return (
              <div key={lvl} className="border-b border-app-border py-2 last:border-b-0">
                <p className="mb-2 text-sm text-app-text-muted">{t('bp.boostsAt', { defaultValue: 'Level {{lvl}}: four boosts ({{n}}/4)', lvl, n: set4.length })}</p>
                <div className="flex flex-wrap gap-2">
                  {ABILITIES.map((a) => (
                    <Chip key={a} on={set4.includes(a)} disabled={!set4.includes(a) && set4.length >= 4} onToggle={() => toggleLevelBoost(lvl, a)}>
                      {ABILITY_NAMES[a]}
                    </Chip>
                  ))}
                </div>
              </div>
            );
          })}
          <Muted className="mt-2">{t('bp.partialRule', { defaultValue: 'After 1st level a boost to a +4 or higher modifier is a partial boost (½); two make +1.' })}</Muted>
        </Section>

        <Section title={t('bp.skills', { defaultValue: 'Skills' })} action={<span className="font-mono text-xs text-app-text-muted">{t('b5.picks', { defaultValue: '{{used}} / {{max}} chosen', used: c.trainedSkills.length, max: skillAllowance })}</span>}>
          {klass ? <Muted className="mb-2">{t('bp.skillHint', { defaultValue: '{{name}}: {{fixed}} plus {{n}} + Int modifier more.', name: klass.name, fixed: klass.trainedSkills.map(cap).join(', ') || '—', n: klass.additionalSkills })}</Muted> : null}
          <div className="flex flex-wrap gap-2">
            {PF2E_SKILLS.map((s) => (
              <Chip key={s} on={c.trainedSkills.includes(s)} onToggle={() => set((x) => ({ ...x, trainedSkills: x.trainedSkills.includes(s) ? x.trainedSkills.filter((y) => y !== s) : [...x.trainedSkills, s] }))}>
                {cap(s)} {R.RANK_LETTER[R.skillRank(c, s)]}
              </Chip>
            ))}
          </div>
          <LoreField c={c} set={set} />
          {incLevels.length ? (
            <div className="mt-4 flex flex-col">
              <p className="mb-1 text-sm font-medium text-app-text-muted">{t('bp.increases', { defaultValue: 'Skill increases' })}</p>
              {incLevels.map((lvl) => (
                <div key={lvl} className="flex items-center gap-3 border-b border-app-border py-1.5 last:border-b-0">
                  <span className="w-16 font-mono text-xs text-app-text-muted">{t('bp.lvl', { defaultValue: 'Lvl {{n}}', n: lvl })}</span>
                  <select className={nativeSelectClass} value={c.skillIncreases[String(lvl)] ?? ''} aria-label={t('bp.increaseAt', { defaultValue: 'Skill increase at level {{n}}', n: lvl })} onChange={(e) => set((x) => ({ ...x, skillIncreases: { ...x.skillIncreases, [String(lvl)]: e.target.value } }))}>
                    <option value="">{t('common.choose', { defaultValue: 'Choose…' })}</option>
                    {[...PF2E_SKILLS, ...c.lores].map((s) => (
                      <option key={s} value={s}>
                        {cap(s)}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
              <Muted className="mt-1">{t('bp.increaseRule', { defaultValue: 'Expert from level 2, master from 7, legendary from 15.' })}</Muted>
            </div>
          ) : null}
        </Section>

        <Section title={t('bp.feats', { defaultValue: 'Feats' })}>
          <ul className="flex flex-col">
            {slots.map((slot) => {
              const choice = c.feats.find((f) => f.slot === slot.slot);
              const options = R.eligibleFeats(c, d, slot);
              const feat = d.feats.find((f) => f.id === choice?.featId);
              const setChoice = (patch: { featId?: string; customName?: string } | null) =>
                set((x) => ({ ...x, feats: [...x.feats.filter((f) => f.slot !== slot.slot), ...(patch ? [{ slot: slot.slot, ...patch }] : [])] }));
              return (
                <li key={slot.slot} className="flex flex-col gap-1.5 border-b border-app-border py-2.5 last:border-b-0">
                  <span className="text-sm text-app-text-muted">
                    <span className="font-mono text-xs">{t('bp.lvl', { defaultValue: 'Lvl {{n}}', n: slot.level })}</span> · {slot.label}
                  </span>
                  <select
                    className={nativeSelectClass}
                    aria-label={`${slot.label} ${slot.level}`}
                    value={choice?.featId ?? (choice?.customName !== undefined ? '__custom' : '')}
                    onChange={(e) => {
                      const v = e.target.value;
                      setChoice(!v ? null : v === '__custom' ? { customName: choice?.customName ?? '' } : { featId: v });
                    }}
                  >
                    <option value="">{t('common.choose', { defaultValue: 'Choose…' })}</option>
                    {options.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name} ({f.level}){f.type === 'archetype' ? ` · ${f.owner}` : ''}
                      </option>
                    ))}
                    <option value="__custom">{t('bp.customFeat', { defaultValue: 'Another book (write in)' })}</option>
                  </select>
                  {choice?.customName !== undefined && !choice.featId ? (
                    <Input value={choice.customName} placeholder={t('bp.featName', { defaultValue: 'Feat name' })} aria-label={t('bp.featName', { defaultValue: 'Feat name' })} onChange={(e) => setChoice({ customName: e.target.value.slice(0, 120) })} />
                  ) : null}
                  {feat ? (
                    <Muted>
                      {feat.actions ? `[${feat.actions}] ` : ''}
                      {feat.prerequisites ? `${t('bp.prereq', { defaultValue: 'Prerequisites' })}: ${feat.prerequisites}. ` : ''}
                      {feat.text}
                    </Muted>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </Section>
      </div>
    </div>
  );
}

function ChoiceField({ c, set, k, label }: { c: Pf2eCharacter; set: SetPf; k: string; label: string }) {
  return (
    <Field label={label}>
      <Input value={c.choices[k] ?? ''} onChange={(e) => {
        const v = e.target.value.slice(0, 120);
        set((x) => ({ ...x, choices: { ...x.choices, [k]: v } }));
      }} />
    </Field>
  );
}

function LoreField({ c, set }: { c: Pf2eCharacter; set: SetPf }) {
  const { t } = useTranslation('c-rmhcharacters');
  const [draft, setDraft] = useState('');
  return (
    <div className="mt-3">
      <div className="mb-2 flex flex-wrap gap-2">
        {c.lores.map((l) => (
          <Button key={l} type="button" size="xs" variant="ghost" onClick={() => set((x) => ({ ...x, lores: x.lores.filter((y) => y !== l) }))} aria-label={t('story.removeLanguage', { defaultValue: 'Remove {{name}}', name: l })}>
            {l} ×
          </Button>
        ))}
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          let v = draft.trim().slice(0, 60);
          if (!v) return;
          if (!/lore$/i.test(v)) v = `${v} Lore`;
          if (!c.lores.includes(v)) set((x) => ({ ...x, lores: [...x.lores, v] }));
          setDraft('');
        }}
      >
        <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={t('bp.addLore', { defaultValue: 'Add a Lore (e.g. Warfare)' })} aria-label={t('bp.addLore', { defaultValue: 'Add a Lore (e.g. Warfare)' })} />
        <Button type="submit">{t('inv.add', { defaultValue: 'Add' })}</Button>
      </form>
    </div>
  );
}
