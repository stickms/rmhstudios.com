import { describe, expect, it } from 'vitest';
import { computeBaseScore, computeUserBoost, finalRelevance } from './scoring';

const base = {
  programType: 'summer_analyst' as const,
  roleCategory: 'investment_banking',
  industry: 'Investment Banking',
  isUS: true,
  remoteStatus: 'onsite' as const,
  city: 'New York',
  postingDate: new Date('2026-07-03'),
  applicationDeadline: new Date('2026-07-15'),
  companyPriority: 1,
  companyIsTarget: true,
  title: 'Investment Banking Summer Analyst 2027',
};
const NOW = new Date('2026-07-05');

describe('computeBaseScore', () => {
  it('stacks program, industry, US, target-firm, recency, deadline weights', () => {
    const { score, urgencyFlag } = computeBaseScore(base, NOW);
    // US 20 + summer_analyst 30 + IB 30 + target 20 + recent 15 + deadline 10 = 125 → clamped 100 by caller
    expect(score).toBe(125);
    expect(urgencyFlag).toBe(true);
  });
  it('remote US gets +15 instead of +20', () => {
    const a = computeBaseScore({ ...base, isUS: true, remoteStatus: 'remote_us' }, NOW).score;
    const b = computeBaseScore({ ...base, isUS: true, remoteStatus: 'onsite' }, NOW).score;
    expect(b - a).toBe(5);
  });
  it('senior title terms subtract', () => {
    const r = computeBaseScore({ ...base, title: 'Senior Director, Strategy', programType: 'other', industry: null, companyIsTarget: false, postingDate: null, applicationDeadline: null }, NOW);
    expect(r.score).toBeLessThan(25);
  });
  it('no deadline → no urgency flag', () => {
    expect(computeBaseScore({ ...base, applicationDeadline: null }, NOW).urgencyFlag).toBe(false);
  });
});

describe('computeUserBoost', () => {
  const ctx = {
    keywords: [
      { keyword: 'investment banking', weight: 15, type: 'boost' as const },
      { keyword: 'crypto', weight: 0, type: 'block' as const },
    ],
    watchlistCompanyIds: new Set(['c1']),
    companyId: 'c1',
    preferredCities: ['New York'],
  };
  it('adds keyword, watchlist, and city boosts and reports matches', () => {
    const r = computeUserBoost(base, ctx);
    expect(r.boost).toBe(15 + 20 + 10);
    expect(r.matched).toContain('investment banking');
    expect(r.blocked).toBe(false);
  });
  it('block keyword disqualifies', () => {
    const r = computeUserBoost({ ...base, title: 'Crypto Analyst Intern' }, ctx);
    expect(r.blocked).toBe(true);
  });
});

describe('finalRelevance', () => {
  it('clamps base + boost into 0-100', () => {
    expect(finalRelevance(125, 45)).toBe(100);
    expect(finalRelevance(30, 20)).toBe(50);
    expect(finalRelevance(0, -10)).toBe(0);
  });
});
