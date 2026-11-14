import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  closedPollEvents,
  diffSnapshots,
  matchesFollow,
  pushEvents,
  type ElectionEvent,
} from '../events';
import { normalizeNytPage } from '../nyt';
import type {
  ElectionSnapshot,
  Race,
} from '../types';
import { senatePage } from './fixtures';

function snap(
  mut?: (
    races: Race[],
  ) => Race[],
): ElectionSnapshot {
  const s =
    normalizeNytPage(
      senatePage,
      'senate',
    );
  return {
    date: '2026-11-03',
    kind: 'general',
    source:
      'nyt',
    fetchedAt:
      'x',
    sourceUpdatedAt:
      null,
    live: true,
    chambers:
      {
        senate:
          s.chamber!,
      },
    races:
      mut
        ? mut(
            s.races,
          )
        : s.races,
    pollClosings:
      {},
    missing:
      [],
    providers:
      [],
  };
}
const AT =
  Date.parse(
    '2026-11-04T03:00:00Z',
  );

describe('diffSnapshots', () => {
  it('emits a call (and a flip) when a race becomes called', () => {
    const prev =
      snap(
        (
          rs,
        ) =>
          rs.map(
            (
              r,
            ) =>
              r.state ===
              'MI'
                ? {
                    ...r,
                    status:
                      'counting' as const,
                    winnerParty:
                      null,
                    flipped: false,
                    calledBy:
                      [],
                    candidates:
                      r.candidates.map(
                        (
                          c,
                        ) => ({
                          ...c,
                          won: false,
                        }),
                      ),
                  }
                : r,
          ),
      );
    const next =
      snap();
    const ev =
      diffSnapshots(
        prev,
        next,
        AT,
      );
    const flip =
      ev.find(
        (
          e,
        ) =>
          e.raceId ===
          'MI-G-S-2026-11-03',
      )!;
    expect(
      flip.kind,
    ).toBe(
      'flip',
    );
    expect(
      flip.id,
    ).toBe(
      'flip:MI-G-S-2026-11-03',
    );
    expect(
      flip.importance,
    ).toBe(
      3,
    );
    expect(
      flip.text,
    ).toBe(
      'Called: Senate · Michigan — M Rho (GOP) wins, a flip',
    );
    expect(
      flip.party,
    ).toBe(
      'GOP',
    );
  });

  it('says AP when the feed attributes the call to AP', () => {
    const prev =
      snap(
        (
          rs,
        ) =>
          rs.map(
            (
              r,
            ) =>
              r.state ===
              'PA'
                ? {
                    ...r,
                    status:
                      'counting' as const,
                    candidates:
                      r.candidates.map(
                        (
                          c,
                        ) => ({
                          ...c,
                          won: false,
                        }),
                      ),
                  }
                : r,
          ),
      );
    const next =
      snap(
        (
          rs,
        ) =>
          rs.map(
            (
              r,
            ) =>
              r.state ===
              'PA'
                ? {
                    ...r,
                    calledBy:
                      [
                        'ap',
                      ],
                  }
                : r,
          ),
      );
    const e =
      diffSnapshots(
        prev,
        next,
        AT,
      ).find(
        (
          x,
        ) =>
          x.raceId ===
          'PA-G-S-2026-11-03',
      )!;
    expect(
      e.kind,
    ).toBe(
      'call',
    );
    expect(
      e.text,
    ).toMatch(
      /^AP calls Senate · Pennsylvania/,
    );
  });

  it('does not re-announce a race that was already called', () => {
    expect(
      diffSnapshots(
        snap(),
        snap(),
        AT,
      ),
    ).toEqual(
      [],
    );
  });

  it('emits a lead change only with enough votes in', () => {
    const flipLeader =
      (
        pct: number,
      ) =>
        snap(
          (
            rs,
          ) =>
            rs.map(
              (
                r,
              ) =>
                r.state ===
                'OH'
                  ? {
                      ...r,
                      pctReporting:
                        pct,
                      candidates:
                        [
                          ...r.candidates,
                        ]
                          .reverse()
                          .map(
                            (
                              c,
                              i,
                            ) => ({
                              ...c,
                              leader:
                                i ===
                                0,
                            }),
                          ),
                    }
                  : r,
            ),
        );
    expect(
      diffSnapshots(
        snap(),
        flipLeader(
          40,
        ),
        AT,
      ).find(
        (
          e,
        ) =>
          e.kind ===
          'lead-change',
      )
        ?.text,
    ).toMatch(
      /takes the lead \(40% in\)/,
    );
    expect(
      diffSnapshots(
        snap(),
        flipLeader(
          2,
        ),
        AT,
      ).some(
        (
          e,
        ) =>
          e.kind ===
          'lead-change',
      ),
    ).toBe(
      false,
    );
  });

  it('announces a chamber clinch once', () => {
    const prev =
      snap();
    const next =
      snap();
    next.chambers.senate =
      {
        ...next
          .chambers
          .senate!,
        controlledBy:
          'GOP',
      };
    const ev =
      diffSnapshots(
        prev,
        next,
        AT,
      );
    expect(
      ev.filter(
        (
          e,
        ) =>
          e.kind ===
          'clinch',
      ),
    ).toEqual(
      [
        expect.objectContaining(
          {
            id: 'clinch:2026-11-03:senate:GOP',
            importance: 3,
            text: 'GOP clinches control of the Senate',
          },
        ),
      ],
    );
    expect(
      diffSnapshots(
        next,
        next,
        AT,
      ).some(
        (
          e,
        ) =>
          e.kind ===
          'clinch',
      ),
    ).toBe(
      false,
    );
  });
});

