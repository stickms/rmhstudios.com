/**
 * Turn an advisor recommendation ({ kind, name, why }) into something the sheet can use:
 * the matching rules entry (for the hover card) and, where it makes sense, an action that
 * adds it to the character.
 *
 * Matching is by name against the built-in data, so the model never invents an id. A name the
 * data does not carry (another book, a magic item, a typo) still shows with its why; its
 * action, if any, writes it into the character's custom entries instead.
 */
import * as d5 from './dnd5e/rules';
import * as p2 from './pf2e/rules';
import { newId } from './factory';
import { matchByName } from './formats/util';
import type { Recommendation } from './advisor.contract';
import type { Character, Dnd5eCharacter, Dnd5eData, Pf2eCharacter, Pf2eData } from './types';

export interface RecDetails {
  title: string;
  /** One line of key facts (level, school, damage, price …). */
  meta: string;
  text: string;
}

export interface RecAction {
  /** Button label key + default (already resolved by the UI). */
  label: 'add-spell' | 'add-item' | 'add-feat' | 'add-note';
  /** Already on the sheet: the UI shows "Added" instead of the button. */
  done: boolean;
  apply: (c: Character) => Character;
}

export interface ResolvedRec {
  rec: Recommendation;
  details: RecDetails | null;
  action: RecAction | null;
}

const note = (rec: Recommendation, kind: string, c?: Character): RecAction => ({
  label: 'add-note',
  done: Boolean(c?.custom.some((e) => e.name.toLowerCase() === rec.name.toLowerCase())),
  apply: (c) =>
    c.custom.some((e) => e.name.toLowerCase() === rec.name.toLowerCase())
      ? c
      : { ...c, custom: [...c.custom, { id: newId(), name: rec.name, text: rec.why, kind }] },
});

/* -------------------------------------------------------------------------- */
/* D&D 5e                                                                     */
/* -------------------------------------------------------------------------- */

