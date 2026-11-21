/**
 * D&D 5e (2024 / SRD 5.2) derived statistics. Pure functions of a character and
 * the rules data; nothing here is stored.
 */
import {
  ABILITIES,
  ABILITY_NAMES,
  type Ability,
  type Dnd5eCharacter,
  type Dnd5eClass,
  type Dnd5eData,
  type Dnd5eFeat,
  type Dnd5eSpellcasting,
  type Dnd5eWeapon,
  type LevelFeature,
} from '../types';
import { DND5E_SKILLS } from './skills';

export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8] as const;
export const POINT_BUY_BUDGET = 27;
const POINT_COST: Record<number, number> = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };

export function pointBuyCost(scores: Record<Ability, number>): number | null {
  let total = 0;
  for (const a of ABILITIES) {
    const cost = POINT_COST[scores[a]];
    if (cost === undefined) return null;
    total += cost;
  }
  return total;
}

export const abilityMod = (score: number) => Math.floor((score - 10) / 2);
export const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

export function totalLevel(c: Dnd5eCharacter): number {
  return Math.max(
    1,
    c.classes.reduce((n, k) => n + k.level, 0),
  );
}

export const proficiencyBonus = (level: number) => 2 + Math.floor((Math.max(1, level) - 1) / 4);

/** XP thresholds for levels 1–20 (unchanged in 2024). */
export const XP_FOR_LEVEL = [
  0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000, 165000, 195000, 225000,
  265000, 305000, 355000,
];

const byId = <T extends { id: string }>(xs: T[], id: string | undefined) =>
  id ? xs.find((x) => x.id === id) : undefined;

export function classOf(data: Dnd5eData, id: string) {
  return byId(data.classes, id);
}

export function featById(data: Dnd5eData, id: string | undefined): Dnd5eFeat | undefined {
  return byId(data.feats, id);
}

/** Every feat the character has, with the slot it came from. */
export function allFeats(c: Dnd5eCharacter, data: Dnd5eData): { feat: Dnd5eFeat; source: string }[] {
  const out: { feat: Dnd5eFeat; source: string }[] = [];
  for (const id of c.originFeats) {
    const f = featById(data, id);
    if (f) out.push({ feat: f, source: 'Origin' });
  }
  for (const choice of c.asi) {
    if (choice.kind !== 'feat') continue;
    const f = featById(data, choice.featId);
    if (f) out.push({ feat: f, source: choice.slot });
  }
  for (const [key, value] of Object.entries(c.choices)) {
    if (!key.endsWith(':fighting-style')) continue;
    const f = featById(data, value);
    if (f) out.push({ feat: f, source: 'Fighting Style' });
  }
  return out;
}

export function hasFeat(c: Dnd5eCharacter, data: Dnd5eData, id: string): boolean {
  return allFeats(c, data).some((f) => f.feat.id === id);
}

/** Final ability scores: base + background + ASIs + feat increases, capped (20, or 30 for Epic Boons). */
export function abilityScores(c: Dnd5eCharacter, data: Dnd5eData): Record<Ability, number> {
  const out = { ...c.baseAbilities };
  for (const a of c.backgroundIncreases) out[a] += 1;
  const capped = (a: Ability, cap: number) => {
    if (out[a] < cap) out[a] += 1;
  };
  for (const choice of c.asi) {
    if (choice.kind === 'asi') for (const a of choice.abilities ?? []) capped(a, 20);
    else {
      const f = featById(data, choice.featId);
      const cap = f?.category === 'epic-boon' ? 30 : 20;
      for (const a of choice.featAbilities ?? []) capped(a, cap);
    }
  }
  return out;
}

export function classLevel(c: Dnd5eCharacter, classId: string): number {
  return c.classes.find((k) => k.classId === classId)?.level ?? 0;
}

export function saveProficiencies(c: Dnd5eCharacter, data: Dnd5eData): Ability[] {
  const first = c.classes[0];
  const k = first ? classOf(data, first.classId) : undefined;
  const saves = new Set<Ability>(k?.saves ?? []);
  // Resilient-style feats name their ability in featAbilities.
  for (const choice of c.asi) {
    if (choice.kind === 'feat' && choice.featId === 'resilient')
      for (const a of choice.featAbilities ?? []) saves.add(a);
  }
  // Monk 14: Disciplined Survivor grants all saves.
  if (classLevel(c, 'monk') >= 14) for (const a of ABILITIES) saves.add(a);
  return [...saves];
}

