import { describe, it, expect } from 'vitest';

/**
 * The recommender's scoring and diversification (M2).
 *
 * The tests that matter are the ones about what a recommender must NOT do:
 * converge on one topic, show something the member muted, or let one viral
 * item dominate every rail. A recommender that only ever gets the happy path
 * right is a recommender that gets worse the longer somebody uses it.
 */

import {
  DEFAULT_WEIGHTS,
  EMPTY_PROFILE,
  RECENCY_HALF_LIFE_DAYS,
  affinityFactor,
  diversify,
  popularityFactor,
  reasonFor,
  recencyFactor,
  scoreCandidates,
  type TasteProfile,
} from '@/lib/recommend/score';

const NOW = Date.UTC(2026, 8, 19);
const DAY = 86_400_000;

function profile(over: Partial<TasteProfile> = {}): TasteProfile {
  return { ...EMPTY_PROFILE, ...over };
}

describe('recencyFactor', () => {
  it('is 1 for something posted now', () => {
    expect(recencyFactor(NOW, NOW)).toBeCloseTo(1, 6);
  });

  it('halves over the half-life', () => {
    expect(recencyFactor(NOW - RECENCY_HALF_LIFE_DAYS * DAY, NOW)).toBeCloseTo(0.5, 6);
  });

  it('decays smoothly rather than falling off a cliff', () => {
    const a = recencyFactor(NOW - 13 * DAY, NOW);
    const b = recencyFactor(NOW - 15 * DAY, NOW);
    expect(a).toBeGreaterThan(b);
    expect(a - b).toBeLessThan(0.1);
  });

  it('never returns a negative factor for a future timestamp', () => {
    expect(recencyFactor(NOW + 10 * DAY, NOW)).toBeCloseTo(1, 6);
  });

  it('gives an undated candidate a neutral factor', () => {
    expect(recencyFactor(undefined, NOW)).toBe(0.5);
  });
});

describe('popularityFactor', () => {
  it('compresses, so one viral item cannot dominate every rail', () => {
    const smallStep = popularityFactor(10) - popularityFactor(0);
    const bigStep = popularityFactor(1010) - popularityFactor(1000);
    expect(smallStep).toBeGreaterThan(bigStep);
  });

  it('treats missing and zero popularity the same', () => {
    expect(popularityFactor(undefined)).toBe(popularityFactor(0));
  });

  it('never goes negative on bad data', () => {
    expect(popularityFactor(-50)).toBe(0);
  });
});

describe('affinityFactor', () => {
  it('is zero for an unknown facet', () => {
    expect(affinityFactor('x', EMPTY_PROFILE)).toBe(0);
    expect(affinityFactor(undefined, EMPTY_PROFILE)).toBe(0);
  });

  it('compresses, so forty plays of one game is not a rail of one game', () => {
    const p = profile({ affinities: { a: 1, b: 40 } });
    expect(affinityFactor('b', p) / affinityFactor('a', p)).toBeLessThan(10);
  });
});

describe('scoreCandidates', () => {
  it('drops a muted facet entirely rather than down-weighting it', () => {
    // A mute that only lowers a score shows the thing anyway on a quiet day,
    // which reads as the control not working.
    const p = profile({ muted: new Set(['spoilers']), affinities: { spoilers: 100 } });
    const out = scoreCandidates([{ id: '1', facet: 'spoilers' }], p, { now: NOW });
    expect(out).toEqual([]);
  });

  it('drops what the member has already seen', () => {
    const p = profile({ seen: new Set(['1']) });
    const out = scoreCandidates([{ id: '1' }, { id: '2' }], p, { now: NOW });
    expect(out.map((c) => c.id)).toEqual(['2']);
  });

  it('keeps the generator ordering as a term, so a fresh match is not buried', () => {
    // Both identical except position: the first should still win.
    const out = scoreCandidates([{ id: 'first' }, { id: 'second' }], EMPTY_PROFILE, { now: NOW });
    expect(out[0].id).toBe('first');
  });

  it('lets affinity beat position', () => {
    const p = profile({ affinities: { liked: 50 } });
    const out = scoreCandidates(
      [{ id: 'a' }, { id: 'b', facet: 'liked' }],
      p,
      { now: NOW },
    );
    expect(out[0].id).toBe('b');
  });

  it('exposes the terms so a reason can be derived rather than written', () => {
    const out = scoreCandidates([{ id: 'a', popularity: 500 }], EMPTY_PROFILE, { now: NOW });
    expect(Object.keys(out[0].terms).sort()).toEqual(['affinity', 'base', 'popularity', 'recency']);
  });

  it('honours custom weights', () => {
    const cands = [{ id: 'a', popularity: 1000 }, { id: 'b', createdAt: NOW }];
    const popular = scoreCandidates(cands, EMPTY_PROFILE, {
      now: NOW,
      weights: { ...DEFAULT_WEIGHTS, popularity: 10, recency: 0 },
    });
    expect(popular[0].id).toBe('a');

    const fresh = scoreCandidates(cands, EMPTY_PROFILE, {
      now: NOW,
      weights: { ...DEFAULT_WEIGHTS, popularity: 0, recency: 10 },
    });
    expect(fresh[0].id).toBe('b');
  });

  it('returns an empty list for no candidates', () => {
    expect(scoreCandidates([], EMPTY_PROFILE, { now: NOW })).toEqual([]);
  });
});

describe('diversify', () => {
  const items = (facets: string[]) => facets.map((f, i) => ({ id: String(i), facet: f }));

  it('caps any one facet', () => {
    const out = diversify(items(['a', 'a', 'a', 'a']), 10, 2);
    expect(out.filter((i) => i.facet === 'a')).toHaveLength(4);
  });

  it('prefers a spread while the rail can be filled', () => {
    const out = diversify(items(['a', 'a', 'a', 'b', 'c']), 3, 1);
    expect(out.map((i) => i.facet)).toEqual(['a', 'b', 'c']);
  });

  it('refills from the overflow rather than returning a short rail', () => {
    // A member with exactly one interest is a normal thing to be, and a
    // half-empty rail is worse than a repetitive one.
    const out = diversify(items(['a', 'a', 'a', 'a']), 3, 1);
    expect(out).toHaveLength(3);
  });

  it('keeps the top of the rail exactly as scored', () => {
    const out = diversify(items(['a', 'b', 'a', 'b']), 4, 2);
    expect(out[0].id).toBe('0');
  });

  it('passes faceted-less items straight through', () => {
    const out = diversify([{ id: '1' }, { id: '2' }, { id: '3' }], 2, 1);
    expect(out).toHaveLength(2);
  });

  it('respects the limit', () => {
    expect(diversify(items(['a', 'b', 'c', 'd']), 2, 5)).toHaveLength(2);
  });

  it('handles an empty input', () => {
    expect(diversify([], 5, 2)).toEqual([]);
  });
});

describe('reasonFor', () => {
  const mk = (terms: Partial<Record<string, number>>) => ({
    id: 'x',
    score: 0,
    terms: { base: 0, affinity: 0, popularity: 0, recency: 0, ...terms },
  }) as Parameters<typeof reasonFor>[0];

  it('names affinity when that is what carried it', () => {
    expect(reasonFor(mk({ affinity: 5 }))).toBe('because-you-like');
  });

  it('names popularity', () => {
    expect(reasonFor(mk({ popularity: 5 }))).toBe('popular-now');
  });

  it('names recency', () => {
    expect(reasonFor(mk({ recency: 5 }))).toBe('just-posted');
  });

  it('falls back when every term is zero', () => {
    expect(reasonFor(mk({}))).toBe('new-to-you');
  });
});
