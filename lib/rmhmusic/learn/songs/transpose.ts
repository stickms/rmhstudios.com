/**
 * A song moved into a singer's range — pure. The songbook writes each melody once; a singer reads
 * it on their range's staff (`voice/range.ts`), as written when it fits there, else moved by whole
 * octaves, else into the nearest key whose transposition fits, with every note respelled by letter:
 * the tonic's letter moves by a number of steps on the staff and each note's letter moves by the
 * same steps, so a G-major F♯ becomes a C-major B, never a C♭ or a G♭. A key change is offered
 * only into a key the score can draw (`KEY_SIGNATURES`) and never needs a double sharp or flat.
 */
import type { Instrument, VoiceRange } from '../schemas';
import { writtenRange } from '../voice/range';
import { LETTER_PC, type Letter, type SongNote } from './notation';
import { KEY_SIGNATURES, type Song, type SongKey, type SongVersion } from './score';

const LETTERS: readonly Letter[] = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

/** Each drawable key's tonic: its letter and pitch class. */
const TONIC: Readonly<
  Record<
    SongKey,
    {
      letter: Letter;
      pc: number;
    }
  >
> = {
  C: {
    letter: 'C',
    pc: 0,
  },
  G: {
    letter: 'G',
    pc: 7,
  },
  D: {
    letter: 'D',
    pc: 2,
  },
  A: {
    letter: 'A',
    pc: 9,
  },
  F: {
    letter: 'F',
    pc: 5,
  },
  Bb: {
    letter: 'B',
    pc: 10,
  },
  Eb: {
    letter: 'E',
    pc: 3,
  },
};

const mod = (n: number, m: number) => ((n % m) + m) % m;

/** The version a learner reads a song in. */
export function versionFor(instrument: Instrument, range?: VoiceRange): SongVersion {
  if (instrument === 'guitar') return 'guitar';
  if (instrument !== 'voice') return 'piano';
  if (range === 'tenor') return 'voice-tenor';
  if (range === 'bass') return 'voice-bass';
  return 'voice-treble';
}

/**
 * The song moved by `semitones`, respelled in its new key, or null when no drawable key is that
 * far away or a note would need a double sharp or flat.
 */
export function transposeSong(song: Song, semitones: number): Song | null {
  if (semitones === 0) return song;
  const from = TONIC[song.key];
  const key = (Object.keys(TONIC) as SongKey[]).find((k) => TONIC[k].pc === mod(from.pc + semitones, 12));
  if (!key) return null;
  const letterSteps = mod(LETTERS.indexOf(TONIC[key].letter) - LETTERS.indexOf(from.letter), 7);
  // Steps on the staff: the letter difference in the direction (and octave) of the semitones.
  let steps = letterSteps;
  let best = Infinity;
  for (let m = -4; m <= 4; m++) {
    const d = letterSteps + 7 * m;
    const err = Math.abs((d * 12) / 7 - semitones);
    if (err < best) {
      best = err;
      steps = d;
    }
  }
  const bars: SongNote[][] = [];
  for (const bar of song.bars) {
    const out: SongNote[] = [];
    for (const n of bar) {
      const index = LETTERS.indexOf(n.letter) + 7 * n.octave + steps;
      const letter = LETTERS[mod(index, 7)] as Letter;
      const octave = Math.floor(index / 7);
      const pitch = n.pitch + semitones;
      const alter = pitch - (12 * (octave + 1) + LETTER_PC[letter]);
      if (alter !== -1 && alter !== 0 && alter !== 1) return null;
      out.push({
        ...n,
        letter,
        octave,
        pitch,
        alter,
      });
    }
    bars.push(out);
  }
  return {
    ...song,
    key,
    bars,
  };
}

/**
 * The song as a singer of `range` reads it: as written, or moved by the octave shift (smallest
 * first) that puts every written note inside the range's written compass, or else by the smallest
 * key change that does. `semitones` is how far the page moved (0 when it fits as written).
 */
export function songForRange(
  song: Song,
  range: VoiceRange,
): {
  song: Song;
  semitones: number;
} {
  const [lo, hi] = writtenRange(range);
  const pitches = song.bars.flatMap((bar) => bar.map((n) => n.pitch));
  const min = Math.min(...pitches);
  const max = Math.max(...pitches);
  const fits = (t: number) => min + t >= lo && max + t <= hi;
  const shifts: number[] = [];
  for (let t = -24; t <= 24; t++) if (fits(t)) shifts.push(t);
  shifts.sort((a, b) => {
    const octA = a % 12 === 0 ? 0 : 1;
    const octB = b % 12 === 0 ? 0 : 1;
    return octA - octB || Math.abs(a) - Math.abs(b) || a - b;
  });
  for (const t of shifts) {
    const moved = transposeSong(song, t);
    if (moved)
      return {
        song: moved,
        semitones: t,
      };
  }
  return {
    song,
    semitones: 0,
  };
}

/** Every key a song can be moved into is one the score draws (a check for tests). */
export const DRAWABLE_KEYS: readonly SongKey[] = Object.keys(KEY_SIGNATURES) as SongKey[];