export interface SkillLine {
  id: string;
  name: string;
  ability: Ability;
  proficient: boolean;
  expertise: boolean;
  bonus: number;
}

export function skillLines(c: Dnd5eCharacter, data: Dnd5eData): SkillLine[] {
  const scores = abilityScores(c, data);
  const pb = proficiencyBonus(totalLevel(c));
  const jack = classLevel(c, 'bard') >= 2;
  return DND5E_SKILLS.map((s) => {
    const proficient = c.skills.includes(s.id);
    const expertise = proficient && c.expertise.includes(s.id);
    const prof = expertise ? pb * 2 : proficient ? pb : jack ? Math.floor(pb / 2) : 0;
    return { ...s, proficient, expertise, bonus: abilityMod(scores[s.ability]) + prof };
  });
}

/** Average HP per level for a hit die (2024: die/2 + 1). */
export const hitDieAverage = (die: number) => die / 2 + 1;

export function maxHp(c: Dnd5eCharacter, data: Dnd5eData): number {
  const con = abilityMod(abilityScores(c, data).con);
  let hp = 0;
  c.classes.forEach((k, index) => {
    const klass = classOf(data, k.classId);
    const die = klass?.hitDie ?? 8;
    for (let lvl = 1; lvl <= k.level; lvl++) {
      const isFirstCharacterLevel = index === 0 && lvl === 1;
      // hpRolls holds one entry per level after the character's very first one.
      const rollIndex = index === 0 ? lvl - 2 : lvl - 1;
      const roll = isFirstCharacterLevel ? die : (k.hpRolls[rollIndex] ?? hitDieAverage(die));
      hp += Math.max(1, roll + con);
    }
  });
  const level = totalLevel(c);
  if (c.speciesId === 'dwarf') hp += level;
  if (hasFeat(c, data, 'tough')) hp += level * 2;
  const sorc = c.classes.find((k) => k.classId === 'sorcerer');
  if (sorc && sorc.subclassId === 'draconic-sorcery' && sorc.level >= 3) hp += sorc.level;
  return Math.max(1, hp);
}

export function hitDice(c: Dnd5eCharacter, data: Dnd5eData): { die: number; count: number }[] {
  const pool = new Map<number, number>();
  for (const k of c.classes) {
    const die = classOf(data, k.classId)?.hitDie ?? 8;
    pool.set(die, (pool.get(die) ?? 0) + k.level);
  }
  return [...pool.entries()].sort((a, b) => b[0] - a[0]).map(([die, count]) => ({ die, count }));
}

export interface ArmorClassBreakdown {
  value: number;
  formula: string;
}

export function armorClass(c: Dnd5eCharacter, data: Dnd5eData): ArmorClassBreakdown {
  const s = abilityScores(c, data);
  const dex = abilityMod(s.dex);
  const armor = byId(data.armor, c.armorId);
  const shield = c.shield ? (data.armor.find((a) => a.category === 'shield')?.ac ?? 2) : 0;
  const candidates: ArmorClassBreakdown[] = [];
  if (armor && armor.category !== 'shield') {
    const d = armor.dexCap === undefined ? dex : Math.min(dex, armor.dexCap);
    const defense = hasFeat(c, data, 'defense') ? 1 : 0;
    candidates.push({
      value: armor.ac + d + defense,
      formula: `${armor.name} ${armor.ac}${d ? ` ${signed(d)} Dex` : ''}${defense ? ' +1 Defense' : ''}`,
    });
  } else {
    candidates.push({ value: 10 + dex, formula: `10 ${signed(dex)} Dex` });
    if (classLevel(c, 'barbarian') >= 1) {
      const con = abilityMod(s.con);
      candidates.push({ value: 10 + dex + con, formula: `Unarmored Defense 10 ${signed(dex)} Dex ${signed(con)} Con` });
    }
    if (classLevel(c, 'monk') >= 1 && !c.shield) {
      const wis = abilityMod(s.wis);
      candidates.push({ value: 10 + dex + wis, formula: `Unarmored Defense 10 ${signed(dex)} Dex ${signed(wis)} Wis` });
    }
    const sorc = c.classes.find((k) => k.classId === 'sorcerer');
    if (sorc?.subclassId === 'draconic-sorcery' && sorc.level >= 3) {
      const cha = abilityMod(s.cha);
      candidates.push({
        value: 10 + dex + cha,
        formula: `Draconic Resilience 10 ${signed(dex)} Dex ${signed(cha)} Cha`,
      });
    }
  }
  const best = candidates.reduce((a, b) => (b.value > a.value ? b : a));
  return shield ? { value: best.value + shield, formula: `${best.formula} +${shield} Shield` } : best;
}

