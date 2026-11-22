import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, o: { defaultValue: string; [k: string]: unknown }) =>
      o.defaultValue.replace(/\{\{(\w+)\}\}/g, (_m, name: string) => String(o[name])),
    i18n: { language: 'en' },
  }),
}));
// The Sprint 6/7 controls own their tests; here they only have to be mounted in the row.
vi.mock('@/components/tournaments/MatchSchedule', () => ({
  MatchSchedule: ({ match }: { match: { id: string } }) => <div data-stub="schedule" data-for={match.id} />,
}));
vi.mock('@/components/tournaments/MatchResultControls', () => ({
  MatchResultControls: ({ match }: { match: { id: string } }) => <div data-stub="results" data-for={match.id} />,
}));

import { RoundsView } from '../RoundsView';
import type { SerializedTournament } from '@/lib/tournaments/tournament.server';

const entrant = (id: string, name: string, seed: number, userId: string) => ({
  id,
  checkedIn: id === 'a',
  seed,
  placement: null,
  wins: 0,
  losses: 0,
  user: { id: userId, name } as never,
});
const base = {
  round: 1,
  entrantAId: null,
  entrantBId: null,
  winnerEntrantId: null,
  bracket: 'W',
  disputed: false,
  claimedWinnerId: null,
};
const tournament = {
  id: 't1',
  status: 'LIVE',
  format: 'SINGLE_ELIM',
  entrants: [
    entrant('a', 'Ada Lovelace', 1, 'u-a'),
    entrant('b', 'Bo', 2, 'u-b'),
    entrant('c', 'Cy', 3, 'u-c'),
    entrant('d', 'Di', 4, 'u-d'),
  ],
  matches: [
    { ...base, id: 'm0', slot: 0, entrantAId: 'a', entrantBId: 'b', state: 'COMPLETE', winnerEntrantId: 'a' },
    { ...base, id: 'm1', slot: 1, entrantAId: 'c', entrantBId: 'd', state: 'READY' },
    { ...base, id: 'm2', round: 2, slot: 0, entrantAId: 'a', state: 'PENDING' },
  ],
} as unknown as SerializedTournament;

const render = (over: { viewerId?: string | null; canReport?: boolean; onChanged?: () => void } = {}) =>
  renderToStaticMarkup(
    <RoundsView
      tournament={tournament}
      canReport={over.canReport ?? false}
      reportingId={null}
      onReport={() => {}}
      viewerId={over.viewerId ?? null}
      onChanged={over.onChanged}
    />,
  );

describe('RoundsView', () => {
  it('has a heading per round, named like the tree', () => {
    const html = render();
    expect(html).toContain('Round 1 · Semifinals');
    expect(html).toContain('Round 2 · Final');
    expect(html.match(/<h3/g)?.length).toBe(2);
  });

  it('reads each match as one sentence', () => {
    const html = render();
    expect(html).toContain('Round 1, match 1: Ada Lovelace against Bo, Ada Lovelace won');
    expect(html).toContain('Round 1, match 2: Cy against Di, Not played yet');
    expect(html).toContain('<ul');
  });

  it('shows full handles and status words', () => {
    const html = render();
    expect(html).toContain('Ada Lovelace');
    expect(html).toContain('Done');
    expect(html).toContain('Ready');
  });

  it('puts your matches first for an entrant, and not for anyone else', () => {
    const mine = render({ viewerId: 'u-c' });
    expect(mine).toContain('Your matches');
    expect(mine.indexOf('Your matches')).toBeLessThan(mine.indexOf('Round 1 · Semifinals'));
    expect(render({ viewerId: 'someone-else' })).not.toContain('Your matches');
    expect(render()).not.toContain('Your matches');
  });

  it('offers report buttons, named with the match, only to a host', () => {
    expect(render()).not.toContain('Report Cy won');
    const host = render({ canReport: true });
    expect(host).toContain('aria-label="Report Cy won, round 1, match 2"');
    expect(host).toContain('aria-label="Report Di won, round 1, match 2"');
    expect(host).not.toContain('Report Ada Lovelace won');
  });

  it('mounts the schedule and result controls in every row when the page can reload', () => {
    expect(render()).not.toContain('data-stub');
    const html = render({ onChanged: () => {}, viewerId: 'u-c' });
    expect(html.match(/data-stub="schedule"/g)?.length).toBe(4); // three rows plus the entrant's own copy
    expect(html.match(/data-stub="results"/g)?.length).toBe(4);
  });
});
