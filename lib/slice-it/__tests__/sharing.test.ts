/**
 * X5, X4, H10 and R7 — what is worth sharing, and what a flag is worth.
 *
 * All four answer the same shape of question — is this run special enough to do
 * something about — and all four get it wrong the same way if written casually:
 * by firing on something that happens every session.
 */

import { describe, expect, it } from 'vitest';
import {
  BASE_RUN_XP,
  ESCALATE_AFTER,
  MAX_AUTO_POSTS_PER_DAY,
  MIN_ACCURACY_WEIGHT,
  REVIEW_SUSPICION,
  isFlagged,
  isNoteworthy,
  noteworthyReason,
  runXp,
  shouldAutoPost,
  shouldEscalate,
  shouldWriteCard,
  type RunContext,
} from '../sharing';

const run = (overrides: Partial<RunContext> = {}): RunContext => ({
  isFirstClearOfChart: false,
  isPerfect: false,
  difficulty: 'normal',
  globalRank: null,
  isPersonalBest: false,
  ...overrides,
});

describe('X5 — posting a run to the feed', () => {
  it('does NOT treat a personal best as noteworthy', () => {
    // A PB happens every session, and a feature that posts every session is how
    // a feed gets muted — which costs the player every future post too.
    expect(isNoteworthy(run({ isPersonalBest: true }))).toBe(false);
  });

  it('fires on the three genuinely rare things', () => {
    expect(isNoteworthy(run({ isFirstClearOfChart: true }))).toBe(true);
    expect(isNoteworthy(run({ isPerfect: true, difficulty: 'expert' }))).toBe(true);
    expect(isNoteworthy(run({ globalRank: 3 }))).toBe(true);
  });

  it('does not fire on a perfect at a lower difficulty', () => {
    expect(isNoteworthy(run({ isPerfect: true, difficulty: 'easy' }))).toBe(false);
  });

  it('does not fire outside the top ten', () => {
    expect(isNoteworthy(run({ globalRank: 11 }))).toBe(false);
    expect(isNoteworthy(run({ globalRank: 10 }))).toBe(true);
  });

  it('names the reason for the post’s own copy', () => {
    expect(noteworthyReason(run({ isFirstClearOfChart: true }))).toBe('first-clear');
    expect(noteworthyReason(run({ globalRank: 1 }))).toBe('top-ten');
    expect(noteworthyReason(run())).toBeNull();
  });

  it('is off unless the player opted in', () => {
    const noteworthy = run({ isFirstClearOfChart: true });
    expect(shouldAutoPost(noteworthy, { enabled: false, postsToday: 0 })).toBe(false);
    expect(shouldAutoPost(noteworthy, { enabled: true, postsToday: 0 })).toBe(true);
  });

  it('respects the daily cap', () => {
    const noteworthy = run({ isFirstClearOfChart: true });
    expect(
      shouldAutoPost(noteworthy, { enabled: true, postsToday: MAX_AUTO_POSTS_PER_DAY }),
    ).toBe(false);
  });
});

describe('H10 — the shareable card', () => {
  it('writes one only for a new best', () => {
    // A card per run means a share URL per attempt and a render queue full of
    // runs nobody will look at.
    expect(shouldWriteCard({ isPersonalBest: true })).toBe(true);
    expect(shouldWriteCard({ isPersonalBest: false })).toBe(false);
  });
});

describe('X4 — battle pass XP', () => {
  it('rewards playing well over playing long', () => {
    const good = runXp({ difficulty: 'normal', accuracy: 0.99, failed: false });
    const bad = runXp({ difficulty: 'normal', accuracy: 0.5, failed: false });
    expect(good).toBeGreaterThan(bad);
  });

  it('scales with difficulty', () => {
    expect(runXp({ difficulty: 'expert', accuracy: 0.9, failed: false })).toBeGreaterThan(
      runXp({ difficulty: 'easy', accuracy: 0.9, failed: false }),
    );
  });

  it('never returns zero', () => {
    // An XP formula that can pay nothing teaches players to quit a run the
    // moment it goes badly.
    expect(runXp({ difficulty: 'easy', accuracy: 0, failed: true })).toBeGreaterThan(0);
    expect(runXp({ difficulty: 'easy', accuracy: NaN, failed: false })).toBeGreaterThan(0);
  });

  it('floors a bad run rather than scaling it to nothing', () => {
    const floored = runXp({ difficulty: 'normal', accuracy: 0.01, failed: false });
    const atFloor = runXp({ difficulty: 'normal', accuracy: MIN_ACCURACY_WEIGHT, failed: false });
    expect(floored).toBe(atFloor);
  });

  it('pays a perfect normal run roughly the base', () => {
    expect(runXp({ difficulty: 'normal', accuracy: 1, failed: false })).toBeGreaterThanOrEqual(
      BASE_RUN_XP,
    );
  });
});

describe('R7 — escalating a pattern, never a run', () => {
  it('flags only above the review threshold', () => {
    expect(isFlagged(REVIEW_SUSPICION + 0.05)).toBe(true);
    expect(isFlagged(REVIEW_SUSPICION)).toBe(false);
    expect(isFlagged(0)).toBe(false);
    // Null is "not evaluated", which is not the same as clean.
    expect(isFlagged(null)).toBe(false);
    expect(isFlagged(undefined)).toBe(false);
  });

  it('needs a pattern, not one run', () => {
    // A single tight-timing run is a player having a very good night; five in a
    // week is a program. This is the difference between a review queue and an
    // accusation machine.
    expect(shouldEscalate(1)).toBe(false);
    expect(shouldEscalate(ESCALATE_AFTER - 1)).toBe(false);
    expect(shouldEscalate(ESCALATE_AFTER)).toBe(true);
  });

  it('sets the bar high on purpose', () => {
    // The cost of missing a cheater for another week is far below the cost of
    // accusing somebody who is simply good.
    expect(ESCALATE_AFTER).toBeGreaterThanOrEqual(5);
    expect(REVIEW_SUSPICION).toBeGreaterThanOrEqual(0.8);
  });
});