export function speed(c: Dnd5eCharacter, data: Dnd5eData): number {
  const species = byId(data.species, c.speciesId);
  let feet = species?.speed ?? 30;
  const armor = byId(data.armor, c.armorId);
  if (armor?.strength && abilityScores(c, data).str < armor.strength) feet -= 10;
  const monk = classLevel(c, 'monk');
  if (monk >= 2 && !armor && !c.shield)
    feet += monk >= 18 ? 30 : monk >= 14 ? 25 : monk >= 10 ? 20 : monk >= 6 ? 15 : 10;
  const barb = classLevel(c, 'barbarian');
  if (barb >= 5 && armor?.category !== 'heavy') feet += 10;
  if (hasFeat(c, data, 'speedy')) feet += 10;
  return feet;
}

export function initiative(c: Dnd5eCharacter, data: Dnd5eData): number {
  const dex = abilityMod(abilityScores(c, data).dex);
  return dex + (hasFeat(c, data, 'alert') ? proficiencyBonus(totalLevel(c)) : 0);
}

/* -------------------------------------------------------------------------- */
/* Spellcasting                                                               */
/* -------------------------------------------------------------------------- */

/** Spell slots by caster level (multiclass table), index = spell level - 1. */
const SLOTS: number[][] = [
  [2],
  [3],
  [4, 2],
  [4, 3],
  [4, 3, 2],
  [4, 3, 3],
  [4, 3, 3, 1],
  [4, 3, 3, 2],
  [4, 3, 3, 3, 1],
  [4, 3, 3, 3, 2],
  [4, 3, 3, 3, 2, 1],
  [4, 3, 3, 3, 2, 1],
  [4, 3, 3, 3, 2, 1, 1],
  [4, 3, 3, 3, 2, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 2, 1, 1],
];

/** Warlock Pact Magic: [slots, slot level] by warlock level. */
const PACT: [number, number][] = [
  [1, 1],
  [2, 1],
  [2, 2],
  [2, 2],
  [2, 3],
  [2, 3],
  [2, 4],
  [2, 4],
  [2, 5],
  [2, 5],
  [3, 5],
  [3, 5],
  [3, 5],
  [3, 5],
  [3, 5],
  [3, 5],
  [4, 5],
  [4, 5],
  [4, 5],
  [4, 5],
];

export interface CasterEntry {
  classId: string;
  name: string;
  level: number;
  casting: Dnd5eSpellcasting;
  ability: Ability;
  saveDc: number;
  attack: number;
  cantrips: number;
  prepared: number;
}

function castingFor(data: Dnd5eData, classId: string, subclassId?: string): Dnd5eSpellcasting | undefined {
  const k = classOf(data, classId);
  if (k?.spellcasting) return k.spellcasting;
  return k?.subclasses.find((s) => s.id === subclassId)?.spellcasting;
}

