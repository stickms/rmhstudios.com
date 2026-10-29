/**
 * The console commands and cvars that belong to the SERVER (the match host,
 * or the single-player world): who may run each, its arguments, and the one
 * validator both ends use. The client uses the table to route a command (it
 * forwards it as `MatchCommand { kind: 'extra' }` over the existing
 * `tf2:extra` channel, already rate-limited and zod-shaped by the hub) and to
 * complete its arguments; the server validates every argument again here,
 * because the client is never trusted.
 *
 * Access, as the SDK decides it:
 *   - `player`: anyone in the match (`kill`, `status`, `getpos`…);
 *   - `cheat`: needs the server's `sv_cheats 1` (FCVAR_CHEAT; client.cpp's
 *     `if ( !sv_cheats->GetBool() ) return;`);
 *   - `host`: the listen server's host (UTIL_IsCommandIssuedByServerAdmin) —
 *     the player whose browser runs the match offline or peer-to-peer. A
 *     dedicated hub room has no admin: these are refused there, and
 *     `sv_cheats` stays 0.
 *
 * Environment-agnostic.
 */

import { CLASS_NAMES } from '../core/constants';
import { STOCK_WEAPONS } from '../data/weapons';
import { BOT_DIFFICULTIES } from '../net/events';
import { EXTRA_COMMAND_MAX_ARGS } from '../net/extra-commands';
import { atof, FCVAR_CHEAT, FCVAR_GAMEDLL, FCVAR_NOTIFY, FCVAR_REPLICATED } from './cvar';

export type ConsoleGame = 'tf2' | 'hl2' | 'portal';
export type ServerAccess = 'player' | 'cheat' | 'host';

const ALL: readonly ConsoleGame[] = ['tf2', 'hl2', 'portal'];
const SP: readonly ConsoleGame[] = ['hl2', 'portal'];
const TF2: readonly ConsoleGame[] = ['tf2'];

/** coordsize.h MAX_COORD_FLOAT. */
export const MAX_COORD = 16384;
/** Longest string argument the `tf2:extra` channel carries (zExtraCommand). */
export const SERVER_ARG_MAX = 64;

export type ArgSpec =
  | { kind: 'float'; name: string; optional?: boolean; min?: number; max?: number }
  | { kind: 'int'; name: string; optional?: boolean; min: number; max: number }
  /** An identifier-like word: matches `re`, or one of `values` (lower-cased). */
  | { kind: 'word'; name: string; optional?: boolean; re?: RegExp; values?: readonly string[] }
  /** Printable text (no control characters), at most SERVER_ARG_MAX. */
  | { kind: 'text'; name: string; optional?: boolean };

export interface ServerCommandSpec {
  name: string;
  games: readonly ConsoleGame[];
  access: ServerAccess;
  args: readonly ArgSpec[];
  help: string;
  /** Arguments in any order (`tf_bot_add`): validated by the command itself, each still a word or text. */
  free?: boolean;
}

export interface ServerCvarSpec {
  name: string;
  games: readonly ConsoleGame[];
  type: 'int' | 'float' | 'bool' | 'string';
  default: number | string | Partial<Record<ConsoleGame, number>>;
  min?: number;
  max?: number;
  values?: readonly string[];
  flags: number;
  access: 'host' | 'cheat';
  help: string;
}

/** TF_CLASS_* names as `joinclass` / `tf_bot_add` take them. */
export const CLASS_WORDS: readonly string[] = CLASS_NAMES.slice(1) as readonly string[];
export const TEAM_WORDS: readonly string[] = ['red', 'blue', 'auto', 'spectate', 'spectator'];
export const DIFFICULTY_WORDS: readonly string[] = BOT_DIFFICULTIES;

/** Pickups `give` spawns in TF2. */
export const TF2_GIVE_PICKUPS: readonly string[] = [
  'item_healthkit_small',
  'item_healthkit_medium',
  'item_healthkit_full',
  'item_ammopack_small',
  'item_ammopack_medium',
  'item_ammopack_full',
];

/** What `give` knows in TF2: the pickups and every stock weapon script name. */
export function tf2GiveItems(): string[] {
  const names = new Set<string>(TF2_GIVE_PICKUPS);
  for (const w of Object.values(STOCK_WEAPONS)) for (const e of Object.values(w.perClass)) if (e) names.add(e.scriptName);
  return [...names].sort();
}

