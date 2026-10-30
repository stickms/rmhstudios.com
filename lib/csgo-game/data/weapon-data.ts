/**
 * CS:GO's default weapons as the simulation reads them, from the compact JSON the `csgo-ui` channel
 * publishes (`ui/index.json` → `weapons: data/<sha>.json`, built by `scripts/tf2-game/csgo_ui.py`
 * with `csgo_items.compact`): `items_game.txt`'s default items with their prefab chains merged —
 *
 *   { v: 1,
 *     items: { weapon_ak47: { defindex, prefabs: [...], item_class, item_name, item_gear_slot,
 *                             used_by_classes: { terrorists: "1" }, visuals: { weapon_type, … },
 *                             model_player, model_world, attributes: { "max player speed": "215", … } } },
 *     scripts: { weapon_ak47: { …old weapon_*.txt KeyValues, lower-cased keys… } } }
 *
 * `attributes` keys are items_game's attribute names, lower-cased by the extractor; values are the
 * KeyValues strings (or, for attributes written as blocks, `{ value }`). Nothing of Valve's text is in
 * the repository: the document arrives at run time (`setCsWeaponData`), and tests use a hand-written
 * fixture (./__fixtures__/weapon-data.fixture.ts).
 *
 * What the game derives from data at run time here: price, kill award, team, damage, range and range
 * modifier, bullets per shot, penetration power, armor ratio, cycle time (and alt), full auto, clip and
 * reserve, max player speed (and alt, scoped), spread, every inaccuracy term (stand, crouch, move, jump,
 * land, ladder, fire, and the alt/scoped ones), recovery times, the recoil parameters (angle, magnitude,
 * their variances, the seed), zoom levels and FOVs, flinch (tagging) modifiers, tracer frequency, and
 * the grenades' damage / radius. What is NOT in items_game and comes from documented constants:
 * reload and deploy times (`COMMUNITY_RELOAD_TIMES`), knife damage, and the grenade physics.
 */

import { SLOT_MELEE, SLOT_PDA, SLOT_PDA2, SLOT_PRIMARY, SLOT_SECONDARY } from '../../tf2-game/sim/weapon-api';
import { CS_TEAM_CT, CS_TEAM_T, DEFAULT_KILL_AWARD } from '../constants';

// ─── The published document ──────────────────────────────────────────────────────────────────

export type CsAttributeValue = string | number | { value?: string | number };

export interface CsItemEntry {
  defindex: number;
  prefabs?: string[];
  name?: string;
  item_class?: string;
  item_name?: string;
  item_gear_slot?: string;
  item_gear_slot_position?: string;
  used_by_classes?: Record<string, string | number>;
  model_player?: string;
  model_world?: string;
  model_dropped?: string;
  visuals?: Record<string, unknown>;
  attributes?: Record<string, CsAttributeValue>;
  [key: string]: unknown;
}

export interface CsItemsDocument {
  v: number;
  items: Record<string, CsItemEntry>;
  /** Old-style `scripts/weapon_*.txt` (gone from current CS:GO), keys lower-cased. */
  scripts?: Record<string, Record<string, unknown>>;
}

// ─── What the simulation uses ────────────────────────────────────────────────────────────────

export type CsWeaponCategory =
  | 'pistol'
  | 'smg'
  | 'rifle'
  | 'sniper'
  | 'shotgun'
  | 'machinegun'
  | 'knife'
  | 'grenade'
  | 'c4'
  | 'taser'
  | 'equipment';

/** CS grenade kinds (one pouch weapon carries them all, with a count each). */
export type CsGrenadeKind = 'hegrenade' | 'flashbang' | 'smokegrenade' | 'molotov' | 'incgrenade' | 'decoy';
export const CS_GRENADE_KINDS: readonly CsGrenadeKind[] = ['hegrenade', 'flashbang', 'smokegrenade', 'molotov', 'incgrenade', 'decoy'];

export interface CsInaccuracy {
  stand: number;
  crouch: number;
  move: number;
  jump: number;
  land: number;
  ladder: number;
  fire: number;
}

