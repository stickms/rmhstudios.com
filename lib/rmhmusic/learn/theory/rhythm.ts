/**
 * Written rhythm as data, and what is read off it (pure; no clock, no audio, no React).
 *
 * A bar is a list of written notes, each a value (whole to eighth), perhaps dotted, perhaps a rest,
 * perhaps tied to the note after it. Everything the lesson needs follows from that list:
 *
 * - how long each note lasts in beats, and whether the bar adds up to its meter ({@link patternProblem});
 * - where each SOUND starts ({@link onsetBeats}): a rest sounds nothing, and a note tied into by the one
 *   before it does not start again (ties merge, {@link soundEvents});
 * - when those sounds fall in ms at a tempo ({@link onsetTimesMs}), which is what a tap is scored against;
 * - which eighths share a beam ({@link beamGroups}), for drawing;
 * - the bar in words ({@link describeBar}), for the text equivalent.
 *
 * Beats are quarter notes in both meters (4/4 and 3/4); compound meters are out of scope.
 */

export type RhythmValue = 'whole' | 'half' | 'quarter' | 'eighth';
export type Meter = '4/4' | '3/4';

export interface RhythmNote {
  value: RhythmValue;
  dotted: boolean;
  rest: boolean;
  /** This note's sound carries on into the next note (a tie), which therefore does not start again. */
  tieToNext: boolean;
}

export interface RhythmPattern {
  meter: Meter;
  notes: RhythmNote[];
}

const BEATS_OF_VALUE: Readonly<Record<RhythmValue, number>> = {
  whole: 4,
  half: 2,
  quarter: 1,
  eighth: 0.5,
};

/** Beats in a bar of the meter. */
export function meterBeats(meter: Meter): number {
  return meter === '3/4' ? 3 : 4;
}

/** How many beats a written note lasts (a dot adds half). */
export function noteBeats(note: Pick<RhythmNote, 'value' | 'dotted'>): number {
  return BEATS_OF_VALUE[note.value] * (note.dotted ? 1.5 : 1);
}

/** The beats the bar's notes add up to. */
export function barBeats(pattern: RhythmPattern): number {
  return pattern.notes.reduce((sum, n) => sum + noteBeats(n), 0);
}

/**
 * What is wrong with a pattern, or null when it is a good bar: the notes must add up to the meter,
 * a tie needs a note after it and must not start or end on a rest, and a bar has notes.
 */
export function patternProblem(pattern: RhythmPattern): string | null {
  const { notes } = pattern;
  if (notes.length === 0) return 'empty bar';
  const total = barBeats(pattern);
  const want = meterBeats(pattern.meter);
  if (Math.abs(total - want) > 1e-9) return `adds up to ${total} beats, not ${want}`;
  for (let i = 0; i < notes.length; i++) {
    const note = notes[i];
    if (!note?.tieToNext) continue;
    const next = notes[i + 1];
    if (!next) return 'the last note is tied to nothing';
    if (note.rest || next.rest) return 'a rest cannot be tied';
  }
  return null;
}

/** The beat each written note starts on, from 0. */
export function noteStarts(pattern: RhythmPattern): number[] {
  const starts: number[] = [];
  let at = 0;
  for (const note of pattern.notes) {
    starts.push(at);
    at += noteBeats(note);
  }
  return starts;
}

export interface SoundEvent {
  /** Where the sound starts (beats from the bar's start). */
  start: number;
  /** Where it ends, ties included. */
  end: number;
  /** The written notes that make it: one, or several joined by ties. */
  notes: number[];
}

/** The bar's sounds, in order: rests are silence and a tied note joins the one before it. */
export function soundEvents(pattern: RhythmPattern): SoundEvent[] {
  const starts = noteStarts(pattern);
  const events: SoundEvent[] = [];
  let open: SoundEvent | null = null;
  pattern.notes.forEach((note, i) => {
    const start = starts[i] ?? 0;
    const end = start + noteBeats(note);
    if (note.rest) {
      open = null;
      return;
    }
    if (open) {
      open.end = end;
      open.notes.push(i);
    } else {
      open = { start, end, notes: [i] };
      events.push(open);
    }
    if (!note.tieToNext) open = null;
  });
  return events;
}

/** Where each sound starts, in beats from the bar's start: the moments a learner must tap. */
export function onsetBeats(pattern: RhythmPattern): number[] {
  return soundEvents(pattern).map((e) => e.start);
}

/** Milliseconds from one beat to the next. */
export function beatMs(bpm: number): number {
  return 60_000 / bpm;
}

/** Where each sound starts in ms: `startMs` is the bar's first beat. */
export function onsetTimesMs(pattern: RhythmPattern, bpm: number, startMs = 0): number[] {
  const per = beatMs(bpm);
  return onsetBeats(pattern).map((b) => startMs + b * per);
}

/** The bar's length in ms. */
export function barMs(pattern: RhythmPattern, bpm: number): number {
  return meterBeats(pattern.meter) * beatMs(bpm);
}

/**
 * Which written notes are beamed together: runs of two or more plain eighth notes (not rests, not
 * dotted) that start in the same beat. An eighth alone in its beat keeps its flag.
 */
export function beamGroups(pattern: RhythmPattern): number[][] {
  const starts = noteStarts(pattern);
  const groups: number[][] = [];
  let run: number[] = [];
  const flush = () => {
    if (run.length >= 2) groups.push(run);
    run = [];
  };
  pattern.notes.forEach((note, i) => {
    const plain = note.value === 'eighth' && !note.rest && !note.dotted;
    if (!plain) {
      flush();
      return;
    }
    const beat = Math.floor(starts[i] ?? 0);
    const last = run[run.length - 1];
    if (last !== undefined && Math.floor(starts[last] ?? 0) !== beat) flush();
    run.push(i);
  });
  flush();
  return groups;
}

/** One spoken item of a bar: a note or rest, or a beamed group of eighths. */
export interface BarWord {
  value: RhythmValue;
  dotted: boolean;
  rest: boolean;
  /** More than one: a beamed group of eighths ("two eighths"). */
  count: number;
  /** Tied to the item after it. */
  tied: boolean;
}

/** The bar as the items a person would read aloud, beamed eighths together. */
export function describeBar(pattern: RhythmPattern): BarWord[] {
  const grouped = new Map<number, number[]>();
  for (const g of beamGroups(pattern)) grouped.set(g[0] ?? -1, g);
  const skip = new Set<number>(beamGroups(pattern).flatMap((g) => g.slice(1)));
  const words: BarWord[] = [];
  pattern.notes.forEach((note, i) => {
    if (skip.has(i)) return;
    const group = grouped.get(i);
    const lastNote = group ? pattern.notes[group[group.length - 1] ?? i] : note;
    words.push({
      value: note.value,
      dotted: note.dotted,
      rest: note.rest,
      count: group ? group.length : 1,
      tied: Boolean(lastNote?.tieToNext),
    });
  });
  return words;
}