/** What `give` knows in Half-Life 2 / Portal. */
export const SP_GIVE_ITEMS: Readonly<Record<'hl2' | 'portal', readonly string[]>> = {
  hl2: ['item_suit', 'item_battery', 'item_healthkit', 'item_healthvial'],
  portal: ['weapon_portalgun', 'item_healthkit', 'item_healthvial'],
};

const NAME_RE = /^[a-z0-9_]{1,48}$/;
/** ent_fire targets: names, `!picker` / `!self` style specials, wildcards. */
const TARGET_RE = /^[!*\w.-]{1,64}$/;
const INPUT_RE = /^\w{1,64}$/;

export const SERVER_COMMANDS: readonly ServerCommandSpec[] = [
  // ── Anyone ─────────────────────────────────────────────────────────────
  { name: 'kill', games: ALL, access: 'player', args: [], help: 'Kills the player with generic damage.' },
  { name: 'explode', games: ALL, access: 'player', args: [], help: 'Kills the player with explosive damage.' },
  { name: 'status', games: ALL, access: 'player', args: [], help: 'Display map and connection status.' },
  { name: 'ping', games: TF2, access: 'player', args: [], help: 'Display ping to the server.' },
  { name: 'getpos', games: ALL, access: 'player', args: [], help: 'Dump position and angles to the console.' },
  { name: 'save', games: SP, access: 'player', args: [{ kind: 'word', name: 'name', optional: true, re: NAME_RE }], help: 'Saves a checkpoint (the quick save).' },
  { name: 'load', games: SP, access: 'player', args: [{ kind: 'word', name: 'name', optional: true, re: NAME_RE }], help: 'Loads the last checkpoint.' },
  // ── The listen server's host ─────────────────────────────────────────────
  {
    name: 'mp_restartgame',
    games: TF2,
    access: 'host',
    args: [{ kind: 'int', name: 'seconds', min: 0, max: 60 }],
    help: 'Restarts the game after <seconds> (scores reset).',
  },
  {
    name: 'tf_bot_add',
    games: TF2,
    access: 'host',
    free: true,
    args: [
      { kind: 'text', name: 'count|class|team|difficulty|name', optional: true },
      { kind: 'text', name: '…', optional: true },
      { kind: 'text', name: '…', optional: true },
      { kind: 'text', name: '…', optional: true },
      { kind: 'text', name: '…', optional: true },
    ],
    help: 'Add bots. Optional arguments in any order: <count> <class> <red|blue|auto> <easy|normal|hard|expert> <name> noquota.',
  },
  { name: 'tf_bot_kick', games: TF2, access: 'host', args: [{ kind: 'text', name: 'name|all' }], help: 'Remove a bot by name, or all bots.' },
  { name: 'tf_bot_kill', games: TF2, access: 'host', args: [{ kind: 'text', name: 'name|all' }], help: 'Kill a bot by name, or all bots.' },
  {
    name: 'changelevel',
    games: SP,
    access: 'host',
    args: [{ kind: 'word', name: 'map', re: NAME_RE }],
    help: 'Change the level (published maps only).',
  },
  { name: 'map', games: SP, access: 'host', args: [{ kind: 'word', name: 'map', re: NAME_RE }], help: 'Start a level (published maps only).' },
  // ── Cheats ─────────────────────────────────────────────────────────────
  { name: 'noclip', games: ALL, access: 'cheat', args: [], help: 'Toggle. Player becomes non-solid and flies.' },
  { name: 'god', games: ALL, access: 'cheat', args: [], help: 'Toggle. Player becomes invulnerable.' },
  { name: 'buddha', games: ALL, access: 'cheat', args: [], help: "Toggle. Player takes damage but won't die." },
  { name: 'notarget', games: ALL, access: 'cheat', args: [], help: 'Toggle. Player becomes hidden to bots and NPCs (and sentries).' },
  { name: 'impulse', games: ALL, access: 'cheat', args: [{ kind: 'int', name: 'n', min: 0, max: 255 }], help: 'impulse 101: full health, ammo and the weapons the game has.' },
  {
    name: 'give',
    games: ALL,
    access: 'cheat',
    args: [{ kind: 'word', name: 'item', re: NAME_RE }],
    help: 'Give item to player: give <item_name> (a weapon of your class or a pickup).',
  },
  {
    name: 'setpos',
    games: ALL,
    access: 'cheat',
    args: [
      { kind: 'float', name: 'x', min: -MAX_COORD, max: MAX_COORD },
      { kind: 'float', name: 'y', min: -MAX_COORD, max: MAX_COORD },
      { kind: 'float', name: 'z', optional: true, min: -MAX_COORD, max: MAX_COORD },
    ],
    help: 'Move player to specified origin (must have sv_cheats).',
  },
  {
    name: 'setang',
    games: ALL,
    access: 'cheat',
    args: [
      { kind: 'float', name: 'pitch', min: -360, max: 360 },
      { kind: 'float', name: 'yaw', min: -360, max: 360 },
      { kind: 'float', name: 'roll', optional: true, min: -360, max: 360 },
    ],
    help: 'Snap player eyes to specified pitch yaw <roll:optional> (must have sv_cheats).',
  },
  { name: 'hurtme', games: ALL, access: 'cheat', args: [{ kind: 'int', name: 'health', optional: true, min: -1000, max: 1000 }], help: 'Hurts the player: hurtme <health to lose>.' },
  {
    name: 'ent_fire',
    games: ALL,
    access: 'cheat',
    args: [
      { kind: 'word', name: 'target', re: TARGET_RE },
      { kind: 'word', name: 'input', optional: true, re: INPUT_RE },
      { kind: 'text', name: 'value', optional: true },
      { kind: 'float', name: 'delay', optional: true, min: 0, max: 600 },
    ],
    help: 'Fire an input on entities: ent_fire <target> [input] [value] [delay] (target !picker = what you look at).',
  },
  {
    name: 'portal_place',
    games: ['portal'],
    access: 'cheat',
    args: [
      { kind: 'int', name: 'portal 0|1', min: 0, max: 1 },
      { kind: 'float', name: 'x', optional: true, min: -MAX_COORD, max: MAX_COORD },
      { kind: 'float', name: 'y', optional: true, min: -MAX_COORD, max: MAX_COORD },
      { kind: 'float', name: 'z', optional: true, min: -MAX_COORD, max: MAX_COORD },
      { kind: 'float', name: 'pitch', optional: true, min: -360, max: 360 },
      { kind: 'float', name: 'yaw', optional: true, min: -360, max: 360 },
      { kind: 'float', name: 'roll', optional: true, min: -360, max: 360 },
    ],
    help: 'Debug: place portal 0 (blue) / 1 (orange) where you look, or at <x y z pitch yaw roll>.',
  },
];

