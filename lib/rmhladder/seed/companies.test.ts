// lib/rmhladder/seed/companies.test.ts
import { describe, expect, it } from 'vitest';
import { normalizeCompanyName } from '../normalize';
import { MANUAL_EARLY_CAREER_URLS, SEED_COMPANIES } from './companies';

describe('SEED_COMPANIES', () => {
  it('has 300+ firms across all firm types', () => {
    expect(SEED_COMPANIES.length).toBeGreaterThanOrEqual(300);
    const types = new Set(SEED_COMPANIES.map((c) => c.firmType));
    for (const t of ['bulge_bracket', 'elite_boutique', 'middle_market', 'private_equity', 'venture_capital', 'asset_manager', 'hedge_fund_trading', 'consulting', 'technology', 'fintech_data', 'corporate']) {
      expect(types).toContain(t);
    }
  });
  it('normalized names are unique (no dedupe collisions in seed)', () => {
    const normalized = SEED_COMPANIES.map((c) => normalizeCompanyName(c.name));
    const dupes = normalized.filter((n, i) => normalized.indexOf(n) !== i);
    expect(dupes).toEqual([]);
  });
  it('every manual URL belongs to a seeded company', () => {
    const names = new Set(SEED_COMPANIES.map((c) => c.name));
    for (const key of Object.keys(MANUAL_EARLY_CAREER_URLS)) expect(names).toContain(key);
  });
  it('all URLs are https', () => {
    for (const url of Object.values(MANUAL_EARLY_CAREER_URLS)) expect(url).toMatch(/^https:\/\//);
  });
});
