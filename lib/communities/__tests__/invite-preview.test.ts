/**
 * The invite page must never claim membership for someone who is not a member:
 * on a PUBLIC community any `/invite/<anything>` URL used to answer "You're
 * already in" to an anonymous visitor.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ getCommunity: vi.fn(), isInviteUsable: vi.fn() }));
vi.mock('@/lib/community.server', () => ({ getCommunity: h.getCommunity }));
vi.mock('@/lib/communities/invites.server', () => ({ isInviteUsable: h.isInviteUsable }));
vi.mock('@/lib/rate-limit.server', () => ({
  checkRateLimit: async () => ({ allowed: true }),
  getClientIp: () => '1.2.3.4',
}));

import { getInvitePreview } from '@/lib/communities/invite-preview.server';

const CODE = 'x'.repeat(32);
const req = new Request('http://x');

beforeEach(() => {
  h.getCommunity.mockReset();
  h.isInviteUsable.mockReset();
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
