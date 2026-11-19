/**
 * Foundry VTT actor JSON (the file "Export Data" writes and "Import Data" reads)
 * for the `dnd5e` and `pf2e` game systems.
 *
 * Export writes a character actor with the core statistics and one item per
 * class, species/ancestry, background, feat, spell and piece of equipment, so
 * the sheet opens populated. The full RMHCharacters record rides along in
 * `flags.rmhcharacters`, which makes a round trip through Foundry lossless.
 *
 * Import prefers that flag; otherwise it reads the actor the way Foundry stores
 * it and matches item names against the rules data. Anything it cannot match
 * becomes a custom entry rather than being dropped.
 */
import { newDnd5e, newId, newPf2e, normalizeCharacter } from '../factory';
import * as d5 from '../dnd5e/rules';
import * as p2 from '../pf2e/rules';
import { DND5E_SKILLS } from '../dnd5e/skills';
import {
  ABILITIES,
  PF2E_SKILLS,
  type Ability,
  type Character,
  type Dnd5eCharacter,
  type Dnd5eData,
  type Pf2eCharacter,
  type Pf2eData,
  type Pf2eRank,
} from '../types';
import { asArr, asNum, asStr, foundryId, isObj, matchByName, stripHtml, toHtml, type Obj } from './util';

const DND_SKILL_KEY: Record<string, string> = {
  acrobatics: 'acr',
  'animal-handling': 'ani',
  arcana: 'arc',
  athletics: 'ath',
  deception: 'dec',
  history: 'his',
  insight: 'ins',
  intimidation: 'itm',
  investigation: 'inv',
  medicine: 'med',
  nature: 'nat',
  perception: 'prc',
  performance: 'prf',
  persuasion: 'per',
  religion: 'rel',
  'sleight-of-hand': 'slt',
  stealth: 'ste',
  survival: 'sur',
};
const DND_KEY_SKILL = Object.fromEntries(Object.entries(DND_SKILL_KEY).map(([k, v]) => [v, k]));

const SCHOOL: Record<string, string> = {
  abjuration: 'abj',
  conjuration: 'con',
  divination: 'div',
  enchantment: 'enc',
  evocation: 'evo',
  illusion: 'ill',
  necromancy: 'nec',
  transmutation: 'trs',
};

const item = (type: string, name: string, system: Obj = {}) => ({ _id: foundryId(), name, type, img: '', system, flags: {} });
const desc = (text: string) => ({ description: { value: toHtml(text) } });

/* ========================================================================== */
/* Export                                                                     */
/* ========================================================================== */

