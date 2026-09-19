import { describe, it, expect } from 'vitest';

/**
 * Ranked seasons (P5).
 *
 * The lifetime ladder had no season, no placement and no decay, which between
 * them make a leaderboard of tenure rather than of skill. These are the three
 * rules that fix that, and the tests that matter are the ones about what each
 * rule must NOT do: decay must not push somebody down through tiers they
 * earned, placement must not show a number it has not established, and a
 * season boundary must not renumber history.
 */

import {
  DECAY_AFTER_DAYS,
  DECAY_FLOOR,
  DECAY_PER_DAY,
  PLACEMENT_MATCHES,
  SEASON_EPOCH,
  SEASON_LENGTH_DAYS,
  applyDecay,
  displayRating,
  idleDays,
  isProvisional,
  kFactorFor,
  seasonFor,
  seasonProgress,
  seasonWindow,
} from '@/lib/ranked/season';
import { nextRating, nextRatingWithK } from '@/lib/ranked/elo';

const DAY = 86_400_000;
const at = (offsetDays: number) => new Date(SEASON_EPOCH + offsetDays * DAY);

describe('the season calendar', () => {
  it('starts at season 1 on the epoch', () => {
    expect(seasonFor(new Date(SEASON_EPOCH))).toBe(1);
  });

  it('never returns a season before 1, even for a date before the epoch', () => {
    expect(seasonFor(new Date(SEASON_EPOCH - 10 * DAY))).toBe(1);
  });

  it('rolls over exactly on the boundary', () => {
    expect(seasonFor(at(SEASON_LENGTH_DAYS - 0.01))).toBe(1);
    expect(seasonFor(at(SEASON_LENGTH_DAYS))).toBe(2);
  });

  it('keeps counting', () => {
    expect(seasonFor(at(SEASON_LENGTH_DAYS * 9 + 3))).toBe(10);
  });

  it('gives a window that abuts the next one exactly', () => {
    expect(seasonWindow(3).start.getTime()).toBe(seasonWindow(2).end.getTime());
  });

  it('reports progress across the window', () => {
    expect(seasonProgress(at(0))).toBeCloseTo(0, 5);
    expect(seasonProgress(at(SEASON_LENGTH_DAYS / 2))).toBeCloseTo(0.5, 5);
    expect(seasonProgress(at(SEASON_LENGTH_DAYS - 0.001))).toBeGreaterThan(0.99);
  });

  it('never reports progress outside 0..1', () => {
    expect(seasonProgress(new Date(SEASON_EPOCH - 100 * DAY))).toBe(0);
  });
});

describe('placement', () => {
  it('is provisional until the matches are served', () => {
    expect(isProvisional(PLACEMENT_MATCHES)).toBe(true);
    expect(isProvisional(1)).toBe(true);
    expect(isProvisional(0)).toBe(false);
  });

  it('moves a placement match further than a settled one', () => {
    // Otherwise placement is five matches of moving 32 points from a fixed
    // start, which cannot find anybody's level.
    const placement = nextRatingWithK(1000, 1400, 1, kFactorFor(PLACEMENT_MATCHES));
    const settled = nextRatingWithK(1000, 1400, 1, kFactorFor(0));
    expect(placement - 1000).toBeGreaterThan(settled - 1000);
  });

  it('settles on the same K the lifetime ladder uses', () => {
    expect(nextRatingWithK(1000, 1200, 1, kFactorFor(0))).toBe(nextRating(1000, 1200, 1));
  });

  it('shows no number while provisional', () => {
    const shown = displayRating({ rating: 1400, placementsLeft: 2, lastPlayedAt: null });
    expect(shown).toEqual({ rating: null, shed: 0, provisional: true });
  });

  it('never decays a provisional rating', () => {
    // You cannot go stale at something you have not finished starting.
    const shown = displayRating({
      rating: 1800,
      placementsLeft: 3,
      lastPlayedAt: new Date(Date.now() - 400 * DAY),
    });
    expect(shown.shed).toBe(0);
  });
});

describe('decay', () => {
  it('does nothing inside the grace period', () => {
    expect(applyDecay(1600, DECAY_AFTER_DAYS)).toEqual({ rating: 1600, shed: 0 });
    expect(applyDecay(1600, DECAY_AFTER_DAYS - 1)).toEqual({ rating: 1600, shed: 0 });
  });

  it('sheds per day past it', () => {
    expect(applyDecay(1600, DECAY_AFTER_DAYS + 3)).toEqual({
      rating: 1600 - 3 * DECAY_PER_DAY,
      shed: 3 * DECAY_PER_DAY,
    });
  });

  it('leaves everyone at or below the floor alone', () => {
    // Decay exists to vacate the top of a ladder, not to punish somebody for
    // having a life. There is nothing at the bottom worth protecting.
    expect(applyDecay(DECAY_FLOOR, 400)).toEqual({ rating: DECAY_FLOOR, shed: 0 });
    expect(applyDecay(900, 400)).toEqual({ rating: 900, shed: 0 });
  });

  it('never pushes anybody below the floor, however long they are away', () => {
    const { rating, shed } = applyDecay(1300, 10_000);
    expect(rating).toBe(DECAY_FLOOR);
    expect(shed).toBe(1300 - DECAY_FLOOR);
  });

  it('is monotonic in idle time', () => {
    const a = applyDecay(2000, 20).rating;
    const b = applyDecay(2000, 40).rating;
    expect(b).toBeLessThan(a);
  });
});

describe('idleDays', () => {
  const now = new Date('2026-09-19T12:00:00Z');

  it('is zero for someone who has never played', () => {
    expect(idleDays(null, now)).toBe(0);
  });

  it('never goes negative for a future timestamp', () => {
    expect(idleDays(new Date(now.getTime() + 5 * DAY), now)).toBe(0);
  });

  it('floors partial days', () => {
    expect(idleDays(new Date(now.getTime() - 2.9 * DAY), now)).toBe(2);
  });
});

describe('displayRating', () => {
  const now = new Date('2026-09-19T12:00:00Z');

  it('folds decay into the number that is shown', () => {
    const shown = displayRating(
      { rating: 1600, placementsLeft: 0, lastPlayedAt: new Date(now.getTime() - 20 * DAY) },
      now,
    );
    expect(shown.provisional).toBe(false);
    expect(shown.rating).toBe(1600 - 6 * DECAY_PER_DAY);
    expect(shown.shed).toBe(6 * DECAY_PER_DAY);
  });

  it('leaves an active player untouched', () => {
    const shown = displayRating(
      { rating: 1600, placementsLeft: 0, lastPlayedAt: new Date(now.getTime() - 2 * DAY) },
      now,
    );
    expect(shown).toEqual({ rating: 1600, shed: 0, provisional: false });
  });
});
