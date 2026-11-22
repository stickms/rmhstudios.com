/**
 * Pathfinder 2e (Remaster) derived statistics. Pure functions of a character and
 * the rules data; nothing here is stored.
 */
import {
  ABILITIES,
  ABILITY_NAMES,
  PF2E_SKILLS,
  type Ability,
  type Pf2eAncestry,
  type Pf2eCharacter,
  type Pf2eClass,
  type Pf2eData,
  type Pf2eFeat,
  type Pf2eHeritage,
  type Pf2eRank,
  type Pf2eStat,
  type Pf2eWeapon,
} from '../types';

export const RANK_NAMES = ['Untrained', 'Trained', 'Expert', 'Master', 'Legendary'] as const;
export const RANK_LETTER = ['U', 'T', 'E', 'M', 'L'] as const;

export const SKILL_ABILITY: Record<string, Ability> = {
  acrobatics: 'dex',
  arcana: 'int',
  athletics: 'str',
  crafting: 'int',
  deception: 'cha',
  diplomacy: 'cha',
  intimidation: 'cha',
  medicine: 'wis',
  nature: 'wis',
  occultism: 'int',
  performance: 'cha',
  religion: 'wis',
  society: 'int',
  stealth: 'dex',
  survival: 'wis',
  thievery: 'dex',
};

export const BOOST_LEVELS = [1, 5, 10, 15, 20] as const;
export const ANCESTRY_FEAT_LEVELS = [1, 5, 9, 13, 17];
export const GENERAL_FEAT_LEVELS = [3, 7, 11, 15, 19];

export const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
const byId = <T extends { id: string }>(xs: T[], id: string | undefined) =>
  id ? xs.find((x) => x.id === id) : undefined;

export const ancestryOf = (d: Pf2eData, c: Pf2eCharacter): Pf2eAncestry | undefined => byId(d.ancestries, c.ancestryId);
export const classOf = (d: Pf2eData, c: Pf2eCharacter): Pf2eClass | undefined => byId(d.classes, c.classId);
export const backgroundOf = (d: Pf2eData, c: Pf2eCharacter) => byId(d.backgrounds, c.backgroundId);
export function heritageOf(d: Pf2eData, c: Pf2eCharacter): Pf2eHeritage | undefined {
  return ancestryOf(d, c)?.heritages.find((h) => h.id === c.heritageId) ?? byId(d.versatileHeritages, c.heritageId);
}

/**
 * Attribute modifiers. Each boost is +1; after character creation a boost to a
 * modifier already at +4 or more is a partial boost, and two partials make +1
 * (Remaster, Player Core p. 26). Flaws are -1.
 */
export function attributeMods(c: Pf2eCharacter): Record<Ability, number> {
  const mod: Record<Ability, number> = { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 };
  const partial: Record<Ability, boolean> = { str: false, dex: false, con: false, int: false, wis: false, cha: false };
  const creation = [
    ...c.boosts.ancestry,
    ...c.boosts.background,
    ...(c.boosts.class ? [c.boosts.class] : []),
    ...(c.boosts.levels['1'] ?? []),
  ];
  for (const a of c.boosts.ancestryAltFree ? [] : c.boosts.ancestryFlaws) mod[a] -= 1;
  for (const a of creation) mod[a] += 1;
  for (const lvl of [5, 10, 15, 20]) {
    if (lvl > c.level) break;
    for (const a of c.boosts.levels[String(lvl)] ?? []) {
      if (mod[a] < 4) mod[a] += 1;
      else if (partial[a]) {
        mod[a] += 1;
        partial[a] = false;
      } else partial[a] = true;
    }
  }
  return mod;
}

/** Partial boosts pending (shown as "+4 ½"). */
export function partialBoosts(c: Pf2eCharacter): Ability[] {
  const out: Ability[] = [];
  // Replay the boosts per attribute and report a partial left hanging.
  for (const a of ABILITIES) {
    let m = 0;
    for (const x of c.boosts.ancestryAltFree ? [] : c.boosts.ancestryFlaws) if (x === a) m -= 1;
    for (const x of [
      ...c.boosts.ancestry,
      ...c.boosts.background,
      ...(c.boosts.class ? [c.boosts.class] : []),
      ...(c.boosts.levels['1'] ?? []),
    ])
      if (x === a) m += 1;
    let half = false;
    for (const lvl of [5, 10, 15, 20]) {
      if (lvl > c.level) break;
      if (!(c.boosts.levels[String(lvl)] ?? []).includes(a)) continue;
      if (m < 4) m += 1;
      else if (half) {
        m += 1;
        half = false;
      } else half = true;
    }
    if (half) out.push(a);
  }
  return out;
}

