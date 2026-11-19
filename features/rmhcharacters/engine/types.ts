/**
 * RMHCharacters — the character model and the rules-data shapes for both systems.
 *
 * Two systems, one roster:
 *   - `dnd5e`: Fifth Edition as revised in 2024 (System Reference Document 5.2,
 *     CC-BY-4.0). Backgrounds grant the ability increases and an Origin feat;
 *     species grant traits only; weapon mastery; Epic Boons at 19.
 *   - `pf2e`: Pathfinder Second Edition, Remaster (Player Core 1 and 2, ORC).
 *     Attribute modifiers instead of scores, partial boosts above +4, no
 *     alignment, the four-boost schedule at 1/5/10/15/20.
 *
 * A character is plain JSON: it is what the roster stores, what the native
 * export writes, and what the advisor summarises. Everything derived (modifiers,
 * AC, DCs, slots) is computed by `dnd5e/rules.ts` / `pf2e/rules.ts` and never
 * stored, so an edit can never leave a stale number behind.
 *
 * Client-safe: no zod here (the schemas in `schema.ts` validate imports).
 */

export type GameSystem = 'dnd5e' | 'pf2e';

export const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;
export type Ability = (typeof ABILITIES)[number];

export const ABILITY_NAMES: Record<Ability, string> = {
  str: 'Strength',
  dex: 'Dexterity',
  con: 'Constitution',
  int: 'Intelligence',
  wis: 'Wisdom',
  cha: 'Charisma',
};

/** A named block of rules text (a trait, a class feature, a feat benefit). */
export interface RulesText {
  name: string;
  text: string;
}

export interface LevelFeature extends RulesText {
  level: number;
}

/* ========================================================================== */
/* Shared character parts                                                     */
/* ========================================================================== */

export interface InventoryItem {
  id: string;
  name: string;
  quantity: number;
  /** 5e: pounds. */
  weight?: number;
  /** PF2e: bulk, `0.1` for light (L). */
  bulk?: number;
  equipped: boolean;
  /** A reference into the system's equipment data, when the item came from it. */
  refId?: string;
  notes?: string;
}

export interface Currency {
  pp: number;
  gp: number;
  ep: number;
  sp: number;
  cp: number;
}

export interface CustomEntry {
  id: string;
  name: string;
  text: string;
  /** Free label, e.g. "Feat", "Subclass feature", "Homebrew". */
  kind?: string;
}

export interface CharacterBase {
  id: string;
  system: GameSystem;
  /** Schema version of this JSON, bumped by a migration in `schema.ts`. */
  schemaVersion: 1;
  name: string;
  playerName: string;
  /** Small data-URL portrait (JPEG/WebP, capped by the uploader at ~200 KB). */
  portrait?: string;
  appearance: string;
  personality: string;
  backstory: string;
  notes: string;
  languages: string[];
  inventory: InventoryItem[];
  currency: Currency;
  hp: { current: number; temp: number };
  conditions: string[];
  /** Homebrew or book content the data set does not carry. */
  custom: CustomEntry[];
  createdAt: number;
  updatedAt: number;
}

/* ========================================================================== */
/* D&D 5e (2024)                                                              */
/* ========================================================================== */

export interface Dnd5eClassLevel {
  classId: string;
  subclassId?: string;
  /** A subclass the data set does not carry (any book), written in by name. */
  customSubclass?: string;
  level: number;
  /**
   * Rolled HP, one entry per level after the character's first (so the starting class's
   * index 0 is its level 2, a multiclass's index 0 is its level 1); `null` = the fixed average.
   */
  hpRolls: (number | null)[];
}

/** One Ability Score Improvement slot: either +2/+1+1 to abilities or a feat. */
export interface Dnd5eAsiChoice {
  /** `${classId}:${classLevel}`, the class level that granted the slot. */
  slot: string;
  kind: 'asi' | 'feat';
  /** For `asi`: the abilities raised, one entry per +1 (so `['str','str']` is +2 Str). */
  abilities?: Ability[];
  /** For `feat`. */
  featId?: string;
  /** Abilities chosen for a feat's own +1 (half-feat style increases). */
  featAbilities?: Ability[];
}