export function exportFoundryDnd5e(c: Dnd5eCharacter, d: Dnd5eData) {
  const scores = d5.abilityScores(c, d);
  const saves = d5.saveProficiencies(c, d);
  const items: unknown[] = [];
  const species = d.species.find((s) => s.id === c.speciesId);
  if (species) items.push(item('race', species.name, { ...desc(species.traits.map((t) => `${t.name}. ${t.text}`).join('\n\n')), identifier: species.id, movement: { walk: species.speed }, senses: { darkvision: species.darkvision ?? 0 } }));
  const bg = d.backgrounds.find((b) => b.id === c.backgroundId);
  if (bg) items.push(item('background', bg.name, { ...desc(`Skills: ${bg.skills.join(', ')}. Tool: ${bg.tool}. Equipment: ${bg.equipment}`), identifier: bg.id }));
  c.classes.forEach((k, i) => {
    const klass = d.classes.find((x) => x.id === k.classId);
    if (!klass) return;
    items.push(item('class', klass.name, { identifier: klass.id, levels: k.level, hitDice: `d${klass.hitDie}`, hitDiceUsed: i === 0 ? c.hitDiceUsed : 0, ...desc(klass.features.filter((f) => f.level <= k.level).map((f) => `${f.name} (${f.level}). ${f.text}`).join('\n\n')) }));
    const sub = klass.subclasses.find((s) => s.id === k.subclassId);
    if (sub || k.customSubclass) items.push(item('subclass', sub?.name ?? k.customSubclass ?? '', { identifier: sub?.id ?? '', classIdentifier: klass.id, ...desc(sub?.summary ?? '') }));
  });
  for (const { feat } of d5.allFeats(c, d)) items.push(item('feat', feat.name, { ...desc(feat.text), type: { value: 'feat', subtype: feat.category } }));
  const prepared = new Set([...c.spells.prepared, ...d5.alwaysPreparedSpells(c, d)]);
  for (const id of new Set([...c.spells.known, ...prepared])) {
    const s = d.spells.find((x) => x.id === id);
    if (!s) continue;
    items.push(item('spell', s.name, {
      ...desc(`${s.text}${s.higher ? `\n\n${s.higher}` : ''}`),
      level: s.level,
      school: SCHOOL[s.school.toLowerCase()] ?? s.school,
      preparation: { mode: s.level === 0 ? 'always' : 'prepared', prepared: prepared.has(id) },
      properties: [...(s.concentration ? ['concentration'] : []), ...(s.ritual ? ['ritual'] : [])],
    }));
  }
  for (const inv of c.inventory) {
    const w = d.weapons.find((x) => x.id === inv.refId);
    const a = d.armor.find((x) => x.id === inv.refId);
    if (w) items.push(item('weapon', inv.name, { quantity: inv.quantity, weight: { value: w.weight, units: 'lb' }, equipped: inv.equipped, damage: { base: { formula: w.damage, types: [w.damageType.toLowerCase()] } }, mastery: w.mastery.toLowerCase(), type: { value: `${w.category === 'simple' ? 'simple' : 'martial'}${w.kind === 'melee' ? 'M' : 'R'}` } }));
    else if (a) items.push(item('equipment', inv.name, { quantity: inv.quantity, weight: { value: a.weight, units: 'lb' }, equipped: inv.equipped || c.armorId === a.id, armor: { value: a.ac, dex: a.dexCap ?? null }, type: { value: a.category }, strength: a.strength ?? 0 }));
    else items.push(item('loot', inv.name, { quantity: inv.quantity, weight: { value: inv.weight ?? 0, units: 'lb' }, ...desc(inv.notes ?? '') }));
  }
  for (const e of c.custom) items.push(item('feat', e.name, { ...desc(e.text), type: { value: 'feat' } }));
  return {
    name: c.name || 'Unnamed',
    type: 'character',
    img: c.portrait ?? 'icons/svg/mystery-man.svg',
    system: {
      abilities: Object.fromEntries(ABILITIES.map((a) => [a, { value: scores[a], proficient: saves.includes(a) ? 1 : 0 }])),
      attributes: {
        hp: { value: c.hp.current || d5.maxHp(c, d), max: d5.maxHp(c, d), temp: c.hp.temp },
        ac: { calc: 'default' },
        death: { success: c.deathSaves.successes, failure: c.deathSaves.failures },
        exhaustion: c.exhaustion,
        inspiration: c.heroicInspiration,
        movement: { walk: d5.speed(c, d), units: 'ft' },
      },
      details: {
        biography: { value: toHtml(c.backstory), public: '' },
        appearance: c.appearance,
        trait: c.personality,
        xp: { value: c.xp },
      },
      skills: Object.fromEntries(DND5E_SKILLS.map((s) => [DND_SKILL_KEY[s.id], { value: c.expertise.includes(s.id) ? 2 : c.skills.includes(s.id) ? 1 : 0, ability: s.ability }])),
      traits: { languages: { value: [], custom: c.languages.join('; ') }, size: (c.size ?? 'Medium') === 'Small' ? 'sm' : 'med' },
      currency: { ...c.currency },
      spells: Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`spell${i + 1}`, { value: Math.max(0, (d5.spellSlots(c, d)[i] ?? 0) - (c.spells.slotsUsed[i] ?? 0)) }])),
    },
    items,
    flags: { rmhcharacters: { character: c } },
  };
}

const PF_RANK = (r: Pf2eRank) => r;

