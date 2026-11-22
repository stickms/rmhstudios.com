/**
 * Who may read and write a community's wiki pages (s09-04, server-only): the one helper every path calls.
 *
 * The list, one page, its history, create, edit, rollback and delete all ask `pageAccess` and nothing else, so
 * privacy, a community ban, a timeout and a site ban cannot be checked on one path and forgotten on the next.
 *
 *  - a private community's pages are for its members: anyone else reads a 404 (as for a missing community);
 *  - a member banned from the community reads like a non-member (a 404 in a private community) and cannot write;
 *  - a timed-out member reads and cannot write until the timeout ends;
 *  - a site ban refuses writes, as the composer does.
 *
 * Whether the viewer's role lets them edit *this page* (`editPolicy`) is a separate question, `canEditPage`.
 */
import { prisma } from '@/lib/prisma.server';
import { activeSanction } from '@/lib/communities/bans.server';
import type { CommunityRole } from '@/lib/communities/page-policy';

/** Why a viewer cannot write to the wiki at all, whatever a page's policy says. */
export type WriteRefusal =
  | { reason: 'SIGNED_OUT' }
  | { reason: 'SITE_BANNED' }
  | { reason: 'COMMUNITY_BANNED'; endsAt: Date | null }
  | { reason: 'TIMED_OUT'; endsAt: Date | null };

export interface PageAccess {
  communityId: string;
  isPrivate: boolean;
  role: CommunityRole | null;
  /** Whether the viewer may see the community's pages. `false` is a 404, never a 403. */
  read: boolean;
  /** `null` when writing is open to this viewer (the page's own policy still applies). */
  writeRefusal: WriteRefusal | null;
}

/**
 * Resolve a viewer's access to one community's wiki. `null` when the community does not exist.
 * A site admin reads everything and is never refused by a community sanction.
 */
export async function pageAccess(
  communityId: string,
  viewerId: string | null,
  isSiteAdmin = false,
  now: Date = new Date(),
): Promise<PageAccess | null> {
  const community = await prisma.community.findUnique({
    where: { id: communityId },
    select: { id: true, isPrivate: true },
  });
  if (!community) return null;

  if (!viewerId) {
    return {
      communityId,
      isPrivate: community.isPrivate,
      role: null,
      read: !community.isPrivate,
      writeRefusal: { reason: 'SIGNED_OUT' },
    };
  }

  const [member, sanction, account] = await Promise.all([
    prisma.communityMember.findUnique({
      where: { communityId_userId: { communityId, userId: viewerId } },
      select: { role: true },
    }),
    isSiteAdmin ? Promise.resolve(null) : activeSanction(communityId, viewerId, now),
    prisma.user.findUnique({ where: { id: viewerId }, select: { bannedUntil: true } }),
  ]);

  const role = (member?.role as CommunityRole | undefined) ?? null;
  const banned = sanction?.kind === 'ban';
  const read = isSiteAdmin || !community.isPrivate || (role !== null && !banned);

  let writeRefusal: WriteRefusal | null = null;
  if (account?.bannedUntil && account.bannedUntil.getTime() > now.getTime()) {
    writeRefusal = { reason: 'SITE_BANNED' };
  } else if (sanction?.kind === 'ban') {
    writeRefusal = { reason: 'COMMUNITY_BANNED', endsAt: sanction.endsAt };
  } else if (sanction?.kind === 'timeout') {
    writeRefusal = { reason: 'TIMED_OUT', endsAt: sanction.endsAt };
  }

  return { communityId, isPrivate: community.isPrivate, role, read, writeRefusal };
}

/** What the wiki routes need to know about a community they were asked for by slug or id. */
export interface WikiCommunity {
  id: string;
  slug: string;
  name: string;
  icon: string | null;
  isPrivate: boolean;
}

/**
 * The community a wiki request names, with the viewer's access, or `null` when it does not exist or the viewer may
 * not read it (the same 404 for both, so a private community's existence is not confirmed).
 */
export async function resolveWikiCommunity(
  by: { slug: string } | { id: string },
  viewerId: string | null,
  isSiteAdmin = false,
): Promise<{ community: WikiCommunity; access: PageAccess } | null> {
  const community = await prisma.community.findUnique({
    where: 'slug' in by ? { slug: by.slug } : { id: by.id },
    select: { id: true, slug: true, name: true, icon: true, isPrivate: true },
  });
  if (!community) return null;
  const access = await pageAccess(community.id, viewerId, isSiteAdmin);
  if (!access?.read) return null;
  return { community, access };
}

/** The JSON body of a refused write: the machine `code` and `endsAt` the sanction notices already read. */
export function refusalBody(
  refusal: WriteRefusal,
  message: string,
): { error: string; code?: 'community_banned' | 'community_timed_out'; endsAt?: string | null } {
  if (refusal.reason === 'COMMUNITY_BANNED') {
    return { error: message, code: 'community_banned', endsAt: refusal.endsAt?.toISOString() ?? null };
  }
  if (refusal.reason === 'TIMED_OUT') {
    return { error: message, code: 'community_timed_out', endsAt: refusal.endsAt?.toISOString() ?? null };
  }
  return { error: message };
}

const STATUS_BY_CODE = {
  INVALID: 400,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
} as const;

/** The response a wiki service error becomes: its status, and for a sanction the `code` and `endsAt` too. */
export function pageErrorResponse(error: {
  message: string;
  code: keyof typeof STATUS_BY_CODE;
  refusal?: WriteRefusal | undefined;
}): Response {
  const body = error.refusal ? refusalBody(error.refusal, error.message) : { error: error.message };
  return Response.json(body, { status: STATUS_BY_CODE[error.code] });
}