export const profBonus = (rank: Pf2eRank, level: number) => (rank === 0 ? 0 : rank * 2 + level);

export function statRank(c: Pf2eCharacter, d: Pf2eData, stat: Pf2eStat): Pf2eRank {
  const klass = classOf(d, c);
  let rank: Pf2eRank = 0;
  for (const p of klass?.progression ?? []) if (p.stat === stat && p.level <= c.level && p.rank > rank) rank = p.rank;
  return rank;
}

/** Skill rank: trained at 1st, plus each skill increase taken up to this level (capped by level). */
export function skillRank(c: Pf2eCharacter, skill: string): Pf2eRank {
  let rank = c.trainedSkills.includes(skill) ? 1 : 0;
  const levels = Object.keys(c.skillIncreases)
    .map(Number)
    .sort((a, b) => a - b);
  for (const lvl of levels) {
    if (lvl > c.level || c.skillIncreases[String(lvl)] !== skill) continue;
    const cap = lvl >= 15 ? 4 : lvl >= 7 ? 3 : 2;
    if (rank < cap) rank += 1;
  }
  return Math.min(4, rank) as Pf2eRank;
}

export interface SkillLine {
  id: string;
  name: string;
  ability: Ability;
  rank: Pf2eRank;
  bonus: number;
  armorPenalty: number;
}

function armorOf(c: Pf2eCharacter, d: Pf2eData) {
  return byId(d.armor, c.armorId);
}

export function skillLines(c: Pf2eCharacter, d: Pf2eData): SkillLine[] {
  const mods = attributeMods(c);
  const armor = armorOf(c, d);
  const strMet = armor?.strength !== undefined && mods.str >= armor.strength;
  const penalty = armor && !strMet ? armor.checkPenalty : 0;
  const lines: SkillLine[] = PF2E_SKILLS.map((id) => {
    const ability = SKILL_ABILITY[id] ?? 'int';
    const rank = skillRank(c, id);
    const armorPenalty = (ability === 'str' || ability === 'dex') && id !== 'thievery' ? penalty : 0;
    return {
      id,
      name: id[0]!.toUpperCase() + id.slice(1),
      ability,
      rank,
      armorPenalty,
      bonus: mods[ability] + profBonus(rank, c.level) + armorPenalty,
    };
  });
  for (const lore of c.lores) {
    const rank = skillRank(c, lore);
    lines.push({
      id: lore,
      name: lore,
      ability: 'int',
      rank: (rank || 1) as Pf2eRank,
      armorPenalty: 0,
      bonus: mods.int + profBonus((rank || 1) as Pf2eRank, c.level),
    });
  }
  return lines;
}

export function keyAbility(c: Pf2eCharacter, d: Pf2eData): Ability {
  return c.boosts.class ?? classOf(d, c)?.keyAbility[0] ?? 'str';
}

export function hasFeat(c: Pf2eCharacter, id: string): boolean {
  return c.feats.some((f) => f.featId === id);
}

export function maxHp(c: Pf2eCharacter, d: Pf2eData): number {
  const con = attributeMods(c).con;
  const ancestry = ancestryOf(d, c)?.hp ?? 8;
  const klass = classOf(d, c)?.hp ?? 8;
  let hp = ancestry + (klass + con) * c.level;
  if (hasFeat(c, 'toughness')) hp += c.level;
  if (hasFeat(c, 'mountains-stoutness')) hp += c.level;
  return Math.max(1, hp);
}

export function save(
  c: Pf2eCharacter,
  d: Pf2eData,
  stat: 'fortitude' | 'reflex' | 'will',
): { bonus: number; rank: Pf2eRank } {
  const ability: Ability = stat === 'fortitude' ? 'con' : stat === 'reflex' ? 'dex' : 'wis';
  const rank = statRank(c, d, stat);
  return { rank, bonus: attributeMods(c)[ability] + profBonus(rank, c.level) };
}

