import { describe, expect, it } from 'vitest';
import { mulberry32 } from '@/lib/core/rng';
import {
  ANNOUNCEMENT_COMMENT_FLOOR_PER_H,
  ANNOUNCEMENT_COMMENT_PEAK_PER_H,
  ANNOUNCEMENT_COMMENT_TAU_H,
  ANNOUNCEMENT_PEAK_SHARE,
  ANNOUNCEMENT_REACTION_WINDOW_H,
  ANNOUNCEMENT_SHARE_TAU_H,
  HEADLINE_MAX_AGE_H,
  HEADLINE_TAU_H,
  NEWS_SHARE,
  ageHours,
  announcementCommentsPerHour,
  announcementCommentsPerTick,
  headlineWeight,
  pickWeighted,
  postKindPmf,
  sampleKind,
  samplePoisson,
} from '@/lib/rmhark-ai/reaction-model';

const HOUR = 3_600_000;
const sum = (p: { announcement: number; news: number; usual: number }) =>
  p.announcement + p.news + p.usual;

describe('ageHours', () => {
  it('measures hours and never goes negative', () => {
    expect(ageHours(5 * HOUR, 2 * HOUR)).toBe(3);
    expect(ageHours(HOUR, 3 * HOUR)).toBe(0);
  });
});

