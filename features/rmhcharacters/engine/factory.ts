/**
 * New characters and the normaliser every import goes through.
 *
 * `normalizeCharacter` takes anything that claims to be a character (a stored
 * roster entry from an older version, a hand-edited export, a converted file)
 * and returns a complete, well-typed one: missing fields get their defaults,
 * wrong types are dropped, strings are capped. It never throws; a value it
 * cannot use becomes `null`.
 */
import {
  ABILITIES,
  type Ability,
  type Character,
  type CharacterBase,
  type Currency,
  type Dnd5eCharacter,
  type GameSystem,
  type InventoryItem,
  type Pf2eCharacter,
} from './types';

export function newId(): string {
  const c = globalThis.crypto;
  if (c && 'randomUUID' in c) return c.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

const zeroCurrency = (): Currency => ({ pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 });

function base(system: GameSystem): CharacterBase {
  const now = Date.now();
  return {
    id: newId(),
    system,
    schemaVersion: 1,
    name: '',
    playerName: '',
    appearance: '',
    personality: '',
    backstory: '',
    notes: '',
    languages: ['Common'],
    inventory: [],
    currency: zeroCurrency(),
    hp: { current: 0, temp: 0 },
    conditions: [],
    custom: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function newDnd5e(): Dnd5eCharacter {
  return {
    ...base('dnd5e'),
    system: 'dnd5e',
    abilityMethod: 'standard',
    baseAbilities: { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 },
    speciesId: '',
    backgroundId: '',
    backgroundIncreases: [],
    originFeats: [],
    classes: [],
    asi: [],
    skills: [],
    expertise: [],
    tools: [],
    weaponMasteries: [],
    choices: {},
    spells: { known: [], prepared: [], slotsUsed: [0, 0, 0, 0, 0, 0, 0, 0, 0], pactSlotsUsed: 0 },
    shield: false,
    hitDiceUsed: 0,
    deathSaves: { successes: 0, failures: 0 },
    heroicInspiration: false,
    exhaustion: 0,
    xp: 0,
  };
}

export function newPf2e(): Pf2eCharacter {
  return {
    ...base('pf2e'),
    system: 'pf2e',
    languages: ['Common'],
    level: 1,
    xp: 0,
    ancestryId: '',
    heritageId: '',
    backgroundId: '',
    classId: '',
    choices: {},
    boosts: {
      ancestry: [],
      ancestryFlaws: [],
      ancestryAltFree: false,
      background: [],
      class: null,
      levels: { '1': [] },
    },
    trainedSkills: [],
    skillIncreases: {},
    lores: [],
    feats: [],
    spells: { known: [], prepared: {}, slotsUsed: {}, focusSpells: [] },
    focusPoints: 0,
    heroPoints: 1,
    shieldRaised: false,
    dying: 0,
    wounded: 0,
  };
}

export const newCharacter = (system: GameSystem): Character => (system === 'dnd5e' ? newDnd5e() : newPf2e());

/* -------------------------------------------------------------------------- */
/* Normaliser                                                                 */
/* -------------------------------------------------------------------------- */

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, fallback = '', max = 20_000) => (typeof v === 'string' ? v.slice(0, max) : fallback);
const num = (v: unknown, fallback = 0, min = -1e9, max = 1e9) => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
const bool = (v: unknown, fallback = false) => (typeof v === 'boolean' ? v : fallback);
const strArr = (v: unknown, max = 500) =>
  Array.isArray(v)
    ? v
        .filter((x): x is string => typeof x === 'string')
        .slice(0, max)
        .map((s) => s.slice(0, 200))
    : [];
const isAbility = (v: unknown): v is Ability => typeof v === 'string' && (ABILITIES as readonly string[]).includes(v);
const abilArr = (v: unknown) => (Array.isArray(v) ? v.filter(isAbility).slice(0, 12) : []);
const strRecord = (v: unknown): Record<string, string> => {
  const out: Record<string, string> = {};
  if (isObj(v))
    for (const [k, x] of Object.entries(v)) if (typeof x === 'string') out[k.slice(0, 100)] = x.slice(0, 200);
  return out;
};

/** Portraits are data URLs of an image, nothing else, and stay small. */
const MAX_PORTRAIT = 400_000;
function portrait(v: unknown): string | undefined {
  if (typeof v !== 'string' || v.length > MAX_PORTRAIT) return undefined;
  return /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(v) ? v : undefined;
}

function inventory(v: unknown): InventoryItem[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter(isObj)
    .slice(0, 500)
    .map((i) => {
      const item: InventoryItem = {
        id: str(i.id) || newId(),
        name: str(i.name, 'Item', 200),
        quantity: num(i.quantity, 1, 0, 100_000),
        equipped: bool(i.equipped),
      };
      if (i.weight !== undefined) item.weight = num(i.weight, 0, 0, 100_000);
      if (i.bulk !== undefined) item.bulk = num(i.bulk, 0, 0, 1000);
      if (typeof i.refId === 'string') item.refId = i.refId.slice(0, 100);
      if (typeof i.notes === 'string') item.notes = i.notes.slice(0, 2000);
      return item;
    });
}

function normalizeBase(raw: Obj, fresh: CharacterBase): CharacterBase {
  const cur = isObj(raw.currency) ? raw.currency : {};
  const hp = isObj(raw.hp) ? raw.hp : {};
  const out: CharacterBase = {
    ...fresh,
    id: str(raw.id, '', 100) || fresh.id,
    name: str(raw.name, '', 120),
    playerName: str(raw.playerName, '', 120),
    appearance: str(raw.appearance),
    personality: str(raw.personality),
    backstory: str(raw.backstory),
    notes: str(raw.notes),
    languages: raw.languages === undefined ? fresh.languages : strArr(raw.languages, 50),
    inventory: inventory(raw.inventory),
    currency: {
      pp: num(cur.pp, 0, 0),
      gp: num(cur.gp, 0, 0),
      ep: num(cur.ep, 0, 0),
      sp: num(cur.sp, 0, 0),
      cp: num(cur.cp, 0, 0),
    },
    hp: { current: num(hp.current, 0, -1000, 100_000), temp: num(hp.temp, 0, 0, 100_000) },
    conditions: strArr(raw.conditions, 50),
    custom: Array.isArray(raw.custom)
      ? raw.custom
          .filter(isObj)
          .slice(0, 200)
          .map((e) => ({
            id: str(e.id) || newId(),
            name: str(e.name, 'Entry', 200),
            text: str(e.text, '', 10_000),
            ...(typeof e.kind === 'string' ? { kind: e.kind.slice(0, 60) } : {}),
          }))
      : [],
    createdAt: num(raw.createdAt, fresh.createdAt, 0, 1e15),
    updatedAt: num(raw.updatedAt, fresh.updatedAt, 0, 1e15),
  };
  const p = portrait(raw.portrait);
  if (p) out.portrait = p;
  return out;
}

function normalizeDnd5e(raw: Obj): Dnd5eCharacter {
  const fresh = newDnd5e();
  const b = normalizeBase(raw, fresh);
  const abil = isObj(raw.baseAbilities) ? raw.baseAbilities : {};
  const spells = isObj(raw.spells) ? raw.spells : {};
  const death = isObj(raw.deathSaves) ? raw.deathSaves : {};
  const method = raw.abilityMethod;
  const out: Dnd5eCharacter = {
    ...fresh,
    ...b,
    system: 'dnd5e',
    abilityMethod:
      method === 'pointbuy' || method === 'roll' || method === 'manual' || method === 'standard' ? method : 'manual',
    baseAbilities: Object.fromEntries(ABILITIES.map((a) => [a, num(abil[a], 10, 1, 30)])) as Record<Ability, number>,
    speciesId: str(raw.speciesId, '', 100),
    backgroundId: str(raw.backgroundId, '', 100),
    backgroundIncreases: abilArr(raw.backgroundIncreases).slice(0, 3),
    originFeats: strArr(raw.originFeats, 10),
    classes: Array.isArray(raw.classes)
      ? raw.classes
          .filter(isObj)
          .slice(0, 12)
          .map((k) => ({
            classId: str(k.classId, '', 100),
            level: num(k.level, 1, 1, 20),
            hpRolls: Array.isArray(k.hpRolls)
              ? k.hpRolls.slice(0, 19).map((r) => (r === null ? null : num(r, 1, 1, 12)))
              : [],
            ...(typeof k.subclassId === 'string' && k.subclassId ? { subclassId: k.subclassId.slice(0, 100) } : {}),
            ...(typeof k.customSubclass === 'string' && k.customSubclass
              ? { customSubclass: k.customSubclass.slice(0, 120) }
              : {}),
          }))
      : [],
    asi: Array.isArray(raw.asi)
      ? raw.asi
          .filter(isObj)
          .slice(0, 40)
          .map((a) => ({
            slot: str(a.slot, '', 100),
            kind: a.kind === 'feat' ? ('feat' as const) : ('asi' as const),
            ...(a.abilities !== undefined ? { abilities: abilArr(a.abilities).slice(0, 2) } : {}),
            ...(typeof a.featId === 'string' ? { featId: a.featId.slice(0, 100) } : {}),
            ...(a.featAbilities !== undefined ? { featAbilities: abilArr(a.featAbilities).slice(0, 2) } : {}),
          }))
      : [],
    skills: strArr(raw.skills, 30),
    expertise: strArr(raw.expertise, 30),
    tools: strArr(raw.tools, 30),
    weaponMasteries: strArr(raw.weaponMasteries, 20),
    choices: strRecord(raw.choices),
    spells: {
      known: strArr(spells.known, 600),
      prepared: strArr(spells.prepared, 600),
      slotsUsed: Array.from({ length: 9 }, (_, i) =>
        num(Array.isArray(spells.slotsUsed) ? spells.slotsUsed[i] : 0, 0, 0, 20),
      ),
      pactSlotsUsed: num(spells.pactSlotsUsed, 0, 0, 10),
    },
    shield: bool(raw.shield),
    hitDiceUsed: num(raw.hitDiceUsed, 0, 0, 20),
    deathSaves: { successes: num(death.successes, 0, 0, 3), failures: num(death.failures, 0, 0, 3) },
    heroicInspiration: bool(raw.heroicInspiration),
    exhaustion: num(raw.exhaustion, 0, 0, 6),
    xp: num(raw.xp, 0, 0, 10_000_000),
  };
  if (typeof raw.speciesOption === 'string' && raw.speciesOption) out.speciesOption = raw.speciesOption.slice(0, 100);
  if (raw.size === 'Small' || raw.size === 'Medium') out.size = raw.size;
  if (typeof raw.armorId === 'string' && raw.armorId) out.armorId = raw.armorId.slice(0, 100);
  return out;
}

function normalizePf2e(raw: Obj): Pf2eCharacter {
  const fresh = newPf2e();
  const b = normalizeBase(raw, fresh);
  const boosts = isObj(raw.boosts) ? raw.boosts : {};
  const levels: Record<string, Ability[]> = {};
  if (isObj(boosts.levels))
    for (const lvl of ['1', '5', '10', '15', '20'])
      if (boosts.levels[lvl] !== undefined) levels[lvl] = abilArr(boosts.levels[lvl]).slice(0, 4);
  const spells = isObj(raw.spells) ? raw.spells : {};
  const prepared: Record<string, string[]> = {};
  if (isObj(spells.prepared))
    for (const [k, v] of Object.entries(spells.prepared)) prepared[k.slice(0, 4)] = strArr(v, 40);
  const slotsUsed: Record<string, number> = {};
  if (isObj(spells.slotsUsed))
    for (const [k, v] of Object.entries(spells.slotsUsed)) slotsUsed[k.slice(0, 4)] = num(v, 0, 0, 20);
  const tradition = spells.tradition;
  const out: Pf2eCharacter = {
    ...fresh,
    ...b,
    system: 'pf2e',
    level: num(raw.level, 1, 1, 20),
    xp: num(raw.xp, 0, 0, 999),
    ancestryId: str(raw.ancestryId, '', 100),
    heritageId: str(raw.heritageId, '', 100),
    backgroundId: str(raw.backgroundId, '', 100),
    classId: str(raw.classId, '', 100),
    choices: strRecord(raw.choices),
    boosts: {
      ancestry: abilArr(boosts.ancestry).slice(0, 4),
      ancestryFlaws: abilArr(boosts.ancestryFlaws).slice(0, 3),
      ancestryAltFree: bool(boosts.ancestryAltFree),
      background: abilArr(boosts.background).slice(0, 2),
      class: isAbility(boosts.class) ? boosts.class : null,
      levels: { '1': [], ...levels },
    },
    trainedSkills: strArr(raw.trainedSkills, 40),
    skillIncreases: strRecord(raw.skillIncreases),
    lores: strArr(raw.lores, 20),
    feats: Array.isArray(raw.feats)
      ? raw.feats
          .filter(isObj)
          .slice(0, 120)
          .map((f) => ({
            slot: str(f.slot, '', 60),
            ...(typeof f.featId === 'string' && f.featId ? { featId: f.featId.slice(0, 100) } : {}),
            ...(typeof f.customName === 'string' && f.customName ? { customName: f.customName.slice(0, 120) } : {}),
          }))
      : [],
    spells: {
      known: strArr(spells.known, 600),
      prepared,
      slotsUsed,
      focusSpells: strArr(spells.focusSpells, 20),
      ...(tradition === 'arcane' || tradition === 'divine' || tradition === 'occult' || tradition === 'primal'
        ? { tradition }
        : {}),
    },
    focusPoints: num(raw.focusPoints, 0, 0, 3),
    heroPoints: num(raw.heroPoints, 1, 0, 3),
    shieldRaised: bool(raw.shieldRaised),
    dying: num(raw.dying, 0, 0, 4),
    wounded: num(raw.wounded, 0, 0, 4),
  };
  if (typeof raw.subclassId === 'string' && raw.subclassId) out.subclassId = raw.subclassId.slice(0, 100);
  if (typeof raw.armorId === 'string' && raw.armorId) out.armorId = raw.armorId.slice(0, 100);
  return out;
}

export function normalizeCharacter(raw: unknown): Character | null {
  if (!isObj(raw)) return null;
  if (raw.system === 'dnd5e') return normalizeDnd5e(raw);
  if (raw.system === 'pf2e') return normalizePf2e(raw);
  return null;
}

/** A copy with a fresh id and timestamps (duplicate, or an import that collides). */
export function cloneCharacter<T extends Character>(c: T, name?: string): T {
  const now = Date.now();
  return { ...structuredClone(c), id: newId(), name: name ?? c.name, createdAt: now, updatedAt: now };
}