export function casters(c: Dnd5eCharacter, data: Dnd5eData): CasterEntry[] {
  const scores = abilityScores(c, data);
  const pb = proficiencyBonus(totalLevel(c));
  const out: CasterEntry[] = [];
  for (const k of c.classes) {
    const casting = castingFor(data, k.classId, k.subclassId);
    if (!casting) continue;
    const mod = abilityMod(scores[casting.ability]);
    const idx = Math.min(19, k.level - 1);
    out.push({
      classId: k.classId,
      name: classOf(data, k.classId)?.name ?? k.classId,
      level: k.level,
      casting,
      ability: casting.ability,
      saveDc: 8 + pb + mod,
      attack: pb + mod,
      cantrips: casting.cantrips[idx] ?? 0,
      prepared: casting.prepared[idx] ?? 0,
    });
  }
  return out;
}

/** Shared spell slots (not Pact Magic), index = spell level - 1. */
export function spellSlots(c: Dnd5eCharacter, data: Dnd5eData): number[] {
  let casterLevel = 0;
  let halfLevels = 0;
  for (const k of c.classes) {
    const casting = castingFor(data, k.classId, k.subclassId);
    if (!casting) continue;
    if (casting.progression === 'full') casterLevel += k.level;
    else if (casting.progression === 'half') halfLevels += k.level;
    else if (casting.progression === 'third') casterLevel += Math.floor(k.level / 3);
  }
  // 2024: half casters count half their levels, rounded up.
  casterLevel += Math.ceil(halfLevels / 2);
  if (casterLevel <= 0) return [];
  return [...(SLOTS[Math.min(20, casterLevel) - 1] ?? [])];
}

export function pactSlots(c: Dnd5eCharacter): { slots: number; level: number } | null {
  const w = classLevel(c, 'warlock');
  if (!w) return null;
  const [slots, level] = PACT[Math.min(20, w) - 1] ?? [1, 1];
  return { slots, level };
}

export function maxSpellLevel(c: Dnd5eCharacter, data: Dnd5eData): number {
  return Math.max(spellSlots(c, data).length, pactSlots(c)?.level ?? 0);
}

/** Spell ids always prepared by subclass features at the current level. */
export function alwaysPreparedSpells(c: Dnd5eCharacter, data: Dnd5eData): string[] {
  const out = new Set<string>();
  for (const k of c.classes) {
    const sub = classOf(data, k.classId)?.subclasses.find((s) => s.id === k.subclassId);
    for (const row of sub?.alwaysPrepared ?? []) if (row.level <= k.level) for (const s of row.spells) out.add(s);
  }
  return [...out];
}

/* -------------------------------------------------------------------------- */
/* Attacks                                                                    */
/* -------------------------------------------------------------------------- */

export interface AttackLine {
  name: string;
  toHit: number;
  damage: string;
  notes: string;
}

function weaponProficient(c: Dnd5eCharacter, data: Dnd5eData, w: Dnd5eWeapon): boolean {
  return c.classes.some((k, i) => {
    const klass = classOf(data, k.classId);
    const list = i === 0 ? (klass?.weaponProficiencies ?? []) : (klass?.multiclass.proficienciesGained ?? []);
    return list.some((p) => p.toLowerCase().includes(w.category) || p.toLowerCase().includes(w.name.toLowerCase()));
  });
}

export function attacks(c: Dnd5eCharacter, data: Dnd5eData): AttackLine[] {
  const scores = abilityScores(c, data);
  const str = abilityMod(scores.str);
  const dex = abilityMod(scores.dex);
  const pb = proficiencyBonus(totalLevel(c));
  const lines: AttackLine[] = [];
  const monk = classLevel(c, 'monk');
  const archery = hasFeat(c, data, 'archery');
  for (const item of c.inventory) {
    if (!item.equipped) continue;
    const w = byId(data.weapons, item.refId);
    if (!w) continue;
    const finesse = w.properties.some((p) => p.toLowerCase().startsWith('finesse'));
    const ranged = w.kind === 'ranged';
    let mod = ranged ? dex : finesse ? Math.max(str, dex) : str;
    if (monk && w.category === 'simple' && !ranged) mod = Math.max(mod, dex);
    const prof = weaponProficient(c, data, w) ? pb : 0;
    const bonus = ranged && archery ? 2 : 0;
    const mastery = c.weaponMasteries.includes(w.id) ? `Mastery: ${w.mastery}` : '';
    lines.push({
      name: item.name || w.name,
      toHit: mod + prof + bonus,
      damage: `${w.damage}${mod ? ` ${signed(mod)}` : ''} ${w.damageType}${w.versatile ? ` (${w.versatile} two-handed)` : ''}`,
      notes: [w.properties.join(', '), w.range ? `Range ${w.range}` : '', mastery].filter(Boolean).join(' · '),
    });
  }
  const unarmedDie = monk ? (monk >= 17 ? '1d12' : monk >= 11 ? '1d10' : monk >= 5 ? '1d8' : '1d6') : '';
  const unarmedMod = monk ? Math.max(str, dex) : str;
  lines.push({
    name: 'Unarmed Strike',
    toHit: unarmedMod + pb,
    damage: unarmedDie ? `${unarmedDie} ${signed(unarmedMod)} Bludgeoning` : `${Math.max(0, 1 + str)} Bludgeoning`,
    notes: 'Or Grapple / Shove (DC ' + (8 + pb + str) + ')',
  });
  return lines;
}

