import {
  describe,
  expect,
  it,
} from 'vitest';
import { pickMatchup } from './menuMatchup';

const ROSTER =
  [
    'ybot',
    'tf2_heavy',
    'tf2_spy',
    'hl2_police',
    'hl2_barney',
    'csgo_ctm_sas',
  ];

describe('pickMatchup', () => {
  it('never fields the Y-Bot when Source models exist, and never a mirror match', () => {
    for (
      let r = 0;
      r <
      40;
      r++
    ) {
      const [
        a,
        b,
      ] =
        pickMatchup(
          ROSTER,
          r,
        );
      expect(
        a,
      ).not.toBe(
        'ybot',
      );
      expect(
        b,
      ).not.toBe(
        'ybot',
      );
      expect(
        a,
      ).not.toBe(
        b,
      );
    }
  });
  it('rotates through the roster instead of repeating', () => {
    const seen =
      new Set<string>();
    for (
      let r = 0;
      r <
      30;
      r++
    )
      pickMatchup(
        ROSTER,
        r,
      ).forEach(
        (
          m,
        ) =>
          seen.add(
            m,
          ),
      );
    expect(
      seen.size,
    ).toBe(
      ROSTER.length -
        1,
    );
  });
  it('changes the pairing between rounds', () => {
    let prev =
      pickMatchup(
        ROSTER,
        0,
      );
    for (
      let r = 1;
      r <
      20;
      r++
    ) {
      const next =
        pickMatchup(
          ROSTER,
          r,
          prev,
        );
      expect(
        next,
      ).not.toEqual(
        prev,
      );
      prev =
        next;
    }
  });
  it('degrades to the Y-Bot when nothing else is published', () => {
    expect(
      pickMatchup(
        [
          'ybot',
        ],
        0,
      ),
    ).toEqual(
      [
        'ybot',
        'ybot',
      ],
    );
    expect(
      pickMatchup(
        [],
        3,
      ),
    ).toEqual(
      [
        'ybot',
        'ybot',
      ],
    );
    expect(
      pickMatchup(
        [
          'ybot',
          'tf2_spy',
        ],
        0,
      ),
    ).toEqual(
      [
        'tf2_spy',
        'ybot',
      ],
    );
  });
});
