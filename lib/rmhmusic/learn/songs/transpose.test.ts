/** Songs moved into a singer's range (Phase 5): by octaves when they fit, else into a nearby key. */
import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  SONGS,
  songById,
} from './catalog';
import {
  KEY_SIGNATURES,
  notesOf,
  soundingPitch,
} from './score';
import {
  songForRange,
  transposeSong,
  versionFor,
} from './transpose';
import { VOICE_RANGES } from '../schemas';
import {
  VOICE_RANGE,
  writtenRange,
} from '../voice/range';

const pc =
  (n: {
    letter: string;
    alter: number;
  }) =>
    ({
      C: 0,
      D: 2,
      E: 4,
      F: 5,
      G: 7,
      A: 9,
      B: 11,
    })[
      n
        .letter
    ]! +
    n.alter;

describe('songs for a singer', () => {
  it('puts every song inside every range, by octaves when that fits', () => {
    for (const range of VOICE_RANGES)
      for (const song of SONGS) {
        const placed =
          songForRange(
            song,
            range,
          );
        const [
          lo,
          hi,
        ] =
          writtenRange(
            range,
          );
        const written =
          notesOf(
            placed.song,
          ).map(
            (
              n,
            ) =>
              n.written,
          );
        expect(
          Math.min(
            ...written,
          ),
          `${song.id} ${range}`,
        ).toBeGreaterThanOrEqual(
          lo,
        );
        expect(
          Math.max(
            ...written,
          ),
          `${song.id} ${range}`,
        ).toBeLessThanOrEqual(
          hi,
        );
        const version =
          versionFor(
            'voice',
            range,
          );
        for (const w of written) {
          const sung =
            soundingPitch(
              w,
              version,
            );
          expect(
            sung,
          ).toBeGreaterThanOrEqual(
            VOICE_RANGE[
              range
            ]
              .low,
          );
          expect(
            sung,
          ).toBeLessThanOrEqual(
            VOICE_RANGE[
              range
            ]
              .high,
          );
        }
        if (
          placed.semitones %
            12 !==
          0
        ) {
          // a key change: every fit by octaves was impossible
          const orig =
            notesOf(
              song,
            ).map(
              (
                n,
              ) =>
                n.written,
            );
          for (
            let k =
              -3;
            k <=
            3;
            k++
          )
            expect(
              orig.every(
                (
                  w,
                ) =>
                  w +
                    12 *
                      k >=
                    lo &&
                  w +
                    12 *
                      k <=
                    hi,
              ),
            ).toBe(
              false,
            );
        }
      }
  });

  it('moves Mary had a little lamb down an octave for a bass, letters unchanged', () => {
    const mary =
      songById(
        'mary-had-a-little-lamb',
      )!;
    const placed =
      songForRange(
        mary,
        'bass',
      );
    expect(
      placed.semitones,
    ).toBe(
      -12,
    );
    expect(
      placed
        .song
        .key,
    ).toBe(
      'C',
    );
    expect(
      notesOf(
        placed.song,
      ).map(
        (
          n,
        ) =>
          n.letter,
      ),
    ).toEqual(
      notesOf(
        mary,
      ).map(
        (
          n,
        ) =>
          n.letter,
      ),
    );
  });

  it('respells a key change by letter: Frère Jacques for a soprano goes to F, Minuet in G for an alto to D', () => {
    const frere =
      songForRange(
        songById(
          'frere-jacques',
        )!,
        'soprano',
      );
    expect(
      frere
        .song
        .key,
    ).toBe(
      'F',
    );
    expect(
      frere.semitones,
    ).toBe(
      5,
    );
    const minuet =
      songForRange(
        songById(
          'minuet-in-g',
        )!,
        'alto',
      );
    expect(
      minuet
        .song
        .key,
    ).toBe(
      'D',
    );
    // Minuet in G's F sharps become C sharps in D
    const fsharp =
      notesOf(
        songById(
          'minuet-in-g',
        )!,
      ).findIndex(
        (
          n,
        ) =>
          n.letter ===
            'F' &&
          n.alter ===
            1,
      );
    expect(
      fsharp,
    ).toBeGreaterThanOrEqual(
      0,
    );
    expect(
      notesOf(
        minuet.song,
      )[
        fsharp
      ],
    ).toMatchObject(
      {
        letter:
          'C',
        alter: 1,
      },
    );
  });

  it('keeps every note a single sharp or flat at most, its pitch moved exactly, its spelling consistent', () => {
    for (const song of SONGS)
      for (
        let t =
          -12;
        t <=
        12;
        t++
      ) {
        const moved =
          transposeSong(
            song,
            t,
          );
        if (
          !moved
        )
          continue;
        expect(
          Object.keys(
            KEY_SIGNATURES,
          ),
        ).toContain(
          moved.key,
        );
        const a =
          notesOf(
            song,
          );
        const b =
          notesOf(
            moved,
          );
        b.forEach(
          (
            n,
            i,
          ) => {
            expect(
              n.written,
            ).toBe(
              a[
                i
              ]!
                .written +
                t,
            );
            expect(
              Math.abs(
                n.alter,
              ),
            ).toBeLessThanOrEqual(
              1,
            );
            expect(
              ((pc(
                n,
              ) %
                12) +
                12) %
                12,
            ).toBe(
              ((n.written %
                12) +
                12) %
                12,
            );
          },
        );
      }
  });

  it('reads each range with the right version', () => {
    expect(
      versionFor(
        'voice',
        'soprano',
      ),
    ).toBe(
      'voice-treble',
    );
    expect(
      versionFor(
        'voice',
        'alto',
      ),
    ).toBe(
      'voice-treble',
    );
    expect(
      versionFor(
        'voice',
        'tenor',
      ),
    ).toBe(
      'voice-tenor',
    );
    expect(
      versionFor(
        'voice',
        'bass',
      ),
    ).toBe(
      'voice-bass',
    );
    expect(
      versionFor(
        'guitar',
      ),
    ).toBe(
      'guitar',
    );
    expect(
      versionFor(
        'piano',
      ),
    ).toBe(
      'piano',
    );
    expect(
      soundingPitch(
        72,
        'voice-tenor',
      ),
    ).toBe(
      60,
    );
    expect(
      soundingPitch(
        48,
        'voice-bass',
      ),
    ).toBe(
      48,
    );
  });
});