export function exportFoundryPf2e(c: Pf2eCharacter, d: Pf2eData) {
  const items: unknown[] = [];
  const ancestry = p2.ancestryOf(d, c);
  if (ancestry) items.push(item('ancestry', ancestry.name, { slug: ancestry.id, hp: ancestry.hp, speed: ancestry.speed, size: ancestry.size.toLowerCase().slice(0, 3), ...desc(ancestry.features.map((f) => `${f.name}. ${f.text}`).join('\n\n')) }));
  const heritage = p2.heritageOf(d, c);
  if (heritage) items.push(item('heritage', heritage.name, { slug: heritage.id, ancestry: ancestry ? { name: ancestry.name, slug: ancestry.id } : null, ...desc(heritage.text) }));
  const bg = p2.backgroundOf(d, c);
  if (bg) items.push(item('background', bg.name, { slug: bg.id, ...desc(bg.text), trainedSkills: { value: bg.skills, lore: [bg.lore] } }));
  const klass = p2.classOf(d, c);
  if (klass) items.push(item('class', klass.name, { slug: klass.id, hp: klass.hp, keyAbility: { value: klass.keyAbility, selected: c.boosts.class }, ...desc(klass.features.filter((f) => f.level <= c.level).map((f) => `${f.name} (${f.level}). ${f.text}`).join('\n\n')) }));
  for (const f of c.feats) {
    const feat = d.feats.find((x) => x.id === f.featId);
    const name = feat?.name ?? f.customName;
    if (!name) continue;
    items.push(item('feat', name, { slug: feat?.id ?? '', level: { value: feat?.level ?? 1 }, category: feat?.type ?? 'bonus', location: f.slot, traits: { value: (feat?.traits ?? []).map((t) => t.toLowerCase()) }, actionType: { value: feat?.actions === 'reaction' ? 'reaction' : feat?.actions === 'free' ? 'free' : feat?.actions ? 'action' : 'passive' }, actions: { value: /^\d$/.test(feat?.actions ?? '') ? Number(feat?.actions) : null }, ...desc(feat?.text ?? '') }));
  }
  const sc = p2.spellcasting(c, d);
  const entryId = foundryId();
  if (sc) {
    items.push({ _id: entryId, name: `${klass?.name ?? ''} Spells`, type: 'spellcastingEntry', img: '', system: { tradition: { value: sc.tradition }, prepared: { value: sc.type }, ability: { value: sc.ability }, proficiency: { value: sc.rank } }, flags: {} });
  }
  for (const id of new Set([...c.spells.known, ...c.spells.focusSpells])) {
    const s = d.spells.find((x) => x.id === id);
    if (!s) continue;
    items.push(item('spell', s.name, { slug: s.id, level: { value: Math.max(1, s.rank) }, traits: { value: [...s.traits.map((t) => t.toLowerCase()), ...(s.rank === 0 ? ['cantrip'] : [])], traditions: s.traditions }, time: { value: s.actions }, range: { value: s.range ?? '' }, area: s.area ? { value: s.area } : null, duration: { value: s.duration ?? '' }, location: { value: sc ? entryId : null }, ...desc(`${s.text}${s.heightened ? `\n\n${s.heightened}` : ''}`) }));
  }
  for (const inv of c.inventory) {
    const w = d.weapons.find((x) => x.id === inv.refId);
    const a = d.armor.find((x) => x.id === inv.refId);
    if (w) items.push(item('weapon', inv.name, { slug: w.id, quantity: inv.quantity, category: w.category, group: w.group, damage: { dice: 1, die: w.damage.replace(/^\d*/, ''), damageType: { B: 'bludgeoning', P: 'piercing', S: 'slashing' }[w.damageType] }, traits: { value: w.traits.map((t) => t.toLowerCase()) }, bulk: { value: w.bulk }, equipped: { carryType: inv.equipped ? 'held' : 'worn', handsHeld: inv.equipped ? Number.parseInt(w.hands, 10) || 1 : 0 } }));
    else if (a) items.push(item(a.category === 'shield' ? 'shield' : 'armor', inv.name, { slug: a.id, quantity: inv.quantity, category: a.category, acBonus: a.acBonus, dexCap: a.dexCap ?? null, checkPenalty: a.checkPenalty, speedPenalty: a.speedPenalty, strength: a.strength ?? null, bulk: { value: a.bulk }, equipped: { carryType: 'worn', inSlot: inv.equipped || c.armorId === a.id } }));
    else items.push(item('equipment', inv.name, { quantity: inv.quantity, bulk: { value: inv.bulk ?? 0 }, ...desc(inv.notes ?? '') }));
  }
  for (const [coin, value] of Object.entries(c.currency)) if (value && coin !== 'ep') items.push(item('treasure', { pp: 'Platinum Pieces', gp: 'Gold Pieces', sp: 'Silver Pieces', cp: 'Copper Pieces' }[coin] ?? coin, { quantity: value, category: 'coin', price: { value: { [coin]: 1 } } }));
  for (const e of c.custom) items.push(item('feat', e.name, { category: 'bonus', ...desc(e.text) }));
  const boosts: Record<string, string[]> = {};
  for (const [lvl, list] of Object.entries(c.boosts.levels)) boosts[lvl] = list;
  return {
    name: c.name || 'Unnamed',
    type: 'character',
    img: c.portrait ?? 'systems/pf2e/icons/default-icons/character.svg',
    system: {
      details: {
        level: { value: c.level },
        xp: { value: c.xp, max: 1000 },
        biography: { appearance: toHtml(c.appearance), backstory: toHtml(c.backstory), edicts: [], anathema: [] },
        languages: { value: c.languages.map((l) => l.toLowerCase()) },
        keyability: { value: c.boosts.class },
      },
      build: { attributes: { boosts, flaws: { ancestry: c.boosts.ancestryFlaws }, allowedBoosts: {} } },
      attributes: { hp: { value: c.hp.current || p2.maxHp(c, d), temp: c.hp.temp } },
      resources: { heroPoints: { value: c.heroPoints, max: 3 }, focus: { value: c.focusPoints, max: p2.focusPointsMax(c) } },
      skills: Object.fromEntries(PF2E_SKILLS.map((s) => [s, { rank: PF_RANK(p2.skillRank(c, s)) }])),
    },
    items,
    flags: { rmhcharacters: { character: c } },
  };
}