export function perception(c: Pf2eCharacter, d: Pf2eData) {
  const rank = statRank(c, d, 'perception');
  return { rank, bonus: attributeMods(c).wis + profBonus(rank, c.level) };
}

export function classDc(c: Pf2eCharacter, d: Pf2eData) {
  const rank = statRank(c, d, 'classDC');
  return { rank, value: 10 + attributeMods(c)[keyAbility(c, d)] + profBonus(rank, c.level) };
}

export function armorClass(c: Pf2eCharacter, d: Pf2eData): { value: number; formula: string; rank: Pf2eRank } {
  const mods = attributeMods(c);
  const armor = armorOf(c, d);
  const category = armor && armor.category !== 'shield' ? armor.category : 'unarmored';
  const rank = statRank(c, d, category);
  const dex = armor?.dexCap === undefined ? mods.dex : Math.min(mods.dex, armor.dexCap);
  const item = armor && armor.category !== 'shield' ? armor.acBonus : 0;
  const shield = c.shieldRaised
    ? (c.inventory.map((i) => byId(d.armor, i.refId)).find((a) => a?.category === 'shield')?.acBonus ?? 2)
    : 0;
  const prof = profBonus(rank, c.level);
  return {
    rank,
    value: 10 + dex + prof + item + shield,
    formula: `10 ${signed(dex)} Dex ${signed(prof)} ${RANK_NAMES[rank]}${item ? ` +${item} ${armor?.name}` : ''}${shield ? ` +${shield} shield` : ''}`,
  };
}

export function speed(c: Pf2eCharacter, d: Pf2eData): number {
  let feet = ancestryOf(d, c)?.speed ?? 25;
  const armor = armorOf(c, d);
  if (armor?.speedPenalty) {
    const met = armor.strength !== undefined && attributeMods(c).str >= armor.strength;
    feet += met ? Math.min(0, armor.speedPenalty + 5) : armor.speedPenalty;
  }
  if (hasFeat(c, 'fleet')) feet += 5;
  return Math.max(5, feet);
}

export function bulk(c: Pf2eCharacter): { carried: number; encumbered: number; max: number } {
  const str = attributeMods(c).str;
  const carried = c.inventory.reduce((n, i) => n + (i.bulk ?? 0) * i.quantity, 0);
  return { carried: Math.floor(carried * 10) / 10, encumbered: 5 + str, max: 10 + str };
}

/* -------------------------------------------------------------------------- */
/* Strikes                                                                    */
/* -------------------------------------------------------------------------- */

export interface StrikeLine {
  name: string;
  attack: [number, number, number];
  damage: string;
  traits: string;
}

