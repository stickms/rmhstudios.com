/**
 * The difficulty director's one non-negotiable property (A10).
 *
 * `lib/game/director.server.ts` exists to make a game adapt to its player. The
 * thing that makes that safe rather than corrosive is a single rule — an
 * adapted run never reaches a leaderboard — and that rule is enforced by a type
 * union plus one mapping function. A type union is checked at build time and
 * then never again; the mapping is where a plausible edit ("let's let strong
 * players keep their rank, they're not being helped") silently breaks it.
 *
 * So the suite below is deliberately lopsided. It spends a couple of
 * assertions on the shape of the envelope and the rest on the invariant, tested
 * exhaustively across every standing the sampler can produce, because that is
 * the failure that would not show up until a leaderboard was already polluted.
 *
 * Nothing here touches the network or a database.
 */

import { describe, it, expect, vi } from 'vitest';

// The director imports the adapter registry (Prisma) for board reads and the
// Redis helpers for claims. Neither is exercised by `envelopeFor`, which is the
// pure core under test — stubbed so the suite runs anywhere.
vi.mock('@/lib/prisma.server', () => ({ prisma: {} }));

import {
  envelopeFor,
  envelopeIsRanked,
  directorEnabled,
  DIRECTOR_TUNING,
  NEUTRAL_ENVELOPE,
  MIN_INTENSITY,
  MAX_INTENSITY,
  type PlayerStanding,
} from '@/lib/game/director.server';

/**
 * Every standing the sampler can return, enumerated rather than randomised.
 *
 * `playerStanding` produces exactly three families — absent from a complete
 * board, absent from a saturated board, and present at some rank — so walking
 * all three plus every rank in a full sample covers the input space rather than
 * approximating it.
 */
function allStandings(): PlayerStanding[] {
  const out: PlayerStanding[] = [
    { sampled: 0, rank: null, boardComplete: true },
    { sampled: 12, rank: null, boardComplete: true },
    { sampled: 200, rank: null, boardComplete: false },
  ];
  for (const sampled of [1, 2, 7, 40, 200]) {
    for (let rank = 1; rank <= sampled; rank++) out.push({ sampled, rank, boardComplete: sampled < 200 });
  }
  return out;
}

describe('envelopeFor — the hard rule', () => {
  it('never returns a ranked envelope that has been modified', () => {
    for (const standing of allStandings()) {
      const envelope = envelopeFor(standing);
      if (envelope.ranked) {
        // The ranked branch is the neutral one, and neutral means *unmodified*.
        // If this ever fails, some player is being helped (or pressured) and
        // still competing on the shared board.
        expect(envelope.intensity).toBe(1);
        expect(envelope.assistGrant).toBe(0);
      } else {
        // And the converse: a modified envelope must actually be modified.
        // A `ranked: false` envelope that changes nothing would cost a player
        // their leaderboard slot for no gameplay difference at all.
        expect(envelope.intensity !== 1 || envelope.assistGrant !== 0).toBe(true);
      }
    }
  });

  it('keeps intensity inside the declared bounds for every standing', () => {
    for (const standing of allStandings()) {
      const { intensity } = envelopeFor(standing);
      expect(intensity).toBeGreaterThanOrEqual(MIN_INTENSITY);
      expect(intensity).toBeLessThanOrEqual(MAX_INTENSITY);
    }
  });

  it('never grants more assist than the tuning allows', () => {
    for (const standing of allStandings()) {
      expect(envelopeFor(standing, { maxAssist: 0 }).assistGrant).toBe(0);
      expect(envelopeFor(standing, { maxAssist: 1 }).assistGrant).toBeLessThanOrEqual(1);
    }
  });

  it('collapses to the neutral singleton when tuning disables every modifier', () => {
    // `intensityScale: 0` + `maxAssist: 0` is how a game is switched off without
    // removing its entry. It must produce a genuinely ranked run, not a
    // "neutral-looking" adaptive one.
    for (const standing of allStandings()) {
      const envelope = envelopeFor(standing, { intensityScale: 0, maxAssist: 0 });
      expect(envelope).toBe(NEUTRAL_ENVELOPE);
      expect(envelopeIsRanked(envelope)).toBe(true);
    }
  });

  it('is deterministic — the same standing always yields the same envelope', () => {
    // Not a tautology worth skipping: the whole argument for this feature being
    // non-AI is that its output can be reproduced in a bug report.
    for (const standing of allStandings()) {
      expect(envelopeFor(standing)).toEqual(envelopeFor(standing));
    }
  });
});

describe('envelopeFor — the mapping', () => {
  it('assists a player with no recorded run on a complete board', () => {
    const envelope = envelopeFor({ sampled: 30, rank: null, boardComplete: true });
    expect(envelope.ranked).toBe(false);
    expect(envelope.assistGrant).toBeGreaterThan(0);
    expect(envelope.intensity).toBeLessThan(1);
  });

  it('treats absence from a saturated sample as below-board, not as newcomer', () => {
    // The head sample cannot tell a median player from a beginner, so absence
    // from a FULL sample gets the lighter assist. Getting this backwards would
    // hand a large assist to most of the player base.
    const below = envelopeFor({ sampled: 200, rank: null, boardComplete: false });
    const newcomer = envelopeFor({ sampled: 30, rank: null, boardComplete: true });
    expect(below.assistGrant).toBeLessThan(newcomer.assistGrant);
  });

  it('raises intensity for the top of the board and never assists them', () => {
    const top = envelopeFor({ sampled: 200, rank: 3, boardComplete: false });
    expect(top.intensity).toBeGreaterThan(1);
    expect(top.assistGrant).toBe(0);
    expect(top.ranked).toBe(false);
  });

  it('is monotonic — a better rank is never given a weaker challenge', () => {
    let previous = 0;
    for (let rank = 200; rank >= 1; rank--) {
      const { intensity } = envelopeFor({ sampled: 200, rank, boardComplete: false });
      expect(intensity).toBeGreaterThanOrEqual(previous);
      previous = intensity;
    }
  });
});

describe('the allowlist', () => {
  it('ships empty, so no live game is affected', () => {
    // Deliberate: an envelope is applied by the CLIENT. Enabling a game whose
    // client ignores it would remove that game's players from its leaderboard
    // in exchange for nothing. A game joins the table in the same change that
    // teaches its client to read the envelope — if this test fails, check that
    // the client half shipped too.
    expect(Object.keys(DIRECTOR_TUNING)).toEqual([]);
    expect(directorEnabled('void-breaker')).toBe(false);
  });
});