/* ========================================================================== */
/* Import                                                                     */
/* ========================================================================== */

export function isFoundryActor(json: unknown): json is Obj {
  return isObj(json) && isObj(json.system) && Array.isArray(json.items) && typeof json.name === 'string';
}

function fromFlag(json: Obj): Character | null {
  const flags = isObj(json.flags) ? json.flags : {};
  const ours = isObj(flags.rmhcharacters) ? flags.rmhcharacters : null;
  return ours ? normalizeCharacter(ours.character) : null;
}

function itemsOf(json: Obj, type: string): Obj[] {
  return asArr(json.items).filter((i): i is Obj => isObj(i) && i.type === type);
}

const sys = (o: Obj): Obj => (isObj(o.system) ? o.system : isObj(o.data) ? o.data : {});
const descOf = (o: Obj) => {
  const s = sys(o);
  const dsc = isObj(s.description) ? s.description : {};
  return stripHtml(asStr(dsc.value));
};

/** Detect which system a Foundry actor belongs to. */
export function foundrySystemOf(json: Obj): 'dnd5e' | 'pf2e' {
  const types = new Set(asArr(json.items).map((i) => (isObj(i) ? i.type : '')));
  if (types.has('ancestry') || types.has('heritage') || types.has('spellcastingEntry')) return 'pf2e';
  const s = sys(json);
  if (isObj(s.build) || (isObj(s.details) && isObj((s.details as Obj).level))) return 'pf2e';
  return 'dnd5e';
}

