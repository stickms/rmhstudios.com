/**
 * The Book of Hours.
 *
 * Mana refills on its own — slowly, and whether or not the tab is open — and
 * buys prayers. Every prayer can go wrong, and the good ones can go very
 * wrong, which is the entire appeal. This is Cookie Clicker's Grimoire: the
 * only place in the game where you can lose something, and therefore the only
 * place where a decision has weight.
 *
 * Max mana grows with prayers said, so the book rewards use rather than
 * hoarding.
 */
import type { HoursState, PrayerDef, PrayerId } from '../types';

export const PRAYERS: PrayerDef[] = [
  {
    id: 'conjureJoy',
    name: 'Conjure Joy',
    icon: '🙏',
    description:
      'Take thirty minutes of your rate out of the air, capped at a fifth of what you already hold. If it fails, the temple falls silent for a while.',
    costFlat: 2,
    costShare: 0.4,
    backfire: 0.15,
    requiresLevel: 1,
  },
  {
    id: 'forceTheHand',
    name: 'Force the Hand of Providence',
    icon: '🌟',
    description:
      'Summon a halo, now, by name. Providence finds this rude and occasionally sends a dark one instead.',
    costFlat: 20,
    costShare: 0.6,
    backfire: 0.15,
    requiresLevel: 2,
  },
  {
    id: 'raiseTheFallen',
    name: 'Raise the Fallen',
    icon: '🫀',
    description:
      'Every Sinner you have ever struck comes back at once, already fat. Requires the Rapture, and a strong stomach.',
    costFlat: 20,
    costShare: 0.2,
    backfire: 0.1,
    requiresLevel: 3,
  },
  {
    id: 'buildInAnInstant',
    name: 'Build in an Instant',
    icon: '🏗️',
    description:
      'Raise a source out of nothing — a tenth of what you own of your best one. On a bad day it takes some instead.',
    costFlat: 50,
    costShare: 0.75,
    backfire: 0.15,
    requiresLevel: 4,
  },
  {
    id: 'stretchTime',
    name: 'Stretch the Hour',
    icon: '⏳',
    description:
      'Every blessing currently on you lasts twice as long. Failure ends all of them immediately.',
    costFlat: 20,
    costShare: 0.4,
    backfire: 0.2,
    requiresLevel: 5,
  },
  {
    id: 'gatherManna',
    name: 'Gather Manna',
    icon: '🍞',
    description: 'Ripen the manna where it stands. Failure spoils what was there.',
    costFlat: 40,
    costShare: 0.7,
    backfire: 0.25,
    requiresLevel: 6,
  },
  {
    id: 'diviningRod',
    name: 'The Divining Rod',
    icon: '🪄',
    description: 'Ask the garden for something it has not grown yet. It may answer with a weed.',
    costFlat: 30,
    costShare: 0.5,
    backfire: 0.3,
    requiresLevel: 7,
  },
];

export const PRAYER_MAP: Record<PrayerId, PrayerDef> = Object.fromEntries(
  PRAYERS.map((p) => [p.id, p]),
) as Record<PrayerId, PrayerDef>;

/** Mana refills on a five-second beat, like everything else slow. */
export const HOURS_BEAT_MS = 5_000;

export function createHours(): HoursState {
  return { unlocked: false, mana: 0, maxMana: 100, carry: 0, said: 0, backfired: 0, last: null };
}

/**
 * Maximum mana. Grows with the Scriptorium's level and with prayers said, so
 * the book opens up by being used rather than by being saved.
 */
export function maxManaFor(scriptoriumLevel: number, said: number): number {
  return Math.floor(100 + scriptoriumLevel * 20 + Math.pow(said, 0.75) * 3);
}

/** Seconds to refill from empty. Deliberately long: an hour at level one. */
export function refillSeconds(maxMana: number): number {
  return Math.max(600, maxMana * 30);
}

export function prayerCost(prayer: PrayerId, maxMana: number): number {
  const def = PRAYER_MAP[prayer];
  return Math.ceil(def.costFlat + def.costShare * maxMana);
}

/**
 * Odds a prayer goes wrong. Backfire is reduced by having said many prayers
 * successfully — the book learns your hand — but never reaches zero, because
 * a prayer that always works is a button.
 */
export function backfireChance(prayer: PrayerId, said: number, rapture: number): number {
  const base = PRAYER_MAP[prayer].backfire;
  const practice = Math.min(0.6, said / 500);
  // The Rapture makes everything less predictable, in both directions.
  const unrest = 1 + rapture * 0.25;
  return Math.max(0.02, base * (1 - practice) * unrest);
}

export function advanceHours(
  hours: HoursState,
  deltaMs: number,
  scriptoriumLevel: number,
): HoursState {
  if (!hours.unlocked) return hours;

  const total = hours.carry + deltaMs;
  const beats = Math.floor(total / HOURS_BEAT_MS);
  const carry = total - beats * HOURS_BEAT_MS;
  if (beats <= 0) return { ...hours, carry };

  const maxMana = maxManaFor(scriptoriumLevel, hours.said);
  const perBeat = (maxMana / refillSeconds(maxMana)) * (HOURS_BEAT_MS / 1000);

  return {
    ...hours,
    maxMana,
    mana: Math.min(maxMana, hours.mana + perBeat * beats),
    carry,
  };
}
