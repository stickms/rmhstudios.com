/**
 * The invite page must never claim membership for someone who is not a member:
 * on a PUBLIC community any `/invite/<anything>` URL used to answer "You're
 * already in" to an anonymous visitor.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ getCommunity: vi.fn(), isInviteUsable: vi.fn() }));
vi.mock('@/lib/community.server', () => ({ getCommunity: h.getCommunity }));
vi.mock('@/lib/communities/invites.server', () => ({ isInviteUsable: h.isInviteUsable }));
const rl = vi.hoisted(() => ({ check: vi.fn() }));
vi.mock('@/lib/rate-limit.server', () => ({
  checkRateLimit: rl.check,
  getClientIp: () => '1.2.3.4',
}));

import { getInvitePreview } from '@/lib/communities/invite-preview.server';

const CODE = 'x'.repeat(32);
const req = new Request('http://x');

beforeEach(() => {
  h.getCommunity.mockReset();
  h.isInviteUsable.mockReset();
  rl.check.mockReset().mockResolvedValue({ allowed: true });
});

describe('getInvitePreview on a public community', () => {
  it('anonymous visitor and signed-in non-member: generic invalid, never "member"', async () => {
    h.getCommunity.mockResolvedValue({ id: 'c', slug: 'pub', locked: false, joined: false });
    expect(await getInvitePreview(req, 'pub', CODE, null)).toEqual({ state: 'invalid' });
    expect(await getInvitePreview(req, 'pub', CODE, 'stranger')).toEqual({ state: 'invalid' });
  });

  it('an actual member may still see "already in"', async () => {
    h.getCommunity.mockResolvedValue({ id: 'c', slug: 'pub', locked: false, joined: true });
    expect(await getInvitePreview(req, 'pub', CODE, 'me')).toEqual({ state: 'member', slug: 'pub' });
  });
});

describe('getInvitePreview on a private community', () => {
  const LOCKED = { id: 'c1', slug: 'priv', locked: true, joined: false, name: 'Secret' };

  it('a usable code shows the locked preview', async () => {
    h.getCommunity.mockResolvedValue(LOCKED);
    h.isInviteUsable.mockResolvedValue(true);
    expect(await getInvitePreview(req, 'priv', CODE, null)).toEqual({
      state: 'valid',
      community: LOCKED,
    });
    expect(h.isInviteUsable).toHaveBeenCalledWith('c1', CODE);
  });

  it.each(['revoked', 'expired', 'exhausted', 'unknown'])(
    'a %s code is the generic invalid state, never the community',
    async () => {
      h.getCommunity.mockResolvedValue(LOCKED);
      h.isInviteUsable.mockResolvedValue(false); // the query excludes all four the same way
      expect(await getInvitePreview(req, 'priv', CODE, 'someone')).toEqual({ state: 'invalid' });
    },
  );

  it('a missing community is the same generic invalid state', async () => {
    h.getCommunity.mockResolvedValue(null);
    expect(await getInvitePreview(req, 'nope', CODE, null)).toEqual({ state: 'invalid' });
    expect(h.isInviteUsable).not.toHaveBeenCalled();
  });

  it('is rate limited per IP: over the limit answers invalid without any lookup', async () => {
    rl.check.mockResolvedValue({ allowed: false });
    expect(await getInvitePreview(req, 'priv', CODE, null)).toEqual({ state: 'invalid' });
    expect(rl.check).toHaveBeenCalledWith(
      '1.2.3.4',
      expect.objectContaining({ limit: 30, windowMs: 60_000, prefix: 'community-invite-page' }),
    );
    expect(h.getCommunity).not.toHaveBeenCalled();
    expect(h.isInviteUsable).not.toHaveBeenCalled();
  });

  it('length guard: codes under 16 or over 64 chars never reach the database', async () => {
    for (const code of ['x'.repeat(15), 'x'.repeat(65), '']) {
      expect(await getInvitePreview(req, 'priv', code, null)).toEqual({ state: 'invalid' });
    }
    expect(h.getCommunity).not.toHaveBeenCalled();
    // the boundaries themselves are accepted
    h.getCommunity.mockResolvedValue(LOCKED);
    h.isInviteUsable.mockResolvedValue(true);
    for (const code of ['x'.repeat(16), 'x'.repeat(64)]) {
      expect((await getInvitePreview(req, 'priv', code, null)).state).toBe('valid');
    }
  });
});