export function importFoundryDnd5e(json: Obj, d: Dnd5eData): Dnd5eCharacter {
  const flagged = fromFlag(json);
  if (flagged?.system === 'dnd5e') return flagged;
  const c = newDnd5e();
  const s = sys(json);
  c.name = asStr(json.name).slice(0, 120);
  c.abilityMethod = 'manual';
  const abilities = isObj(s.abilities) ? s.abilities : {};
  for (const a of ABILITIES) {
    const v = isObj(abilities[a]) ? (abilities[a] as Obj).value : undefined;
    c.baseAbilities[a] = Math.min(30, Math.max(1, asNum(v, 10)));
  }
  const attrs = isObj(s.attributes) ? s.attributes : {};
  const hp = isObj(attrs.hp) ? attrs.hp : {};
  c.hp = { current: asNum(hp.value), temp: asNum(hp.temp) };
  const details = isObj(s.details) ? s.details : {};
  const bio = isObj(details.biography) ? details.biography : {};
  c.backstory = stripHtml(asStr(bio.value));
  c.appearance = asStr(details.appearance);
  c.personality = asStr(details.trait);
  c.xp = asNum(isObj(details.xp) ? details.xp.value : 0);
  const skills = isObj(s.skills) ? s.skills : {};
  for (const [key, val] of Object.entries(skills)) {
    const id = DND_KEY_SKILL[key];
    const rank = isObj(val) ? asNum(val.value) : 0;
    if (!id || !rank) continue;
    c.skills.push(id);
    if (rank >= 2) c.expertise.push(id);
  }
  const cur = isObj(s.currency) ? s.currency : {};
  c.currency = { pp: asNum(cur.pp), gp: asNum(cur.gp), ep: asNum(cur.ep), sp: asNum(cur.sp), cp: asNum(cur.cp) };
  const traits = isObj(s.traits) ? s.traits : {};
  const langs = isObj(traits.languages) ? traits.languages : {};
  c.languages = [...asArr(langs.value).map(asStr), ...asStr(langs.custom).split(/[;,]/)].map((x) => x.trim()).filter(Boolean).map((x) => x[0]!.toUpperCase() + x.slice(1));
  const race = itemsOf(json, 'race')[0];
  const species = race && matchByName(d.species, race.name);
  if (species) c.speciesId = species.id;
  else if (race) c.custom.push({ id: newId(), name: asStr(race.name), text: descOf(race), kind: 'Species' });
  const bgItem = itemsOf(json, 'background')[0];
  const bg = bgItem && matchByName(d.backgrounds, bgItem.name);
  if (bg) c.backgroundId = bg.id;
  else if (bgItem) c.custom.push({ id: newId(), name: asStr(bgItem.name), text: descOf(bgItem), kind: 'Background' });
  const subclasses = itemsOf(json, 'subclass');
  for (const ci of itemsOf(json, 'class')) {
    const klass = matchByName(d.classes, ci.name) ?? matchByName(d.classes, sys(ci).identifier);
    if (!klass) {
      c.custom.push({ id: newId(), name: `${asStr(ci.name)} ${asNum(sys(ci).levels, 1)}`, text: descOf(ci), kind: 'Class' });
      continue;
    }
    const level = Math.min(20, Math.max(1, asNum(sys(ci).levels, 1)));
    const subItem = subclasses.find((x) => asStr(sys(x).classIdentifier) === klass.id || asStr(sys(x).classIdentifier) === asStr(sys(ci).identifier));
    const sub = subItem && matchByName(klass.subclasses, subItem.name);
    c.classes.push({
      classId: klass.id,
      level,
      hpRolls: [],
      ...(sub ? { subclassId: sub.id } : subItem ? { customSubclass: asStr(subItem.name) } : {}),
    });
  }
  // Scores in Foundry are final; the base is the final value, so no background increases are re-applied.
  for (const fi of itemsOf(json, 'feat')) {
    const feat = matchByName(d.feats, fi.name);
    if (feat?.category === 'origin' && !c.originFeats.includes(feat.id)) c.originFeats.push(feat.id);
    else if (!feat) {
      const name = asStr(fi.name);
      const isClassFeature = d.classes.some((k) => k.features.some((f) => f.name === name) || k.subclasses.some((sc) => sc.features.some((f) => f.name === name)));
      const isTrait = d.species.some((sp) => sp.traits.some((t) => t.name === name));
      if (!isClassFeature && !isTrait) c.custom.push({ id: newId(), name, text: descOf(fi), kind: 'Feature' });
    }
  }
  for (const si of itemsOf(json, 'spell')) {
    const spell = matchByName(d.spells, si.name);
    if (!spell) {
      c.custom.push({ id: newId(), name: asStr(si.name), text: descOf(si), kind: 'Spell' });
      continue;
    }
    c.spells.known.push(spell.id);
    const prep = isObj(sys(si).preparation) ? (sys(si).preparation as Obj) : {};
    if (prep.prepared === true || spell.level === 0) c.spells.prepared.push(spell.id);
  }
  for (const type of ['weapon', 'equipment', 'consumable', 'tool', 'loot', 'container']) {
    for (const ii of itemsOf(json, type)) {
      const s2 = sys(ii);
      const ref = matchByName(d.weapons, ii.name) ?? matchByName(d.armor, ii.name) ?? matchByName(d.gear, ii.name);
      const weight = isObj(s2.weight) ? asNum(s2.weight.value) : asNum(s2.weight);
      const equipped = s2.equipped === true;
      c.inventory.push({ id: newId(), name: asStr(ii.name), quantity: Math.max(1, asNum(s2.quantity, 1)), weight, equipped, ...(ref ? { refId: ref.id } : {}) });
      const armor = d.armor.find((a) => a.id === ref?.id);
      if (armor && equipped) {
        if (armor.category === 'shield') c.shield = true;
        else c.armorId = armor.id;
      }
    }
  }
  const portrait = asStr(json.img);
  if (portrait.startsWith('data:image/')) c.portrait = portrait;
  return (normalizeCharacter(c) as Dnd5eCharacter | null) ?? c;
}

