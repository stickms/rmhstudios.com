/**
 * Class resources and rests for the 5e sheet. Pure: a rest takes a character and returns a new one; the sheet only
 * calls these.
 *
 * A counted class resource (Rages, Channel Divinity, Second Wind...) is tracked by name in `resourcesUsed`. What a rest
 * gives back is read from the class data's `recharge` text by `rechargeRule`, once, here.
 */
import * as R from './rules';
import type { Dnd5eCharacter, Dnd5eData } from '../types';

/** What a rest gives back of one resource: every use, one use, or nothing. */
export type Restore = 'all' | 'one' | 'none';

export interface RechargeRule {
  short: Restore;
  long: Restore;
}

/** Every `recharge` text the class data uses and what it means. A new text must be added here (the product test says so). */
export const KNOWN_RECHARGE_TEXTS = [
  'Long Rest',
  'Short Rest',
  'Long Rest (one use back on a Short Rest)',
  'Long Rest (Short Rest from level 5)',
] as const;

export function isKnownRecharge(recharge: string | undefined): boolean {
  return recharge === undefined || (KNOWN_RECHARGE_TEXTS as readonly string[]).includes(recharge);
}

/**
 * What a short and a long rest give back for `recharge` text at `classLevel`. Text this does not know is treated as
 * "long rest gives all, short rest nothing", the safe reading; `isKnownRecharge` lets a test notice it.
 */
export function rechargeRule(recharge: string | undefined, classLevel: number): RechargeRule {
  switch (recharge) {
    case 'Short Rest':
      return { short: 'all', long: 'all' };
    case 'Long Rest (one use back on a Short Rest)':
      return { short: 'one', long: 'all' };
    case 'Long Rest (Short Rest from level 5)':
      return { short: classLevel >= 5 ? 'all' : 'none', long: 'all' };
    default:
      return { short: 'none', long: 'all' };
  }
}

/** The pact slots are tracked with the spell slots (`spells.pactSlotsUsed`), not as a resource. */
const PACT_SLOT_RESOURCE = 'Pact Magic Slots';

export interface TrackedResource {
  name: string;
  /** The most uses (or points) there are. */
  max: number;
  recharge: string;
  rule: RechargeRule;
}

/**
 * The resources a stepper tracks: a numeric value with a recharge. A die value ("d8") and a figure with no recharge
 * (Rage Damage, Eldritch Invocations) stay read-only rows. A name two classes share is one pool of both maxima.
 */
export function trackableResources(c: Dnd5eCharacter, data: Dnd5eData): TrackedResource[] {
  const out: TrackedResource[] = [];
  for (const k of c.classes) {
    for (const r of R.classOf(data, k.classId)?.resources ?? []) {
      if (!r.recharge || r.name === PACT_SLOT_RESOURCE) continue;
      const v = r.values[Math.min(19, k.level - 1)];
      const max = typeof v === 'number' ? Math.floor(v) : /^\d+$/.test(String(v)) ? Number(v) : 0;
      if (max <= 0) continue;
      const existing = out.find((x) => x.name === r.name);
      if (existing) existing.max += max;
      else out.push({ name: r.name, max, recharge: r.recharge, rule: rechargeRule(r.recharge, k.level) });
    }
  }
  return out;
}

/** Uses spent per resource, only for resources the character has, each between 0 and its maximum. */
export function clampResourcesUsed(c: Dnd5eCharacter, data: Dnd5eData): Record<string, number> {
  const stored = c.resourcesUsed ?? {};
  const out: Record<string, number> = {};
  for (const r of trackableResources(c, data)) {
    const n = Math.floor(Number(stored[r.name]));
    if (Number.isFinite(n) && n > 0) out[r.name] = Math.min(r.max, n);
  }
  return out;
}

/** Uses left of one resource. */
export const usesLeft = (c: Dnd5eCharacter, r: TrackedResource): number =>
  Math.max(0, r.max - Math.min(r.max, Math.max(0, Math.floor(c.resourcesUsed?.[r.name] ?? 0))));

/** Set one resource's uses left (clamped to 0..max); a full resource carries no entry. */
export function setUsesLeft(c: Dnd5eCharacter, r: TrackedResource, left: number): Dnd5eCharacter {
  const used = r.max - Math.min(r.max, Math.max(0, Math.floor(left)));
  const next = { ...(c.resourcesUsed ?? {}) };
  if (used > 0) next[r.name] = used;
  else delete next[r.name];
  return { ...c, resourcesUsed: next };
}

function recharged(c: Dnd5eCharacter, data: Dnd5eData, when: 'short' | 'long'): Record<string, number> {
  const used = clampResourcesUsed(c, data);
  for (const r of trackableResources(c, data)) {
    const restore = r.rule[when];
    const spent = used[r.name];
    if (restore === 'all') delete used[r.name];
    else if (restore === 'one' && spent !== undefined) {
      if (spent > 1) used[r.name] = spent - 1;
      else delete used[r.name];
    }
  }
  return used;
}

