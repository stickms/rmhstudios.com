/**
 * Halos — the thing that appears in the corner of the sanctum and rewards you
 * for having looked up.
 *
 * These are golden cookies, and the numbers are golden cookies' numbers: a ×7
 * frenzy for 77 seconds, a ×777 click frenzy for 13 seconds, a lucky payout of
 * `min(15% of joy held, 15 minutes of rate) + 13`. Those three values do an
 * enormous amount of work — the frenzy is the reason you check back, the lucky
 * is the reason banking joy before catching one is a real strategy, and the
 * click frenzy is the reason the offering button still matters at 10^40.
 *
 * The sable variants only appear during the Rapture. They pay far better and
 * two of them are actively bad, which is exactly the deal the Rapture offers.
 */
import type { HaloKind } from '../types';

export interface HaloOutcome {
  id: string;
  name: string;
  icon: string;
  /** One line shown in the toast when it lands. */
  note: string;
  /** Relative likelihood within its kind. */
  weight: number;
  kind: HaloKind;
  /** A timed multiplier on joy-per-second. */
  jps?: { multiplier: number; seconds: number };
  /** A timed multiplier on the offering. */
  touch?: { multiplier: number; seconds: number };
  /**
   * An instant payout, as `min(joyShare × joy held, rateSeconds × jps) + flat`.
   * Cookie Clicker's Lucky formula, which is what makes banking worthwhile.
   */
  gift?: { joyShare: number; rateSeconds: number; flat: number };
  /** Rain a burst of short-lived halos. */
  storm?: number;
  /** Multiplier scaled by how many sources you own, for a fixed window. */
  congregation?: { perSource: number; seconds: number };
  /** Take joy away. Sable halos are not all good news. */
  toll?: { joyShare: number; rateSeconds: number };
  /** Ripen a share of the current manna instantly. */
  manna?: number;
}

export const HALO_OUTCOMES: HaloOutcome[] = [
  // ── Gilded: the ordinary blessing ──
  {
    id: 'mercy',
    name: 'A Small Mercy',
    icon: '🪙',
    note: 'Nothing you did earned this. Take it anyway.',
    weight: 30,
    kind: 'gilded',
    gift: { joyShare: 0.15, rateSeconds: 900, flat: 13 },
  },
  {
    id: 'fervour',
    name: 'A Fervent Hour',
    icon: '🔥',
    note: 'Everything in the temple works at seven times its usual pace.',
    weight: 28,
    kind: 'gilded',
    jps: { multiplier: 7, seconds: 77 },
  },
  {
    id: 'blessedHands',
    name: 'Blessed Hands',
    icon: '🤲',
    note: 'Your offerings count for seven hundred and seventy-seven times as much. Briefly.',
    weight: 14,
    kind: 'gilded',
    touch: { multiplier: 777, seconds: 13 },
  },
  {
    id: 'congregation',
    name: 'A Full Congregation',
    icon: '🕊️',
    note: 'Everyone came. Everything counts more while they are here.',
    weight: 10,
    kind: 'gilded',
    congregation: { perSource: 0.01, seconds: 30 },
  },
  {
    id: 'rain',
    name: 'Rain of Grace',
    icon: '🌦️',
    note: 'More of them. All at once. Be quick.',
    weight: 7,
    kind: 'gilded',
    storm: 9,
  },
  {
    id: 'litany',
    name: 'The Litany',
    icon: '📿',
    note: 'It keeps giving. It has not stopped giving.',
    weight: 6,
    kind: 'gilded',
    gift: { joyShare: 0.5, rateSeconds: 3600, flat: 777 },
  },
  {
    id: 'bread',
    name: 'Bread Early',
    icon: '🍞',
    note: 'The manna ripened while you were looking at it.',
    weight: 5,
    kind: 'gilded',
    manna: 0.3,
  },

  // ── Sable: only during the Rapture ──
  {
    id: 'reckoning',
    name: 'The Reckoning',
    icon: '🩸',
    note: 'Six hundred and sixty-six times. For six seconds. Do something with them.',
    weight: 26,
    kind: 'sable',
    jps: { multiplier: 666, seconds: 6 },
  },
  {
    id: 'famine',
    name: 'A Season of Doubt',
    icon: '🌫️',
    note: 'Everything halves. It passes. It always passes.',
    weight: 22,
    kind: 'sable',
    jps: { multiplier: 0.5, seconds: 66 },
  },
  {
    id: 'tithe',
    name: 'The Levy',
    icon: '🕳️',
    note: 'Something took its share without asking.',
    weight: 16,
    kind: 'sable',
    toll: { joyShare: 0.05, rateSeconds: 600 },
  },
  {
    id: 'sableMercy',
    name: 'Restitution',
    icon: '🌑',
    note: 'Handed back with an apology and a great deal of interest.',
    weight: 24,
    kind: 'sable',
    gift: { joyShare: 0.3, rateSeconds: 2700, flat: 666 },
  },
  {
    id: 'sableHands',
    name: 'Hands of the Fallen',
    icon: '🖤',
    note: 'They will do the offering for you. They are very fast.',
    weight: 12,
    kind: 'sable',
    touch: { multiplier: 6_666, seconds: 6 },
  },

  // ── Seraphic: rare, deep, enormous ──
  {
    id: 'beatitude',
    name: 'Beatitude',
    icon: '😇',
    note: 'Seventy-seven times, for seventy-seven seconds. Sit down for this one.',
    weight: 40,
    kind: 'seraphic',
    jps: { multiplier: 77, seconds: 77 },
  },
  {
    id: 'longNoon',
    name: 'The Long Noon',
    icon: '🌞',
    note: 'Sevenfold, and it lasts most of a quarter hour.',
    weight: 35,
    kind: 'seraphic',
    jps: { multiplier: 7, seconds: 666 },
  },
  {
    id: 'jubilee',
    name: 'Jubilee',
    icon: '🎺',
    note: 'Every debt cancelled. Every store opened. All of it, now.',
    weight: 25,
    kind: 'seraphic',
    gift: { joyShare: 1, rateSeconds: 10_800, flat: 7_777 },
  },
];

export const HALO_MAP: Record<string, HaloOutcome> = Object.fromEntries(
  HALO_OUTCOMES.map((o) => [o.id, o]),
);

/** Seconds between halos, before frequency blessings. Cookie Clicker's window. */
export const HALO_INTERVAL_MIN = 300;
export const HALO_INTERVAL_MAX = 900;

/** How long a halo waits on screen before it fades, in seconds. */
export const HALO_LIFETIME = 13;

/** Odds a halo is seraphic rather than ordinary, once the Rapture has begun. */
export const SERAPHIC_CHANCE = 0.03;
