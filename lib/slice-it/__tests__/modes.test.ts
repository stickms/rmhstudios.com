/**
 * N3–N12 — the multiplayer mode policies.
 *
 * These are the rules a 1900-line socket handler would otherwise hold and
 * nobody could exercise. The ones that matter most are the guards: an
 * elimination that can knock out the second-to-last player, an attack that can
 * defeat a photosensitivity setting, and a rating change that scales with lobby
 * size are all bugs that only show up in a live match.
 */

import { describe, expect, it } from 'vitest';
import {
  ATTACKS,
  DEFAULT_MATCH_RATING,
  ELIMINATION_CHECKPOINTS,
  MAX_QUEUE_LENGTH,
  REJOIN_COMPETE_FRACTION,
  buildScoreCurve,
  chargesEarned,
  coopBalance,
  coopFilter,
  dequeueChart,
  elimination,
  enqueueChart,
  ghostAsLiveScore,
  isPartialRun,
  matchRatingDeltas,
  nextPicker,
  ratingBand,
  resolveAttack,
  resolveRejoin,
  sectionIndexAt,
  withinBand,
} from '../net/modes';
import type { Section } from '../beatmap/sections';
import type { Slice } from '../types';

const note = (id: string, time: number, lane: number): Slice => ({
  id,
  time,
  lane,
  type: 'STANDARD',
});

const sections: Section[] = [
  { start: 0, end: 10, label: 'A', energy: 0.5 },
  { start: 10, end: 20, label: 'B', energy: 1 },
  { start: 20, end: 30, label: 'A', energy: 0.6 },
];

describe('N3 — co-op', () => {
  const chart = [
    note('a', 1, 0),
    note('b', 2, 1),
    note('c', 11, 0),
    note('d', 12, 1),
    note('e', 21, 0),
  ];

  it('splits by lane with no extra chart data', () => {
    expect(coopFilter(chart, 0, 'lane').map((n) => n.id)).toEqual(['a', 'c', 'e']);
    expect(coopFilter(chart, 1, 'lane').map((n) => n.id)).toEqual(['b', 'd']);
  });

  it('alternates sections in section mode', () => {
    // Sections 0 and 2 to seat 0, section 1 to seat 1.
    expect(coopFilter(chart, 0, 'section', sections).map((n) => n.id)).toEqual(['a', 'b', 'e']);
    expect(coopFilter(chart, 1, 'section', sections).map((n) => n.id)).toEqual(['c', 'd']);
  });

  it('degrades section mode to lane mode with no analysis', () => {
    // An empty section list is an analysis that has not run, not a song with
    // one section — and giving one player everything is not co-op.
    expect(coopFilter(chart, 0, 'section', []).map((n) => n.id)).toEqual(
      coopFilter(chart, 0, 'lane').map((n) => n.id),
    );
  });

  it('places a note past the last section in the last section', () => {
    expect(sectionIndexAt(sections, 999)).toBe(2);
    expect(sectionIndexAt([], 5)).toBe(0);
  });

  it('refuses a split that gives one seat almost everything', () => {
    // One person playing while the other watches is not co-op.
    const lopsided = Array.from({ length: 20 }, (_, i) => note(`n${i}`, i, i < 19 ? 0 : 1));
    expect(coopBalance(lopsided, 'lane').playable).toBe(false);
    expect(coopBalance(chart, 'lane').playable).toBe(true);
  });

  it('reports an empty chart as unplayable rather than perfectly balanced', () => {
    expect(coopBalance([], 'lane')).toMatchObject({ seat0: 0, seat1: 0, playable: false });
  });
});

describe('N4 — attack mode', () => {
  const base = {
    charges: 3,
    now: 1000,
    attackerId: 'a',
    targetId: 'b',
    targetReducedFlash: false,
  };

  it('spends charges and sets an expiry', () => {
    const result = resolveAttack({ ...base, kind: 'blackout' });
    expect(result.ok).toBe(true);
    expect(result.chargesLeft).toBe(3 - ATTACKS.blackout.cost);
    expect(result.untilMs).toBe(1000 + ATTACKS.blackout.durationMs);
  });

  it('refuses without enough charges', () => {
    expect(resolveAttack({ ...base, kind: 'blackout', charges: 1 })).toMatchObject({
      ok: false,
      reason: 'no-charges',
      chargesLeft: 1,
    });
  });

  it('refuses an attack on yourself', () => {
    expect(resolveAttack({ ...base, kind: 'shake', targetId: 'a' })).toMatchObject({
      ok: false,
      reason: 'self',
    });
  });

  it('substitutes a blackout for a player with reduced flash on', () => {
    // An attack that can defeat an accessibility setting is a hazard, not a
    // mechanic. The attacker still pays.
    const result = resolveAttack({ ...base, kind: 'blackout', targetReducedFlash: true });
    expect(result.ok).toBe(true);
    expect(result.kind).toBe('laneCover');
    expect(result.chargesLeft).toBe(3 - ATTACKS.blackout.cost);
    // …and the substituted attack lasts as long as a lane cover, not as long as
    // the blackout that was asked for.
    expect(result.untilMs).toBe(1000 + ATTACKS.laneCover.durationMs);
  });

  it('grants a charge per milestone crossed, once', () => {
    expect(chargesEarned(120, 0)).toBe(2); // 50 and 100
    expect(chargesEarned(120, 100)).toBe(0);
    expect(chargesEarned(220, 100)).toBe(1); // 200
    expect(chargesEarned(0, 0)).toBe(0);
  });

  it('keeps every attack cosmetic and time-boxed', () => {
    // The invariant that keeps a match's scores comparable.
    for (const spec of Object.values(ATTACKS)) {
      expect(spec.durationMs).toBeGreaterThan(0);
      expect(spec.durationMs).toBeLessThanOrEqual(5000);
      expect(spec.cost).toBeGreaterThan(0);
    }
  });
});

