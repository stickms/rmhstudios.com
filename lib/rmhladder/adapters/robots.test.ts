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
});