export const SERVER_CVARS: readonly ServerCvarSpec[] = [
  {
    name: 'sv_cheats',
    games: ALL,
    type: 'bool',
    default: 0,
    flags: FCVAR_GAMEDLL | FCVAR_NOTIFY | FCVAR_REPLICATED,
    access: 'host',
    help: 'Allow cheats on server (the listen server host only; always 0 on dedicated servers).',
  },
  {
    name: 'sv_gravity',
    games: TF2,
    type: 'float',
    default: { tf2: 800 },
    min: 0,
    max: 4000,
    flags: FCVAR_GAMEDLL | FCVAR_NOTIFY | FCVAR_REPLICATED,
    access: 'host',
    help: 'World gravity for players (units/s²).',
  },
  {
    name: 'host_timescale',
    games: ALL,
    type: 'float',
    default: 1,
    min: 0.1,
    max: 10,
    flags: FCVAR_GAMEDLL | FCVAR_REPLICATED | FCVAR_CHEAT,
    access: 'cheat',
    help: "Prescale the clock by this amount (single-player, or a TF2 listen server's host with sv_cheats 1).",
  },
  {
    name: 'mp_timelimit',
    games: TF2,
    type: 'int',
    default: 0,
    min: 0,
    max: 999,
    flags: FCVAR_GAMEDLL | FCVAR_NOTIFY | FCVAR_REPLICATED,
    access: 'host',
    help: 'Game time per map in minutes (0 = no limit).',
  },
  {
    name: 'mp_winlimit',
    games: TF2,
    type: 'int',
    default: 0,
    min: 0,
    max: 99,
    flags: FCVAR_GAMEDLL | FCVAR_NOTIFY,
    access: 'host',
    help: 'Max score one team can reach before the game ends (0 = no limit).',
  },
  {
    name: 'mp_friendlyfire',
    games: TF2,
    type: 'bool',
    default: 0,
    flags: FCVAR_GAMEDLL | FCVAR_NOTIFY | FCVAR_REPLICATED,
    access: 'host',
    help: 'Allows team members to injure other members of their team.',
  },
  {
    name: 'tf_bot_quota',
    games: TF2,
    type: 'int',
    default: 0,
    min: 0,
    max: 32,
    flags: FCVAR_GAMEDLL,
    access: 'host',
    help: 'Determines the total number of tf bots in the game (fill mode: bots leave room for humans).',
  },
  {
    name: 'tf_bot_difficulty',
    games: TF2,
    type: 'int',
    default: 1,
    min: 0,
    max: 3,
    flags: FCVAR_GAMEDLL,
    access: 'host',
    help: 'Defines the skill of bots joining the game.  Values are: 0=easy, 1=normal, 2=hard, 3=expert.',
  },
  {
    name: 'tf_bot_force_class',
    games: TF2,
    type: 'string',
    default: '',
    values: ['', ...CLASS_WORDS],
    flags: FCVAR_GAMEDLL,
    access: 'host',
    help: 'If set to a class name, all TFBots will respawn as that class.',
  },
  {
    name: 'sv_portal_placement_never_fail',
    games: ['portal'],
    type: 'bool',
    default: 0,
    flags: FCVAR_GAMEDLL | FCVAR_REPLICATED | FCVAR_CHEAT,
    access: 'cheat',
    help: 'Debug: portals can be placed on any surface.',
  },
];

