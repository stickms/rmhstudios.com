/**
 * What an FSRS card can be about — the ids stored in `music_learn_card.cardId`, pure.
 *
 * One table remembers everything the learner is drilled on, and one scheduler (`schedule.ts`)
 * schedules it, so each drill needs only a stable id for "this thing":
 *
 *   `treble:64`                    a staff card (`content/decks.ts`): a natural note on a clef.
 *   `treble:66:sharp`, `treble:70:flat`   a staff card with a printed sign, by SOUNDING pitch (`content/spelling.ts`).
 *   `key:G:treble:66`              a note read in a key (G D A F Bb Eb major): the key, the clef and the pitch
 *                                  the signature makes it. All three are staff cards: Practice deals them.
 *   `ear:interval:third`           hearing an interval and naming it.
 *   `ear:chord:minor`              hearing a triad and naming its quality.
 *   `sprint:note:<clef>:<midi>:<accidental>`  a written note (accidental -1, 0 or 1) read at speed.
 *   `sprint:chord:<clef>:<midi>:<quality>`    a triad read at speed, by its lowest written note.
 *   `int:up:third`, `int:down:minor-second`   reading an interval off the staff, by direction and by
 *                                             the size word or the quality name the lesson asks.
 *
 * Staff-card ids are the only ones Practice deals (`parseCardId`); the others are read by their own
 * drill, which lets its due and weak items come up more often. Every id is validated here before
 * the server writes it, so a client cannot invent rows.
 */
import { isKnownCardId } from '../content/decks';
import { CHORD_QUALITIES, type ChordQuality } from '../theory/chords';
import { INTERVAL_NAMES, type IntervalName } from '../theory/intervals';
import type { Clef } from '../theory/clef';
import { isStaffIntervalName, type IntervalDirection, type StaffIntervalName } from '../theory/staff-intervals';

export type ItemFamily = 'staff' | 'ear' | 'sprint' | 'interval';

const CLEFS: readonly string[] = ['treble', 'bass'];
/** Written MIDI of a Sprint prompt: well inside the piano, wide enough for every ledger line. */
const MIN_WRITTEN = 21;
const MAX_WRITTEN = 108;
const NATURAL_PCS = new Set([0, 2, 4, 5, 7, 9, 11]);

export function earItemId(kind: 'interval' | 'chord', name: IntervalName | ChordQuality): string {
  return `ear:${kind}:${name}`;
}

export function intervalItemId(direction: IntervalDirection, name: StaffIntervalName): string {
  return `int:${direction}:${name}`;
}

export function sprintNoteItemId(clef: Clef, written: number, accidental: -1 | 0 | 1): string {
  return `sprint:note:${clef}:${Math.round(written)}:${accidental}`;
}

export function sprintChordItemId(clef: Clef, lowestWritten: number, quality: ChordQuality): string {
  return `sprint:chord:${clef}:${Math.round(lowestWritten)}:${quality}`;
}

function validWritten(s: string | undefined): boolean {
  if (s === undefined || !/^\d{1,3}$/.test(s)) return false;
  const n = Number(s);
  return n >= MIN_WRITTEN && n <= MAX_WRITTEN && NATURAL_PCS.has(n % 12);
}

/** Which family an id belongs to, or null when no drill produces it. */
export function itemFamily(id: string): ItemFamily | null {
  if (isKnownCardId(id)) return 'staff';
  const p = id.split(':');
  if (p[0] === 'ear' && p.length === 3) {
    if (p[1] === 'interval' && (INTERVAL_NAMES as readonly string[]).includes(p[2]!)) return 'ear';
    if (p[1] === 'chord' && (CHORD_QUALITIES as readonly string[]).includes(p[2]!)) return 'ear';
    return null;
  }
  if (p[0] === 'int' && p.length === 3) {
    return (p[1] === 'up' || p[1] === 'down') && isStaffIntervalName(p[2]) ? 'interval' : null;
  }
  if (p[0] === 'sprint' && p.length === 5 && CLEFS.includes(p[2]!) && validWritten(p[3])) {
    if (p[1] === 'note' && (p[4] === '-1' || p[4] === '0' || p[4] === '1')) return 'sprint';
    if (p[1] === 'chord' && (CHORD_QUALITIES as readonly string[]).includes(p[4]!)) return 'sprint';
  }
  return null;
}

/** Whether `id` names something a drill can review (what the cards API accepts). */
export function isKnownItemId(id: string): boolean {
  return itemFamily(id) !== null;
}