export interface Dnd5eCharacter extends CharacterBase {
  system: 'dnd5e';
  abilityMethod: 'standard' | 'pointbuy' | 'roll' | 'manual';
  /** Scores before background increases and ASIs. */
  baseAbilities: Record<Ability, number>;
  speciesId: string;
  /** Lineage / ancestry option, e.g. an elven lineage or a dragonborn ancestry. */
  speciesOption?: string;
  size?: 'Small' | 'Medium';
  backgroundId: string;
  /** Background increases: +2/+1 or +1/+1/+1 among the background's three abilities. */
  backgroundIncreases: Ability[];
  /** The Origin feat (the background's, or the Human's extra one, etc.). */
  originFeats: string[];
  classes: Dnd5eClassLevel[];
  asi: Dnd5eAsiChoice[];
  /** Skill ids with proficiency. */
  skills: string[];
  /** Skill ids with expertise. */
  expertise: string[];
  tools: string[];
  /** Weapon ids whose mastery property is active. */
  weaponMasteries: string[];
  /** Free-form option choices keyed by feature, e.g. `fighter:fighting-style` → feat id. */
  choices: Record<string, string>;
  spells: {
    /** Spell ids known or in the spellbook / prepared list. */
    known: string[];
    prepared: string[];
    /** Slots expended, index = spell level - 1 (0..8). */
    slotsUsed: number[];
    pactSlotsUsed: number;
  };
  /** Worn armor (equipment id) and whether a shield is held. */
  armorId?: string;
  shield: boolean;
  hitDiceUsed: number;
  deathSaves: { successes: number; failures: number };
  heroicInspiration: boolean;
  exhaustion: number;
  xp: number;
}

export interface Dnd5eSpellcasting {
  ability: Ability;
  /** Caster progression for multiclass slot math. */
  progression: 'full' | 'half' | 'third' | 'pact';
  /** Cantrips known by class level (index 0 = level 1). Empty if none. */
  cantrips: number[];
  /** Prepared spells by class level (2024: every class prepares). */
  prepared: number[];
  /** Spell list id (usually the class id). */
  list: string;
  /** Can cast rituals from the list without preparing them. */
  ritualCasting?: boolean;
  spellbook?: boolean;
}

export interface Dnd5eResource {
  name: string;
  /** Value by class level (index 0 = level 1); strings allowed for dice ("d6"). */
  values: (number | string)[];
  /** "Short Rest" | "Long Rest" | "Turn" etc. */
  recharge?: string;
}

export interface Dnd5eSubclass {
  id: string;
  name: string;
  /** Short description of the theme. */
  summary: string;
  features: LevelFeature[];
  /** For third-casters (Eldritch Knight style); none in the SRD but supported. */
  spellcasting?: Dnd5eSpellcasting;
  /** Always-prepared spells by class level. */
  alwaysPrepared?: { level: number; spells: string[] }[];
}

export interface Dnd5eClass {
  id: string;
  name: string;
  hitDie: 6 | 8 | 10 | 12;
  primaryAbility: Ability[];
  saves: [Ability, Ability];
  skillChoices: { count: number; from: string[] };
  armorTraining: string[];
  weaponProficiencies: string[];
  toolProficiencies?: string[];
  /** 2024 multiclassing prerequisite: 13+ in the class's primary ability (all of them, or any for `any`). */
  multiclass: { abilities: Ability[]; any?: boolean; proficienciesGained: string[] };
  startingEquipment: string;
  subclassLevel: number;
  /** Class levels granting an Ability Score Improvement (19 is the Epic Boon). */
  asiLevels: number[];
  /** Weapon Mastery count by level; omitted when the class has none. */
  weaponMastery?: number[];
  features: LevelFeature[];
  resources?: Dnd5eResource[];
  spellcasting?: Dnd5eSpellcasting;
  subclasses: Dnd5eSubclass[];
}

export interface Dnd5eSpecies {
  id: string;
  name: string;
  sizes: ('Small' | 'Medium')[];
  speed: number;
  darkvision?: number;
  traits: RulesText[];
  /** Lineages / ancestries (Elven Lineage, Draconic Ancestry, Fiendish Legacy, Giant Ancestry, Gnomish Lineage). */
  options?: { label: string; choices: { id: string; name: string; text: string }[] };
  /** Grants an extra Origin feat (Human: Versatile). */
  extraOriginFeat?: boolean;
  /** Grants a skill proficiency of choice (Human: Skillful, Elf: Keen Senses from a short list). */
  skillChoice?: { count: number; from?: string[] };
}

export interface Dnd5eBackground {
  id: string;
  name: string;
  abilities: [Ability, Ability, Ability];
  featId: string;
  skills: [string, string];
  tool: string;
  equipment: string;
}

export interface Dnd5eFeat {
  id: string;
  name: string;
  category: 'origin' | 'general' | 'fighting-style' | 'epic-boon';
  /** Human-readable prerequisite, e.g. "Level 4+, Strength or Dexterity 13+". */
  prerequisite?: string;
  minLevel?: number;
  /** Ability-score minimums, any one satisfying if `prereqAny`. */
  prereqAbilities?: Partial<Record<Ability, number>>;
  prereqAny?: boolean;
  /** Feats that raise an ability by 1 (max 20; epic boons to 30). */
  abilityIncrease?: Ability[];
  repeatable?: boolean;
  text: string;
}

