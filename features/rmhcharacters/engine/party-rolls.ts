/**
 * Rolls made for the table (sprint 12, feature 01). Pure: no React, no storage, no network, no randomness.
 *
 * A table roll is a request that names what to roll. The server reads the member's own character and asks the same
 * rules functions the sheet calls (`skillLines`, `attacks`, `strikes`, `save`, `perception`, `initiative`) for the
 * modifier, so a client never sends a modifier or a result. `modifierFor` and `damageTextFor` are that read; the rest
 * is the visibility rule and the rules key a roll is stored under.
 *
 * Client-safe: types only from the schema file (no zod ships).
 */
import type { z } from 'zod';
import type { Term } from '@/lib/toolbox/dice';
import * as d5 from './dnd5e/rules';
import * as p2 from './pf2e/rules';
import type { rollBody, sheetRequest } from './party-rolls-schema';
import type { Degree } from './rolls';
import { DND5E_SKILL_IDS } from './dnd5e/skills';
import { PF2E_SKILLS, type Character, type Dnd5eData, type GameSystem, type Pf2eData } from './types';

export type SheetRequest = z.infer<typeof sheetRequest>;
export type RollBody = z.infer<typeof rollBody>;
export type RollVisibility = RollBody['visibility'];
export type PartyRollKind = SheetRequest['kind'];

/** The newest rolls a party keeps; older ones are deleted in the transaction that inserts a new one. */
export const PARTY_ROLL_KEEP = 200;
/** How many rolls a page of the log holds. */
export const PARTY_ROLL_PAGE = 50;
/** How often the open party asks for new rolls while the page is visible. */
export const PARTY_ROLL_POLL_MS = 5_000;

const PF2E_SAVES = ['fortitude', 'reflex', 'will'] as const;
const isPf2eSave = (v: string): v is (typeof PF2E_SAVES)[number] => (PF2E_SAVES as readonly string[]).includes(v);

/** Kinds that read the caller's own character; `free` does not. */
export const isSheetKind = (kind: PartyRollKind) => kind !== 'free';
/** Kinds that roll a d20 with a modifier (advantage and exhaustion apply to these in 5e). */
export const isD20Kind = (kind: PartyRollKind) => !['damage', 'free'].includes(kind);

const is5e = (c: Character): c is Extract<Character, { system: 'dnd5e' }> => c.system === 'dnd5e';

/**
 * The flat modifier of a d20 request, read from the sheet's own rules functions. `null` when the request does not
 * apply to this character or system (an index past the list, a skill the sheet does not have, a Strike on a 5e sheet).
 * Exhaustion is not in it: it is a separate term of the roll (`exhaustionOf`).
 */
export function modifierFor(c: Character, req: SheetRequest, data: Dnd5eData | Pf2eData): number | null {
  if (is5e(c)) {
    const d = data as Dnd5eData;
    switch (req.kind) {
      case 'check':
        return d5.abilityMod(d5.abilityScores(c, d)[req.ability]);
      case 'save': {
        if (isPf2eSave(req.ability)) return null;
        const mod = d5.abilityMod(d5.abilityScores(c, d)[req.ability]);
        return mod + (d5.saveProficiencies(c, d).includes(req.ability) ? d5.proficiencyBonus(d5.totalLevel(c)) : 0);
      }
      case 'skill':
        return d5.skillLines(c, d).find((s) => s.id === req.key)?.bonus ?? null;
      case 'initiative':
        return d5.initiative(c, d);
      case 'attack':
        return d5.attacks(c, d)[req.index]?.toHit ?? null;
      default:
        return null;
    }
  }
  const d = data as Pf2eData;
  switch (req.kind) {
    case 'check':
      return p2.attributeMods(c)[req.ability];
    case 'save':
      return isPf2eSave(req.ability) ? p2.save(c, d, req.ability).bonus : null;
    case 'skill':
      return p2.skillLines(c, d).find((s) => s.id === req.key)?.bonus ?? null;
    // In Pathfinder 2e initiative is a Perception check by default.
    case 'initiative':
    case 'perception':
      return p2.perception(c, d).bonus;
    case 'strike':
      return p2.strikes(c, d)[req.index]?.attack[req.map] ?? null;
    default:
      return null;
  }
}

/** The damage text (`1d8 +3 Slashing`) of an attack or Strike the sheet lists, or `null`. */
export function damageTextFor(c: Character, req: SheetRequest, data: Dnd5eData | Pf2eData): string | null {
  if (req.kind !== 'damage') return null;
  if (is5e(c)) return d5.attacks(c, data as Dnd5eData)[req.index]?.damage ?? null;
  return p2.strikes(c, data as Pf2eData)[req.index]?.damage ?? null;
}

/** 5e exhaustion level (a penalty to every d20 test); Pathfinder has none. */
export const exhaustionOf = (c: Character): number => (is5e(c) ? Math.max(0, Math.floor(c.exhaustion)) : 0);