export function serverCommandSpec(name: string, game: ConsoleGame): ServerCommandSpec | null {
  const n = name.toLowerCase();
  return SERVER_COMMANDS.find((c) => c.name === n && c.games.includes(game)) ?? null;
}

export function serverCvarSpec(name: string, game: ConsoleGame): ServerCvarSpec | null {
  const n = name.toLowerCase();
  return SERVER_CVARS.find((c) => c.name === n && c.games.includes(game)) ?? null;
}

export function serverCvarDefault(spec: ServerCvarSpec, game: ConsoleGame): string {
  const d = spec.default;
  if (typeof d === 'object') return String(d[game] ?? 0);
  return String(d);
}

/** Whether an access level needs `sv_cheats` / the host. */
export const isCheat = (spec: { access: ServerAccess | 'host' | 'cheat'; flags?: number }): boolean =>
  spec.access === 'cheat' || ((spec.flags ?? 0) & FCVAR_CHEAT) !== 0;

// ─── Validation ──────────────────────────────────────────────────────────

/** No control characters (C0 or DEL). */
function printable(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x20 || c === 0x7f) return false;
  }
  return true;
}

/**
 * Raw `tf2:extra` arguments as console words: numbers as their text, booleans
 * 1/0, strings checked printable and capped. Null when anything is unusable
 * (wrong type, too many, too long, control characters, non-finite numbers).
 */
export function argWords(raw: unknown): string[] | null {
  if (!Array.isArray(raw) || raw.length > EXTRA_COMMAND_MAX_ARGS) return null;
  const out: string[] = [];
  for (const a of raw) {
    if (typeof a === 'number') {
      if (!Number.isFinite(a)) return null;
      out.push(String(a));
    } else if (typeof a === 'boolean') out.push(a ? '1' : '0');
    else if (typeof a === 'string') {
      if (a.length > SERVER_ARG_MAX || !printable(a)) return null;
      out.push(a);
    } else return null;
  }
  return out;
}

const isNumeric = (s: string): boolean => /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s.trim());

export type ParsedArg = string | number;
export type ValidationResult = { ok: true; args: ParsedArg[] } | { ok: false; error: string };

/** `Usage:  setpos <x> <y> [z]`. */
export function usage(spec: ServerCommandSpec): string {
  return `Usage:  ${spec.name}${spec.args.map((a) => (a.optional ? ` [${a.name}]` : ` <${a.name}>`)).join('')}`;
}