export interface Dnd5eSpell {
  id: string;
  name: string;
  level: number;
  school: string;
  castingTime: string;
  range: string;
  components: string;
  duration: string;
  concentration: boolean;
  ritual: boolean;
  classes: string[];
  /** Short summary in plain words. */
  text: string;
  /** "At Higher Levels" / cantrip upgrade summary. */
  higher?: string;
}

export interface Dnd5eWeapon {
  id: string;
  name: string;
  category: 'simple' | 'martial';
  kind: 'melee' | 'ranged';
  damage: string;
  damageType: string;
  properties: string[];
  /** Two-handed / versatile damage, e.g. "1d10". */
  versatile?: string;
  range?: string;
  mastery: string;
  weight: number;
  cost: string;
}

export interface Dnd5eArmor {
  id: string;
  name: string;
  category: 'light' | 'medium' | 'heavy' | 'shield';
  /** Base AC (shield: the bonus). */
  ac: number;
  /** Max Dex bonus; `undefined` = unlimited, `0` = none. */
  dexCap?: number;
  strength?: number;
  stealthDisadvantage: boolean;
  weight: number;
  cost: string;
}

export interface Dnd5eGear {
  id: string;
  name: string;
  weight: number;
  cost: string;
  text?: string;
}

export interface Dnd5eData {
  classes: Dnd5eClass[];
  species: Dnd5eSpecies[];
  backgrounds: Dnd5eBackground[];
  feats: Dnd5eFeat[];
  spells: Dnd5eSpell[];
  weapons: Dnd5eWeapon[];
  armor: Dnd5eArmor[];
  gear: Dnd5eGear[];
}

/* ========================================================================== */
/* Pathfinder 2e (Remaster)                                                   */
/* ========================================================================== */

/** 0 untrained, 1 trained, 2 expert, 3 master, 4 legendary. */
export type Pf2eRank = 0 | 1 | 2 | 3 | 4;

export const PF2E_SKILLS = [
  'acrobatics',
  'arcana',
  'athletics',
  'crafting',
  'deception',
  'diplomacy',
  'intimidation',
  'medicine',
  'nature',
  'occultism',
  'performance',
  'religion',
  'society',
  'stealth',
  'survival',
  'thievery',
] as const;
export type Pf2eSkill = (typeof PF2E_SKILLS)[number];

export type Pf2eStat =
  | 'perception'
  | 'fortitude'
  | 'reflex'
  | 'will'
  | 'classDC'
  | 'spell'
  | 'unarmored'
  | 'light'
  | 'medium'
  | 'heavy'
  | 'unarmed'
  | 'simple'
  | 'martial'
  | 'advanced';

/** A boost source: a fixed attribute, or a free choice. */
export type Pf2eBoost = Ability | 'free';

export interface Pf2eFeatChoice {
  /** e.g. `ancestry-1`, `class-2`, `skill-2`, `general-3`, `bonus-1` (background skill feat). */
  slot: string;
  featId?: string;
  /** A feat the data set does not carry, written in by name. */
  customName?: string;
}

export interface Pf2eCharacter extends CharacterBase {
  system: 'pf2e';
  level: number;
  xp: number;
  ancestryId: string;
  heritageId: string;
  backgroundId: string;
  classId: string;
  /** Class option: doctrine, muse, instinct, cause, racket, school, patron, … */
  subclassId?: string;
  /** Free-form option choices keyed by feature, e.g. `rogue:racket`, `cleric:deity`. */
  choices: Record<string, string>;
  boosts: {
    /** Ancestry boosts as chosen (fixed ones included, one entry per boost). */
    ancestry: Ability[];
    /** Ancestry flaws in effect (possibly empty when using the two-free option). */
    ancestryFlaws: Ability[];
    /** Use the alternative "two free boosts, no flaw" ancestry rule. */
    ancestryAltFree: boolean;
    background: Ability[];
    class: Ability | null;
    /** Four free boosts at levels 1, 5, 10, 15, 20, keyed by level. */
    levels: Record<string, Ability[]>;
  };
  /** Skills trained at 1st level (class + background + Int extra). */
  trainedSkills: string[];
  /** Skill increases by level, `${level}` → skill id. */
  skillIncreases: Record<string, string>;
  /** Lore subcategories, e.g. "Warfare Lore". */
  lores: string[];
  feats: Pf2eFeatChoice[];
  spells: {
    tradition?: 'arcane' | 'divine' | 'occult' | 'primal';
    /** Cantrips and spells in the repertoire / spellbook / prepared, by spell id. */
    known: string[];
    /** Prepared slots: rank → spell ids (prepared casters). */
    prepared: Record<string, string[]>;
    slotsUsed: Record<string, number>;
    focusSpells: string[];
  };
  focusPoints: number;
  heroPoints: number;
  armorId?: string;
  shieldRaised: boolean;
  dying: number;
  wounded: number;
}