export function strikes(c: Pf2eCharacter, d: Pf2eData): StrikeLine[] {
  const mods = attributeMods(c);
  const out: StrikeLine[] = [];
  const weapons: { name: string; w: Pf2eWeapon }[] = [];
  for (const item of c.inventory) {
    if (!item.equipped) continue;
    const w = byId(d.weapons, item.refId);
    if (w) weapons.push({ name: item.name || w.name, w });
  }
  const fist = d.weapons.find((w) => w.id === 'fist');
  if (fist) weapons.push({ name: 'Fist', w: fist });
  for (const { name, w } of weapons) {
    const traits = w.traits.map((t) => t.toLowerCase());
    const finesse = traits.includes('finesse');
    const agile = traits.includes('agile');
    const ranged = w.kind === 'ranged';
    const attackMod = ranged ? mods.dex : finesse ? Math.max(mods.str, mods.dex) : mods.str;
    const rank = statRank(c, d, w.category);
    const first = attackMod + profBonus(rank, c.level);
    const step = agile ? 4 : 5;
    const thrown = traits.some((t) => t.startsWith('thrown'));
    const propulsive = traits.includes('propulsive');
    const dmgMod = !ranged || thrown ? mods.str : propulsive ? (mods.str > 0 ? Math.floor(mods.str / 2) : mods.str) : 0;
    out.push({
      name,
      attack: [first, first - step, first - step * 2],
      damage: `${w.damage}${dmgMod ? ` ${signed(dmgMod)}` : ''} ${w.damageType}`,
      traits: [w.traits.join(', '), w.range ? `range ${w.range} ft` : ''].filter(Boolean).join(' · '),
    });
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Spellcasting                                                               */
/* -------------------------------------------------------------------------- */

export function spellcasting(c: Pf2eCharacter, d: Pf2eData) {
  const klass = classOf(d, c);
  const sc = klass?.spellcasting;
  if (!sc) return null;
  const ability = sc.ability === 'key' ? keyAbility(c, d) : sc.ability;
  const rank = statRank(c, d, 'spell');
  const attack = attributeMods(c)[ability] + profBonus(rank, c.level);
  const tradition = sc.tradition === 'choice' ? (c.spells.tradition ?? 'arcane') : sc.tradition;
  return {
    tradition,
    type: sc.type,
    ability,
    rank,
    attack,
    dc: 10 + attack,
    cantrips: sc.cantrips,
    slots: sc.slots[Math.min(20, c.level) - 1] ?? [],
    maxRank: Math.min(10, Math.ceil(c.level / 2)),
  };
}

export function focusPointsMax(c: Pf2eCharacter): number {
  return Math.min(3, c.spells.focusSpells.length);
}

/* -------------------------------------------------------------------------- */
/* Feat and increase schedule                                                 */
/* -------------------------------------------------------------------------- */

export interface Slot {
  slot: string;
  level: number;
  type: 'ancestry' | 'class' | 'skill' | 'general' | 'bonus';
  label: string;
}

/** Every feat slot the character has earned by their level. */
export function featSlots(c: Pf2eCharacter, d: Pf2eData, upTo = c.level): Slot[] {
  const klass = classOf(d, c);
  const out: Slot[] = [{ slot: 'bonus-1', level: 1, type: 'bonus', label: 'Background skill feat' }];
  const humanBonus = c.ancestryId === 'human' && c.feats.some((f) => f.featId === 'natural-ambition');
  for (let lvl = 1; lvl <= upTo; lvl++) {
    if (ANCESTRY_FEAT_LEVELS.includes(lvl))
      out.push({ slot: `ancestry-${lvl}`, level: lvl, type: 'ancestry', label: 'Ancestry feat' });
    if ((klass?.classFeatLevels ?? []).includes(lvl))
      out.push({ slot: `class-${lvl}`, level: lvl, type: 'class', label: 'Class feat' });
    if ((klass?.skillFeatLevels ?? []).includes(lvl))
      out.push({ slot: `skill-${lvl}`, level: lvl, type: 'skill', label: 'Skill feat' });
    if (GENERAL_FEAT_LEVELS.includes(lvl))
      out.push({ slot: `general-${lvl}`, level: lvl, type: 'general', label: 'General feat' });
  }
  if (humanBonus) out.push({ slot: 'class-bonus-1', level: 1, type: 'class', label: 'Natural Ambition class feat' });
  return out;
}

export function skillIncreaseLevels(c: Pf2eCharacter, d: Pf2eData, upTo = c.level): number[] {
  return (classOf(d, c)?.skillIncreaseLevels ?? [3, 5, 7, 9, 11, 13, 15, 17, 19]).filter((l) => l <= upTo);
}

export function eligibleFeats(c: Pf2eCharacter, d: Pf2eData, slot: Slot): Pf2eFeat[] {
  const taken = new Set(c.feats.filter((f) => f.slot !== slot.slot).map((f) => f.featId));
  const ancestry = c.ancestryId;
  return d.feats.filter((f) => {
    if (f.level > slot.level) return false;
    if (taken.has(f.id) && !f.traits.some((t) => t.toLowerCase() === 'repeatable')) return false;
    switch (slot.type) {
      case 'ancestry':
        return f.type === 'ancestry' && (f.owner === ancestry || f.owner === c.heritageId);
      case 'class':
        return (f.type === 'class' && f.owner === c.classId) || (f.type === 'archetype' && slot.level >= 2);
      case 'skill':
      case 'bonus':
        return f.type === 'skill';
      case 'general':
        return f.type === 'general' || f.type === 'skill';
    }
  });
}

/* -------------------------------------------------------------------------- */
/* Level up                                                                   */
/* -------------------------------------------------------------------------- */

export interface Pf2eLevelUpPreview {
  newLevel: number;
  hpGain: number;
  features: { name: string; text: string }[];
  improvements: { stat: Pf2eStat; rank: Pf2eRank }[];
  slots: Slot[];
  skillIncrease: boolean;
  attributeBoosts: boolean;
  newSpellRank: boolean;
}

export function previewLevelUp(c: Pf2eCharacter, d: Pf2eData): Pf2eLevelUpPreview | null {
  if (c.level >= 20) return null;
  const next = c.level + 1;
  const klass = classOf(d, c);
  const con = attributeMods(c).con;
  return {
    newLevel: next,
    hpGain: (klass?.hp ?? 8) + con + (hasFeat(c, 'toughness') ? 1 : 0),
    features: (klass?.features ?? []).filter((f) => f.level === next),
    improvements: (klass?.progression ?? [])
      .filter((p) => p.level === next)
      .map((p) => ({ stat: p.stat, rank: p.rank })),
    slots: featSlots(c, d, next).filter((s) => s.level === next),
    skillIncrease: skillIncreaseLevels(c, d, next).includes(next),
    attributeBoosts: (BOOST_LEVELS as readonly number[]).includes(next),
    newSpellRank: Boolean(klass?.spellcasting) && next % 2 === 1 && next <= 19,
  };
}

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

export function validate(c: Pf2eCharacter, d: Pf2eData): string[] {
  const issues: string[] = [];
  if (!c.name.trim()) issues.push('The character has no name.');
  const ancestry = ancestryOf(d, c);
  if (!ancestry) issues.push('Choose an ancestry.');
  if (!heritageOf(d, c)) issues.push('Choose a heritage.');
  if (!backgroundOf(d, c)) issues.push('Choose a background.');
  const klass = classOf(d, c);
  if (!klass) issues.push('Choose a class.');
  const distinct = (xs: Ability[]) => new Set(xs).size === xs.length;
  if (!distinct(c.boosts.ancestry)) issues.push('Ancestry boosts must go to different attributes.');
  if (!distinct(c.boosts.background)) issues.push('Background boosts must go to different attributes.');
  if (ancestry) {
    const want = c.boosts.ancestryAltFree ? 2 : ancestry.boosts.length;
    if (c.boosts.ancestry.length !== want) issues.push(`Assign ${want} ancestry boost(s).`);
  }
  if (c.boosts.background.length !== 2) issues.push('Assign both background boosts.');
  if (!c.boosts.class) issues.push('Choose a key attribute.');
  for (const lvl of BOOST_LEVELS) {
    if (lvl > c.level) break;
    const set = c.boosts.levels[String(lvl)] ?? [];
    if (set.length !== 4) issues.push(`Level ${lvl}: assign 4 attribute boosts (${set.length}/4).`);
    else if (!distinct(set)) issues.push(`Level ${lvl}: boosts must go to four different attributes.`);
  }
  const mods = attributeMods(c);
  for (const a of ABILITIES)
    if (c.level === 1 && mods[a] > 4) issues.push(`${ABILITY_NAMES[a]} is above +4 at 1st level.`);
  if (klass) {
    const expected =
      klass.trainedSkills.length +
      klass.additionalSkills +
      Math.max(0, mods.int) +
      (backgroundOf(d, c)?.skills.length ?? 0);
    if (c.trainedSkills.length < expected) issues.push(`Train ${expected - c.trainedSkills.length} more skill(s).`);
    if (klass.subclasses?.length && !c.subclassId) issues.push(`Choose a ${klass.subclassLabel ?? 'class option'}.`);
  }
  const filled = new Set(c.feats.filter((f) => f.featId || f.customName).map((f) => f.slot));
  for (const s of featSlots(c, d))
    if (!filled.has(s.slot)) issues.push(`Level ${s.level}: choose a ${s.label.toLowerCase()}.`);
  for (const lvl of skillIncreaseLevels(c, d))
    if (!c.skillIncreases[String(lvl)]) issues.push(`Level ${lvl}: choose a skill increase.`);
  return issues;
}