/* -------------------------------------------------------------------------- */
/* Features and resources                                                     */
/* -------------------------------------------------------------------------- */

export interface FeatureLine extends LevelFeature {
  source: string;
}

export function features(c: Dnd5eCharacter, data: Dnd5eData): FeatureLine[] {
  const out: FeatureLine[] = [];
  const species = byId(data.species, c.speciesId);
  for (const t of species?.traits ?? []) out.push({ ...t, level: 1, source: species?.name ?? '' });
  const option = species?.options?.choices.find((o) => o.id === c.speciesOption);
  if (option) out.push({ name: option.name, text: option.text, level: 1, source: species?.options?.label ?? '' });
  for (const k of c.classes) {
    const klass = classOf(data, k.classId);
    if (!klass) continue;
    for (const f of klass.features) if (f.level <= k.level) out.push({ ...f, source: klass.name });
    const sub = klass.subclasses.find((s) => s.id === k.subclassId);
    for (const f of sub?.features ?? []) if (f.level <= k.level) out.push({ ...f, source: sub?.name ?? '' });
    if (k.customSubclass)
      out.push({
        name: k.customSubclass,
        text: 'Subclass from another book; see Custom entries.',
        level: klass.subclassLevel,
        source: klass.name,
      });
  }
  for (const { feat, source } of allFeats(c, data))
    out.push({ name: feat.name, text: feat.text, level: 1, source: `Feat (${source})` });
  return out;
}

