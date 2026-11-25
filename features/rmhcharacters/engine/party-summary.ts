/**
 * What a party sees of a character: a short, computed summary (pure; the server calls it with the rules data).
 *
 * The summary is built from numbers and names the rules engines produce, never from the sheet's free text: no notes,
 * backstory, appearance, personality, player name, portrait, inventory or currency, and the conditions list keeps only
 * the entries of the system's own condition list. The one free-text field is the character's `name`, which the
 * roster and the party need. Client-safe: no zod, no server imports.
 */
import { DND5E_CONDITIONS, PF2E_CONDITIONS } from './conditions';
import * as d5 from './dnd5e/rules';
import * as p2 from './pf2e/rules';
import type { Character, Dnd5eData, GameSystem, Pf2eData } from './types';

export interface PartySummary {
  system: GameSystem;
  name: string;
  level: number;
  /** The species (5e) or ancestry (PF2e) the rules data names, or null when the sheet has none chosen. */
  ancestry: string | null;
  /** Each class the rules data names, with its level. */
  classes: { name: string; level: number }[];
  ac: number;
  hp: { current: number; max: number; temp: number };
  /** Entries of the system's own condition list only. */
  conditions: string[];
  /** 5e: passive Perception (10 + the skill bonus). PF2e: the Perception modifier. */
  perception: number;
  speed: number;
  /** The initiative bonus; in PF2e initiative is Perception by default. */
  initiative: number;
}

const NAME_MAX = 120;

const known = (list: readonly string[], conditions: readonly string[]) => list.filter((c) => conditions.includes(c));

const whole = (n: number) => (Number.isFinite(n) ? Math.trunc(n) : 0);

function summary5e(c: Extract<Character, { system: 'dnd5e' }>, d: Dnd5eData): PartySummary {
  const skills = d5.skillLines(c, d);
  const perception = skills.find((s) => s.id === 'perception')?.bonus ?? 0;
  const species = d.species.find((s) => s.id === c.speciesId)?.name ?? null;
  const classes = c.classes.flatMap((k) => {
    const name = d.classes.find((x) => x.id === k.classId)?.name;
    return name ? [{ name, level: whole(k.level) }] : [];
  });
  return {
    system: 'dnd5e',
    name: c.name.slice(0, NAME_MAX),
    level: d5.totalLevel(c),
    ancestry: species,
    classes,
    ac: d5.armorClass(c, d).value,
    hp: { current: Math.max(0, whole(c.hp.current)), max: d5.maxHp(c, d), temp: Math.max(0, whole(c.hp.temp)) },
    conditions: known(DND5E_CONDITIONS, c.conditions),
    perception: 10 + perception,
    speed: d5.speed(c, d),
    initiative: d5.initiative(c, d),
  };
}

function summaryPf2e(c: Extract<Character, { system: 'pf2e' }>, d: Pf2eData): PartySummary {
  const per = p2.perception(c, d).bonus;
  const ancestry = p2.ancestryOf(d, c)?.name ?? null;
  const klass = p2.classOf(d, c)?.name;
  return {
    system: 'pf2e',
    name: c.name.slice(0, NAME_MAX),
    level: whole(c.level),
    ancestry,
    classes: klass ? [{ name: klass, level: whole(c.level) }] : [],
    ac: p2.armorClass(c, d).value,
    hp: { current: Math.max(0, whole(c.hp.current)), max: p2.maxHp(c, d), temp: Math.max(0, whole(c.hp.temp)) },
    conditions: known(PF2E_CONDITIONS, c.conditions),
    perception: per,
    speed: p2.speed(c, d),
    initiative: per,
  };
}

export function partySummary(c: Extract<Character, { system: 'dnd5e' }>, d: Dnd5eData): PartySummary;
export function partySummary(c: Extract<Character, { system: 'pf2e' }>, d: Pf2eData): PartySummary;
export function partySummary(c: Character, d: Dnd5eData | Pf2eData): PartySummary {
  return c.system === 'dnd5e' ? summary5e(c, d as Dnd5eData) : summaryPf2e(c, d as Pf2eData);
}