describe('songForRange edges (Phase 5 review)', () => {
  it('keeps Frère Jacques and Au clair de la lune in C, as written, for an alto (G3 to D5)', () => {
    for (const id of [
      'frere-jacques',
      'au-clair-de-la-lune',
    ]) {
      const song =
        songById(
          id,
        )!;
      const out =
        songForRange(
          song,
          'alto',
        );
      expect(
        out.semitones,
        id,
      ).toBe(
        0,
      );
      expect(
        out
          .song
          .key,
        id,
      ).toBe(
        'C',
      );
    }
  });

  it('gives a song back unchanged when no octave or key puts it in the range', () => {
    const base =
      songById(
        'mary-had-a-little-lamb',
      )!;
    const [
      first,
      ...rest
    ] =
      base.bars;
    const note =
      first![0]!;
    // Three octaves apart: wider than any range.
    const wide =
      {
        ...base,
        bars: [
          [
            {
              ...note,
              pitch:
                note.pitch -
                24,
            },
            ...first!.slice(
              1,
            ),
            {
              ...note,
              pitch:
                note.pitch +
                12,
            },
          ],
          ...rest,
        ],
      };
    for (const range of VOICE_RANGES) {
      const out =
        songForRange(
          wide,
          range,
        );
      expect(
        out.semitones,
        range,
      ).toBe(
        0,
      );
      expect(
        out.song,
        range,
      ).toBe(
        wide,
      );
    }
  });
});
