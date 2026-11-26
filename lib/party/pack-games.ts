/**
 * RMHBox community packs: what one line of a pack means for each game. Pure (no I/O, no clock), so the create schema,
 * the packs page's preview and the hub's loader all apply the same rules.
 *
 * A pack stores its lines as an array of strings, one per line, whatever the game:
 *
 *  - `wit-war`: a prompt, 8 to 120 characters.
 *  - `identity-crisis`: `Name` or `Name | Alias | Alias`, the name and each alias 2 to 60 characters, up to 5 aliases.
 *  - `human-keyboard`: a sentence, stored normalised (lowercase letters and single spaces, 20 to 60 characters).
 *
 * `parsePackText` reads what a member typed, `parsePackLines` what a client sent or the database holds; both return the
 * canonical lines that would be stored and the lines that cannot be used, each with its 1-based line number.
 */
/** The games a pack can be for. `PACK_GAMES` in `packs.ts` lists the same ids (it is checked against this type). */
export type PackGame = 'wit-war' | 'identity-crisis' | 'human-keyboard';

export interface PackGameRules {
  /** The fewest usable, distinct lines a pack needs. */
  min: number;
  /** The most lines a pack holds. */
  max: number;
}

export const PACK_GAME_RULES: Record<PackGame, PackGameRules> = {
  'wit-war': { min: 12, max: 60 },
  'identity-crisis': { min: 20, max: 60 },
  'human-keyboard': { min: 12, max: 60 },
};

export const WIT_WAR_LINE_MIN = 8;
export const WIT_WAR_LINE_MAX = 120;
export const IDENTITY_NAME_MIN = 2;
export const IDENTITY_NAME_MAX = 60;
export const IDENTITY_MAX_ALIASES = 5;
export const IDENTITY_ALIAS_SEPARATOR = '|';
export const SENTENCE_MIN = 20;
export const SENTENCE_MAX = 60;
/** A raw line is never longer than this, whatever the game (a name, five aliases and their separators fit). */
export const PACK_RAW_LINE_MAX = 400;

/** Why a line cannot be used. The page turns each into a sentence; the codes are not shown. */
export type LineErrorCode =
  'too-short' | 'too-long' | 'empty-after-normalising' | 'alias-too-short' | 'alias-too-long' | 'too-many-aliases';

export interface LineError {
  /** 1-based, counting blank lines, so it is the line number in the text box. */
  line: number;
  code: LineErrorCode;
  /** The limit the line broke, where there is one (a minimum or a maximum length, the alias cap). */
  limit?: number;
}

export interface PackParse {
  game: PackGame;
  /** Canonical lines, in order, duplicates removed; what is stored. */
  lines: string[];
  errors: LineError[];
  /** Distinct lines dropped because an earlier line was the same (case-insensitively, and for sentences after normalising). */
  duplicates: number;
  min: number;
  max: number;
  /** More lines than the game allows. */
  tooMany: boolean;
  /** Enough usable lines, none unusable, not too many. */
  ok: boolean;
}

export function isPackGame(value: unknown): value is PackGame {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(PACK_GAME_RULES, value);
}

/**
 * Pack text is member text other players read, so control characters (a tab or a stray NUL becomes a space) and the
 * invisible bidirectional controls (embeddings, overrides, isolates and marks, which could reorder what a line shows)
 * are removed before anything else is read.
 */
const CONTROL_CHARS = /[\p{Cc}\u2028\u2029]/gu;
const BIDI_CONTROLS = /[\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/gu;
const collapse = (s: string) => s.replace(CONTROL_CHARS, ' ').replace(BIDI_CONTROLS, '').replace(/\s+/g, ' ').trim();
const length = (s: string) => Array.from(s).length;

/** Lowercase letters and single spaces: accents folded, anything else a space. */
export function normalizeSentence(raw: string): string {
  return raw
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^a-z]+/g, ' ')
    .trim();
}

export interface PackIdentity {
  name: string;
  aliases: string[];
}

type LineResult = { ok: true; canonical: string; key: string } | { ok: false; code: LineErrorCode; limit?: number };

function readWitWar(raw: string): LineResult {
  const text = collapse(raw);
  const n = length(text);
  if (n < WIT_WAR_LINE_MIN) return { ok: false, code: 'too-short', limit: WIT_WAR_LINE_MIN };
  if (n > WIT_WAR_LINE_MAX) return { ok: false, code: 'too-long', limit: WIT_WAR_LINE_MAX };
  return { ok: true, canonical: text, key: text.toLowerCase() };
}