export interface CsWeaponInfo {
  /** `weapon_ak47` (items_game `name`). */
  name: string;
  /** Short name without the prefix (`ak47`): the buy command and the kill feed. */
  short: string;
  defindex: number;
  category: CsWeaponCategory;
  /** SLOT_* the weapon sits in (primary, secondary, knife, grenades, C4). */
  slot: number;
  price: number;
  killAward: number;
  /** 0 = both teams, else the only team that may buy it. */
  team: number;
  damage: number;
  range: number;
  rangeModifier: number;
  bullets: number;
  /** Penetration power (1 pistols / SMGs, 2 rifles, 2.5 the AWP). */
  penetration: number;
  armorRatio: number;
  cycleTime: number;
  cycleTimeAlt: number;
  fullAuto: boolean;
  clipSize: number;
  reserveMax: number;
  maxSpeed: number;
  maxSpeedAlt: number;
  spread: number;
  spreadAlt: number;
  inaccuracy: CsInaccuracy;
  inaccuracyAlt: CsInaccuracy;
  recoveryStand: number;
  recoveryCrouch: number;
  recoil: { angle: number; angleVariance: number; magnitude: number; magnitudeVariance: number; seed: number };
  recoilAlt: { angle: number; angleVariance: number; magnitude: number; magnitudeVariance: number };
  zoomLevels: number;
  zoomFov: [number, number];
  zoomTime: [number, number, number];
  flinchLarge: number;
  flinchSmall: number;
  tracerFrequency: number;
  reloadTime: number;
  /** Shotguns that load shell by shell. */
  reloadsSingly: boolean;
  deployTime: number;
  hasSilencer: boolean;
  viewModel: string;
  worldModel: string;
  /** The weapon's sound entry prefix (visuals.sound_single_shot "Weapon_AK47.Single" → the entry). */
  shotSound: string;
  /** Grenades: their kind. */
  grenade: CsGrenadeKind | null;
}

// ─── Community-measured numbers items_game does not carry ────────────────────────────────────

/**
 * Reload durations in seconds (the CS:GO wiki weapon pages and the community's frame-timed
 * measurements of the reload animations; items_game has no reload attribute). Weapons missing here
 * reload in 2.5 s.
 */
export const COMMUNITY_RELOAD_TIMES: Readonly<Record<string, number>> = {
  glock: 2.27,
  hkp2000: 2.17,
  usp_silencer: 2.17,
  p250: 2.17,
  elite: 3.77,
  fiveseven: 2.17,
  tec9: 2.5,
  cz75a: 2.7,
  deagle: 2.2,
  revolver: 2.3,
  mac10: 2.6,
  mp9: 2.13,
  mp7: 3.13,
  mp5sd: 2.6,
  ump45: 3.5,
  p90: 3.37,
  bizon: 2.43,
  famas: 3.3,
  galilar: 3.0,
  ak47: 2.43,
  m4a1: 3.07,
  m4a1_silencer: 3.07,
  aug: 3.8,
  sg556: 2.83,
  ssg08: 3.7,
  awp: 3.67,
  scar20: 3.1,
  g3sg1: 4.7,
  mag7: 2.5,
  m249: 5.7,
  negev: 5.7,
};
/** Shell-by-shell shotguns (CS:GO wiki: the Nova, XM1014 and Sawed-Off load one shell at a time, ~0.5 s each). */
export const SINGLY_RELOADING = new Set(['nova', 'xm1014', 'sawedoff']);
export const SHELL_RELOAD_TIME = 0.5;
/** Drawing a weapon (community measurement: ~1 s for most guns). */
export const DEFAULT_DEPLOY_TIME = 1.0;

// ─── Parsing ─────────────────────────────────────────────────────────────────────────────────

const lower = (s: unknown): string => (typeof s === 'string' ? s.toLowerCase() : '');

/** Script keys that are not just the attribute name without spaces. */
const SCRIPT_ALIASES: Readonly<Record<string, string>> = {
  'primary clip size': 'clip_size',
  'in game price': 'weaponprice',
  'armor ratio': 'weaponarmorratio',
};

function attrNumber(entry: CsItemEntry, script: Record<string, unknown> | undefined, name: string, fallback: number): number {
  const raw = entry.attributes?.[name];
  const v = typeof raw === 'object' && raw !== null ? raw.value : raw;
  let n = typeof v === 'number' ? v : typeof v === 'string' ? Number.parseFloat(v) : Number.NaN;
  if (!Number.isFinite(n) && script) {
    const key = SCRIPT_ALIASES[name] ?? name.replace(/ /g, '');
    const sv = script[key];
    n = typeof sv === 'number' ? sv : typeof sv === 'string' ? Number.parseFloat(sv) : Number.NaN;
  }
  return Number.isFinite(n) ? n : fallback;
}

