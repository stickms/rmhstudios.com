import { describe, expect, it } from 'vitest';
import {
  automodConditionsSchema,
  derivePostKind,
  evaluateAutomod,
  extractLinkHosts,
  normalizeDomain,
  type AutomodContext,
  type AutomodRule,
} from '@/lib/communities/automod';

const ctx = (over: Partial<AutomodContext> = {}): AutomodContext => ({
  target: 'post',
  text: 'hello world',
  postKind: 'text',
  accountAgeDays: 100,
  hasAvatar: true,
  ...over,
});

const rule = (over: Partial<AutomodRule> & Pick<AutomodRule, 'conditions'>): AutomodRule => ({
  id: over.id ?? 'r1',
  name: over.name ?? 'Rule',
  enabled: true,
  appliesTo: 'both',
  action: 'flag',
  ...over,
});

describe('evaluateAutomod', () => {
  it('returns null with no rules or no match', () => {
    expect(evaluateAutomod([], ctx())).toBeNull();
    expect(evaluateAutomod([rule({ conditions: { keywords: ['spam'] } })], ctx())).toBeNull();
  });

  it('ANDs the conditions inside one rule', () => {
    const r = rule({ conditions: { accountAgeLtDays: 7, keywords: ['buy'] }, action: 'hold' });
    expect(evaluateAutomod([r], ctx({ text: 'buy now', accountAgeDays: 2 }))?.action).toBe('hold');
    expect(evaluateAutomod([r], ctx({ text: 'buy now', accountAgeDays: 30 }))).toBeNull();
    expect(evaluateAutomod([r], ctx({ text: 'hi', accountAgeDays: 2 }))).toBeNull();
  });

  it('matches keywords case- and accent-insensitively', () => {
    const r = rule({ conditions: { keywords: ['Café'] } });
    expect(evaluateAutomod([r], ctx({ text: 'Best CAFE in town' }))).not.toBeNull();
  });

  it('matches link domains including subdomains, not look-alikes', () => {
    const r = rule({ conditions: { linkDomains: ['bad.com'] } });
    expect(evaluateAutomod([r], ctx({ text: 'see https://www.bad.com/x' }))).not.toBeNull();
    expect(evaluateAutomod([r], ctx({ text: 'see https://cdn.bad.com/x' }))).not.toBeNull();
    expect(evaluateAutomod([r], ctx({ text: 'see https://notbad.com/x' }))).toBeNull();
    expect(evaluateAutomod([r], ctx({ text: 'see https://bad.com.evil.io' }))).toBeNull();
    expect(evaluateAutomod([r], ctx({ text: 'no links here' }))).toBeNull();
  });

  it('matches post kind and no-avatar', () => {
    const kind = rule({ conditions: { postKinds: ['image', 'gif'] } });
    expect(evaluateAutomod([kind], ctx({ postKind: 'gif' }))).not.toBeNull();
    expect(evaluateAutomod([kind], ctx({ postKind: 'text' }))).toBeNull();
    const av = rule({ conditions: { noAvatar: true } });
    expect(evaluateAutomod([av], ctx({ hasAvatar: false }))).not.toBeNull();
    expect(evaluateAutomod([av], ctx({ hasAvatar: true }))).toBeNull();
  });

  it('most severe action wins: remove > hold > flag', () => {
    const rules = [
      rule({ id: 'a', name: 'A', action: 'flag', conditions: { keywords: ['x'] } }),
      rule({ id: 'b', name: 'B', action: 'remove', conditions: { keywords: ['x'] } }),
      rule({ id: 'c', name: 'C', action: 'hold', conditions: { keywords: ['x'] } }),
    ];
    const v = evaluateAutomod(rules, ctx({ text: 'x' }));
    expect(v?.action).toBe('remove');
    expect(v?.rule.id).toBe('b');
    expect(v?.matched).toEqual(['A', 'B', 'C']);
  });

  it('skips disabled rules and respects appliesTo', () => {
    const off = rule({ enabled: false, conditions: { keywords: ['x'] } });
    expect(evaluateAutomod([off], ctx({ text: 'x' }))).toBeNull();
    const postsOnly = rule({ appliesTo: 'posts', conditions: { keywords: ['x'] } });
    expect(evaluateAutomod([postsOnly], ctx({ text: 'x', target: 'comment' }))).toBeNull();
    const commentsOnly = rule({ appliesTo: 'comments', conditions: { keywords: ['x'] } });
    expect(evaluateAutomod([commentsOnly], ctx({ text: 'x', target: 'comment' }))).not.toBeNull();
  });

  it('never throws on hostile text', () => {
    const r = rule({ conditions: { keywords: ['a'], linkDomains: ['a.com'] } });
    expect(() =>
      evaluateAutomod([r], ctx({ text: '\u0000'.repeat(10_000) + 'http://' })),
    ).not.toThrow();
  });
});

describe('helpers', () => {
  it('normalizes domains', () => {
    expect(normalizeDomain('https://WWW.Example.com/path?q=1')).toBe('example.com');
    expect(normalizeDomain('example.com:8080')).toBe('example.com');
    expect(normalizeDomain('not a domain!')).toBe('');
  });
  it('extracts hosts and strips trailing punctuation', () => {
    expect(extractLinkHosts('go to https://a.com/x, or www.b.org.')).toEqual(['a.com', 'b.org']);
  });
  it('derives post kinds most-specific first', () => {
    expect(derivePostKind({ hasPoll: true, imageUrls: ['x'] })).toBe('poll');
    expect(derivePostKind({ isQuote: true })).toBe('quote');
    expect(derivePostKind({ imageUrls: ['x'] })).toBe('image');
    expect(derivePostKind({ gifUrl: 'x' })).toBe('gif');
    expect(derivePostKind({ content: 'see https://a.com' })).toBe('link');
    expect(derivePostKind({ content: 'hi' })).toBe('text');
  });
  it('refuses a rule with no condition', () => {
    expect(automodConditionsSchema.safeParse({}).success).toBe(false);
    expect(automodConditionsSchema.safeParse({ keywords: ['a'] }).success).toBe(true);
  });
});
