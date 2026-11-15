import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  ballotByState,
  statewideFirst,
} from '../ballot-map';
import type { OtherRace } from '../downballot';
import type { BallotMeasure } from '../measures';

const m =
  (
    state: string,
    status: BallotMeasure['status'] = 'upcoming',
    scope: BallotMeasure['scope'] = 'statewide',
    title = 't',
  ): BallotMeasure =>
    ({
      id:
        state +
        title +
        scope,
      state,
      status,
      scope,
      title,
    }) as BallotMeasure;
const o =
  (
    state: string,
    status: OtherRace['status'] = 'upcoming',
  ): OtherRace =>
    ({
      id:
        state +
        status,
      state,
      status,
      scope:
        'local',
      title:
        'x',
    }) as OtherRace;

describe('ballotByState', () => {
  it('groups measures and other offices by state and flags live results', () => {
    const by =
      ballotByState(
        [
          m(
            'AZ',
          ),
          m(
            'AZ',
            'counting',
          ),
          m(
            'CA',
          ),
        ],
        [
          o(
            'AZ',
          ),
          o(
            'KY',
            'called',
          ),
        ],
      );
    expect(
      [
        ...by.keys(),
      ].sort(),
    ).toEqual(
      [
        'AZ',
        'CA',
        'KY',
      ],
    );
    expect(
      by.get(
        'AZ',
      ),
    ).toMatchObject(
      {
        live: true,
      },
    );
    expect(
      by.get(
        'AZ',
      )!
        .measures,
    ).toHaveLength(
      2,
    );
    expect(
      by.get(
        'AZ',
      )!
        .others,
    ).toHaveLength(
      1,
    );
    expect(
      by.get(
        'CA',
      )!
        .live,
    ).toBe(
      false,
    );
    expect(
      by.get(
        'KY',
      ),
    ).toMatchObject(
      {
        live: true,
        measures:
          [],
      },
    );
  });
  it('lists statewide before local, then by title', () => {
    const out =
      statewideFirst(
        [
          m(
            'AZ',
            'upcoming',
            'local',
            'b',
          ),
          m(
            'AZ',
            'upcoming',
            'statewide',
            'z',
          ),
          m(
            'AZ',
            'upcoming',
            'statewide',
            'a',
          ),
        ],
      );
    expect(
      out.map(
        (
          x,
        ) =>
          `${x.scope}:${x.title}`,
      ),
    ).toEqual(
      [
        'statewide:a',
        'statewide:z',
        'local:b',
      ],
    );
  });
});