function categoryOf(entry: CsItemEntry, name: string): CsWeaponCategory {
  const wt = lower(entry.visuals?.weapon_type);
  switch (wt) {
    case 'pistol':
      return 'pistol';
    case 'submachinegun':
      return 'smg';
    case 'rifle':
      return 'rifle';
    case 'sniperrifle':
      return 'sniper';
    case 'shotgun':
      return 'shotgun';
    case 'machinegun':
      return 'machinegun';
    case 'knife':
      return 'knife';
    case 'grenade':
      return 'grenade';
    case 'c4':
      return 'c4';
    case 'taser':
      return 'taser';
    default:
      break;
  }
  if (name === 'weapon_c4') return 'c4';
  if (name === 'weapon_taser') return 'taser';
  switch (lower(entry.item_gear_slot)) {
    case 'secondary':
      return 'pistol';
    case 'smg':
      return 'smg';
    case 'rifle':
      return 'rifle';
    case 'heavy':
      return 'shotgun';
    case 'melee':
      return 'knife';
    case 'grenade':
      return 'grenade';
    case 'c4':
      return 'c4';
    default:
      return name.startsWith('weapon_') ? 'rifle' : 'equipment';
  }
}

export const slotForCategory = (c: CsWeaponCategory): number =>
  c === 'pistol'
    ? SLOT_SECONDARY
    : c === 'knife' || c === 'taser'
      ? SLOT_MELEE
      : c === 'grenade'
        ? SLOT_PDA
        : c === 'c4'
          ? SLOT_PDA2
          : SLOT_PRIMARY;

function teamOf(entry: CsItemEntry): number {
  const u = entry.used_by_classes;
  if (!u) return 0;
  const t = Number(u.terrorists ?? 0) > 0;
  const ct = Number(u['counter-terrorists'] ?? 0) > 0;
  return t && !ct ? CS_TEAM_T : ct && !t ? CS_TEAM_CT : 0;
}

function soundEntry(entry: CsItemEntry): string {
  const s = entry.visuals?.sound_single_shot;
  return typeof s === 'string' ? s : '';
}

/** One weapon's numbers from its compact entry (and its old script, when an install had one). */
export function parseCsWeapon(name: string, entry: CsItemEntry, script?: Record<string, unknown>): CsWeaponInfo {
  const n = (attr: string, fallback: number) => attrNumber(entry, script, attr, fallback);
  const category = categoryOf(entry, name);
  const short = name.replace(/^weapon_|^item_/, '');
  const inacc = (suffix: string, base?: CsInaccuracy): CsInaccuracy => ({
    stand: n(`inaccuracy stand${suffix}`, base?.stand ?? 0),
    crouch: n(`inaccuracy crouch${suffix}`, base?.crouch ?? 0),
    move: n(`inaccuracy move${suffix}`, base?.move ?? 0),
    jump: n(`inaccuracy jump${suffix}`, base?.jump ?? 0),
    land: n(`inaccuracy land${suffix}`, base?.land ?? 0),
    ladder: n(`inaccuracy ladder${suffix}`, base?.ladder ?? 0),
    fire: n(`inaccuracy fire${suffix}`, base?.fire ?? 0),
  });
  const inaccuracy = inacc('');
  const maxSpeed = n('max player speed', 250);
  const cycleTime = n('cycletime', category === 'knife' ? 0.4 : 0.1);
  const recoil = {
    angle: n('recoil angle', 0),
    angleVariance: n('recoil angle variance', 0),
    magnitude: n('recoil magnitude', 0),
    magnitudeVariance: n('recoil magnitude variance', 0),
    seed: Math.trunc(n('recoil seed', entry.defindex)),
  };
  const grenade = category === 'grenade' ? ((CS_GRENADE_KINDS as readonly string[]).includes(short) ? (short as CsGrenadeKind) : 'hegrenade') : null;
  return {
    name,
    short,
    defindex: entry.defindex,
    category,
    slot: slotForCategory(category),
    price: n('in game price', 0),
    killAward: n('kill award', DEFAULT_KILL_AWARD),
    team: teamOf(entry),
    damage: n('damage', 0),
    range: n('range', 8192),
    rangeModifier: n('range modifier', 1),
    bullets: Math.max(1, Math.trunc(n('bullets', 1))),
    penetration: n('penetration', 1),
    armorRatio: n('armor ratio', 1),
    cycleTime,
    cycleTimeAlt: n('cycletime alt', cycleTime),
    fullAuto: n('is full auto', 0) > 0,
    clipSize: Math.trunc(n('primary clip size', category === 'knife' || category === 'c4' || category === 'grenade' ? -1 : 30)),
    reserveMax: Math.trunc(n('primary reserve ammo max', 0)),
    maxSpeed,
    maxSpeedAlt: n('max player speed alt', maxSpeed),
    spread: n('spread', 0),
    spreadAlt: n('spread alt', n('spread', 0)),
    inaccuracy,
    inaccuracyAlt: inacc(' alt', inaccuracy),
    recoveryStand: n('recovery time stand', 0.4),
    recoveryCrouch: n('recovery time crouch', 0.3),
    recoil,
    recoilAlt: {
      angle: n('recoil angle alt', recoil.angle),
      angleVariance: n('recoil angle variance alt', recoil.angleVariance),
      magnitude: n('recoil magnitude alt', recoil.magnitude),
      magnitudeVariance: n('recoil magnitude variance alt', recoil.magnitudeVariance),
    },
    zoomLevels: Math.trunc(n('zoom levels', 0)),
    zoomFov: [n('zoom fov 1', 90), n('zoom fov 2', 90)],
    zoomTime: [n('zoom time 0', 0.1), n('zoom time 1', 0.1), n('zoom time 2', 0.1)],
    flinchLarge: n('flinch velocity modifier large', 1),
    flinchSmall: n('flinch velocity modifier small', 1),
    tracerFrequency: Math.trunc(n('tracer frequency', 0)),
    reloadTime: n('reload time', SINGLY_RELOADING.has(short) ? SHELL_RELOAD_TIME : (COMMUNITY_RELOAD_TIMES[short] ?? 2.5)),
    reloadsSingly: SINGLY_RELOADING.has(short),
    deployTime: n('deploy time', DEFAULT_DEPLOY_TIME),
    hasSilencer: n('has silencer', 0) > 0,
    viewModel: typeof entry.model_player === 'string' ? entry.model_player : '',
    worldModel: typeof entry.model_world === 'string' ? entry.model_world : '',
    shotSound: soundEntry(entry),
    grenade,
  };
}

