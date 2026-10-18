import { describe, expect, it } from 'vitest';
import { hostAndParents, hostOfUrl, isTrusted } from '../link-risk';
import { renderMacro } from '../macros';
import { RoomSlowMode } from '../../../server/shared/room-slow-mode';

describe('link-risk helpers', () => {
  it('only treats http(s) URLs as links', () => {
    expect(hostOfUrl('javascript:alert(1)')).toBeNull();
    expect(hostOfUrl('https://www.Evil.com/x')).toBe('evil.com');
  });
  it('matches parent domains for rules and the trusted list', () => {
    expect(hostAndParents('a.b.evil.com')).toEqual(['a.b.evil.com', 'b.evil.com', 'evil.com']);
    expect(isTrusted('m.youtube.com')).toBe(true);
    expect(isTrusted('notyoutube.com')).toBe(false);
  });
});

describe('renderMacro', () => {
  it('fills known variables and falls back when empty', () => {
    expect(renderMacro('Hi {{user}}: {{ reason }}', { user: 'sam', reason: 'spam' })).toBe(
      'Hi sam: spam',
    );
    expect(renderMacro('Hi {{user}}', {})).toBe('Hi there');
  });
});

describe('RoomSlowMode', () => {
  it('rejects inside the host cooldown, exempts the host, rejects unknown choices', async () => {
    const sm = new RoomSlowMode(async () => 0);
    expect(sm.setCooldown('r', 7)).toBeNull();
    expect(sm.setCooldown('r', 30)).toBe(30_000);
    const now = 1_000_000;
    expect((await sm.check('r', 'u1', false, now)).ok).toBe(true);
    const second = await sm.check('r', 'u1', false, now + 1);
    expect(second.ok).toBe(false);
    expect((await sm.check('r', 'host', true, now)).ok).toBe(true);
    expect((await sm.check('r', 'host', true, now + 1)).ok).toBe(true);
  });
});
