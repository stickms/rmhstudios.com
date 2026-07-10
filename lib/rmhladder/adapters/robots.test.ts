import { describe, expect, it } from 'vitest';
import { isPathAllowed } from './robots';

const robots = `
User-agent: *
Disallow: /admin/
Allow: /admin/jobs/

User-agent: rmhladder-bot
Disallow: /private/
`;

describe('isPathAllowed', () => {
  it('specific UA group wins over *', () => {
    expect(isPathAllowed(robots, 'rmhladder-bot/0.1', '/admin/anything')).toBe(true);
    expect(isPathAllowed(robots, 'rmhladder-bot/0.1', '/private/x')).toBe(false);
  });
  it('falls back to * group', () => {
    expect(isPathAllowed(robots, 'otherbot', '/admin/secret')).toBe(false);
    expect(isPathAllowed(robots, 'otherbot', '/careers/123')).toBe(true);
  });
  it('longest prefix wins: Allow overrides Disallow', () => {
    expect(isPathAllowed(robots, 'otherbot', '/admin/jobs/456')).toBe(true);
  });
  it('empty robots allows everything', () => {
    expect(isPathAllowed('', 'anybot', '/x')).toBe(true);
  });
  it('wildcard in Disallow matches prefix up to *', () => {
    const r = `User-agent: *\nDisallow: /careers/*`;
    expect(isPathAllowed(r, 'bot', '/careers/x')).toBe(false);
    expect(isPathAllowed(r, 'bot', '/careers/jobs/123')).toBe(false);
    expect(isPathAllowed(r, 'bot', '/other')).toBe(true);
  });
  it('wildcard: Allow wins by effective prefix length', () => {
    const r = `User-agent: *\nAllow: /careers/jobs*\nDisallow: /careers/`;
    expect(isPathAllowed(r, 'bot', '/careers/jobs123')).toBe(true);
    expect(isPathAllowed(r, 'bot', '/careers/other')).toBe(false);
  });
  it('* before $ truncates at *', () => {
    const r = `User-agent: *\nDisallow: /jobs/*/apply$`;
    expect(isPathAllowed(r, 'bot', '/jobs/123/apply')).toBe(false);
    expect(isPathAllowed(r, 'bot', '/jobs/123/applyextra')).toBe(false);
    expect(isPathAllowed(r, 'bot', '/other/jobs/apply')).toBe(true);
  });
  it('bare Disallow: * blocks everything for the matched agent', () => {
    const r = 'User-agent: rmhladder-bot\nDisallow: *\n\nUser-agent: *\nDisallow:';
    expect(isPathAllowed(r, 'rmhladder-bot/0.1', '/anything')).toBe(false);
    expect(isPathAllowed(r, 'otherbot', '/anything')).toBe(true);
  });
  it('pure $ rule matches on its literal prefix', () => {
    expect(isPathAllowed('User-agent: *\nDisallow: /done$', 'anybot', '/done-deal')).toBe(false);
    expect(isPathAllowed('User-agent: *\nDisallow: /done$', 'anybot', '/careers')).toBe(true);
  });
});