function resolve5e(rec: Recommendation, c: Dnd5eCharacter, d: Dnd5eData): ResolvedRec {
  const kind = rec.kind;
  if (kind === 'spell' || kind === 'other') {
    const s = matchByName(d.spells, rec.name);
    if (s) {
      const has = c.spells.prepared.includes(s.id);
      return {
        rec,
        details: {
          title: s.name,
          meta: `${s.level === 0 ? 'Cantrip' : `Level ${s.level}`} ${s.school} · ${s.castingTime} · ${s.range} · ${s.duration}${s.concentration ? ' · Concentration' : ''}${s.ritual ? ' · Ritual' : ''} · ${s.classes.join(', ')}`,
          text: `${s.text}${s.higher ? `\n\n${s.higher}` : ''}`,
        },
        action: {
          label: 'add-spell',
          done: has,
          apply: (x) => {
            if (x.system !== 'dnd5e' || x.spells.prepared.includes(s.id)) return x;
            return {
              ...x,
              spells: {
                ...x.spells,
                prepared: [...x.spells.prepared, s.id],
                known: x.spells.known.includes(s.id) ? x.spells.known : [...x.spells.known, s.id],
              },
            };
          },
        },
      };
    }
    if (kind === 'spell') return { rec, details: null, action: note(rec, 'Spell', c) };
  }
  if (kind === 'feat' || kind === 'other') {
    const f = matchByName(d.feats, rec.name);
    if (f) {
      const has = d5.allFeats(c, d).some((x) => x.feat.id === f.id);
      return {
        rec,
        details: {
          title: f.name,
          meta: `${f.category} feat${f.prerequisite ? ` · ${f.prerequisite}` : ''}`,
          text: f.text,
        },
        action: {
          label: 'add-feat',
          done: has,
          apply: (x) => {
            if (x.system !== 'dnd5e') return x;
            if (f.category === 'fighting-style') {
              const k = x.classes.find((cl) => x.choices[`${cl.classId}:fighting-style`] === undefined);
              if (k) return { ...x, choices: { ...x.choices, [`${k.classId}:fighting-style`]: f.id } };
            }
            // The first unspent improvement slot takes it; otherwise it becomes a note to place by hand.
            const free = d5.asiSlots(x, d).find((slot) => !x.asi.some((a) => a.slot === slot));
            if (free && f.category !== 'origin')
              return { ...x, asi: [...x.asi, { slot: free, kind: 'feat', featId: f.id, featAbilities: [] }] };
            return note(rec, 'Feat').apply(x);
          },
        },
      };
    }
    if (kind === 'feat') return { rec, details: null, action: note(rec, 'Feat', c) };
  }
  if (kind === 'item' || kind === 'weapon' || kind === 'armor' || kind === 'other') {
    const w = matchByName(d.weapons, rec.name);
    const a = !w ? matchByName(d.armor, rec.name) : undefined;
    const g = !w && !a ? matchByName(d.gear, rec.name) : undefined;
    const ref = w ?? a ?? g;
    if (ref) {
      const details: RecDetails = w
        ? {
            title: w.name,
            meta: `${w.category} ${w.kind} weapon · ${w.damage} ${w.damageType} · mastery ${w.mastery} · ${w.cost}`,
            text: [
              w.properties.join(', '),
              w.range ? `Range ${w.range}` : '',
              w.versatile ? `Versatile ${w.versatile}` : '',
            ]
              .filter(Boolean)
              .join(' · '),
          }
        : a
          ? {
              title: a.name,
              meta: `${a.category} · AC ${a.ac}${a.dexCap === undefined ? ' + Dex' : a.dexCap ? ` + Dex (max ${a.dexCap})` : ''} · ${a.cost}`,
              text: `${a.strength ? `Strength ${a.strength}. ` : ''}${a.stealthDisadvantage ? 'Disadvantage on Stealth. ' : ''}${a.weight} lb.`,
            }
          : { title: g!.name, meta: `${g!.cost} · ${g!.weight} lb`, text: g!.text ?? '' };
      return {
        rec,
        details,
        action: {
          label: 'add-item',
          done: c.inventory.some((i) => i.refId === ref.id),
          apply: (x) =>
            x.inventory.some((i) => i.refId === ref.id)
              ? x
              : {
                  ...x,
                  inventory: [
                    ...x.inventory,
                    { id: newId(), name: ref.name, quantity: 1, equipped: false, refId: ref.id, weight: ref.weight },
                  ],
                },
        },
      };
    }
    if (kind !== 'other') return { rec, details: null, action: addCustomItem(rec, c) };
  }
  const klass = kind === 'class' || kind === 'other' ? matchByName(d.classes, rec.name) : undefined;
  if (klass)
    return {
      rec,
      details: {
        title: klass.name,
        meta: `d${klass.hitDie} · primary ${klass.primaryAbility.join('/').toUpperCase()} · saves ${klass.saves.join('/').toUpperCase()}`,
        text: klass.features
          .filter((f) => f.level <= 3)
          .map((f) => `${f.name} (${f.level}): ${f.text}`)
          .join('\n'),
      },
      action: null,
    };
  if (kind === 'subclass' || kind === 'other') {
    for (const k of d.classes) {
      const sub = matchByName(k.subclasses, rec.name);
      if (sub)
        return {
          rec,
          details: {
            title: sub.name,
            meta: `${k.name} subclass`,
            text: `${sub.summary}\n\n${sub.features.map((f) => `${f.name} (${f.level}): ${f.text}`).join('\n')}`,
          },
          action: null,
        };
    }
  }
  const sp =
    kind === 'species' || kind === 'ancestry' || kind === 'other' ? matchByName(d.species, rec.name) : undefined;
  if (sp)
    return {
      rec,
      details: {
        title: sp.name,
        meta: `${sp.sizes.join(' or ')} · speed ${sp.speed} ft${sp.darkvision ? ` · darkvision ${sp.darkvision} ft` : ''}`,
        text: sp.traits.map((t) => `${t.name}: ${t.text}`).join('\n'),
      },
      action: null,
    };
  const bg = kind === 'background' || kind === 'other' ? matchByName(d.backgrounds, rec.name) : undefined;
  if (bg)
    return {
      rec,
      details: {
        title: bg.name,
        meta: `${bg.abilities.join('/').toUpperCase()} · ${bg.skills.join(', ')}`,
        text: `Origin feat: ${d.feats.find((f) => f.id === bg.featId)?.name ?? bg.featId}. Tool: ${bg.tool}. ${bg.equipment}`,
      },
      action: null,
    };
  return { rec, details: null, action: null };
}