describe('postKindPmf', () => {
  it('always sums to 1 with every share in [0, 1]', () => {
    for (const announcementAgeH of [null, -1, 0, 1, 6, 18, 48, 72, 73, 500]) {
      for (const headlineCount of [0, 1, 40]) {
        const p = postKindPmf({ announcementAgeH, headlineCount });
        expect(sum(p)).toBeCloseTo(1, 12);
        for (const v of [p.announcement, p.news, p.usual]) {
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('peaks at the configured share and decays with the time constant', () => {
    expect(postKindPmf({ announcementAgeH: 0, headlineCount: 0 }).announcement).toBe(
      ANNOUNCEMENT_PEAK_SHARE,
    );
    expect(
      postKindPmf({ announcementAgeH: ANNOUNCEMENT_SHARE_TAU_H, headlineCount: 0 }).announcement,
    ).toBeCloseTo(ANNOUNCEMENT_PEAK_SHARE / Math.E, 12);
    const shares = [0, 6, 12, 24, 48].map(
      (h) => postKindPmf({ announcementAgeH: h, headlineCount: 0 }).announcement,
    );
    for (let i = 1; i < shares.length; i++) expect(shares[i]).toBeLessThan(shares[i - 1] ?? 0);
  });

  it('the window edges: in at exactly 72h, out after it, none without an announcement', () => {
    expect(
      postKindPmf({ announcementAgeH: ANNOUNCEMENT_REACTION_WINDOW_H, headlineCount: 0 })
        .announcement,
    ).toBeGreaterThan(0);
    expect(
      postKindPmf({ announcementAgeH: ANNOUNCEMENT_REACTION_WINDOW_H + 0.01, headlineCount: 0 })
        .announcement,
    ).toBe(0);
    expect(postKindPmf({ announcementAgeH: null, headlineCount: 0 })).toEqual({
      announcement: 0,
      news: 0,
      usual: 1,
    });
    expect(postKindPmf({ announcementAgeH: -1, headlineCount: 0 }).announcement).toBe(0);
  });

  it('news takes its share of what the announcement leaves, only when headlines exist', () => {
    expect(postKindPmf({ announcementAgeH: null, headlineCount: 3 }).news).toBeCloseTo(NEWS_SHARE);
    const p = postKindPmf({ announcementAgeH: 0, headlineCount: 3 });
    expect(p.news).toBeCloseTo(NEWS_SHARE * (1 - ANNOUNCEMENT_PEAK_SHARE));
    expect(postKindPmf({ announcementAgeH: 0, headlineCount: 0 }).news).toBe(0);
  });
});

describe('sampleKind', () => {
  const pmf = { announcement: 0.2, news: 0.3, usual: 0.5 };
  it('splits [0, 1) at the cumulative boundaries', () => {
    expect(sampleKind(pmf, 0)).toBe('announcement');
    expect(sampleKind(pmf, 0.1999)).toBe('announcement');
    expect(sampleKind(pmf, 0.2)).toBe('news');
    expect(sampleKind(pmf, 0.4999)).toBe('news');
    expect(sampleKind(pmf, 0.5)).toBe('usual');
    expect(sampleKind(pmf, 0.9999)).toBe('usual');
  });
  it('a zero share is never drawn', () => {
    const none = { announcement: 0, news: 0, usual: 1 };
    expect(sampleKind(none, 0)).toBe('usual');
  });
});

describe('headlineWeight', () => {
  it('decays with age and is zero outside [0, max age]', () => {
    expect(headlineWeight(0, 0)).toBe(1);
    expect(headlineWeight(HEADLINE_TAU_H, 0)).toBeCloseTo(1 / Math.E, 12);
    expect(headlineWeight(HEADLINE_MAX_AGE_H, 0)).toBeGreaterThan(0);
    expect(headlineWeight(HEADLINE_MAX_AGE_H + 0.01, 0)).toBe(0);
    expect(headlineWeight(-1, 0)).toBe(0);
    expect(headlineWeight(Number.NaN, 0)).toBe(0);
  });
  it('a story bots already covered loses its pull; negative counts are treated as none', () => {
    expect(headlineWeight(0, 1)).toBeCloseTo(1 / Math.pow(2, 1.5), 12);
    expect(headlineWeight(0, 3)).toBeLessThan(headlineWeight(0, 1));
    expect(headlineWeight(0, -4)).toBe(1);
  });
});

describe('pickWeighted', () => {
  it('returns null with nothing to pick', () => {
    expect(pickWeighted([], [], 0.5)).toBeNull();
    expect(pickWeighted(['a', 'b'], [0, 0], 0.5)).toBeNull();
    expect(pickWeighted(['a', 'b'], [-1, Number.NaN], 0.5)).toBeNull();
  });
  it('never picks a zero-weight item and handles u at the top of the range', () => {
    expect(pickWeighted(['a', 'b', 'c'], [0, 1, 0], 0)).toBe('b');
    expect(pickWeighted(['a', 'b', 'c'], [0, 1, 0], 0.999999)).toBe('b');
    expect(pickWeighted(['a', 'b'], [1, 1], 0.999999999)).toBe('b');
    // A missing weight counts as zero.
    expect(pickWeighted(['a', 'b'], [1], 0.9)).toBe('a');
    // A NaN weight counts as zero and does not poison the rest.
    for (const u of [0, 0.5, 0.999]) expect(pickWeighted(['a', 'b'], [1, Number.NaN], u)).toBe('a');
  });
  it('picks in proportion to weight', () => {
    const rnd = mulberry32(7);
    const counts = { a: 0, b: 0, c: 0 };
    const N = 30_000;
    for (let i = 0; i < N; i++) {
      const got = pickWeighted(['a', 'b', 'c'] as const, [1, 2, 7], rnd());
      if (got) counts[got]++;
    }
    expect(counts.a / N).toBeCloseTo(0.1, 1);
    expect(counts.b / N).toBeCloseTo(0.2, 1);
    expect(counts.c / N).toBeCloseTo(0.7, 1);
  });
});

describe('announcement comment rate', () => {
  it('peaks plus floor at 0h, decays to the floor, zero outside the window', () => {
    expect(announcementCommentsPerHour(0)).toBeCloseTo(
      ANNOUNCEMENT_COMMENT_PEAK_PER_H + ANNOUNCEMENT_COMMENT_FLOOR_PER_H,
    );
    expect(announcementCommentsPerHour(ANNOUNCEMENT_COMMENT_TAU_H)).toBeCloseTo(
      ANNOUNCEMENT_COMMENT_FLOOR_PER_H + ANNOUNCEMENT_COMMENT_PEAK_PER_H / Math.E,
    );
    expect(announcementCommentsPerHour(ANNOUNCEMENT_REACTION_WINDOW_H)).toBeCloseTo(
      ANNOUNCEMENT_COMMENT_FLOOR_PER_H,
      3,
    );
    expect(announcementCommentsPerHour(ANNOUNCEMENT_REACTION_WINDOW_H + 0.01)).toBe(0);
    expect(announcementCommentsPerHour(-1)).toBe(0);
    expect(announcementCommentsPerHour(Number.NaN)).toBe(0);
  });
  it('per tick is the hourly rate times the tick length; a negative tick is none', () => {
    expect(announcementCommentsPerTick(0, HOUR / 2)).toBeCloseTo(
      announcementCommentsPerHour(0) / 2,
    );
    expect(announcementCommentsPerTick(0, -5)).toBe(0);
  });
});

describe('samplePoisson', () => {
  it('a non-positive or non-finite mean draws nothing', () => {
    const rnd = () => 0.5;
    expect(samplePoisson(0, rnd)).toBe(0);
    expect(samplePoisson(-2, rnd)).toBe(0);
    expect(samplePoisson(Number.NaN, rnd)).toBe(0);
    expect(samplePoisson(Number.POSITIVE_INFINITY, rnd)).toBe(0);
  });
  it('the sample mean matches lambda over many seeded draws', () => {
    for (const [lambda, seed] of [
      [0.5, 1],
      [2, 2],
      [6, 3],
    ] as const) {
      const rnd = mulberry32(seed);
      const N = 20_000;
      let total = 0;
      for (let i = 0; i < N; i++) total += samplePoisson(lambda, rnd);
      // Standard error is sqrt(lambda / N); allow ~5 of them.
      expect(Math.abs(total / N - lambda)).toBeLessThan(5 * Math.sqrt(lambda / N));
    }
  });
  it('is capped, whatever the mean or the draws', () => {
    expect(samplePoisson(1000, () => 0.999999)).toBe(20);
    expect(samplePoisson(1000, () => 0.999999, 5)).toBe(5);
    const rnd = mulberry32(9);
    for (let i = 0; i < 500; i++) expect(samplePoisson(25, rnd, 8)).toBeLessThanOrEqual(8);
  });
});