export function resources(c: Dnd5eCharacter, data: Dnd5eData): { name: string; value: string; recharge?: string }[] {
  const out: { name: string; value: string; recharge?: string }[] = [];
  for (const k of c.classes) {
    const klass = classOf(data, k.classId);
    for (const r of klass?.resources ?? []) {
      const v = r.values[Math.min(19, k.level - 1)];
      if (v === undefined || v === 0 || v === '' || v === '-') continue;
      out.push({ name: r.name, value: String(v), ...(r.recharge ? { recharge: r.recharge } : {}) });
    }
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Level up                                                                   */
/* -------------------------------------------------------------------------- */

export function meetsMulticlass(c: Dnd5eCharacter, data: Dnd5eData, klass: Dnd5eClass): boolean {
  const s = abilityScores(c, data);
  const ok = (k: Dnd5eClass) =>
    k.multiclass.any ? k.multiclass.abilities.some((a) => s[a] >= 13) : k.multiclass.abilities.every((a) => s[a] >= 13);
  const current = c.classes.map((k) => classOf(data, k.classId)).filter((k): k is Dnd5eClass => Boolean(k));
  return ok(klass) && current.every(ok);
}

export interface LevelUpPreview {
  classId: string;
  newClassLevel: number;
  newCharacterLevel: number;
  hitDie: number;
  hpAverage: number;
  features: LevelFeature[];
  subclassChoice: boolean;
  asi: boolean;
  epicBoon: boolean;
  proficiencyBonusUp: boolean;
  newSlots: number[];
  cantripsGained: number;
  preparedGained: number;
  masteryGained: number;
}

export function previewLevelUp(c: Dnd5eCharacter, data: Dnd5eData, classId: string): LevelUpPreview | null {
  const klass = classOf(data, classId);
  if (!klass) return null;
  const current = classLevel(c, classId);
  const next = current + 1;
  if (next > 20 || totalLevel(c) >= 20) return null;
  const sub = klass.subclasses.find((s) => s.id === c.classes.find((k) => k.classId === classId)?.subclassId);
  const nextChar: Dnd5eCharacter = {
    ...c,
    classes: current
      ? c.classes.map((k) => (k.classId === classId ? { ...k, level: next } : k))
      : [...c.classes, { classId, level: 1, hpRolls: [] }],
  };
  const before = spellSlots(c, data);
  const after = spellSlots(nextChar, data);
  const casting = klass.spellcasting;
  const at = (arr: number[] | undefined, lvl: number) => (lvl > 0 ? (arr?.[lvl - 1] ?? 0) : 0);
  const con = abilityMod(abilityScores(c, data).con);
  return {
    classId,
    newClassLevel: next,
    newCharacterLevel: totalLevel(c) + 1,
    hitDie: klass.hitDie,
    hpAverage: Math.max(1, hitDieAverage(klass.hitDie) + con),
    features: [
      ...klass.features.filter((f) => f.level === next),
      ...(sub?.features.filter((f) => f.level === next) ?? []),
    ],
    subclassChoice: next === klass.subclassLevel && !sub,
    asi: klass.asiLevels.includes(next) && next !== 19,
    epicBoon: next === 19 && klass.asiLevels.includes(19),
    proficiencyBonusUp: proficiencyBonus(totalLevel(c) + 1) > proficiencyBonus(totalLevel(c)),
    newSlots: after.map((n, i) => n - (before[i] ?? 0)),
    cantripsGained: at(casting?.cantrips, next) - at(casting?.cantrips, current),
    preparedGained: at(casting?.prepared, next) - at(casting?.prepared, current),
    masteryGained: at(klass.weaponMastery, next) - at(klass.weaponMastery, current),
  };
}

/** Feats the character may take in an ASI slot at their current level. */
export function eligibleFeats(c: Dnd5eCharacter, data: Dnd5eData, category: Dnd5eFeat['category'][]): Dnd5eFeat[] {
  const s = abilityScores(c, data);
  const level = totalLevel(c);
  const have = new Set(allFeats(c, data).map((f) => f.feat.id));
  return data.feats.filter((f) => {
    if (!category.includes(f.category)) return false;
    if (f.minLevel && level < f.minLevel) return false;
    if (have.has(f.id) && !f.repeatable) return false;
    if (f.prereqAbilities) {
      const checks = Object.entries(f.prereqAbilities).map(([a, min]) => s[a as Ability] >= (min ?? 0));
      if (f.prereqAny ? !checks.some(Boolean) : !checks.every(Boolean)) return false;
    }
    return true;
  });
}

/** ASI slots the character's class levels have earned, in order. */
export function asiSlots(c: Dnd5eCharacter, data: Dnd5eData): string[] {
  const slots: string[] = [];
  for (const k of c.classes) {
    const klass = classOf(data, k.classId);
    for (const lvl of klass?.asiLevels ?? []) if (lvl <= k.level) slots.push(`${k.classId}:${lvl}`);
  }
  return slots;
}

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

export function validate(c: Dnd5eCharacter, data: Dnd5eData): string[] {
  const issues: string[] = [];
  if (!c.name.trim()) issues.push('The character has no name.');
  const species = byId(data.species, c.speciesId);
  if (!species) issues.push('Choose a species.');
  if (species?.options && !c.speciesOption) issues.push(`Choose a ${species.options.label}.`);
  if (species?.extraOriginFeat) {
    const bgFeat = byId(data.backgrounds, c.backgroundId)?.featId;
    if (!c.originFeats.some((f) => f !== bgFeat)) issues.push('Choose your extra Origin feat (Versatile).');
  }
  if (!byId(data.backgrounds, c.backgroundId) && !c.custom.some((e) => e.kind === 'Background'))
    issues.push('Choose a background.');
  if (!c.classes.length) issues.push('Choose a class.');
  if (c.abilityMethod === 'pointbuy') {
    const cost = pointBuyCost(c.baseAbilities);
    if (cost === null) issues.push('Point buy scores must be between 8 and 15.');
    else if (cost > POINT_BUY_BUDGET) issues.push(`Point buy spends ${cost} of ${POINT_BUY_BUDGET} points.`);
  }
  if (c.abilityMethod === 'standard') {
    const sorted = ABILITIES.map((a) => c.baseAbilities[a]).sort((a, b) => b - a);
    if (sorted.join() !== [...STANDARD_ARRAY].join())
      issues.push('Standard array scores must be 15, 14, 13, 12, 10 and 8.');
  }
  const bg = byId(data.backgrounds, c.backgroundId);
  // Imported final scores (manual, no increases recorded) already include the background's.
  const importedScores = c.abilityMethod === 'manual' && c.backgroundIncreases.length === 0;
  if (bg && !importedScores) {
    const inc = c.backgroundIncreases;
    const valid = inc.length === 3 && inc.every((a) => bg.abilities.includes(a));
    const counts = new Map<Ability, number>();
    for (const a of inc) counts.set(a, (counts.get(a) ?? 0) + 1);
    const shape = [...counts.values()].sort().join();
    if (!(valid && (shape === '1,1,1' || shape === '1,2')))
      issues.push(
        `Background increases must be +2/+1 or +1/+1/+1 among ${bg.abilities.map((a) => ABILITY_NAMES[a]).join(', ')}.`,
      );
  }
  for (const k of c.classes) {
    const klass = classOf(data, k.classId);
    if (!klass) continue;
    if (k.level >= klass.subclassLevel && !k.subclassId && !k.customSubclass)
      issues.push(`${klass.name} ${k.level}: choose a subclass.`);
  }
  for (const k of c.classes) {
    const klass = classOf(data, k.classId);
    const style = klass?.features.some((f) => f.name.toLowerCase().startsWith('fighting style') && f.level <= k.level);
    if (style && !c.choices[`${k.classId}:fighting-style`]) issues.push(`${klass?.name}: choose a Fighting Style.`);
  }
  const masteries = c.classes.reduce((n, k) => n + (classOf(data, k.classId)?.weaponMastery?.[k.level - 1] ?? 0), 0);
  if (c.weaponMasteries.length < masteries)
    issues.push(`Choose ${masteries - c.weaponMasteries.length} more Weapon Mastery weapon(s).`);
  const filled = new Set(c.asi.map((a) => a.slot));
  for (const slot of asiSlots(c, data))
    if (!filled.has(slot)) issues.push(`Unspent feat or ability improvement (${slot.replace(':', ' level ')}).`);
  for (const a of c.asi) {
    if (a.kind === 'asi' && (a.abilities?.length ?? 0) < 2)
      issues.push(`Pick both ability increases (${a.slot.replace(':', ' level ')}).`);
    const f = a.kind === 'feat' ? featById(data, a.featId) : undefined;
    if (f?.abilityIncrease?.length && !a.featAbilities?.length) issues.push(`${f.name}: choose its ability increase.`);
  }
  const scores = abilityScores(c, data);
  for (const a of ABILITIES)
    if (scores[a] > 20 && !c.asi.some((x) => featById(data, x.featId)?.category === 'epic-boon'))
      issues.push(`${ABILITY_NAMES[a]} is above 20.`);
  const first = c.classes[0] && classOf(data, c.classes[0].classId);
  if (first) {
    const bgSkills = new Set(bg?.skills ?? []);
    const classPicked = c.skills.filter((s) => !bgSkills.has(s));
    if (classPicked.length < first.skillChoices.count)
      issues.push(`Choose ${first.skillChoices.count - classPicked.length} more ${first.name} skill(s).`);
  }
  for (const cast of casters(c, data)) {
    const known = c.spells.prepared.filter((id) =>
      data.spells.find((s) => s.id === id && s.level > 0 && s.classes.includes(cast.casting.list)),
    ).length;
    if (known > cast.prepared && casters(c, data).length === 1)
      issues.push(`${cast.name}: ${known} spells prepared, the limit is ${cast.prepared}.`);
  }
  return issues;
}
