import { describe, expect, it } from 'vitest';
import { computeVerification, passesAlertGate } from './verification';

const good = {
  fetched: true, httpStatus: 200, apiSource: true, companyMatch: true, titleMatch: true,
  usConfirmed: true, applyPresent: true, reqIdPresent: true, closedLanguage: false,
  blocked: false, isSearchResultsPage: false,
  companyName: 'Stripe', jobTitle: 'Product Management Intern', locationLabel: 'New York, NY',
  platform: 'greenhouse',
};

describe('computeVerification', () => {
  it('API source with full evidence → verified_active, high confidence, readable evidence', () => {
    const r = computeVerification(good);
    expect(r.status).toBe('verified_active');
    expect(r.confidence).toBeGreaterThanOrEqual(85);
    expect(r.evidence).toContain('Stripe');
    expect(r.evidence).toContain('Product Management Intern');
  });
  it('HTML-verified without req id → verified_probable band', () => {
    const r = computeVerification({ ...good, apiSource: false, reqIdPresent: false });
    expect(['verified_probable', 'verified_active']).toContain(r.status);
    expect(r.confidence).toBeGreaterThanOrEqual(60);
  });
  it('closed language → expired regardless of other evidence', () => {
    expect(computeVerification({ ...good, closedLanguage: true }).status).toBe('expired');
  });
  it('blocked page → blocked_or_inaccessible', () => {
    const r = computeVerification({ ...good, blocked: true, fetched: false });
    expect(r.status).toBe('blocked_or_inaccessible');
    expect(r.evidence).toContain('Stripe');
    expect(r.evidence).toContain('Product Management Intern');
  });
  it('fetch failure → broken_link', () => {
    expect(computeVerification({ ...good, fetched: false, httpStatus: 404, apiSource: false }).status).toBe('broken_link');
  });
  it('search results page → needs_manual_review', () => {
    expect(computeVerification({ ...good, isSearchResultsPage: true }).status).toBe('needs_manual_review');
  });
  it('weak evidence → needs_manual_review', () => {
    const r = computeVerification({ ...good, apiSource: false, titleMatch: false, applyPresent: false, reqIdPresent: false });
    expect(r.status).toBe('needs_manual_review');
    expect(r.confidence).toBeLessThan(60);
  });
});

describe('passesAlertGate', () => {
  const ok = { status: 'verified_active', confidence: 90, isUS: true, earlyCareer: 'yes' as const,
               finalRelevance: 75, userThreshold: 60, alreadyAlerted: false, blockedKeyword: false };
  it('passes the happy path', () => expect(passesAlertGate(ok)).toBe(true));
  it.each([
    ['unverified status', { ...ok, status: 'unverified' }],
    ['low confidence', { ...ok, confidence: 74 }],
    ['non-US', { ...ok, isUS: false }],
    ['not early-career', { ...ok, earlyCareer: 'no' as const }],
    ['below threshold', { ...ok, finalRelevance: 59 }],
    ['duplicate alert', { ...ok, alreadyAlerted: true }],
    ['blocked keyword', { ...ok, blockedKeyword: true }],
  ])('fails on %s', (_label, args) => expect(passesAlertGate(args)).toBe(false));
});
