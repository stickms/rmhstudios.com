import { DELETED_USER_ID } from '@/lib/account/deleted-user';
import { prisma } from '@/lib/prisma.server';

/**
 * Erasure of the models that hold a member's id in a plain column (sprint 14 18). Account deletion anonymises the
 * `User` row in place, so no foreign key cascades or nulls these: the models have no relation to `User`, and the
 * relation registry's coverage test cannot see them either. `PLAIN_MEMBER_COLUMNS` (`erasure-registry.ts`) classifies
 * every one; the operations below are the ones that were missing. The rest are carried out where they always were
 * (`deletion.server.ts`, `erasure-games.server.ts`, `events/updates.server.ts`, …) and named in that registry.
 *
 * Prisma operations only, one statement per table, each filtered on the member's id in the column the registry names
 * and never on another member's row, so the order is free and a second run matches nothing.
 *
 * - A column that is optional is set to `null`.
 * - A column that is required takes `DELETED_USER_ID`, the shared "Deleted user" account, as the follow log does. None of
 *   these columns is part of a unique key, so two rows with the same tombstone cannot collide.
 */
export function plainColumnErasureOps(userId: string) {
  return [
    // The security record stays; nothing in it names the member (the title, text and status are the report).
    prisma.securityReport.updateMany({
      where: { userId },
      data: { userId: null, reporterName: null, reporterEmail: null, ipHash: null },
    }),

    // The member's own "removed from this chat" marks.
    prisma.chatRemoval.deleteMany({ where: { userId } }),

    // Who first reported a Doctrine incident.
    prisma.doctrineIncident.updateMany({ where: { firstReporterId: userId }, data: { firstReporterId: null } }),

    // The winner of a match; the other players' rows and the "Deleted user" name on the member's own row are
    // `gameProgressErasureOps`.
    prisma.rMHboxMatch.updateMany({ where: { winnerUserId: userId }, data: { winnerUserId: null } }),
    prisma.rmhTypeMatch.updateMany({ where: { winnerUserId: userId }, data: { winnerUserId: null } }),

    // Content that moderators and staff made and the site keeps: required columns take the deleted-user id.
    prisma.communityChallenge.updateMany({ where: { createdById: userId }, data: { createdById: DELETED_USER_ID } }),
    prisma.communityCensus.updateMany({ where: { createdById: userId }, data: { createdById: DELETED_USER_ID } }),
    prisma.modMacro.updateMany({ where: { createdById: userId }, data: { createdById: DELETED_USER_ID } }),
    prisma.communityGoal.updateMany({ where: { createdById: userId }, data: { createdById: DELETED_USER_ID } }),
    prisma.canvasEvent.updateMany({ where: { createdById: userId }, data: { createdById: DELETED_USER_ID } }),
    prisma.studioChallenge.updateMany({ where: { createdById: userId }, data: { createdById: DELETED_USER_ID } }),
    prisma.linkDomainRule.updateMany({ where: { addedById: userId }, data: { addedById: DELETED_USER_ID } }),

    // The same, where the column is optional.
    prisma.targetedNotice.updateMany({ where: { createdById: userId }, data: { createdById: null } }),
    prisma.ladderReviewTask.updateMany({ where: { resolvedById: userId }, data: { resolvedById: null } }),
    prisma.botWorkerSettings.updateMany({ where: { updatedById: userId }, data: { updatedById: null } }),
  ];
}

/**
 * A security report sent while signed out carries the reporter's name and address with `userId` null, so the
 * by-id operation above cannot find it (s15-20, S14-18). Rows with no `userId` whose `reporterEmail` is the account's
 * address, compared case-insensitively, lose the name, the address and the IP hash; the title, text and status stay.
 *
 * `accountEmail` is read before the transaction, because the profile scrub inside it removes the address. No address
 * (the account had none, or an earlier run already scrubbed it) is no operation: a blank value must never match the
 * reports that were sent with no address at all.
 */
export function securityReportEmailErasureOps(accountEmail: string | null) {
  const email = accountEmail?.trim();
  if (!email) return [];
  return [
    prisma.securityReport.updateMany({
      where: { userId: null, reporterEmail: { equals: email, mode: 'insensitive' } },
      data: { reporterName: null, reporterEmail: null, ipHash: null },
    }),
  ];
}
