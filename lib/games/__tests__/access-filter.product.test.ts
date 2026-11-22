import { describe, expect, it } from 'vitest';
import type { GameCapabilities } from '@/lib/game-capabilities';
import {
  ACCESS_OPTIONS,
  NO_ACCESS_FILTER,
  PLAY_OPTIONS,
  matchesAccess,
  parseAccessParam,
  serializeAccessParam,
  toggleOption,
  type AccessFilter,
} from '@/lib/games/access-filter';
import { filterRail } from '@/lib/games/library';
import type { CuratedBuild } from '@/lib/builds/curated';

const caps = (over: Partial<GameCapabilities> = {}): GameCapabilities => ({
  genre: ['arcade'],
  players: ['single'],
  input: {
    supported: ['keyboard', 'mouse', 'touch'],
    required: [],
  },
  sessionMinutes: [5, 10],
  engine: 'dom',
  demanding: false,
  save: 'none',
  accessibility: [],
  ...over,
});
const f = (over: Partial<AccessFilter>): AccessFilter => ({
  ...NO_ACCESS_FILTER,
  ...over,
});

describe('matchesAccess', () => {
  it('an empty filter matches everything, including a title with no entry', () => {
    expect(matchesAccess(undefined, NO_ACCESS_FILTER)).toBe(true);
    expect(matchesAccess(caps(), NO_ACCESS_FILTER)).toBe(true);
  });

  it('a title with no entry matches nothing while a filter is on', () => {
    expect(
      matchesAccess(
        undefined,
        f({
          play: ['keyboard'],
        }),
      ),
    ).toBe(false);
  });

  it('excludes a game that flashes and cannot turn it off from "No flashing"', () => {
    const flashing = caps({
      descriptors: ['flashing'],
    });
    expect(
      matchesAccess(
        flashing,
        f({
          access: ['no-flashing'],
        }),
      ),
    ).toBe(false);
    expect(
      matchesAccess(
        caps({
          descriptors: ['flashing'],
          accessibility: ['reduced-flashing'],
        }),
        f({
          access: ['no-flashing'],
        }),
      ),
    ).toBe(true);
    expect(
      matchesAccess(
        caps({
          descriptors: ['violence'],
        }),
        f({
          access: ['no-flashing'],
        }),
      ),
    ).toBe(true);
  });

  it('maps each accessibility option to its claim', () => {
    const pairs = [
      ['no-timed-input', 'no-timed-input'],
      ['assists', 'assist-mode'],
      ['remappable', 'remappable-input'],
      ['colorblind', 'colorblind-safe'],
      ['subtitles', 'subtitles'],
    ] as const;
    for (const [option, claim] of pairs) {
      expect(
        matchesAccess(
          caps({
            accessibility: [claim],
          }),
          f({
            access: [option],
          }),
        ),
      ).toBe(true);
      expect(
        matchesAccess(
          caps(),
          f({
            access: [option],
          }),
        ),
      ).toBe(false);
    }
  });

  it('plays with an input only when nothing else is required', () => {
    const mouseOnly = caps({
      input: {
        supported: ['mouse', 'touch'],
        required: ['mouse'],
      },
    });
    expect(
      matchesAccess(
        mouseOnly,
        f({
          play: ['touch'],
        }),
      ),
    ).toBe(false);
    const kb = caps({
      input: {
        supported: ['keyboard'],
        required: ['keyboard'],
      },
    });
    expect(
      matchesAccess(
        kb,
        f({
          play: ['keyboard'],
        }),
      ),
    ).toBe(true);
    expect(
      matchesAccess(
        kb,
        f({
          play: ['gamepad'],
        }),
      ),
    ).toBe(false);
    expect(
      matchesAccess(
        caps({
          input: {
            supported: ['gamepad', 'keyboard'],
            required: [],
          },
        }),
        f({
          play: ['gamepad'],
        }),
      ),
    ).toBe(true);
  });

  it('combines every selected option (AND)', () => {
    const both = caps({
      accessibility: ['no-timed-input'],
    });
    const filter = f({
      play: ['keyboard'],
      access: ['no-timed-input'],
    });
    expect(matchesAccess(both, filter)).toBe(true);
    expect(matchesAccess(caps(), filter)).toBe(false);
    expect(
      matchesAccess(
        caps({
          accessibility: ['no-timed-input'],
          input: {
            supported: ['touch'],
            required: [],
          },
        }),
        filter,
      ),
    ).toBe(false);
  });
});

describe('URL params', () => {
  it('parses a comma list, drops unknown and duplicate entries and returns display order', () => {
    expect(parseAccessParam('touch,keyboard,bogus,touch', PLAY_OPTIONS)).toEqual(['keyboard', 'touch']);
    expect(parseAccessParam(undefined, PLAY_OPTIONS)).toEqual([]);
    expect(parseAccessParam(['keyboard'], PLAY_OPTIONS)).toEqual([]);
  });

  it('round-trips and drops an empty selection', () => {
    const list = parseAccessParam('subtitles,no-timed-input', ACCESS_OPTIONS);
    expect(serializeAccessParam(list)).toBe('no-timed-input,subtitles');
    expect(serializeAccessParam([])).toBeUndefined();
  });

  it('toggles an option on and off in display order', () => {
    const on = toggleOption(['touch'], 'keyboard', PLAY_OPTIONS);
    expect(on).toEqual(['keyboard', 'touch']);
    expect(toggleOption(on, 'touch', PLAY_OPTIONS)).toEqual(['keyboard']);
  });
});

describe('filterRail with the access filter', () => {
  const rail = [
    {
      id: 'void-breaker',
      kind: 'game',
      title: 'Void Breaker',
      tags: [],
    },
    {
      id: 'no-such-game',
      kind: 'game',
      title: 'Mystery',
      tags: [],
    },
  ] as unknown as CuratedBuild[];

  it('keeps titles that claim the option and drops those with no entry', () => {
    const out = filterRail(rail, {
      kind: 'all',
      search: '',
      access: f({
        access: ['assists'],
      }),
    });
    expect(out.map((b) => b.id)).toEqual(['void-breaker']);
  });

  it('is unchanged without a filter', () => {
    expect(
      filterRail(rail, {
        kind: 'all',
        search: '',
      }),
    ).toHaveLength(2);
  });
});
