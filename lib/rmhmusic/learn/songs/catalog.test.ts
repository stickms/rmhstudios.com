import {
  describe,
  expect,
  it,
} from 'vitest';
import { clefStep } from '../theory/clef';
import {
  SONGS,
  SONG_ID_RE,
  isSongId,
  songById,
} from './catalog';
import { fingerFor } from './fingering';
import {
  notesOf,
  soundingPitch,
} from './score';

describe('the songbook', () => {
  it('has six to ten songs with unique, URL-safe ids', () => {
    expect(
      SONGS.length,
    ).toBeGreaterThanOrEqual(
      6,
    );
    expect(
      SONGS.length,
    ).toBeLessThanOrEqual(
      10,
    );
    const ids =
      SONGS.map(
        (
          s,
        ) =>
          s.id,
      );
    expect(
      new Set(
        ids,
      )
        .size,
    ).toBe(
      ids.length,
    );
    for (const id of ids) {
      expect(
        SONG_ID_RE.test(
          id,
        ),
        id,
      ).toBe(
        true,
      );
      expect(
        isSongId(
          id,
        ),
      ).toBe(
        true,
      );
      expect(
        songById(
          id,
        )
          ?.id,
      ).toBe(
        id,
      );
    }
    expect(
      isSongId(
        'nope',
      ),
    ).toBe(
      false,
    );
    expect(
      songById(
        'constructor',
      ),
    ).toBeNull();
  });

  it('pins every song, note by note (pitch as written and length in beats)', () => {
    const pinned =
      SONGS.map(
        (
          s,
        ) => ({
          id: s.id,
          key: s.key,
          time: `${s.beatsPerBar}/4`,
          bpm: s.bpm,
          pickup:
            s.pickup,
          bars: s.bars.map(
            (
              bar,
            ) =>
              bar
                .map(
                  (
                    n,
                  ) =>
                    `${n.letter}${n.alter > 0 ? '#' : n.alter < 0 ? 'b' : ''}${n.octave}:${n.beats}`,
                )
                .join(
                  ' ',
                ),
          ),
        }),
      );
    expect(
      pinned,
    ).toMatchSnapshot();
  });

  it('Amazing Grace splices its first line into its last without a tie (no D5 asked twice)', () => {
    const grace =
      songById(
        'amazing-grace',
      );
    expect(
      grace?.bars.map(
        (
          bar,
        ) =>
          bar
            .map(
              (
                n,
              ) =>
                `${n.letter}${n.octave}:${n.beats}`,
            )
            .join(
              ' ',
            ),
      ),
    ).toEqual(
      [
        'D4:1',
        'G4:2 B4:0.5 G4:0.5',
        'B4:2 A4:1',
        'G4:2 E4:1',
        'D4:2 D4:1',
        'G4:2 B4:0.5 G4:0.5',
        'B4:2 A4:1',
        'G4:3',
      ],
    );
  });

  for (const song of SONGS) {
    describe(
      song.title,
      () => {
        it('fills every bar to its time signature (a pickup only first)', () => {
          song.bars.forEach(
            (
              bar,
              i,
            ) => {
              const beats =
                bar.reduce(
                  (
                    sum,
                    n,
                  ) =>
                    sum +
                    n.beats,
                  0,
                );
              const want =
                i ===
                  0 &&
                song.pickup >
                  0
                  ? song.pickup
                  : song.beatsPerBar;
              expect(
                beats,
                `bar ${i + 1}`,
              ).toBe(
                want,
              );
            },
          );
          expect(
            song.pickup,
          ).toBeLessThan(
            song.beatsPerBar,
          );
        });

        it('stays on the treble staff between G3 and A5, in a simple key and tempo', () => {
          for (const n of notesOf(
            song,
          )) {
            const step =
              clefStep(
                'treble',
                n.written -
                  n.alter,
              );
            expect(
              step,
              `note ${n.index + 1}`,
            ).toBeGreaterThanOrEqual(
              -5,
            );
            expect(
              step,
              `note ${n.index + 1}`,
            ).toBeLessThanOrEqual(
              10,
            );
          }
          expect(
            [
              'C',
              'G',
              'F',
            ],
          ).toContain(
            song.key,
          );
          expect(
            [
              3,
              4,
            ],
          ).toContain(
            song.beatsPerBar,
          );
          expect(
            song.bpm,
          ).toBeGreaterThanOrEqual(
            60,
          );
          expect(
            song.bpm,
          ).toBeLessThanOrEqual(
            120,
          );
        });

        it('needs no natural sign and every guitar note has a fret in the first twelve', () => {
          for (const n of notesOf(
            song,
          )) {
            expect(
              n.printed,
            ).not.toBe(
              'natural',
            );
            const fret =
              fingerFor(
                soundingPitch(
                  n.written,
                  'guitar',
                ),
              );
            expect(
              fret,
              `note ${n.index + 1}`,
            ).not.toBeNull();
            expect(
              fret?.fret ??
                99,
            ).toBeLessThanOrEqual(
              12,
            );
          }
        });

        it('names a public-domain source', () => {
          expect(
            song
              .composer
              .length,
          ).toBeGreaterThan(
            0,
          );
          expect(
            song
              .title
              .length,
          ).toBeGreaterThan(
            0,
          );
        });
      },
    );
  }
});