const PF_ATTR = (v: unknown): Ability | null => {
  const s = asStr(v).toLowerCase().slice(0, 3);
  return (ABILITIES as readonly string[]).includes(s) ? (s as Ability) : null;
};

export function importFoundryPf2e(json: Obj, d: Pf2eData): Pf2eCharacter {
  const flagged = fromFlag(json);
  if (flagged?.system === 'pf2e') return flagged;
  const c = newPf2e();
  const s = sys(json);
  c.name = asStr(json.name).slice(0, 120);
  const details = isObj(s.details) ? s.details : {};
  c.level = Math.min(20, Math.max(1, asNum(isObj(details.level) ? details.level.value : 1, 1)));
  const bio = isObj(details.biography) ? details.biography : {};
  c.appearance = stripHtml(asStr(bio.appearance));
  c.backstory = stripHtml(asStr(bio.backstory));
  const langs = isObj(details.languages) ? details.languages : {};
  c.languages = asArr(langs.value).map(asStr).filter(Boolean).map((x) => x[0]!.toUpperCase() + x.slice(1));
  const anc = itemsOf(json, 'ancestry')[0];
  const ancestry = anc && matchByName(d.ancestries, anc.name);
  if (ancestry) {
    c.ancestryId = ancestry.id;
    c.boosts.ancestryFlaws = [...ancestry.flaws];
  }
  const her = itemsOf(json, 'heritage')[0];
  const heritage = her && (matchByName(ancestry?.heritages ?? [], her.name) ?? matchByName(d.versatileHeritages, her.name));
  if (heritage) c.heritageId = heritage.id;
  const bgi = itemsOf(json, 'background')[0];
  const bg = bgi && matchByName(d.backgrounds, bgi.name);
  if (bg) c.backgroundId = bg.id;
  const cli = itemsOf(json, 'class')[0];
  const klass = cli && matchByName(d.classes, cli.name);
  if (klass) c.classId = klass.id;
  const build = isObj(s.build) && isObj((s.build as Obj).attributes) ? ((s.build as Obj).attributes as Obj) : {};
  const boosts = isObj(build.boosts) ? build.boosts : {};
  for (const lvl of ['1', '5', '10', '15', '20']) {
    const list = asArr(boosts[lvl]).map(PF_ATTR).filter((a): a is Ability => Boolean(a));
    if (list.length) c.boosts.levels[lvl] = list.slice(0, 4);
  }
  const key = PF_ATTR(isObj(details.keyability) ? details.keyability.value : null) ?? (klass?.keyAbility.length === 1 ? klass.keyAbility[0]! : null);
  c.boosts.class = key;
  // Ancestry and background boosts live on those items in Foundry; read what they recorded.
  const pick = (it: Obj | undefined): Ability[] => {
    if (!it) return [];
    const b = isObj(sys(it).boosts) ? (sys(it).boosts as Obj) : {};
    return Object.values(b).map((x) => (isObj(x) ? PF_ATTR(x.selected) : null)).filter((a): a is Ability => Boolean(a));
  };
  c.boosts.ancestry = pick(anc);
  c.boosts.background = pick(bgi);
  const skills = isObj(s.skills) ? s.skills : {};
  for (const sk of PF2E_SKILLS) {
    const v = skills[sk];
    const rank = isObj(v) ? asNum(v.rank) : 0;
    if (rank >= 1) c.trainedSkills.push(sk);
    // Spread later ranks over the skill-increase schedule.
    for (let r = 2; r <= rank; r++) {
      const free = p2.skillIncreaseLevels(c, d, 20).find((l) => !c.skillIncreases[String(l)] && (r < 3 || l >= 7) && (r < 4 || l >= 15));
      if (free !== undefined) c.skillIncreases[String(free)] = sk;
    }
  }
  for (const lore of itemsOf(json, 'lore')) c.lores.push(asStr(lore.name));
  for (const fi of itemsOf(json, 'feat')) {
    const feat = matchByName(d.feats, fi.name);
    const location = asStr(sys(fi).location);
    const slot = location && !/^[A-Za-z0-9]{16}$/.test(location) ? location : feat ? `${feat.type === 'archetype' ? 'class' : feat.type}-${feat.level}` : '';
    if (feat) c.feats.push({ slot, featId: feat.id });
    else if (asStr(sys(fi).category) !== 'classfeature' && asStr(sys(fi).category) !== 'ancestryfeature') c.feats.push({ slot: slot || 'custom', customName: asStr(fi.name) });
  }
  for (const si of itemsOf(json, 'spell')) {
    const spell = matchByName(d.spells, si.name);
    if (spell?.focus) c.spells.focusSpells.push(spell.id);
    else if (spell) c.spells.known.push(spell.id);
    else c.custom.push({ id: newId(), name: asStr(si.name), text: descOf(si), kind: 'Spell' });
  }
  for (const type of ['weapon', 'armor', 'shield', 'equipment', 'consumable', 'backpack']) {
    for (const ii of itemsOf(json, type)) {
      const ref = matchByName(d.weapons, ii.name) ?? matchByName(d.armor, ii.name) ?? matchByName(d.gear, ii.name);
      const s2 = sys(ii);
      const eq = isObj(s2.equipped) ? s2.equipped : {};
      const equipped = eq.inSlot === true || eq.carryType === 'held';
      c.inventory.push({ id: newId(), name: asStr(ii.name), quantity: Math.max(1, asNum(s2.quantity, 1)), bulk: isObj(s2.bulk) ? asNum(s2.bulk.value) : 0, equipped, ...(ref ? { refId: ref.id } : {}) });
      if (type === 'armor' && equipped && ref) c.armorId = ref.id;
    }
  }
  for (const ti of itemsOf(json, 'treasure')) {
    const n = asStr(ti.name).toLowerCase();
    const q = asNum(sys(ti).quantity);
    if (n.startsWith('platinum')) c.currency.pp += q;
    else if (n.startsWith('gold')) c.currency.gp += q;
    else if (n.startsWith('silver')) c.currency.sp += q;
    else if (n.startsWith('copper')) c.currency.cp += q;
  }
  const res = isObj(s.resources) ? s.resources : {};
  c.heroPoints = asNum(isObj(res.heroPoints) ? res.heroPoints.value : 1, 1);
  const portrait = asStr(json.img);
  if (portrait.startsWith('data:image/')) c.portrait = portrait;
  return (normalizeCharacter(c) as Pf2eCharacter | null) ?? c;
}