describe('N5 — elimination', () => {
  const seats = [
    { id: 'a', score: 100, eliminated: false },
    { id: 'b', score: 50, eliminated: false },
    { id: 'c', score: 200, eliminated: false },
    { id: 'd', score: 10, eliminated: false },
  ];

  it('does nothing before the first checkpoint', () => {
    expect(elimination(seats, 0, 0.1)).toEqual({ eliminate: null, checkpointsPassed: 0 });
  });

  it('knocks out the lowest score at a checkpoint', () => {
    expect(elimination(seats, 0, ELIMINATION_CHECKPOINTS[0])).toEqual({
      eliminate: 'd',
      checkpointsPassed: 1,
    });
  });

  it('never eliminates below two players', () => {
    // One person playing alone against nobody is not the end of a match.
    const two = seats.slice(0, 2);
    expect(elimination(two, 0, 0.9).eliminate).toBeNull();
  });

  it('consumes the checkpoint even when it eliminates nobody', () => {
    // Otherwise it re-evaluates on every tick for the rest of the song.
    expect(elimination(seats.slice(0, 2), 0, 0.9).checkpointsPassed).toBe(1);
  });

  it('ignores already-eliminated seats', () => {
    const withDead = [{ ...seats[3], eliminated: true }, ...seats.slice(0, 3)];
    expect(elimination(withDead, 0, 0.3).eliminate).toBe('b');
  });

  it('stops once the checkpoints run out', () => {
    expect(elimination(seats, ELIMINATION_CHECKPOINTS.length, 0.99).eliminate).toBeNull();
  });
});

describe('N6 — matchmaking', () => {
  it('widens the band with wait time', () => {
    // A fixed band means a very strong player waits forever; an unbounded one
    // means quickplay is random.
    expect(ratingBand(0)).toBe(100);
    expect(ratingBand(10_000)).toBe(200);
    expect(ratingBand(60_000)).toBeGreaterThan(5000);
  });

  it('treats a negative wait as no wait', () => {
    expect(ratingBand(-5000)).toBe(100);
  });

  it('accepts a close match immediately and a distant one only later', () => {
    expect(withinBand(1200, 1250, 0)).toBe(true);
    expect(withinBand(1200, 1600, 0)).toBe(false);
    expect(withinBand(1200, 1600, 30_000)).toBe(true);
  });

  it('is worth one match regardless of lobby size', () => {
    // Without the 1/(n-1) scaling, an 8-player win moves a rating seven times
    // as far as a 2-player win and the fastest way to climb is to fill the
    // lobby.
    const duel = matchRatingDeltas(
      [
        { userId: 'a', score: 100 },
        { userId: 'b', score: 50 },
      ],
      {},
    );
    const eight = matchRatingDeltas(
      Array.from({ length: 8 }, (_, i) => ({ userId: `p${i}`, score: 100 - i })),
      {},
    );
    // The winner of the 8-player match beat 7 people, each worth 1/7.
    expect(eight.p0).toBeCloseTo(duel.a, 5);
  });

  it('sums to zero', () => {
    const deltas = matchRatingDeltas(
      Array.from({ length: 5 }, (_, i) => ({ userId: `p${i}`, score: 100 - i * 7 })),
      { p0: 1400, p1: 1100 },
    );
    expect(Object.values(deltas).reduce((a, b) => a + b, 0)).toBeCloseTo(0, 6);
  });

  it('treats identical scores as a draw', () => {
    const deltas = matchRatingDeltas(
      [
        { userId: 'a', score: 100 },
        { userId: 'b', score: 100 },
      ],
      { a: DEFAULT_MATCH_RATING, b: DEFAULT_MATCH_RATING },
    );
    expect(deltas.a).toBeCloseTo(0, 6);
    expect(deltas.b).toBeCloseTo(0, 6);
  });

  it('rewards an upset more than an expected win', () => {
    const upset = matchRatingDeltas(
      [
        { userId: 'weak', score: 100 },
        { userId: 'strong', score: 50 },
      ],
      { weak: 900, strong: 1600 },
    );
    const expected = matchRatingDeltas(
      [
        { userId: 'strong', score: 100 },
        { userId: 'weak', score: 50 },
      ],
      { weak: 900, strong: 1600 },
    );
    expect(upset.weak).toBeGreaterThan(expected.strong);
  });

  it('returns nothing for a one-player standing', () => {
    expect(matchRatingDeltas([{ userId: 'a', score: 1 }], {})).toEqual({});
  });
});

