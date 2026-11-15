/** The voice path (Phase 5): its own lessons, the right decks and pools, no chord or keyboard lessons. */
import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  PATH,
  VOICE_PATH,
  VOICE_RANGE_DECK,
  getLesson,
  isKnownLesson,
  pathFor,
} from './path';
import {
  DECKS,
  voiceDeck,
} from './decks';
import { isPlayable } from './routing';
import { VOICE_RANGES } from '../schemas';
import { VOICE_RANGE } from '../voice/range';
import { INTERVALS } from '../theory/intervals';
import {
  createMatchNoteMachine,
  matchNotePool,
  singIntervalTargets,
} from '../machines/match-note';

const voiceLessons =
  VOICE_PATH.flatMap(
    (
      u,
    ) =>
      u.lessons,
  );

describe('voice path', () => {
  it('is the path a voice learner gets; piano and guitar keep theirs', () => {
    expect(
      pathFor(
        'voice',
      ),
    ).toBe(
      VOICE_PATH,
    );
    expect(
      pathFor(
        'piano',
      ),
    ).toBe(
      PATH,
    );
    expect(
      pathFor(
        'guitar',
      ),
    ).toBe(
      PATH,
    );
  });

  it('has its own lessons (known to the server) plus the shared rhythm unit', () => {
    const ids =
      voiceLessons.map(
        (
          l,
        ) =>
          l.id,
      );
    expect(
      new Set(
        ids,
      )
        .size,
    ).toBe(
      ids.length,
    );
    for (const l of voiceLessons) {
      expect(
        isKnownLesson(
          l.id,
        ),
        l.id,
      ).toBe(
        true,
      );
      expect(
        getLesson(
          l.id,
        ),
      ).toBe(
        l,
      );
      expect(
        isPlayable(
          l,
        ),
        l.id,
      ).toBe(
        true,
      );
    }
    expect(
      VOICE_PATH.some(
        (
          u,
        ) =>
          u.id ===
          'rhythm-basics',
      ),
    ).toBe(
      true,
    );
    expect(
      ids,
    ).toEqual(
      expect.arrayContaining(
        [
          'voice-staff-notes',
          'voice-first-note',
          'voice-match-five',
          'voice-match-range',
          'voice-interval-steps',
          'voice-interval-leaps',
        ],
      ),
    );
  });

  it('asks no chord, keyboard or fretboard lesson of a singer', () => {
    for (const l of voiceLessons)
      expect(
        [
          'play-chord',
          'ear-chord',
          'keyboard-map',
          'fretboard',
        ],
      ).not.toContain(
        l.mode,
      );
  });

  it('gives interval singing a pool of interval names', () => {
    const sing =
      voiceLessons.filter(
        (
          l,
        ) =>
          l.mode ===
          'sing-interval',
      );
    expect(
      sing.length,
    ).toBe(
      2,
    );
    for (const l of sing)
      for (const n of l.pool ??
        [])
        expect(
          n in
            INTERVALS,
        ).toBe(
          true,
        );
  });

  it('reads the staff lesson from the deck of the range: tenor written an octave up, bass on the bass staff', () => {
    expect(
      getLesson(
        'voice-staff-notes',
      )
        ?.deck,
    ).toBe(
      VOICE_RANGE_DECK,
    );
    for (const r of VOICE_RANGES) {
      const d =
        voiceDeck(
          r,
        );
      expect(
        DECKS[
          d
            .id
        ],
      ).toBe(
        d,
      );
      const shift =
        r ===
        'tenor'
          ? 12
          : 0;
      expect(
        d.clef,
      ).toBe(
        r ===
          'bass'
          ? 'bass'
          : 'treble',
      );
      expect(
        d.octaveClef ??
          false,
      ).toBe(
        r ===
          'tenor',
      );
      for (const m of d.midis) {
        expect(
          m -
            shift,
        ).toBeGreaterThanOrEqual(
          VOICE_RANGE[
            r
          ]
            .low,
        );
        expect(
          m -
            shift,
        ).toBeLessThanOrEqual(
          VOICE_RANGE[
            r
          ]
            .high,
        );
      }
    }
  });

  it('matches the five lowest naturals, then the whole range, at the sounding pitch', () => {
    expect(
      matchNotePool(
        'voice-match-five',
        'bass',
      ),
    ).toEqual(
      [
        43,
        45,
        47,
        48,
        50,
      ],
    );
    expect(
      matchNotePool(
        'voice-match-range',
        'alto',
      ),
    ).toEqual(
      [
        57,
        59,
        60,
        62,
        64,
        65,
        67,
        69,
        71,
        72,
        74,
      ],
    );
    // piano lessons are unchanged
    expect(
      matchNotePool(
        'match-c',
      ),
    ).toEqual(
      [
        60,
        62,
        64,
        65,
        67,
      ],
    );
  });

  it('deals interval targets whose first and second notes both lie in the range', () => {
    let seed = 1;
    const rand =
      () =>
        (seed =
          (seed *
            16807) %
          2147483647) /
        2147483647;
    for (const r of VOICE_RANGES) {
      const ts =
        singIntervalTargets(
          [
            'third',
            'fifth',
            'octave',
          ],
          r,
          10,
          rand,
        );
      expect(
        ts,
      ).toHaveLength(
        10,
      );
      for (const t of ts) {
        expect(
          t.from,
        ).toBeDefined();
        const from =
          t.from ??
          0;
        expect(
          from,
        ).toBeGreaterThanOrEqual(
          VOICE_RANGE[
            r
          ]
            .low,
        );
        expect(
          t.midi,
        ).toBeLessThanOrEqual(
          VOICE_RANGE[
            r
          ]
            .high,
        );
        const size =
          t.midi -
          from;
        expect(
          [
            3,
            4,
            7,
            12,
          ],
        ).toContain(
          size,
        );
        expect(
          t.interval,
        ).toBeDefined();
        expect(
          INTERVALS[
            t.interval ??
              'unison'
          ]
            .semitones,
        ).toContain(
          size,
        );
      }
    }
  });

  it('plays the first note then the second when a singer asks to hear an interval', () => {
    const m =
      createMatchNoteMachine(
        [
          {
            midi: 64,
            from: 60,
            interval:
              'third',
          },
        ],
      );
    const {
      effects,
    } =
      m.step(
        m.initial,
        {
          type: 'hear',
        },
      );
    expect(
      effects,
    ).toEqual(
      [
        {
          type: 'play',
          midi: 64,
          from: 60,
        },
      ],
    );
  });
});
