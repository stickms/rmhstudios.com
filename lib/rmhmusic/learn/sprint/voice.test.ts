/** Sight reading for a singer (Phase 5): prompts moved into the range, on the range's staff. */
import {
  describe,
  expect,
  it,
} from 'vitest';
import { mulberry32 } from '@/lib/core/rng';
import {
  dailyRun,
  makeRun,
  noteMidi,
  promptMidis,
} from './generate';
import { VOICE_RANGES } from '../schemas';
import {
  VOICE_RANGE,
  writtenRange,
} from '../voice/range';

describe('sprint for a singer', () => {
  it('writes every single-note prompt inside the range, on its staff (tenor an octave up, with the 8)', () => {
    for (const range of VOICE_RANGES) {
      for (const level of [
        'note',
        'note-both',
        'accidental',
        'bar',
      ] as const) {
        const run =
          makeRun(
            level,
            40,
            mulberry32(
              7,
            ),
            'voice',
            range,
          );
        const [
          lo,
          hi,
        ] =
          writtenRange(
            range,
          );
        for (const p of run) {
          expect(
            p.clef,
          ).toBe(
            range ===
              'bass'
              ? 'bass'
              : 'treble',
          );
          expect(
            p.octaveClef ??
              false,
          ).toBe(
            range ===
              'tenor',
          );
          for (const n of p.notes) {
            expect(
              n.written,
              `${range} ${level}`,
            ).toBeGreaterThanOrEqual(
              lo,
            );
            expect(
              n.written,
              `${range} ${level}`,
            ).toBeLessThanOrEqual(
              hi,
            );
          }
          // what is sung: the range's sounding pitches, one octave below the page for a tenor
          const sung =
            promptMidis(
              p,
              'voice',
            );
          expect(
            sung,
          ).toEqual(
            p.notes.map(
              (
                n,
              ) =>
                noteMidi(
                  n,
                ) -
                (range ===
                'tenor'
                  ? 12
                  : 0),
            ),
          );
          for (const m of sung) {
            expect(
              m,
            ).toBeGreaterThanOrEqual(
              VOICE_RANGE[
                range
              ]
                .low -
                1,
            );
            expect(
              m,
            ).toBeLessThanOrEqual(
              VOICE_RANGE[
                range
              ]
                .high +
                1,
            );
          }
        }
      }
    }
  });

  it('keeps the letters of the prompt (only octaves move), so a run stays comparable', () => {
    const piano =
      makeRun(
        'note-both',
        20,
        mulberry32(
          3,
        ),
        'piano',
      );
    const sung =
      makeRun(
        'note-both',
        20,
        mulberry32(
          3,
        ),
        'voice',
        'bass',
      );
    sung.forEach(
      (
        p,
        i,
      ) =>
        expect(
          p
            .notes[0]!
            .written %
            12,
        ).toBe(
          piano[
            i
          ]!
            .notes[0]!
            .written %
            12,
        ),
    );
    expect(
      dailyRun(
        '2026-11-15',
        'voice',
        'alto',
      ),
    ).toHaveLength(
      dailyRun(
        '2026-11-15',
      )
        .length,
    );
  });
});