describe('N8 — queue and host rotation', () => {
  it('rotates by seat index and wraps', () => {
    // By SEAT, not socket id: a reconnect mints a new socket id, so rotating on
    // that would hand the pick to whoever last had a wifi blip.
    expect(nextPicker(0, 4)).toBe(1);
    expect(nextPicker(3, 4)).toBe(0);
    expect(nextPicker(0, 0)).toBe(0);
  });

  it('refuses duplicates and respects the cap', () => {
    expect(enqueueChart(['a'], 'a')).toEqual(['a']);
    const full = Array.from({ length: MAX_QUEUE_LENGTH }, (_, i) => `c${i}`);
    expect(enqueueChart(full, 'new')).toHaveLength(MAX_QUEUE_LENGTH);
  });

  it('never mutates the queue it was given', () => {
    const queue = ['a', 'b'];
    dequeueChart(queue);
    enqueueChart(queue, 'c');
    expect(queue).toEqual(['a', 'b']);
  });

  it('dequeues in order and survives an empty queue', () => {
    expect(dequeueChart(['a', 'b'])).toEqual({ next: 'a', rest: ['b'] });
    expect(dequeueChart([])).toEqual({ next: null, rest: [] });
  });
});

describe('N10 — ghost races', () => {
  const curve = [0, 100, 250, 400, 400];

  it('is shaped exactly like a live opponent', () => {
    // The whole point: no second renderer and no second code path.
    const ghost = ghostAsLiveScore(curve, 2, 'PB');
    expect(ghost).toMatchObject({ socketId: 'ghost:PB', name: 'PB', score: 250, health: 100 });
  });

  it('does not invent the fields it cannot know', () => {
    // A fabricated accuracy would be a number on screen that nothing produced.
    const ghost = ghostAsLiveScore(curve, 2, 'PB');
    expect(ghost.combo).toBe(0);
    expect(ghost.accuracy).toBe(0);
  });

  it('finishes at the end and holds there', () => {
    expect(ghostAsLiveScore(curve, 4, 'PB').finished).toBe(true);
    expect(ghostAsLiveScore(curve, 999, 'PB')).toMatchObject({ score: 400, finished: true });
    expect(ghostAsLiveScore(curve, 1, 'PB').finished).toBe(false);
  });

  it('survives an empty curve', () => {
    expect(ghostAsLiveScore([], 5, 'PB')).toMatchObject({ score: 0, finished: false });
  });

  it('forward-fills a second with no sample', () => {
    // A gap that dropped to zero would draw as the ghost losing points.
    const built = buildScoreCurve(
      [
        { seconds: 0, score: 10 },
        { seconds: 3, score: 90 },
      ],
      5,
    );
    expect(built).toEqual([10, 10, 10, 90, 90]);
  });

  it('is one integer per second', () => {
    // A curve sampled per frame would be 14 000 values for a four-minute run.
    expect(buildScoreCurve([], 240)).toHaveLength(240);
  });

  it('clamps a sample past the stated duration', () => {
    expect(buildScoreCurve([{ seconds: 99, score: 500 }], 3)).toEqual([0, 0, 500]);
  });
});

describe('N12 — rejoining', () => {
  it('seats a player who returns early, at the room’s position', () => {
    // Seeking to zero would have them playing a different song from the room.
    const outcome = resolveRejoin({
      hadSeat: true,
      state: 'playing',
      elapsedSeconds: 10,
      songDuration: 200,
    });
    expect(outcome).toEqual({ kind: 'compete', seekTo: 10, fromSeconds: 10 });
  });

  it('sends a late returner to the spectator room', () => {
    // Past 20%, the remainder is a different chart from the one everyone else
    // played, and a partial score on the same board means something else.
    const outcome = resolveRejoin({
      hadSeat: true,
      state: 'playing',
      elapsedSeconds: 200 * REJOIN_COMPETE_FRACTION + 1,
      songDuration: 200,
    });
    expect(outcome).toEqual({ kind: 'spectate', reason: 'too-late' });
  });

  it('refuses someone who never had a seat', () => {
    expect(
      resolveRejoin({ hadSeat: false, state: 'playing', elapsedSeconds: 1, songDuration: 200 }),
    ).toMatchObject({ kind: 'refused', reason: 'no-seat' });
  });

  it('refuses when the match is not running', () => {
    expect(
      resolveRejoin({ hadSeat: true, state: 'waiting', elapsedSeconds: 1, songDuration: 200 }),
    ).toMatchObject({ kind: 'refused', reason: 'not-playing' });
  });

  it('survives a zero duration rather than dividing by it', () => {
    const outcome = resolveRejoin({
      hadSeat: true,
      state: 'playing',
      elapsedSeconds: 1,
      songDuration: 0,
    });
    expect(outcome.kind).toBe('spectate');
  });

  it('labels a partial run at the source', () => {
    expect(isPartialRun(10)).toBe(true);
    expect(isPartialRun(0)).toBe(false);
    expect(isPartialRun(null)).toBe(false);
  });
});
