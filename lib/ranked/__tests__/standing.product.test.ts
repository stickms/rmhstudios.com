import { describe, expect, it } from 'vitest';
import {
  PLACE_SCAN_CAP,
  decayNotice,
  placeFromCandidates,
  placeSummary,
  splitPlayed,
  type RankedStandingGame,
} from '@/lib/ranked/standing';

const DAY = 86_400_000;
const NOW = new Date('2026-12-30T12:00:00Z');

describe('decayNotice', () => {
  it('is null when nothing was shed', () => {
    expect(decayNotice(0, 3)).toBeNull();
  });
  it('carries the points and the idle days', () => {
    expect(decayNotice(20, 16)).toEqual({ count: 20, days: 16 });
  });
  it('rounds points and floors days', () => {
    expect(decayNotice(19.6, 16.9)).toEqual({ count: 20, days: 16 });
  });
});

describe('placeFromCandidates', () => {
  it('is one plus the candidates still above after decay', () => {
    const rows = [
      { rating: 1500, lastPlayedAt: new Date(NOW.getTime() - DAY) },
      { rating: 1400, lastPlayedAt: new Date(NOW.getTime() - 30 * DAY) }, // decays to 1240
    ];
    expect(placeFromCandidates(rows, 1300, NOW)).toEqual({ place: 2, beyondCap: false });
  });
  it('is first with nobody above', () => {
    expect(placeFromCandidates([], 1300, NOW)).toEqual({ place: 1, beyondCap: false });
  });
  it('does not count a tie as above', () => {
    expect(placeFromCandidates([{ rating: 1300, lastPlayedAt: null }], 1300, NOW).place).toBe(1);
  });
  it('reports the cap instead of a number', () => {
    const rows = Array.from({ length: 3 }, () => ({ rating: 2000, lastPlayedAt: null }));
    expect(placeFromCandidates(rows, 1300, NOW, 3)).toEqual({ place: null, beyondCap: true });
    expect(PLACE_SCAN_CAP).toBe(5000);
  });
});

const game = (over: Partial<RankedStandingGame>): RankedStandingGame => ({
  game: 'altair',
  name: 'Altair',
  played: true,
  rating: 1300,
  tier: 'Platinum',
  tierId: 'platinum',
  provisional: false,
  placementsLeft: 0,
  wins: 1,
  losses: 0,
  draws: 0,
  place: 3,
  beyondCap: false,
  of: 10,
  shed: 0,
  idleDays: 0,
  ...over,
});

describe('placeSummary and splitPlayed', () => {
  it('names the three cases', () => {
    expect(placeSummary(game({}))).toEqual({ kind: 'placed', place: 3, of: 10 });
    expect(placeSummary(game({ place: null, of: null }))).toEqual({ kind: 'off-ladder' });
    expect(placeSummary(game({ place: null, beyondCap: true }))).toEqual({ kind: 'beyond-cap', cap: 5000 });
  });
  it('splits played from unplayed, keeping order', () => {
    const s = splitPlayed([game({ game: 'a' }), game({ game: 'b', played: false }), game({ game: 'c' })]);
    expect(s.played.map((g) => g.game)).toEqual(['a', 'c']);
    expect(s.unplayed.map((g) => g.game)).toEqual(['b']);
  });
});