export interface HitDicePool {
  die: number;
  count: number;
  left: number;
}

/**
 * Hit Dice by size with how many are left. `hitDiceUsed` is the count; `hitDiceSpent` records which sizes the rests
 * spent. Spent dice with no recorded size (an older save, or the sheet's own "Hit Dice spent" stepper) are taken from
 * the smallest size first.
 */
export function hitDiceLeft(c: Dnd5eCharacter, data: Dnd5eData): HitDicePool[] {
  const pools = R.hitDice(c, data);
  let spent = Math.min(
    Math.max(0, Math.floor(c.hitDiceUsed)),
    pools.reduce((n, p) => n + p.count, 0),
  );
  const out: HitDicePool[] = pools.map((p) => ({ ...p, left: p.count }));
  const bySize = c.hitDiceSpent ?? {};
  for (const pool of out) {
    const take = Math.min(spent, pool.left, Math.max(0, Math.floor(bySize[pool.die] ?? 0)));
    pool.left -= take;
    spent -= take;
  }
  for (const pool of [...out].reverse()) {
    const take = Math.min(spent, pool.left);
    pool.left -= take;
    spent -= take;
  }
  return out;
}

/** The two fields that hold spent Hit Dice, from the dice spent of each size. */
function spentFields(pools: HitDicePool[]): Pick<Dnd5eCharacter, 'hitDiceUsed' | 'hitDiceSpent'> {
  const bySize: Record<number, number> = {};
  let used = 0;
  for (const p of pools) {
    const n = p.count - p.left;
    if (n > 0) bySize[p.die] = n;
    used += n;
  }
  return { hitDiceUsed: used, hitDiceSpent: bySize };
}

/** One Hit Die's healing from its roll total (die plus Constitution modifier): at least 1 (2024). */
export const hitDieHealing = (total: number): number => Math.max(1, Math.floor(total));

export interface ShortRestInput {
  /** Hit Dice spent, by die size (`{ 10: 2 }`). More than are left is cut to what is left. */
  spent: Record<number, number>;
  /** Hit points the rolls gave (already with the Constitution modifier). */
  healing: number;
}

/** How many dice of `spent` the character can really spend, by size. */
export function spendable(c: Dnd5eCharacter, data: Dnd5eData, spent: Record<number, number>): Record<number, number> {
  const out: Record<number, number> = {};
  for (const p of hitDiceLeft(c, data)) {
    const n = Math.min(p.left, Math.max(0, Math.floor(spent[p.die] ?? 0)));
    if (n > 0) out[p.die] = n;
  }
  return out;
}

/**
 * A short rest: the Hit Dice spent, the healing added up to the maximum, every short-rest resource back as its text
 * says, and the pact slots.
 */
export function applyShortRest(c: Dnd5eCharacter, data: Dnd5eData, input: ShortRestInput): Dnd5eCharacter {
  const chosen = spendable(c, data, input.spent);
  const pools = hitDiceLeft(c, data).map((p) => ({ ...p, left: p.left - (chosen[p.die] ?? 0) }));
  const dice = Object.values(chosen).reduce((n, v) => n + v, 0);
  const maxHp = R.maxHp(c, data);
  const heal = dice > 0 ? Math.max(0, Math.floor(input.healing)) : 0;
  return {
    ...c,
    hp: { ...c.hp, current: Math.min(maxHp, Math.max(0, c.hp.current) + heal) },
    ...spentFields(pools),
    deathSaves: heal > 0 && c.hp.current === 0 ? { successes: 0, failures: 0 } : c.deathSaves,
    spells: { ...c.spells, pactSlotsUsed: 0 },
    resourcesUsed: recharged(c, data, 'short'),
  };
}

/**
 * A long rest: full HP, half the Hit Dice (at least one, the largest given back first), every slot and resource, one
 * exhaustion, the death saves.
 */
export function applyLongRest(c: Dnd5eCharacter, data: Dnd5eData): Dnd5eCharacter {
  const pools = hitDiceLeft(c, data);
  let back = Math.max(1, Math.floor(pools.reduce((n, p) => n + p.count, 0) / 2));
  for (const p of pools) {
    const n = Math.min(back, p.count - p.left);
    p.left += n;
    back -= n;
  }
  return {
    ...c,
    hp: { current: R.maxHp(c, data), temp: 0 },
    ...spentFields(pools),
    spells: { ...c.spells, slotsUsed: c.spells.slotsUsed.map(() => 0), pactSlotsUsed: 0 },
    exhaustion: Math.max(0, c.exhaustion - 1),
    deathSaves: { successes: 0, failures: 0 },
    resourcesUsed: recharged(c, data, 'long'),
  };
}
