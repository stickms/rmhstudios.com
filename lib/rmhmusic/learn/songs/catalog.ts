/**
 * The songbook: eight beginner melodies, every one in the PUBLIC DOMAIN — traditional tunes, and
 * composers who died more than seventy years ago — transcribed by hand for this app in the notation
 * of `notation.ts`. No third-party file or arrangement is copied; each is the bare melody line as
 * it is commonly sung, in C or G major. Amazing Grace is its first and last lines (the tune "New
 * Britain"); Ode to Joy is the theme of Beethoven's Ninth Symphony; Minuet in G is the first eight
 * bars of the minuet long attributed to J. S. Bach and now to Christian Petzold.
 *
 * Titles and composers are proper names and stay data: they are shown as written here, in every
 * language. Order is roughly by difficulty. `catalog.test.ts` holds every bar to its time
 * signature, every note to the staff and every guitar note to a fret.
 */
import { parseBars } from './notation';
import type { Song } from './score';

/** A song id: lowercase words joined by hyphens. */
export const SONG_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+){0,7}$/;

interface Source extends Omit<Song, 'bars'> {
  music: string;
}

const SOURCES: readonly Source[] = [
  {
    id: 'mary-had-a-little-lamb',
    title: 'Mary Had a Little Lamb',
    composer: 'Traditional',
    key: 'C',
    beatsPerBar: 4,
    bpm: 100,
    pickup: 0,
    music: 'E4 D4 C4 D4 | E4 E4 E4:2 | D4 D4 D4:2 | E4 G4 G4:2 | E4 D4 C4 D4 | E4 E4 E4 E4 | D4 D4 E4 D4 | C4:4 |',
  },
  {
    id: 'twinkle-twinkle',
    title: 'Twinkle, Twinkle, Little Star',
    composer: 'Traditional (French)',
    key: 'C',
    beatsPerBar: 4,
    bpm: 92,
    pickup: 0,
    music:
      'C4 C4 G4 G4 | A4 A4 G4:2 | F4 F4 E4 E4 | D4 D4 C4:2 | G4 G4 F4 F4 | E4 E4 D4:2 | ' +
      'G4 G4 F4 F4 | E4 E4 D4:2 | C4 C4 G4 G4 | A4 A4 G4:2 | F4 F4 E4 E4 | D4 D4 C4:2 |',
  },
  {
    id: 'lightly-row',
    title: 'Lightly Row',
    composer: 'Traditional (German)',
    key: 'C',
    beatsPerBar: 4,
    bpm: 100,
    pickup: 0,
    music:
      'G4 E4 E4:2 | F4 D4 D4:2 | C4 D4 E4 F4 | G4 G4 G4:2 | G4 E4 E4:2 | F4 D4 D4:2 | C4 E4 G4 G4 | C4:4 | ' +
      'D4 D4 D4 D4 | D4 E4 F4:2 | E4 E4 E4 E4 | E4 F4 G4:2 | G4 E4 E4:2 | F4 D4 D4:2 | C4 E4 G4 G4 | C4:4 |',
  },
  {
    id: 'ode-to-joy',
    title: 'Ode to Joy',
    composer: 'Ludwig van Beethoven',
    key: 'C',
    beatsPerBar: 4,
    bpm: 96,
    pickup: 0,
    music:
      'E4 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | E4:1.5 D4:0.5 D4:2 | ' +
      'E4 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | D4:1.5 C4:0.5 C4:2 |',
  },
  {
    id: 'au-clair-de-la-lune',
    title: 'Au clair de la lune',
    composer: 'Traditional (French)',
    key: 'C',
    beatsPerBar: 4,
    bpm: 92,
    pickup: 0,
    music:
      'C4 C4 C4 D4 | E4:2 D4:2 | C4 E4 D4 D4 | C4:4 | C4 C4 C4 D4 | E4:2 D4:2 | C4 E4 D4 D4 | C4:4 | ' +
      'D4 D4 D4 D4 | A3:2 A3:2 | D4 C4 B3 A3 | G3:4 | C4 C4 C4 D4 | E4:2 D4:2 | C4 E4 D4 D4 | C4:4 |',
  },
  {
    id: 'frere-jacques',
    title: 'Frère Jacques',
    composer: 'Traditional (French)',
    key: 'C',
    beatsPerBar: 4,
    bpm: 96,
    pickup: 0,
    music:
      'C4 D4 E4 C4 | C4 D4 E4 C4 | E4 F4 G4:2 | E4 F4 G4:2 | ' +
      'G4:0.5 A4:0.5 G4:0.5 F4:0.5 E4 C4 | G4:0.5 A4:0.5 G4:0.5 F4:0.5 E4 C4 | C4 G3 C4:2 | C4 G3 C4:2 |',
  },
  {
    id: 'amazing-grace',
    title: 'Amazing Grace',
    composer: 'Traditional',
    key: 'G',
    beatsPerBar: 3,
    bpm: 84,
    pickup: 1,
    music:
      'D4 | G4:2 B4:0.5 G4:0.5 | B4:2 A4 | G4:2 E4 | D4:2 D4 | G4:2 B4:0.5 G4:0.5 | B4:2 A4 | D5:3 | ' +
      'D5:2 D4 | G4:2 B4:0.5 G4:0.5 | B4:2 A4 | G4:3 |',
  },
  {
    id: 'minuet-in-g',
    title: 'Minuet in G',
    composer: 'Christian Petzold',
    key: 'G',
    beatsPerBar: 3,
    bpm: 96,
    pickup: 0,
    music:
      'D5 G4:0.5 A4:0.5 B4:0.5 C5:0.5 | D5 G4 G4 | E5 C5:0.5 D5:0.5 E5:0.5 F#5:0.5 | G5 G4 G4 | ' +
      'C5 D5:0.5 C5:0.5 B4:0.5 A4:0.5 | B4 C5:0.5 B4:0.5 A4:0.5 G4:0.5 | F#4 G4:0.5 A4:0.5 B4:0.5 G4:0.5 | A4:3 |',
  },
];

export const SONGS: readonly Song[] = SOURCES.map(({ music, ...rest }) => ({ ...rest, bars: parseBars(music) }));

// A plain search over eight songs (a module-level Map here would read as an ad-hoc cache to
// lib/__tests__/adhoc-cache-ratchet.test.ts, whose TTL-word check matches "Little").
export function songById(id: string): Song | null {
  return SONGS.find((s) => s.id === id) ?? null;
}

export function isSongId(id: unknown): id is string {
  return typeof id === 'string' && songById(id) !== null;
}