/** The rules key a roll is stored under: never free text (a Pathfinder lore skill, named by the player, is `lore`). */
export function labelFor(req: SheetRequest): string {
  switch (req.kind) {
    case 'skill':
      return DND5E_SKILL_IDS.includes(req.key) || (PF2E_SKILLS as readonly string[]).includes(req.key)
        ? req.key
        : 'lore';
    case 'check':
    case 'save':
      return req.ability;
    case 'attack':
      return `a${req.index}`;
    case 'damage':
      return `d${req.index}${req.critical ? 'c' : ''}`;
    case 'strike':
      return `s${req.index}m${req.map}`;
    case 'initiative':
    case 'perception':
      return req.kind;
    case 'free':
      return '';
  }
}

/** What an attack, damage or Strike label (`a0`, `d1c`, `s0m2`) points at; `null` for a label that is not one. */
export function parseLabel(label: string): { index: number; critical: boolean; map: number } | null {
  const m = /^(?:a(\d+)|d(\d+)(c?)|s(\d+)m([012]))$/.exec(label);
  if (!m) return null;
  return {
    index: Number(m[1] ?? m[2] ?? m[4]),
    critical: m[3] === 'c',
    map: m[5] === undefined ? 0 : Number(m[5]),
  };
}

/** A roll's terms written as notation (`2d20kh1+5`), within the column's 64 characters. */
export function notationOf(terms: readonly Term[], multiplier = 1): string {
  const body = terms
    .map((term, i) => {
      const sign = term.sign === -1 ? '-' : i === 0 ? '' : '+';
      if (term.kind === 'constant') return `${sign}${term.value}`;
      const keep = term.keep ? `${term.keep.mode}${term.keep.n}` : '';
      return `${sign}${term.count}d${term.sides}${keep}${term.explode ? '!' : ''}`;
    })
    .join('');
  return (multiplier > 1 ? `(${body})x${multiplier}` : body).slice(0, 64);
}

/** The flat part of a roll: its constant terms, signed. */
export const flatOf = (terms: readonly Term[]): number =>
  terms.reduce((n, term) => (term.kind === 'constant' ? n + term.sign * term.value : n), 0);

export interface RollViewer {
  userId: string;
  /** The party's game master. */
  isGm: boolean;
}

/**
 * Who sees a roll. `table`: every member. `gm`: the roller and the game master. `secret`: the game master only (a
 * player never holds one, so a `secret` roll is in no player's response).
 */
export function visibleTo(roll: { visibility: string; userId: string }, viewer: RollViewer): boolean {
  if (viewer.isGm) return true;
  if (roll.visibility === 'table') return true;
  return roll.visibility === 'gm' && roll.userId === viewer.userId;
}

/** The same rule as a query filter, so a hidden roll is never read at all (visibility is filtered in the query). */
export function visibilityWhere(viewer: RollViewer) {
  if (viewer.isGm) return {};
  return { OR: [{ visibility: 'table' }, { visibility: 'gm', userId: viewer.userId }] };
}

export type RollRefusal = 'FORBIDDEN' | 'INVALID_INPUT' | 'PARTY_ROLL_NO_CHARACTER';

/**
 * The rules about who may roll what, before anything is read or written. `null` when the request may go on.
 * A player chooses `table` or `gm`; the game master `table` or `secret`; only the game master sets a DC, only on a
 * secret Pathfinder roll; a sheet roll needs the caller's own seat and character in the party.
 */
export function rollPolicy(input: {
  isGm: boolean;
  hasSeat: boolean;
  system: GameSystem;
  req: SheetRequest;
  visibility: RollVisibility;
  dc: number | undefined;
}): RollRefusal | null {
  const { isGm, hasSeat, system, req, visibility, dc } = input;
  if (isGm ? visibility === 'gm' : visibility === 'secret') return 'INVALID_INPUT';
  if (dc !== undefined) {
    if (!isGm) return 'FORBIDDEN';
    if (visibility !== 'secret' || system !== 'pf2e') return 'INVALID_INPUT';
  }
  if (isSheetKind(req.kind) && !hasSeat) return 'PARTY_ROLL_NO_CHARACTER';
  return null;
}

/** A stored roll as a viewer receives it (client-safe; the contract re-exports it). */
export interface PartyRoll {
  id: string;
  /** Milliseconds since the epoch. */
  at: number;
  kind: PartyRollKind;
  label: string;
  notation: string;
  dice: number[];
  modifier: number;
  total: number;
  mode: 'normal' | 'advantage' | 'disadvantage';
  visibility: RollVisibility;
  dc: number | null;
  degree: Degree | null;
  /** Who rolled: a character (named from the party's current seat), the game master, or one who left. `hidden`: a player the reader is blocked with. */
  who: { kind: 'character'; name: string } | { kind: 'gm' } | { kind: 'left' } | { kind: 'hidden' };
  /** Whether the viewer made this roll. */
  mine: boolean;
}

/** The cursor of the next older page: the position of the oldest roll on this one. */
export const cursorOf = (roll: { createdAt: Date; id: string }) => `${roll.createdAt.getTime()}_${roll.id}`;
