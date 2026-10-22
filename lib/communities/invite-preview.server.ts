/**
 * The invite page's data (server-only): the locked preview of the community plus
 * whether `code` can be used. An invalid code answers with the same generic
 * result whatever is wrong with it, and the lookup is rate-limited per IP so the
 * page cannot be used to probe codes.
 */
import { getCommunity, type CommunityDetail } from '@/lib/community.server';
import { isInviteUsable } from '@/lib/communities/invites.server';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit.server';

export type InvitePreview =
  | { state: 'invalid' }
  /** Already inside (or the community is open): nothing to accept. */
  | { state: 'member'; slug: string }
  | { state: 'valid'; community: CommunityDetail };

export async function getInvitePreview(
  request: Request,
  slug: string,
  code: string,
  viewerId: string | null,
): Promise<InvitePreview> {
  const { allowed } = await checkRateLimit(getClientIp(request), {
    limit: 30,
    windowMs: 60_000,
    prefix: 'community-invite-page',
  });
  if (!allowed || code.length < 16 || code.length > 64) return { state: 'invalid' };

  const community = await getCommunity(slug, viewerId);
  if (!community) return { state: 'invalid' };
  if (!community.locked) return { state: 'member', slug: community.slug };
  if (!(await isInviteUsable(community.id, code))) return { state: 'invalid' };
  return { state: 'valid', community };
}
