import {
  describe,
  expect,
  it,
} from 'vitest';
import { cycleForYear } from '../calendar';
import {
  electionMarketSpecs,
  marketTimes,
  resolveChamber,
  resolveRace,
} from '../markets';
import { normalizeNytPage } from '../nyt';
import type { ElectionSnapshot } from '../types';
import {
  housePage,
  senatePage,
} from './fixtures';

function snap(
  over: Partial<ElectionSnapshot> = {},
): ElectionSnapshot {
  const s =
    normalizeNytPage(
      senatePage,
      'senate',
    );
  const h =
    normalizeNytPage(
      housePage,
      'house',
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
        house:
          h.chamber!,
      },
    races:
      [
        ...s.races,
        ...h.races,
      ],
    pollClosings:
      {},
    missing:
      [],
    providers:
      [],
    ...over,
  };
}

describe('marketTimes', () => {
  it('closes at noon ET on Election Day and settles noon ET the day after', () => {
    const t =
      marketTimes(
        '2026-11-03',
      );
    expect(
      t.closesAt.toISOString(),
    ).toBe(
      '2026-11-03T17:00:00.000Z',
    );
    expect(
      t.autoResolveAt.toISOString(),
    ).toBe(
      '2026-11-04T17:00:00.000Z',
    );
  });
});

describe('electionMarketSpecs', () => {
  const specs =
    electionMarketSpecs(
      cycleForYear(
        2026,
      ),
      snap(
        {
          races:
            snap().races.map(
              (
                r,
              ) => ({
                ...r,
                status:
                  'upcoming' as const,
                winnerParty:
                  null,
              }),
            ),
        },
      ),
    );
  it('opens chamber markets for chambers the source covers, and toss-up race markets', () => {
    const titles =
      specs.map(
        (
          s,
        ) =>
          s.title,
      );
    expect(
      titles,
    ).toContain(
      'Will Republicans control the Senate after the 2026 election?',
    );
    expect(
      titles,
    ).toContain(
      'Will Democrats control the House after the 2026 election?',
    );
    expect(
      titles,
    ).toContain(
      'Will a Democrat win Senate: Pennsylvania?',
    );
    // OH is lean-rep, TX likely-rep: not toss-ups.
    expect(
      titles.some(
        (
          t,
        ) =>
          t.includes(
            'Ohio',
          ) ||
          t.includes(
            'Texas',
          ),
      ),
    ).toBe(
      false,
    );
  });
  it('gives every market a unique subjectUrl and the safety timings', () => {
    expect(
      new Set(
        specs.map(
          (
            s,
          ) =>
            s.subjectUrl,
        ),
      )
        .size,
    ).toBe(
      specs.length,
    );
    for (const s of specs) {
      expect(
        s.closesAt.getTime(),
      ).toBeLessThan(
        s.autoResolveAt.getTime(),
      );
      expect(
        s
          .title
          .length,
      ).toBeLessThanOrEqual(
        160,
      );
    }
  });
  it('does not open a race market for a race already called', () => {
    const live =
      electionMarketSpecs(
        cycleForYear(
          2026,
        ),
        snap(),
      );
    expect(
      live.some(
        (
          s,
        ) =>
          s.title.includes(
            'Pennsylvania',
          ),
      ),
    ).toBe(
      false,
    );
  });
});

describe('resolveRace', () => {
  it('settles from the call and is null until called', () => {
    expect(
      resolveRace(
        snap(),
        {
          key: 'PA-G-S',
          party:
            'DEM',
        },
      ),
    ).toBe(
      'YES',
    );
    expect(
      resolveRace(
        snap(),
        {
          key: 'PA-G-S',
          party:
            'GOP',
        },
      ),
    ).toBe(
      'NO',
    );
    expect(
      resolveRace(
        snap(),
        {
          key: 'OH-S_W-S',
          party:
            'DEM',
        },
      ),
    ).toBeNull(); // counting
    expect(
      resolveRace(
        snap(),
        {
          key: 'TX-G-S',
          party:
            'DEM',
        },
      ),
    ).toBeNull(); // upcoming
    expect(
      resolveRace(
        snap(),
        {
          key: 'ZZ-G-S',
          party:
            'DEM',
        },
      ),
    ).toBeNull(); // unknown race
  });
  it('fails closed without trustworthy data or valid params', () => {
    expect(
      resolveRace(
        snap(
          {
            source:
              'calendar',
          },
        ),
        {
          key: 'PA-G-S',
          party:
            'DEM',
        },
      ),
    ).toBeNull();
    expect(
      resolveRace(
        snap(),
        {
          key: 'PA-G-S',
          party:
            'OTH',
        },
      ),
    ).toBeNull();
    expect(
      resolveRace(
        snap(),
        {
          key: 5,
          party:
            'DEM',
        },
      ),
    ).toBeNull();
  });
});

describe('resolveChamber', () => {
  it('is null while control is undecided', () => {
    expect(
      resolveChamber(
        snap(),
        {
          office:
            'senate',
          party:
            'GOP',
        },
      ),
    ).toBeNull();
  });
  it('is YES for the clincher and NO for the other side', () => {
    const s =
      snap();
    s.chambers.senate =
      {
        ...s
          .chambers
          .senate!,
        controlledBy:
          'GOP',
      };
    expect(
      resolveChamber(
        s,
        {
          office:
            'senate',
          party:
            'GOP',
        },
      ),
    ).toBe(
      'YES',
    );
    expect(
      resolveChamber(
        s,
        {
          office:
            'senate',
          party:
            'DEM',
        },
      ),
    ).toBe(
      'NO',
    );
  });
  it('is NO for both sides only when every race is called and nobody has a majority', () => {
    const s =
      snap();
    s.races =
      s.races.map(
        (
          r,
        ) =>
          r.office ===
          'senate'
            ? {
                ...r,
                status:
                  'called' as const,
              }
            : r,
      );
    expect(
      resolveChamber(
        s,
        {
          office:
            'senate',
          party:
            'GOP',
        },
      ),
    ).toBe(
      'NO',
    );
    expect(
      resolveChamber(
        s,
        {
          office:
            'senate',
          party:
            'DEM',
        },
      ),
    ).toBe(
      'NO',
    );
  });
  it('never decides from a derived tally or a non-source snapshot', () => {
    const s =
      snap();
    s.chambers.senate =
      {
        ...s
          .chambers
          .senate!,
        derived: true,
        controlledBy:
          'GOP',
      };
    expect(
      resolveChamber(
        s,
        {
          office:
            'senate',
          party:
            'GOP',
        },
      ),
    ).toBeNull();
    expect(
      resolveChamber(
        snap(
          {
            source:
              'calendar',
          },
        ),
        {
          office:
            'senate',
          party:
            'GOP',
        },
      ),
    ).toBeNull();
    expect(
      resolveChamber(
        snap(),
        {
          office:
            'governor',
          party:
            'GOP',
        },
      ),
    ).toBeNull();
  });
});
