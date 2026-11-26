import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RivalsList } from '../../ui/RivalsList';
import {
  compareRivals,
  isListableRival,
  isRivalAccountId,
  tallyScores,
  type RivalUser,
  type RivalView,
} from '../rivals';

const NOW = new Date('2026-12-01T12:00:00.000Z');
const none = new Set<string>();
const live = (extra: Partial<RivalUser> = {}): RivalUser => ({
  id: 'ann',
  name: 'Ann',
  bannedUntil: null,
  banReason: null,
  ...extra,
});

describe('tallyScores', () => {
  it('counts a win for a higher score, a loss for a lower one and a tie for an equal one', () => {
    expect(
      tallyScores([
        { mine: 900, theirs: 100 },
        { mine: 100, theirs: 900 },
        { mine: 500, theirs: 500 },
        { mine: 0, theirs: 0 },
        { mine: 700, theirs: 600 },
      ]),
    ).toEqual({ matches: 5, wins: 2, losses: 1, ties: 2 });
  });

  it('is all zeros for no matches, and matches always equals wins + losses + ties', () => {
    expect(tallyScores([])).toEqual({ matches: 0, wins: 0, losses: 0, ties: 0 });
    const pairs = Array.from({ length: 8 }, (_, i) => ({ mine: i % 3, theirs: 1 }));
    const t = tallyScores(pairs);
    expect(t.matches).toBe(t.wins + t.losses + t.ties);
  });

  it('eight matches with five ahead and three behind is 5 wins and 3 losses', () => {
    const pairs = [...Array(5).fill({ mine: 2, theirs: 1 }), ...Array(3).fill({ mine: 1, theirs: 2 })];
    expect(tallyScores(pairs)).toEqual({ matches: 8, wins: 5, losses: 3, ties: 0 });
  });
});

describe('isRivalAccountId', () => {
  it('refuses guests, erased members and empty ids; accepts an account id', () => {
    expect(isRivalAccountId('guest:abc')).toBe(false);
    expect(isRivalAccountId('deleted:row1')).toBe(false);
    expect(isRivalAccountId('')).toBe(false);
    expect(isRivalAccountId('ann')).toBe(true);
  });
});

describe('isListableRival', () => {
  it('lists a live, named account', () => {
    expect(isListableRival('ann', live(), none, none, NOW)).toBe(true);
  });

  it('never lists guests, erased members, unknown, deleted or unnamed accounts', () => {
    expect(isListableRival('guest:1', live({ id: 'guest:1' }), none, none, NOW)).toBe(false);
    expect(isListableRival('deleted:1', live({ id: 'deleted:1' }), none, none, NOW)).toBe(false);
    expect(isListableRival('ann', undefined, none, none, NOW)).toBe(false);
    expect(isListableRival('deleted-user', live({ id: 'deleted-user' }), none, none, NOW)).toBe(false);
    expect(isListableRival('ann', live({ banReason: 'account_deleted' }), none, none, NOW)).toBe(false);
    expect(isListableRival('ann', live({ name: 'Deleted user' }), none, none, NOW)).toBe(false);
    expect(isListableRival('ann', live({ name: null }), none, none, NOW)).toBe(false);
  });

  it('never lists a blocked member, a board-hidden member or one under a ban; an ended ban is fine', () => {
    expect(isListableRival('ann', live(), new Set(['ann']), none, NOW)).toBe(false);
    expect(isListableRival('ann', live(), none, new Set(['ann']), NOW)).toBe(false);
    expect(isListableRival('ann', live({ bannedUntil: new Date(NOW.getTime() + 1000) }), none, none, NOW)).toBe(false);
    expect(isListableRival('ann', live({ bannedUntil: new Date(NOW.getTime() - 1000) }), none, none, NOW)).toBe(true);
  });
});

describe('compareRivals', () => {
  it('sorts most matches first, then the latest', () => {
    const rows = [
      { matches: 2, lastAt: '2026-11-01T00:00:00.000Z' },
      { matches: 5, lastAt: '2026-10-01T00:00:00.000Z' },
      { matches: 2, lastAt: '2026-12-01T00:00:00.000Z' },
    ];
    expect([...rows].sort(compareRivals).map((r) => `${r.matches}:${r.lastAt.slice(0, 7)}`)).toEqual([
      '5:2026-10',
      '2:2026-12',
      '2:2026-11',
    ]);
  });
});

describe('RivalsList markup', () => {
  const rival: RivalView = {
    key: 'row-1',
    name: 'Ann',
    matches: 8,
    wins: 5,
    losses: 3,
    ties: 0,
    lastAt: '2026-11-30T12:00:00.000Z',
  };

  it('renders one openable row per rival, the name isolated for its direction and no key in the markup', () => {
    const html = renderToStaticMarkup(
      createElement(RivalsList, { rivals: [rival, { ...rival, key: 'row-2', name: 'Bo' }], onOpen: () => {} }),
    );
    expect(html.match(/<li /g)).toHaveLength(2);
    expect(html.match(/<button type="button" class="ssm-rival"/g)).toHaveLength(2);
    expect(html).toContain('<bdi dir="auto">Ann</bdi>');
    expect(html).toContain('<bdi dir="auto">Bo</bdi>');
    expect(html).not.toContain('row-1');
  });

  it('shows an empty line when there are no rivals', () => {
    const html = renderToStaticMarkup(createElement(RivalsList, { rivals: [], onOpen: () => {} }));
    expect(html).toContain('No rivals yet');
  });
});