/** Equipment bought without a weapon of its own (items_game item_kevlar, item_assaultsuit, item_defuser). */
export interface CsGearInfo {
  name: 'item_kevlar' | 'item_assaultsuit' | 'item_defuser';
  price: number;
  team: number;
}

export interface CsWeaponTable {
  readonly weapons: ReadonlyMap<string, CsWeaponInfo>;
  readonly byDefindex: ReadonlyMap<number, CsWeaponInfo>;
  readonly gear: ReadonlyMap<string, CsGearInfo>;
}

/** Builds the table from a published document (items it cannot read are skipped). */
export function buildCsWeaponTable(doc: CsItemsDocument): CsWeaponTable {
  if (!doc || typeof doc !== 'object' || typeof doc.items !== 'object' || doc.items === null) {
    throw new Error('CS:GO weapon data: not an items document');
  }
  const weapons = new Map<string, CsWeaponInfo>();
  const byDefindex = new Map<number, CsWeaponInfo>();
  const gear = new Map<string, CsGearInfo>();
  for (const [rawName, entry] of Object.entries(doc.items)) {
    if (!entry || typeof entry !== 'object' || typeof entry.defindex !== 'number') continue;
    const name = rawName.toLowerCase();
    if (name === 'item_kevlar' || name === 'item_assaultsuit' || name === 'item_defuser') {
      gear.set(name, { name, price: attrNumber(entry, undefined, 'in game price', 0), team: teamOf(entry) || (name === 'item_defuser' ? CS_TEAM_CT : 0) });
      continue;
    }
    if (!name.startsWith('weapon_')) continue;
    const info = parseCsWeapon(name, entry, doc.scripts?.[name]);
    weapons.set(name, info);
    byDefindex.set(info.defindex, info);
  }
  return { weapons, byDefindex, gear };
}

// ─── The loaded table ────────────────────────────────────────────────────────────────────────

let table: CsWeaponTable | null = null;

/** Installs the weapon data (the host and every predicting client call it with the same document). */
export function setCsWeaponData(doc: CsItemsDocument): CsWeaponTable {
  table = buildCsWeaponTable(doc);
  return table;
}

/** The loaded table; throws when no data was installed (the game cannot run without it). */
export function csWeaponTable(): CsWeaponTable {
  if (!table) throw new Error('CS:GO weapon data is not loaded (setCsWeaponData)');
  return table;
}

export const hasCsWeaponData = (): boolean => table !== null;

/** A weapon by name (`weapon_ak47` or `ak47`), or null. */
export function csWeapon(name: string): CsWeaponInfo | null {
  const t = csWeaponTable();
  const n = name.toLowerCase();
  return t.weapons.get(n) ?? t.weapons.get(`weapon_${n}`) ?? null;
}

export function csWeaponByDefindex(defindex: number): CsWeaponInfo | null {
  return csWeaponTable().byDefindex.get(defindex) ?? null;
}