const addCustomItem = (rec: Recommendation, c?: Character): RecAction => ({
  label: 'add-item',
  done: Boolean(c?.inventory.some((i) => i.name.toLowerCase() === rec.name.toLowerCase())),
  apply: (x) =>
    x.inventory.some((i) => i.name.toLowerCase() === rec.name.toLowerCase())
      ? x
      : {
          ...x,
          inventory: [...x.inventory, { id: newId(), name: rec.name, quantity: 1, equipped: false, notes: rec.why }],
        },
});

/* -------------------------------------------------------------------------- */
/* Pathfinder 2e                                                              */
/* -------------------------------------------------------------------------- */

function resolvePf(rec: Recommendation, c: Pf2eCharacter, d: Pf2eData): ResolvedRec {
  const kind = rec.kind;
  if (kind === 'spell' || kind === 'other') {
    const s = matchByName(d.spells, rec.name);
    if (s) {
      const list: 'focusSpells' | 'known' = s.focus ? 'focusSpells' : 'known';
      return {
        rec,
        details: {
          title: s.name,
          meta: `${s.focus ? 'Focus ' : ''}${s.rank === 0 ? 'Cantrip' : `Rank ${s.rank}`} · ${s.actions} · ${s.traditions.join(', ')} · ${s.traits.join(', ')}`,
          text: [
            [
              s.range && `Range ${s.range}`,
              s.area && `Area ${s.area}`,
              s.targets && `Targets ${s.targets}`,
              s.defense && `Defense ${s.defense}`,
              s.duration && `Duration ${s.duration}`,
            ]
              .filter(Boolean)
              .join(' · '),
            s.text,
            s.heightened ?? '',
          ]
            .filter(Boolean)
            .join('\n\n'),
        },
        action: {
          label: 'add-spell',
          done: c.spells[list].includes(s.id),
          apply: (x) =>
            x.system !== 'pf2e' || x.spells[list].includes(s.id)
              ? x
              : { ...x, spells: { ...x.spells, [list]: [...x.spells[list], s.id] } },
        },
      };
    }
    if (kind === 'spell') return { rec, details: null, action: note(rec, 'Spell', c) };
  }
  if (kind === 'feat' || kind === 'archetype' || kind === 'other') {
    const f = matchByName(d.feats, rec.name);
    if (f) {
      return {
        rec,
        details: {
          title: f.name,
          meta: `${f.type} feat ${f.level}${f.actions ? ` · [${f.actions}]` : ''}${f.traits.length ? ` · ${f.traits.join(', ')}` : ''}`,
          text: `${f.prerequisites ? `Prerequisites: ${f.prerequisites}\n\n` : ''}${f.text}`,
        },
        action: {
          label: 'add-feat',
          done: c.feats.some((x) => x.featId === f.id),
          apply: (x) => {
            if (x.system !== 'pf2e') return x;
            // The first open slot this feat is legal in; otherwise a note to place by hand.
            const filled = new Set(x.feats.filter((y) => y.featId || y.customName).map((y) => y.slot));
            const slot = p2
              .featSlots(x, d)
              .find((s) => !filled.has(s.slot) && p2.eligibleFeats(x, d, s).some((e) => e.id === f.id));
            if (slot)
              return {
                ...x,
                feats: [...x.feats.filter((y) => y.slot !== slot.slot), { slot: slot.slot, featId: f.id }],
              };
            return note(rec, 'Feat').apply(x);
          },
        },
      };
    }
    if (kind !== 'other')
      return { rec, details: null, action: note(rec, kind === 'archetype' ? 'Archetype' : 'Feat', c) };
  }
  if (kind === 'item' || kind === 'weapon' || kind === 'armor' || kind === 'other') {
    const w = matchByName(d.weapons, rec.name);
    const a = !w ? matchByName(d.armor, rec.name) : undefined;
    const g = !w && !a ? matchByName(d.gear, rec.name) : undefined;
    const ref = w ?? a ?? g;
    if (ref) {
      const bulk = (b: number) => (b === 0 ? '—' : b < 1 ? 'L' : String(b));
      const details: RecDetails = w
        ? {
            title: w.name,
            meta: `${w.category} ${w.kind} · ${w.damage} ${w.damageType} · ${w.group} · ${w.price}`,
            text: `${w.traits.join(', ')} · hands ${w.hands}${w.range ? ` · range ${w.range} ft` : ''} · bulk ${bulk(w.bulk)}`,
          }
        : a
          ? {
              title: a.name,
              meta: `${a.category} · +${a.acBonus} AC${a.dexCap !== undefined ? ` · Dex cap ${a.dexCap}` : ''} · ${a.price}`,
              text: `${a.strength !== undefined ? `Str +${a.strength} · ` : ''}check ${a.checkPenalty} · speed ${a.speedPenalty} · ${a.traits.join(', ')} · bulk ${bulk(a.bulk)}`,
            }
          : { title: g!.name, meta: `${g!.price} · bulk ${bulk(g!.bulk)}`, text: g!.text ?? '' };
      return {
        rec,
        details,
        action: {
          label: 'add-item',
          done: c.inventory.some((i) => i.refId === ref.id),
          apply: (x) =>
            x.inventory.some((i) => i.refId === ref.id)
              ? x
              : {
                  ...x,
                  inventory: [
                    ...x.inventory,
                    { id: newId(), name: ref.name, quantity: 1, equipped: false, refId: ref.id, bulk: ref.bulk },
                  ],
                },
        },
      };
    }
    if (kind !== 'other') return { rec, details: null, action: addCustomItem(rec, c) };
  }
  const klass = kind === 'class' || kind === 'other' ? matchByName(d.classes, rec.name) : undefined;
  if (klass)
    return {
      rec,
      details: {
        title: klass.name,
        meta: `${klass.hp} + Con HP per level · key ${klass.keyAbility.join('/').toUpperCase()}`,
        text: klass.features
          .filter((f) => f.level <= 3)
          .map((f) => `${f.name} (${f.level}): ${f.text}`)
          .join('\n'),
      },
      action: null,
    };
  const anc =
    kind === 'ancestry' || kind === 'species' || kind === 'other' ? matchByName(d.ancestries, rec.name) : undefined;
  if (anc)
    return {
      rec,
      details: {
        title: anc.name,
        meta: `${anc.hp} HP · ${anc.size} · ${anc.speed} ft${anc.senses ? ` · ${anc.senses}` : ''}`,
        text: anc.features.map((f) => `${f.name}: ${f.text}`).join('\n'),
      },
      action: null,
    };
  if (kind === 'heritage' || kind === 'other') {
    const all = [
      ...d.ancestries.flatMap((a) => a.heritages.map((h) => ({ ...h, of: a.name }))),
      ...d.versatileHeritages.map((h) => ({ ...h, of: 'Versatile' })),
    ];
    const h = matchByName(all, rec.name);
    if (h) return { rec, details: { title: h.name, meta: `${h.of} heritage`, text: h.text }, action: null };
  }
  if (kind === 'subclass' || kind === 'other') {
    for (const k of d.classes) {
      const sub = matchByName(k.subclasses ?? [], rec.name);
      if (sub)
        return {
          rec,
          details: { title: sub.name, meta: `${k.name} ${k.subclassLabel ?? 'option'}`, text: sub.text },
          action: null,
        };
    }
  }
  const bg = kind === 'background' || kind === 'other' ? matchByName(d.backgrounds, rec.name) : undefined;
  if (bg)
    return {
      rec,
      details: { title: bg.name, meta: `${bg.skills.join(', ')} · ${bg.lore}`, text: bg.text },
      action: null,
    };
  return { rec, details: null, action: null };
}

export function resolveRecommendation(rec: Recommendation, c: Character, data: Dnd5eData | Pf2eData): ResolvedRec {
  return c.system === 'dnd5e' ? resolve5e(rec, c, data as Dnd5eData) : resolvePf(rec, c, data as Pf2eData);
}
