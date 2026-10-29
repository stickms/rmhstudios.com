/**
 * Console variables (the SDK's ConVar, tier1/convar.h): a typed value with a
 * default, an optional [min, max] clamp, flags and help text, and a change
 * callback.
 *
 * Values follow ConVar::InternalSetValue: a number cvar parses with atof
 * (anything unparsable is 0), clamps to its bounds, an int cvar truncates, a
 * bool cvar is 0 or 1. A string cvar keeps the text (capped), or — when it
 * lists `values` and is `strict` — refuses anything else.
 *
 * Environment-agnostic.
 */

// FCVAR_* (tier1/iconvar.h), the same bit values as the engine's.
export const FCVAR_NONE = 0;
/** Defined by the server (the match host / the single-player world). */
export const FCVAR_GAMEDLL = 1 << 2;
/** Defined by the client. */
export const FCVAR_CLIENTDLL = 1 << 3;
/** Left out of `find`, `cvarlist` and completion. */
export const FCVAR_HIDDEN = 1 << 4;
/** Single-player only. */
export const FCVAR_SPONLY = 1 << 6;
/** Saved (config.cfg, or the settings record when the cvar is settings-backed). */
export const FCVAR_ARCHIVE = 1 << 7;
/** The server tells every player when it changes. */
export const FCVAR_NOTIFY = 1 << 8;
/** The server's value is sent to every client; clients cannot set it themselves. */
export const FCVAR_REPLICATED = 1 << 13;
/** Needs `sv_cheats 1`. */
export const FCVAR_CHEAT = 1 << 14;

/** The flags by the names the console uses in its docs. */
export const CVAR = {
  CHEAT: FCVAR_CHEAT,
  ARCHIVE: FCVAR_ARCHIVE,
  REPLICATED: FCVAR_REPLICATED,
  SERVER: FCVAR_GAMEDLL,
  CLIENT: FCVAR_CLIENTDLL,
  NOTIFY: FCVAR_NOTIFY,
  HIDDEN: FCVAR_HIDDEN,
  SPONLY: FCVAR_SPONLY,
} as const;

const FLAG_NAMES: ReadonlyArray<readonly [number, string]> = [
  [FCVAR_GAMEDLL, 'game'],
  [FCVAR_CLIENTDLL, 'client'],
  [FCVAR_ARCHIVE, 'archive'],
  [FCVAR_NOTIFY, 'notify'],
  [FCVAR_REPLICATED, 'replicated'],
  [FCVAR_CHEAT, 'cheat'],
  [FCVAR_SPONLY, 'sp'],
];

/** "game notify replicated" — the flag line `help` prints. */
export function flagNames(flags: number): string {
  return FLAG_NAMES.filter(([bit]) => flags & bit)
    .map(([, name]) => name)
    .join(' ');
}

export type CvarType = 'int' | 'float' | 'bool' | 'string';

export interface CvarDef {
  name: string;
  type: CvarType;
  default: string | number | boolean;
  flags?: number;
  help?: string;
  min?: number;
  max?: number;
  /** Values offered by completion (and, with `strict`, the only ones accepted). */
  values?: readonly string[];
  strict?: boolean;
  /** Called after the value changed (not for a set to the same value). */
  onChange?: (cvar: ConVar, old: string) => void;
  /** An archived cvar the game's settings record persists (left out of config.cfg). */
  settingsBacked?: boolean;
}

/** Longest string a cvar holds. */
export const CVAR_STRING_MAX = 256;

/** atof: the longest numeric prefix, 0 when there is none. */
export function atof(s: string): number {
  const v = parseFloat(s.trim());
  return Number.isFinite(v) ? v : 0;
}

/** A float the way the engine prints one ("%g"-like, no exponent for ordinary values). */
export function formatNumber(v: number): string {
  if (Number.isInteger(v)) return String(v);
  return String(Math.round(v * 1e6) / 1e6);
}

export type CvarSetResult = { ok: true; changed: boolean; old: string; value: string } | { ok: false; error: string };

export class ConVar {
  readonly name: string;
  readonly type: CvarType;
  readonly flags: number;
  readonly help: string;
  readonly min: number | undefined;
  readonly max: number | undefined;
  readonly values: readonly string[] | undefined;
  readonly strict: boolean;
  readonly defaultValue: string;
  readonly settingsBacked: boolean;
  onChange: ((cvar: ConVar, old: string) => void) | undefined;
  private str: string;
  private num: number;

  constructor(def: CvarDef) {
    this.name = def.name;
    this.settingsBacked = def.settingsBacked ?? false;
    this.type = def.type;
    this.flags = def.flags ?? FCVAR_NONE;
    this.help = def.help ?? '';
    this.min = def.min;
    this.max = def.max;
    this.values = def.values;
    this.strict = def.strict ?? false;
    this.onChange = def.onChange;
    const d = this.normalize(typeof def.default === 'boolean' ? (def.default ? '1' : '0') : String(def.default));
    this.defaultValue = typeof d === 'string' ? d : String(def.default);
    this.str = this.defaultValue;
    this.num = atof(this.str);
  }

  get string(): string {
    return this.str;
  }
  get float(): number {
    return this.num;
  }
  get int(): number {
    return Math.trunc(this.num);
  }
  get bool(): boolean {
    return this.num !== 0;
  }
  get isDefault(): boolean {
    return this.str === this.defaultValue;
  }
  hasFlag(flag: number): boolean {
    return (this.flags & flag) !== 0;
  }

  /** The stored form of `raw`, or an error (a strict string cvar given something else). */
  normalize(raw: string): string | { error: string } {
    if (this.type === 'string') {
      const s = raw.slice(0, CVAR_STRING_MAX);
      if (this.strict && this.values && !this.values.includes(s)) {
        return { error: `${this.name}: "${s}" is not one of ${this.values.map((v) => `"${v}"`).join(', ')}` };
      }
      return s;
    }
    let v = atof(raw);
    // ConVar::ClampValue.
    if (this.min !== undefined && v < this.min) v = this.min;
    if (this.max !== undefined && v > this.max) v = this.max;
    if (this.type === 'bool') return v !== 0 ? '1' : '0';
    if (this.type === 'int') return String(Math.trunc(v));
    return formatNumber(v);
  }

  /** ConVar::SetValue. Fires `onChange` unless `quiet`. */
  set(raw: string | number | boolean, quiet = false): CvarSetResult {
    const text = typeof raw === 'boolean' ? (raw ? '1' : '0') : String(raw);
    const v = this.normalize(text);
    if (typeof v !== 'string') return { ok: false, error: v.error };
    const old = this.str;
    if (v === old) return { ok: true, changed: false, old, value: v };
    this.str = v;
    this.num = this.type === 'string' ? atof(v) : Number(v);
    if (!quiet) this.onChange?.(this, old);
    return { ok: true, changed: true, old, value: v };
  }

  reset(quiet = false): CvarSetResult {
    return this.set(this.defaultValue, quiet);
  }

  /** `"name" = "value" ( def. "default" ) min. … max. …` — what typing a cvar's name prints. */
  describe(): string[] {
    const range =
      this.min !== undefined || this.max !== undefined
        ? `${this.min !== undefined ? ` min. ${formatNumber(this.min)}` : ''}${this.max !== undefined ? ` max. ${formatNumber(this.max)}` : ''}`
        : '';
    const lines = [`"${this.name}" = "${this.str}" ( def. "${this.defaultValue}" )${range}`];
    const f = flagNames(this.flags);
    if (f) lines.push(` ${f}`);
    if (this.help) lines.push(` - ${this.help}`);
    return lines;
  }
}