function readIdentity(raw: string): LineResult {
  const parts = raw.split(IDENTITY_ALIAS_SEPARATOR).map(collapse);
  const name = parts[0] ?? '';
  // An empty alias (`Ada | | Lovelace`, a trailing bar) is dropped, not an error.
  const aliases = parts.slice(1).filter(Boolean);
  const nameLength = length(name);
  if (nameLength < IDENTITY_NAME_MIN) return { ok: false, code: 'too-short', limit: IDENTITY_NAME_MIN };
  if (nameLength > IDENTITY_NAME_MAX) return { ok: false, code: 'too-long', limit: IDENTITY_NAME_MAX };
  if (aliases.length > IDENTITY_MAX_ALIASES) {
    return { ok: false, code: 'too-many-aliases', limit: IDENTITY_MAX_ALIASES };
  }
  for (const alias of aliases) {
    const n = length(alias);
    if (n < IDENTITY_NAME_MIN) return { ok: false, code: 'alias-too-short', limit: IDENTITY_NAME_MIN };
    if (n > IDENTITY_NAME_MAX) return { ok: false, code: 'alias-too-long', limit: IDENTITY_NAME_MAX };
  }
  const canonical = [name, ...aliases].join(` ${IDENTITY_ALIAS_SEPARATOR} `);
  // Two lines naming the same person are one identity, whatever their aliases.
  return { ok: true, canonical, key: name.toLowerCase() };
}

function readSentence(raw: string): LineResult {
  const text = normalizeSentence(raw);
  if (!text) return { ok: false, code: 'empty-after-normalising' };
  if (text.length < SENTENCE_MIN) return { ok: false, code: 'too-short', limit: SENTENCE_MIN };
  if (text.length > SENTENCE_MAX) return { ok: false, code: 'too-long', limit: SENTENCE_MAX };
  return { ok: true, canonical: text, key: text };
}

/** The longest line each game takes, the limit a line over `PACK_RAW_LINE_MAX` is told it broke. */
const LINE_MAX: Record<PackGame, number> = {
  'wit-war': WIT_WAR_LINE_MAX,
  'identity-crisis': IDENTITY_NAME_MAX,
  'human-keyboard': SENTENCE_MAX,
};

const READERS: Record<PackGame, (raw: string) => LineResult> = {
  'wit-war': readWitWar,
  'identity-crisis': readIdentity,
  'human-keyboard': readSentence,
};

/**
 * Read lines the way a pack of this game stores them. `entries` are `[lineNumber, rawLine]` pairs; blank lines are
 * left out by the callers, so a line number is where the member typed it.
 */
function parseEntries(game: PackGame, entries: ReadonlyArray<readonly [number, string]>): PackParse {
  const { min, max } = PACK_GAME_RULES[game];
  const read = READERS[game];
  const seen = new Set<string>();
  const lines: string[] = [];
  const errors: LineError[] = [];
  let duplicates = 0;
  for (const [line, raw] of entries) {
    const r: LineResult =
      raw.length > PACK_RAW_LINE_MAX ? { ok: false, code: 'too-long', limit: LINE_MAX[game] } : read(raw);
    if (!r.ok) {
      errors.push({ line, code: r.code, ...(r.limit !== undefined ? { limit: r.limit } : {}) });
      continue;
    }
    if (seen.has(r.key)) {
      duplicates++;
      continue;
    }
    seen.add(r.key);
    lines.push(r.canonical);
  }
  const tooMany = entries.length > max;
  return {
    game,
    lines,
    errors,
    duplicates,
    min,
    max,
    tooMany,
    ok: errors.length === 0 && !tooMany && lines.length >= min,
  };
}

/** A member's text box: lines split on newlines, blank lines skipped, numbers counting them. */
export function parsePackText(game: PackGame, text: string): PackParse {
  const entries: Array<readonly [number, string]> = [];
  text.split(/\r\n|\r|\n/).forEach((raw, i) => {
    if (raw.trim()) entries.push([i + 1, raw]);
  });
  return parseEntries(game, entries);
}

/** A list of lines (a request body, a stored pack): blank entries skipped, numbers are the position in the list. */
export function parsePackLines(game: PackGame, lines: readonly string[]): PackParse {
  const entries: Array<readonly [number, string]> = [];
  lines.forEach((raw, i) => {
    if (typeof raw === 'string' && raw.trim()) entries.push([i + 1, raw]);
  });
  return parseEntries(game, entries);
}

/**
 * What the hub loads: every stored line that is still valid for the game, duplicates removed, or null when fewer than
 * the game's minimum survive. The hub never trusts the stored lines, whatever wrote them.
 */
export function usablePackLines(game: PackGame, stored: readonly unknown[]): string[] | null {
  const strings = stored.filter((l): l is string => typeof l === 'string');
  const parsed = parsePackLines(game, strings);
  const lines = parsed.lines.slice(0, parsed.max);
  return lines.length >= parsed.min ? lines : null;
}

/** A stored Identity Crisis line as a name and its aliases; null when it is not a usable line. */
export function parseIdentityLine(line: string): PackIdentity | null {
  const r = readIdentity(line);
  if (!r.ok) return null;
  const [name = '', ...aliases] = r.canonical.split(` ${IDENTITY_ALIAS_SEPARATOR} `);
  return { name, aliases };
}