export interface Pf2eHeritage {
  id: string;
  name: string;
  text: string;
  /** Versatile heritages (Changeling, Nephilim, Aiuvarin, Dromaar) can attach to any ancestry. */
  versatile?: boolean;
}

export interface Pf2eAncestry {
  id: string;
  name: string;
  hp: number;
  size: string;
  speed: number;
  boosts: Pf2eBoost[];
  flaws: Ability[];
  languages: string[];
  traits: string[];
  /** Darkvision, low-light vision, etc. */
  senses?: string;
  features: RulesText[];
  heritages: Pf2eHeritage[];
}

export interface Pf2eBackground {
  id: string;
  name: string;
  /** Exactly two entries: one boost chosen from the first array, one free. */
  boosts: [Ability[], 'free'];
  skills: string[];
  lore: string;
  featId: string;
  text: string;
}

export interface Pf2eProgression {
  level: number;
  stat: Pf2eStat;
  rank: Pf2eRank;
}

export interface Pf2eSubclass {
  id: string;
  name: string;
  text: string;
  /** Skill trained by this choice, if any. */
  skill?: string;
}

export interface Pf2eClass {
  id: string;
  name: string;
  hp: number;
  /** Key attribute options (choose one). */
  keyAbility: Ability[];
  /** Fixed trained skills (may be a choice described in text). */
  trainedSkills: string[];
  /** Additional trained skills = this + Int modifier. */
  additionalSkills: number;
  /** Starting proficiencies at level 1 and every later improvement. */
  progression: Pf2eProgression[];
  /** Label for the class option, e.g. "Doctrine", "Muse", "Instinct". */
  subclassLabel?: string;
  subclasses?: Pf2eSubclass[];
  spellcasting?: {
    tradition: 'arcane' | 'divine' | 'occult' | 'primal' | 'choice';
    type: 'prepared' | 'spontaneous';
    ability: Ability | 'key';
    /** Slots per rank by level: `slots[level-1][rank-1]`; cantrips counted separately. */
    slots: number[][];
    cantrips: number;
  };
  /** Class feat levels (default: 1? and every even level). */
  classFeatLevels: number[];
  /** Skill feat levels (default even levels; rogue/investigator every level). */
  skillFeatLevels: number[];
  /** Skill increase levels (default odd levels 3-19; rogue every level from 2). */
  skillIncreaseLevels: number[];
  features: LevelFeature[];
}

export interface Pf2eFeat {
  id: string;
  name: string;
  level: number;
  type: 'ancestry' | 'class' | 'skill' | 'general' | 'archetype';
  /** Owner for ancestry/class feats (ancestry or class id); archetype id for archetype feats. */
  owner?: string;
  traits: string[];
  /** Action cost: "1", "2", "3", "reaction", "free", or omitted for passive. */
  actions?: string;
  prerequisites?: string;
  text: string;
}

export interface Pf2eSpell {
  id: string;
  name: string;
  /** 0 = cantrip. Focus spells carry `focus: true`. */
  rank: number;
  traditions: string[];
  actions: string;
  traits: string[];
  range?: string;
  area?: string;
  targets?: string;
  defense?: string;
  duration?: string;
  text: string;
  heightened?: string;
  focus?: boolean;
  /** Class that owns a focus spell. */
  owner?: string;
}

export interface Pf2eWeapon {
  id: string;
  name: string;
  category: 'unarmed' | 'simple' | 'martial' | 'advanced';
  kind: 'melee' | 'ranged';
  damage: string;
  damageType: 'B' | 'P' | 'S';
  group: string;
  traits: string[];
  hands: string;
  range?: number;
  reload?: string;
  bulk: number;
  price: string;
}

export interface Pf2eArmor {
  id: string;
  name: string;
  category: 'unarmored' | 'light' | 'medium' | 'heavy' | 'shield';
  acBonus: number;
  dexCap?: number;
  checkPenalty: number;
  speedPenalty: number;
  strength?: number;
  group?: string;
  traits: string[];
  /** Shields: hardness / HP / BT. */
  hardness?: number;
  hpMax?: number;
  bulk: number;
  price: string;
}

export interface Pf2eGear {
  id: string;
  name: string;
  bulk: number;
  price: string;
  text?: string;
}

export interface Pf2eData {
  ancestries: Pf2eAncestry[];
  /** Versatile heritages available to every ancestry. */
  versatileHeritages: Pf2eHeritage[];
  backgrounds: Pf2eBackground[];
  classes: Pf2eClass[];
  feats: Pf2eFeat[];
  spells: Pf2eSpell[];
  weapons: Pf2eWeapon[];
  armor: Pf2eArmor[];
  gear: Pf2eGear[];
}

export type Character = Dnd5eCharacter | Pf2eCharacter;