/** Checks a command's words against its spec. Numbers come back as numbers, words lower-cased. */
export function validateServerArgs(spec: ServerCommandSpec, words: readonly string[]): ValidationResult {
  if (words.length > spec.args.length) return { ok: false, error: usage(spec) };
  const out: ParsedArg[] = [];
  for (let i = 0; i < spec.args.length; i++) {
    const a = spec.args[i];
    const w = words[i];
    if (w === undefined || w === '') {
      if (a.optional) {
        // Optional arguments end at the first missing one.
        if (words.slice(i).some((x) => x !== undefined && x !== '')) return { ok: false, error: usage(spec) };
        break;
      }
      return { ok: false, error: usage(spec) };
    }
    if (a.kind === 'float' || a.kind === 'int') {
      if (!isNumeric(w)) return { ok: false, error: `${spec.name}: ${a.name} must be a number (${usage(spec)})` };
      let v = atof(w);
      if (a.kind === 'int') v = Math.trunc(v);
      if ((a.min !== undefined && v < a.min) || (a.max !== undefined && v > a.max)) {
        return { ok: false, error: `${spec.name}: ${a.name} must be between ${a.min ?? '-∞'} and ${a.max ?? '∞'}` };
      }
      out.push(v);
    } else if (a.kind === 'word') {
      const lw = w.toLowerCase();
      if (a.values && !a.values.includes(lw)) return { ok: false, error: `${spec.name}: unknown ${a.name} "${w}"` };
      if (a.re && !a.re.test(lw)) return { ok: false, error: `${spec.name}: invalid ${a.name} "${w}"` };
      out.push(lw);
    } else {
      if (w.length > SERVER_ARG_MAX || !printable(w)) return { ok: false, error: `${spec.name}: invalid ${a.name}` };
      out.push(w);
    }
  }
  return { ok: true, args: out };
}

/** A cvar value the server accepts (null = invalid). */
export function validateCvarValue(spec: ServerCvarSpec, word: string): string | null {
  if (word.length > SERVER_ARG_MAX || !printable(word)) return null;
  if (spec.type === 'string') {
    const w = word.toLowerCase();
    return spec.values && !spec.values.includes(w) ? null : w;
  }
  if (!isNumeric(word)) return null;
  let v = atof(word);
  if (spec.min !== undefined) v = Math.max(spec.min, v);
  if (spec.max !== undefined) v = Math.min(spec.max, v);
  if (spec.type === 'bool') return v !== 0 ? '1' : '0';
  if (spec.type === 'int') return String(Math.trunc(v));
  return String(Math.round(v * 1e4) / 1e4);
}

export interface BotAddRequest {
  count: number;
  cls: string | null;
  team: 'red' | 'blue' | 'auto';
  difficulty: (typeof BOT_DIFFICULTIES)[number] | null;
  name: string | null;
  quota: boolean;
}

/** tf_bot_add's any-order arguments (CTFBot tf_bot_add): count, class, team, difficulty, name, noquota. */
export function parseBotAdd(words: readonly string[], maxCount = 32): BotAddRequest | { error: string } {
  const r: BotAddRequest = { count: 1, cls: null, team: 'auto', difficulty: null, name: null, quota: true };
  for (const raw of words) {
    const lw = raw.toLowerCase();
    const w = lw === 'heavyweapons' ? 'heavy' : lw;
    if (CLASS_WORDS.includes(w)) r.cls = w;
    else if (w === 'red' || w === 'blue' || w === 'auto') r.team = w;
    else if (w === 'noquota') r.quota = false;
    else if ((DIFFICULTY_WORDS as readonly string[]).includes(w)) r.difficulty = w as BotAddRequest['difficulty'];
    else if (isNumeric(w) && atof(w) > 0) {
      r.count = Math.min(maxCount, Math.max(1, Math.trunc(atof(w))));
      r.name = null;
    } else if (r.count === 1 && raw.length <= 32 && printable(raw) && raw.trim()) r.name = raw.trim();
    else return { error: `tf_bot_add: invalid argument '${raw}'` };
  }
  return r;
}