describe('closedPollEvents', () => {
  const closings =
    {
      OH: {
        iso: '2026-11-04T00:30:00.000Z',
        displayET:
          '7:30 p.m.',
      },
      PA: {
        iso: '2026-11-04T01:00:00.000Z',
        displayET:
          '8 p.m.',
      },
      CA: {
        iso: '2026-11-04T04:00:00.000Z',
        displayET:
          '11 p.m.',
      },
    };
  it('announces newly closed states, not future ones, and never twice', () => {
    const now =
      Date.parse(
        '2026-11-04T01:05:00Z',
      );
    const a =
      closedPollEvents(
        '2026-11-03',
        closings,
        new Set(),
        now,
        (
          s,
        ) =>
          s ===
          'PA',
      );
    expect(
      a.events.map(
        (
          e,
        ) =>
          e.state,
      ),
    ).toEqual(
      [
        'PA',
      ],
    ); // OH closed 35 min ago: recorded, not announced
    expect(
      a
        .events[0],
    ).toMatchObject(
      {
        id: 'closed:2026-11-03:PA',
        importance: 2,
        kind: 'polls-closed',
      },
    );
    expect(
      a.announced.has(
        'OH',
      ) &&
        a.announced.has(
          'PA',
        ) &&
        !a.announced.has(
          'CA',
        ),
    ).toBe(
      true,
    );
    expect(
      closedPollEvents(
        '2026-11-03',
        closings,
        a.announced,
        now,
      )
        .events,
    ).toEqual(
      [],
    );
  });
  it('does not replay the evening after a cold start', () => {
    const late =
      Date.parse(
        '2026-11-04T05:00:00Z',
      );
    expect(
      closedPollEvents(
        '2026-11-03',
        closings,
        new Set(),
        late,
      )
        .events,
    ).toEqual(
      [],
    );
  });
});

describe('matchesFollow', () => {
  const ev =
    (
      o: Partial<ElectionEvent>,
    ): ElectionEvent => ({
      id: 'x',
      at: 1,
      date: 'd',
      kind: 'call',
      importance: 2,
      text: 't',
      state:
        'PA',
      ...o,
    });
  it('routes events to follow modes', () => {
    expect(
      matchesFollow(
        ev(
          {
            importance: 3,
            kind: 'flip',
          },
        ),
        'major',
      ),
    ).toBe(
      true,
    );
    expect(
      matchesFollow(
        ev(
          {
            importance: 2,
          },
        ),
        'major',
      ),
    ).toBe(
      false,
    );
    expect(
      matchesFollow(
        ev(
          {
            kind: 'flip',
          },
        ),
        'calls',
      ),
    ).toBe(
      true,
    );
    expect(
      matchesFollow(
        ev(
          {
            kind: 'polls-closed',
          },
        ),
        'closings',
      ),
    ).toBe(
      true,
    );
    expect(
      matchesFollow(
        ev(
          {
            kind: 'polls-closed',
          },
        ),
        'calls',
      ),
    ).toBe(
      false,
    );
    expect(
      matchesFollow(
        ev(
          {
            kind: 'news',
          },
        ),
        'all',
      ),
    ).toBe(
      false,
    );
    expect(
      matchesFollow(
        ev(
          {},
        ),
        'off',
      ),
    ).toBe(
      false,
    );
    expect(
      matchesFollow(
        ev(
          {
            state:
              undefined,
            raceId:
              undefined,
          },
        ),
        'all',
      ),
    ).toBe(
      false,
    ); // nowhere to point a pane
  });
});

describe('pushEvents', () => {
  const e =
    (
      id: string,
      at: number,
    ): ElectionEvent => ({
      id,
      at,
      date: 'd',
      kind: 'call',
      importance: 1,
      text: id,
    });
  it('dedupes by id, sorts by time and bounds the ring', () => {
    const ring =
      pushEvents(
        [],
        [
          e(
            'a',
            2,
          ),
          e(
            'b',
            1,
          ),
        ],
      );
    expect(
      ring.map(
        (
          x,
        ) =>
          x.id,
      ),
    ).toEqual(
      [
        'b',
        'a',
      ],
    );
    expect(
      pushEvents(
        ring,
        [
          e(
            'a',
            9,
          ),
        ],
      ).map(
        (
          x,
        ) =>
          x.id,
      ),
    ).toEqual(
      [
        'b',
        'a',
      ],
    );
    expect(
      pushEvents(
        ring,
        [
          e(
            'c',
            3,
          ),
          e(
            'd',
            4,
          ),
        ],
        3,
      ).map(
        (
          x,
        ) =>
          x.id,
      ),
    ).toEqual(
      [
        'a',
        'c',
        'd',
      ],
    );
  });
});
