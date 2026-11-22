/**
 * What the learner's stored cards say about how they are doing — pure, client-safe.
 *
 * Every drill keeps its items in one table (`srs/items.ts`), each with an FSRS memory (stability,
 * difficulty, when it was last reviewed). This turns those rows into what a learner can use: how
 * many items are due now, today and this week per drill, which are the weakest (the chance of
 * recalling them right now, `recallChance`) and which the strongest, and what each item IS in words
 * a screen can translate (`describeItem`) instead of an id.
 *
 * Only reviewed items (`reps > 0`) count: a row that exists but was never answered is not due, weak
 * or strong, it is new.
 */
import { parseCardId } from '../content/decks';
import { stateFromRow, type CardRow } from '../content/practice';
import { cardAlteration, cardWritten, keyCardTonic } from '../content/spelling';
import { spelledNoteName } from '../miss';
import { midiToName } from '../pitch/notes';
import type { Clef } from '../theory/clef';
import type { ChordQuality } from '../theory/chords';
import type { IntervalName } from '../theory/intervals';
import type { IntervalDirection, StaffIntervalName } from '../theory/staff-intervals';
import { itemFamily, type ItemFamily } from './items';
import { DAY_MS, isDue, recallChance } from './schedule';

export const FAMILIES: readonly ItemFamily[] = ['staff', 'interval', 'ear', 'sprint'];

export interface FamilyCounts {
  /** Items of this family the learner has answered at least once. */
  reviewed: number;
  /** Due now. */
  dueNow: number;
  /** Due by the end of today (includes `dueNow`). */
  dueToday: number;
  /** Due within seven days (includes `dueToday`). */
  dueWeek: number;
}

export interface Strength {
  cardId: string;
  family: ItemFamily;
  /** The chance of recalling it right now, 0 to 1. */
  recall: number;
  /** Days until recall would fall to 90%. */
  stability: number;
  reps: number;
  lapses: number;
}

export interface Insights {
  /** Reviewed items across every family. */
  reviewed: number;
  families: Record<ItemFamily, FamilyCounts>;
  /** Lowest recall first. */
  weakest: Record<ItemFamily, Strength[]>;
  /** Longest-lasting memory first. */
  strongest: Record<ItemFamily, Strength[]>;
}

/** The last millisecond of the local day `now` falls in. */
export function endOfLocalDay(now: number): number {
  const d = new Date(now);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

const emptyCounts = (): FamilyCounts => ({ reviewed: 0, dueNow: 0, dueToday: 0, dueWeek: 0 });

/** How many of each list to keep (the page shows a handful, not the whole table). */
export const INSIGHT_LIST = 6;

export function buildInsights(
  rows: readonly CardRow[],
  now: number,
  dayEnd: number = endOfLocalDay(now),
  limit: number = INSIGHT_LIST,
): Insights {
  const families = Object.fromEntries(FAMILIES.map((f) => [f, emptyCounts()])) as Record<ItemFamily, FamilyCounts>;
  const all = Object.fromEntries(FAMILIES.map((f) => [f, [] as Strength[]])) as Record<ItemFamily, Strength[]>;
  const week = now + 7 * DAY_MS;
  let reviewed = 0;
  for (const row of rows) {
    if (row.reps <= 0) continue;
    const family = itemFamily(row.cardId);
    if (family === null) continue;
    const state = stateFromRow(row);
    const recall = recallChance(state, now);
    if (recall === null) continue;
    reviewed += 1;
    const c = families[family];
    c.reviewed += 1;
    if (isDue(state, now)) c.dueNow += 1;
    if (isDue(state, Math.max(now, dayEnd))) c.dueToday += 1;
    if (isDue(state, week)) c.dueWeek += 1;
    all[family].push({
      cardId: row.cardId,
      family,
      recall,
      stability: state.stability,
      reps: row.reps,
      lapses: row.lapses,
    });
  }
  const weakest = Object.fromEntries(FAMILIES.map((f) => [f, [] as Strength[]])) as Record<ItemFamily, Strength[]>;
  const strongest = Object.fromEntries(FAMILIES.map((f) => [f, [] as Strength[]])) as Record<ItemFamily, Strength[]>;
  const max = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 0;
  for (const f of FAMILIES) {
    weakest[f] = [...all[f]]
      .sort((a, b) => a.recall - b.recall || b.lapses - a.lapses || a.stability - b.stability)
      .slice(0, max);
    // A strong item is one that has been remembered more than once: a single lucky answer is not a habit.
    strongest[f] = all[f]
      .filter((s) => s.reps >= 2)
      .sort((a, b) => b.stability - a.stability || b.recall - a.recall)
      .slice(0, max);
  }
  return { reviewed, families, weakest, strongest };
}

/** What an item is, in parts a screen translates; null for an id no drill produces. */
export type ItemLabel =
  | {
      kind: 'staff';
      clef: Clef;
      name: string;
      /** A key card: the key's tonic as written ("B♭"), read in that key. */ key?: string;
    }
  | { kind: 'staff-interval'; direction: IntervalDirection; name: StaffIntervalName }
  | { kind: 'ear-interval'; name: IntervalName }
  | { kind: 'ear-chord'; name: ChordQuality }
  | { kind: 'sprint-note'; clef: Clef; name: string }
  | { kind: 'sprint-chord'; clef: Clef; root: string; quality: ChordQuality };

/** A written note's spelling: its letter, the accidental printed beside it, its octave ("F♯4"). */
function spelled(writtenMidi: number, accidental: number): string {
  const natural = midiToName(writtenMidi);
  const letter = natural.charAt(0);
  const octave = natural.slice(natural.search(/-?\d/));
  return `${letter}${accidental > 0 ? '♯' : accidental < 0 ? '♭' : ''}${octave}`;
}

export function describeItem(cardId: string): ItemLabel | null {
  const family = itemFamily(cardId);
  if (family === null) return null;
  if (family === 'staff') {
    const card = parseCardId(cardId);
    if (!card) return null;
    // A spelled card is named by the note as written ("F♯4", "B♭3"), never by its sounding pitch's
    // sharp name, and a key card also by its key (two keys' cards for one pitch are different cards).
    const name = spelledNoteName(cardWritten(card), cardAlteration(card));
    return card.key
      ? { kind: 'staff', clef: card.clef, name, key: keyCardTonic(card.key) }
      : { kind: 'staff', clef: card.clef, name };
  }
  const p = cardId.split(':');
  if (family === 'interval') {
    return { kind: 'staff-interval', direction: p[1] as IntervalDirection, name: p[2] as StaffIntervalName };
  }
  if (family === 'ear') {
    return p[1] === 'chord'
      ? { kind: 'ear-chord', name: p[2] as ChordQuality }
      : { kind: 'ear-interval', name: p[2] as IntervalName };
  }
  const clef = p[2] as Clef;
  const written = Number(p[3]);
  if (p[1] === 'note') return { kind: 'sprint-note', clef, name: spelled(written, Number(p[4])) };
  return { kind: 'sprint-chord', clef, root: spelled(written, 0), quality: p[4] as ChordQuality };
}

/** The recall as the percent a learner reads. */
export function recallPercent(recall: number): number {
  return Math.round(Math.min(1, Math.max(0, recall)) * 100);
}
