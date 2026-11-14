/**
 * The four triads the chord lessons name and ask for: a root with a third and a fifth above it.
 * A chord is its pitch classes, so an inversion, a doubled note or another octave is the same
 * chord (`chordQuality`, `matchesChord`). Pure; client-safe.
 */

export type ChordQuality =
  | 'major'
  | 'minor'
  | 'diminished'
  | 'augmented';

/** The qualities, in the order the lessons list them. */
export const CHORD_QUALITIES: readonly ChordQuality[] =
  [
    'major',
    'minor',
    'diminished',
    'augmented',
  ];

/** Semitones above the root. */
export const CHORDS: Record<
  ChordQuality,
  number[]
> =
  {
    major:
      [
        0,
        4,
        7,
      ],
    minor:
      [
        0,
        3,
        7,
      ],
    diminished:
      [
        0,
        3,
        6,
      ],
    augmented:
      [
        0,
        4,
        8,
      ],
  };

/** The notes of `quality` on `root`, lowest first (root position). */
export function chordNotes(
  root: number,
  quality: ChordQuality,
): number[] {
  return CHORDS[
    quality
  ].map(
    (
      s,
    ) =>
      root +
      s,
  );
}

/**
 * The distinct pitch classes (0..11) of the notes, ascending. A list holding anything that is not
 * a note (NaN, Infinity) has none: it is not a chord, and `chordQuality` and `matchesChord` say
 * the same, so a bad value is never quietly dropped and the rest judged.
 */
export function pitchClasses(
  midis: readonly number[],
): number[] {
  if (
    midis.some(
      (
        m,
      ) =>
        !Number.isFinite(
          m,
        ),
    )
  )
    return [];
  const set =
    new Set<number>();
  for (const m of midis)
    set.add(
      ((Math.round(
        m,
      ) %
        12) +
        12) %
        12,
    );
  return [
    ...set,
  ].sort(
    (
      a,
      b,
    ) =>
      a -
      b,
  );
}

/**
 * The triad these notes make, in any order, octave or inversion (and with a note doubled), or null
 * when they are not exactly one of the four triads.
 */
export function chordQuality(
  midis: readonly number[],
): ChordQuality | null {
  const pcs =
    pitchClasses(
      midis,
    );
  if (
    pcs.length !==
    3
  )
    return null;
  for (const root of pcs) {
    const stack =
      pcs
        .map(
          (
            p,
          ) =>
            (p -
              root +
              12) %
            12,
        )
        .sort(
          (
            a,
            b,
          ) =>
            a -
            b,
        );
    for (const quality of CHORD_QUALITIES) {
      if (
        CHORDS[
          quality
        ].every(
          (
            s,
            i,
          ) =>
            s ===
            stack[
              i
            ],
        )
      )
        return quality;
    }
  }
  return null;
}

/**
 * Whether the played notes are exactly the pitch classes of `quality` on `root`. False when the
 * root or any played note is not a number.
 */
export function matchesChord(
  played: readonly number[],
  root: number,
  quality: ChordQuality,
): boolean {
  const want =
    pitchClasses(
      chordNotes(
        root,
        quality,
      ),
    );
  const got =
    pitchClasses(
      played,
    );
  return (
    want.length >
      0 &&
    want.length ===
      got.length &&
    want.every(
      (
        p,
        i,
      ) =>
        p ===
        got[
          i
        ],
    )
  );
}

/** The fewest distinct pitch classes that make an attempt at a chord. */
export const MIN_CHORD_PITCH_CLASSES = 3;

/**
 * Whether these notes are a try at a chord rather than a lone tap or a dyad: at least
 * {@link MIN_CHORD_PITCH_CLASSES} distinct pitch classes. Only an attempt is graded; fewer notes
 * are the learner finding the keys.
 */
export function isChordAttempt(
  midis: readonly number[],
): boolean {
  return (
    pitchClasses(
      midis,
    )
      .length >=
    MIN_CHORD_PITCH_CLASSES
  );
}
