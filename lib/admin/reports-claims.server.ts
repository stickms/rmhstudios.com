/**
 * Who else claims the websites a reported account claims (sprint 14, feature 09): the evidence an impersonation
 * investigation turns on. Admin only (the one caller is `GET /api/admin/reports/claims`).
 */
import { prisma } from '@/lib/prisma.server';
import { accountsClaimingHost } from '@/lib/profile-links/links.server';
import type { ClaimedHost } from '@/lib/admin/reports-claims.contract';

/** Hosts shown per account, and other accounts shown per host. */
export const MAX_CLAIMED_HOSTS = 10;
export const MAX_OTHER_CLAIMANTS = 10;

export async function claimsForAccount(userId: string): Promise<ClaimedHost[]> {
  // `host` is optional on the row (a link that is not a web address has none), so those are left out here.
  const links = await prisma.profileLink.findMany({
    where: { userId, host: { not: null } },
    orderBy: [{ verifiedAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'asc' }],
    take: 50,
    select: { host: true, verifiedAt: true },
  });

  // One entry per host; the account's own claim is verified when any of its links to that host is.
  const own = new Map<string, boolean>();
  for (const link of links) {
    if (!link.host) continue;
    own.set(link.host, (own.get(link.host) ?? false) || link.verifiedAt !== null);
  }

  const hosts = [...own].slice(0, MAX_CLAIMED_HOSTS);
  return Promise.all(
    hosts.map(async ([host, verified]) => {
      // One more than shown, so that the reported account's own row never costs another account its place.
      const claims = await accountsClaimingHost(host, MAX_OTHER_CLAIMANTS + 1);
      const seen = new Set<string>([userId]);
      const others: ClaimedHost['others'] = [];
      for (const claim of claims) {
        if (seen.has(claim.userId)) continue;
        seen.add(claim.userId);
        others.push({
          userId: claim.userId,
          handle: claim.handle,
          name: claim.name,
          verified: claim.verifiedAt !== null,
        });
        if (others.length === MAX_OTHER_CLAIMANTS) break;
      }
      return { host, verified, others };
    }),
  );
}
