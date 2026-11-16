/**
 * The Phase 5 sounds in the catalogue: every id has its meta, its family, a credit and the right
 * polyphony, and the Sound dialog's families list each sound exactly once.
 */
import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  INSTRUMENT_CATALOG,
  defaultSoundFor,
  resolveSound,
  SOUND_FAMILIES,
  playsChords,
} from './catalog';
import {
  CREDIT_ORDER,
  SOUND_CREDITS,
} from './credits';
import { INSTRUMENT_IDS } from './types';

const NEW_MONO =
  [
    'cello',
    'clarinet',
    'oboe',
  ] as const;
const NEW_CHORD =
  [
    'guitar-nylon',
    'ukulele',
    'organ',
  ] as const;

describe('instrument catalogue (Phase 5)', () => {
  it('lists the new sounds, each id short enough for the sound column (16)', () => {
    for (const id of [
      ...NEW_MONO,
      ...NEW_CHORD,
    ])
      expect(
        INSTRUMENT_IDS,
      ).toContain(
        id,
      );
    for (const id of INSTRUMENT_IDS)
      expect(
        id.length,
      ).toBeLessThanOrEqual(
        16,
      );
  });

  it('cello, clarinet and oboe are monophonic; nylon guitar, ukulele and organ play chords', () => {
    for (const id of NEW_MONO) {
      expect(
        INSTRUMENT_CATALOG[
          id
        ]
          .polyphony,
      ).toBe(
        'mono',
      );
      expect(
        INSTRUMENT_CATALOG[
          id
        ]
          .maxVoices,
      ).toBe(
        1,
      );
      expect(
        playsChords(
          id,
        ),
      ).toBe(
        false,
      );
    }
    for (const id of NEW_CHORD) {
      expect(
        INSTRUMENT_CATALOG[
          id
        ]
          .polyphony,
      ).toBe(
        'chord',
      );
      expect(
        INSTRUMENT_CATALOG[
          id
        ]
          .maxVoices,
      ).toBeGreaterThanOrEqual(
        4,
      );
      expect(
        playsChords(
          id,
        ),
      ).toBe(
        true,
      );
    }
  });

  it('every meta is its own id, with a sane range and a credit in the credits order', () => {
    for (const id of INSTRUMENT_IDS) {
      const m =
        INSTRUMENT_CATALOG[
          id
        ];
      expect(
        m.id,
      ).toBe(
        id,
      );
      expect(
        m
          .range[0],
      ).toBeLessThan(
        m
          .range[1],
      );
      expect(
        SOUND_CREDITS[
          m
            .credit
        ],
      ).toBeDefined();
      expect(
        CREDIT_ORDER,
      ).toContain(
        m.credit,
      );
    }
  });

  it('groups every sound into exactly one family, in the catalogue order within a family', () => {
    const listed =
      SOUND_FAMILIES.flatMap(
        (
          f,
        ) =>
          f.ids,
      );
    expect(
      [
        ...listed,
      ].sort(),
    ).toEqual(
      [
        ...INSTRUMENT_IDS,
      ].sort(),
    );
    expect(
      new Set(
        listed,
      )
        .size,
    ).toBe(
      listed.length,
    );
    for (const f of SOUND_FAMILIES) {
      const order =
        f.ids.map(
          (
            id,
          ) =>
            INSTRUMENT_IDS.indexOf(
              id,
            ),
        );
      expect(
        order,
      ).toEqual(
        [
          ...order,
        ].sort(
          (
            a,
            b,
          ) =>
            a -
            b,
        ),
      );
    }
  });
  it('a voice learner hears the piano unless they chose a sound', () => {
    expect(
      defaultSoundFor(
        'voice',
      ),
    ).toBe(
      'piano',
    );
    expect(
      resolveSound(
        {
          instrument:
            'voice',
          sound:
            null,
        },
      ),
    ).toBe(
      'piano',
    );
    expect(
      resolveSound(
        {
          instrument:
            'voice',
          sound:
            'cello',
        },
      ),
    ).toBe(
      'cello',
    );
  });
});
