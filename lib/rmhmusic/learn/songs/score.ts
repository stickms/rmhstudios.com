/**
 * A song as a score — pure. The songbook (`catalog.ts`) writes each melody once; this file turns it
 * into numbered notes with their bar, their onset in beats and the accidental the staff prints, and
 * says what each note sounds on each version.
 *
 * **Two versions, one staff.** Piano plays the staff as written. Guitar reads the same staff with
 * the octave clef (the small 8 under it) and sounds an octave LOWER, which is how guitar music is
 * written (`theory/fretboard.ts` `writtenMidi`), so a melody around middle C lies in the guitar's
 * open position.
 *
 * **Accidentals.** A note shows a sharp, flat or natural sign when its alteration differs from what
 * the key signature and the earlier notes of the same letter and octave in the bar already say;
 * the sign holds to the end of the bar.
 */
import type { Letter, SongNote } from './notation';

/** The songbook's keys (C, G, F) and the ones a singer's transposition may move into. */
export type SongKey = 'C' | 'G' | 'D' | 'A' | 'F' | 'Bb' | 'Eb';
/**
 * How a song is read: piano as written; guitar with the octave clef and tab, an octave lower; a
 * singer on their range's staff (`transpose.ts` moves the song there): treble as written, tenor
 * with the octave clef an octave lower, baritone and bass on the bass staff.
 */
export type SongVersion = 'piano' | 'guitar' | 'voice-treble' | 'voice-tenor' | 'voice-bass';
export const SONG_VERSIONS: readonly SongVersion[] = ['piano', 'guitar', 'voice-treble', 'voice-tenor', 'voice-bass'];

export interface Song {
  /** URL-safe id (`SONG_ID_RE`). */
  id: string;
  /** A proper name, shown as it is (not a translated key). */
  title: string;
  /** Who wrote it, or "Traditional". */
  composer: string;
  key: SongKey;
  beatsPerBar: 3 | 4;
  /** The normal tempo, quarter notes per minute. */
  bpm: number;
  /** Beats of an opening partial bar (an upbeat), or 0. */
  pickup: number;
  bars: readonly (readonly SongNote[])[];
}

export type Printed = 'sharp' | 'flat' | 'natural' | null;

export interface ScoreNote {
  index: number;
  bar: number;
  letter: Letter;
  alter: -1 | 0 | 1;
  /** The written pitch (MIDI). */
  written: number;
  beats: number;
  /** Beats from the first note of the song. */
  onset: number;
  /** The sign printed before the note. */
  printed: Printed;
}

/** What the key signature does to each letter. */
export const KEY_SIGNATURES: Readonly<Record<SongKey, Partial<Record<Letter, -1 | 1>>>> = {
  // In the order the signs are printed: sharps F C G, flats B E A.
  C: {},
  G: {
    F: 1,
  },
  D: {
    F: 1,
    C: 1,
  },
  A: {
    F: 1,
    C: 1,
    G: 1,
  },
  F: {
    B: -1,
  },
  Bb: {
    B: -1,
    E: -1,
  },
  Eb: {
    B: -1,
    E: -1,
    A: -1,
  },
};

/** Every note of the song in order. */
export function notesOf(song: Song): ScoreNote[] {
  const sig = KEY_SIGNATURES[song.key];
  const out: ScoreNote[] = [];
  let onset = 0;
  song.bars.forEach((bar, b) => {
    // The alteration in force for a letter in an octave, for the rest of this bar.
    const held = new Map<string, number>();
    for (const n of bar) {
      const at = `${n.letter}${n.octave}`;
      const current = held.get(at) ?? sig[n.letter] ?? 0;
      const printed: Printed =
        n.alter === current ? null : n.alter === 1 ? 'sharp' : n.alter === -1 ? 'flat' : 'natural';
      held.set(at, n.alter);
      out.push({
        index: out.length,
        bar: b,
        letter: n.letter,
        alter: n.alter,
        written: n.pitch,
        beats: n.beats,
        onset,
        printed,
      });
      onset += n.beats;
    }
  });
  return out;
}

/** The song's length in beats. */
export function songBeats(song: Song): number {
  let beats = 0;
  for (const bar of song.bars) for (const n of bar) beats += n.beats;
  return beats;
}

/** What a written note sounds on a version (guitar and tenor: an octave down). */
export function soundingPitch(written: number, version: SongVersion): number {
  return version === 'guitar' || version === 'voice-tenor' ? written - 12 : written;
}

/** The staff a version reads on. */
export function versionClef(version: SongVersion): 'treble' | 'bass' {
  return version === 'voice-bass' ? 'bass' : 'treble';
}

/** Whether a version reads the treble clef with the small 8 (an octave lower than written). */
export function versionOctaveClef(version: SongVersion): boolean {
  return version === 'guitar' || version === 'voice-tenor';
}

/** The natural a written note sits on (its letter and octave), MIDI. */
export function naturalOf(n: Pick<ScoreNote, 'written' | 'alter'>): number {
  return n.written - n.alter;
}

/** A note's name as the staff spells it, without its octave: "F♯". */
export function spelledName(n: Pick<ScoreNote, 'letter' | 'alter'>): string {
  return `${n.letter}${n.alter > 0 ? '♯' : n.alter < 0 ? '♭' : ''}`;
}

/** Bars per phrase, for "Hear it". */
export const PHRASE_BARS = 4;

/**
 * The phrase a note is in: four bars (an opening pickup belongs to the first phrase), as a range of
 * note indices `[from, to)`. An index past either end is clamped.
 */
export function phraseAt(
  song: Song,
  index: number,
): {
  from: number;
  to: number;
} {
  const notes = notesOf(song);
  if (notes.length === 0)
    return {
      from: 0,
      to: 0,
    };
  const i = Math.min(notes.length - 1, Math.max(0, Math.floor(index)));
  const lead = song.pickup > 0 ? 1 : 0;
  const phraseOf = (bar: number) => Math.floor(Math.max(0, bar - lead) / PHRASE_BARS);
  const want = phraseOf(notes[i]?.bar ?? 0);
  let from = i;
  while (from > 0 && phraseOf(notes[from - 1]?.bar ?? 0) === want) from--;
  let to = i + 1;
  while (to < notes.length && phraseOf(notes[to]?.bar ?? 0) === want) to++;
  return {
    from,
    to,
  };
}
