/**
 * Your reports (s03-16): the reports a member filed, as they may see them.
 *
 * - `listMyReports` returns only the caller's rows, only allow-listed columns, and builds each content label with
 *   the caller's current visibility of the content.
 * - `withdrawReport` takes back a PENDING report; the row stays for the reporter's history and leaves the admin
 *   queue (DISMISSED with `withdrawnAt`).
 * - `notifyReportersOfOutcome` tells each reporter once that their report was decided. The admin action and feature
 *   20's bulk decisions both call it after the status change.
 */

import { notice } from '@/lib/notifications/notice-keys';
import { prisma } from '@/lib/prisma.server';
import { getBlockedAuthorIds } from '@/lib/moderation.server';
import { partyPath } from '@/lib/rmhtube/parties';
import { createNotification } from '@/lib/notifications.server';
import { viewerVisiblePostWhere } from '@/lib/feed/audience.server';
import type { ReportEntityType, ReportReason } from '@/lib/moderation/report-schema';
import {
  MY_REPORTS_LINK,
  MY_REPORTS_PAGE_SIZE,
  REPORT_OUTCOME_ENTITY_TYPE,
  canWithdraw,
  outcomeOf,
  reporterStatus,
  snippet,
  statusWhere,
  unavailableTarget,
  windowStart,
  type MyReportsFilter,
  type ReportTarget,
} from '@/lib/moderation/my-reports';
import type { MyReport, MyReportsPage } from '@/lib/moderation/my-reports.contract';

type Row = { entityType: string; entityId: string };

const ids = (rows: Row[], type: string) => rows.filter((r) => r.entityType === type).map((r) => r.entityId);

/**
 * What the reporter may see of each reported thing, keyed `type:id`. A post, reply, build or profile that is gone,
 * hidden from them or blocked shows as unavailable (no text, no link); types with nothing safe to show (a direct
 * message, an upload, a score) show only their kind.
 */
async function targetsFor(viewerId: string, rows: Row[]): Promise<Map<string, ReportTarget>> {
  const out = new Map<string, ReportTarget>();
  const set = (kind: ReportEntityType, id: string, target: ReportTarget) => out.set(`${kind}:${id}`, target);

  const postIds = ids(rows, 'rmhark');
  if (postIds.length) {
    const visible = await viewerVisiblePostWhere(viewerId);
    const posts = await prisma.rMHark.findMany({
      where: { id: { in: postIds }, ...visible },
      select: { id: true, content: true },
    });
    for (const p of posts) {
      set('rmhark', p.id, {
        kind: 'rmhark',
        available: true,
        name: snippet(p.content) || null,
        href: `/thread/${p.id}`,
      });
    }
  }

  const commentIds = ids(rows, 'comment');
  if (commentIds.length) {
    const comments = await prisma.rMHarkComment.findMany({
      where: { id: { in: commentIds }, deletedAt: null, rmhark: await viewerVisiblePostWhere(viewerId) },
      select: { id: true, content: true, rmheetId: true },
    });
    for (const c of comments) {
      set('comment', c.id, {
        kind: 'comment',
        available: true,
        name: snippet(c.content) || null,
        href: `/thread/${c.rmheetId}`,
      });
    }
  }

  const userIds = ids(rows, 'user');
  const buildIds = ids(rows, 'build');
  const blocked = userIds.length || buildIds.length ? new Set(await getBlockedAuthorIds(viewerId)) : new Set<string>();
  if (userIds.length) {
    const users = await prisma.user.findMany({
      where: { id: { in: userIds.filter((id) => !blocked.has(id)) }, handle: { not: null } },
      select: { id: true, handle: true },
    });
    for (const u of users) {
      if (u.handle) {
        set('user', u.id, { kind: 'user', available: true, name: `@${u.handle}`, href: `/u/${u.handle}` });
      }
    }
  }

  if (buildIds.length) {
    const builds = await prisma.userBuild.findMany({
      where: {
        id: { in: buildIds },
        OR: [{ visibility: 'PUBLIC', userId: { notIn: [...blocked] } }, { userId: viewerId }],
      },
      select: { id: true, slug: true, title: true },
    });
    for (const b of builds) {
      set('build', b.id, { kind: 'build', available: true, name: snippet(b.title), href: `/builds/${b.slug}` });
    }
  }

  // Sprint 11 (docs/autonomous/sprint-11/plan.md §Anchors)
  // s11-05 lights-out-maker
  // s11-07 studio-share

  // s12-16 member-reports
  // A reported grid, deck, persona or listing shows its title while the reporter can still open it; once a moderator
  // removed it (or its author made it private) it is "no longer available", which is how the reporter sees the outcome.
  const gridIds = ids(rows, 'connections-grid');
  const deckIds = ids(rows, 'study-deck');
  const personaIds = ids(rows, 'persona');
  const listingIds = ids(rows, 'home-listing');
  const memberItems = gridIds.length || deckIds.length || personaIds.length || listingIds.length;
  const blockedAuthors = memberItems ? new Set(await getBlockedAuthorIds(viewerId)) : new Set<string>();
  const notBlocked = (authorField: 'authorId' | 'userId' | 'ownerId') => ({
    [authorField]: { notIn: [...blockedAuthors] },
  });
  if (gridIds.length) {
    const grids = await prisma.connectionsGrid.findMany({
      where: { id: { in: gridIds }, hidden: false, draft: false, ...notBlocked('authorId') },
      select: { id: true, title: true },
    });
    for (const g of grids) {
      set('connections-grid', g.id, {
        kind: 'connections-grid',
        available: true,
        name: snippet(g.title),
        href: `/connections/u/${g.id}`,
      });
    }
  }
  if (deckIds.length) {
    const decks = await prisma.flashcardDeck.findMany({
      where: { id: { in: deckIds }, isPublic: true, moderatedAt: null, ...notBlocked('userId') },
      select: { id: true, title: true },
    });
    for (const d of decks) {
      set('study-deck', d.id, { kind: 'study-deck', available: true, name: snippet(d.title), href: `/study/${d.id}` });
    }
  }
  if (personaIds.length) {
    const personas = await prisma.aiPersona.findMany({
      where: { id: { in: personaIds }, isPublic: true, moderatedAt: null, ...notBlocked('ownerId') },
      select: { id: true, name: true },
    });
    for (const p of personas) {
      set('persona', p.id, { kind: 'persona', available: true, name: snippet(p.name), href: `/personas/${p.id}` });
    }
  }
  if (listingIds.length) {
    const listings = await prisma.homeListing.findMany({
      where: { id: { in: listingIds }, moderatedAt: null, ...notBlocked('authorId') },
      select: { id: true, title: true },
    });
    for (const l of listings) {
      set('home-listing', l.id, {
        kind: 'home-listing',
        available: true,
        name: snippet(l.title),
        href: `/homes/listing/${l.id}`,
      });
    }
  }

  // Sprint 13 (docs/autonomous/sprint-13/plan.md §Anchors)
  // s13-06 tube-chat-reports
  // A reported room message shows the start of its text while it still exists; once a moderator removed it (or it was
  // pruned) it is "no longer available". The reporter was a member of the room, so no block filter applies to the
  // message's own words beyond the author block below.
  const tubeChatIds = ids(rows, 'tube-chat');
  if (tubeChatIds.length) {
    const blocked = new Set(await getBlockedAuthorIds(viewerId));
    const messages = await prisma.rmhTubeChatMessage.findMany({
      where: { id: { in: tubeChatIds } },
      select: { id: true, content: true, userId: true },
    });
    for (const m of messages) {
      if (blocked.has(m.userId)) continue;
      set('tube-chat', m.id, { kind: 'tube-chat', available: true, name: snippet(m.content), href: null });
    }
  }

  // s13-15 rideshare-safety
  // A reported trip names its two places while the reporter is still a party to it (they always were, to report it).
  // Never coordinates, never the chat.
  const rideIds = ids(rows, 'ride');
  if (rideIds.length) {
    const trips = await prisma.ride.findMany({
      where: { id: { in: rideIds }, OR: [{ riderId: viewerId }, { driverId: viewerId }] },
      select: { id: true, pickupLabel: true, dropoffLabel: true },
    });
    for (const r of trips) {
      set('ride', r.id, {
        kind: 'ride',
        available: true,
        name: snippet(`${r.pickupLabel} → ${r.dropoffLabel}`),
        href: null,
      });
    }
  }

  // s13-16 pack-reports
  // A reported pack shows its name until a moderator removed it (then it is "no longer available"). The reporter was
  // not its owner, so the block filter applies to the owner like any other member's item.
  const packIds = ids(rows, 'rmhbox-pack');
  if (packIds.length) {
    const packs = await prisma.rmhboxPack.findMany({
      where: { id: { in: packIds }, moderatedAt: null, ...notBlocked('ownerId') },
      select: { id: true, name: true },
    });
    for (const p of packs) {
      set('rmhbox-pack', p.id, { kind: 'rmhbox-pack', available: true, name: snippet(p.name), href: '/rmhbox-packs' });
    }
  }

  // s13-17 dm-reports
  // A reported message shows the start of its text while it still exists, has not expired or been unsent or removed,
  // and the reporter is still in its conversation. Earlier versions are never part of this view.
  const dmIds = ids(rows, 'dm');
  if (dmIds.length) {
    const blocked = new Set(await getBlockedAuthorIds(viewerId));
    const messages = await prisma.chatMessage.findMany({
      where: {
        id: { in: dmIds },
        deletedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        chat: { members: { some: { userId: viewerId } } },
      },
      select: { id: true, content: true, senderId: true, chatId: true, chat: { select: { kind: true } } },
    });
    for (const m of messages) {
      if (blocked.has(m.senderId)) continue;
      set('dm', m.id, {
        kind: 'dm',
        available: true,
        name: snippet(m.content) || null,
        href: m.chat.kind === 'group' ? `/groups/${m.chatId}` : `/messages/${m.chatId}`,
      });
    }
  }

  // Sprint 14 (docs/autonomous/sprint-14/plan.md §Anchors)
  // s14-07 slice-reports
  // A reported song shows its title, and a reported comment its start, while the song is still public and up; a
  // takedown or a song made private reads as "no longer available". Blocked uploaders and authors are left out.
  const songIds = ids(rows, 'song');
  const songCommentIds = ids(rows, 'song-comment');
  if (songIds.length || songCommentIds.length) {
    const blocked = [...new Set(await getBlockedAuthorIds(viewerId))];
    const live = { isPublic: true, takenDownAt: null, uploadedBy: { notIn: blocked } } as const;
    if (songIds.length) {
      const songs = await prisma.song.findMany({
        where: { id: { in: songIds }, ...live },
        select: { id: true, title: true },
      });
      for (const s of songs) set('song', s.id, { kind: 'song', available: true, name: snippet(s.title), href: null });
    }
    if (songCommentIds.length) {
      const comments = await prisma.songComment.findMany({
        where: { id: { in: songCommentIds }, userId: { notIn: blocked }, song: live },
        select: { id: true, content: true },
      });
      for (const c of comments) {
        set('song-comment', c.id, { kind: 'song-comment', available: true, name: snippet(c.content), href: null });
      }
    }
  }

  // s14-08 game-reports
  // A reported review, guide, discussion, reply or tip shows what it is while it is still up; a removal (a stamp for
  // a review, guide or tip, a delete for a discussion or reply) reads as "no longer available". Blocked authors are
  // left out. A guide draft and a removed item are not looked up at all.
  const gameTypes = ['game-review', 'game-guide', 'game-thread', 'game-thread-post', 'achievement-tip'] as const;
  if (gameTypes.some((type) => ids(rows, type).length)) {
    const blocked = new Set(await getBlockedAuthorIds(viewerId));
    const { gameContentTargets } = await import('@/lib/games/moderation.server');
    for (const type of gameTypes) {
      for (const item of await gameContentTargets(type, ids(rows, type))) {
        if (blocked.has(item.authorId)) continue;
        set(type, item.id, { kind: type, available: true, name: snippet(item.name), href: null });
      }
    }
  }

  // s14-09 profile-reports
  // A reported impersonator shows as its profile while the reporter may still open it (never the comparison, never who
  // it is said to be pretending to be); a deleted account, one with no handle and a blocked one read as unavailable.
  const impersonationIds = ids(rows, 'impersonation');
  if (impersonationIds.length) {
    const blockedAccounts = new Set(await getBlockedAuthorIds(viewerId));
    const accused = await prisma.user.findMany({
      where: { id: { in: impersonationIds.filter((id) => !blockedAccounts.has(id)) }, handle: { not: null } },
      select: { id: true, handle: true },
    });
    for (const u of accused) {
      if (u.handle) {
        set('impersonation', u.id, {
          kind: 'impersonation',
          available: true,
          name: `@${u.handle}`,
          href: `/u/${u.handle}`,
        });
      }
    }
  }

  // s14-10 tube-room-reports
  // A reported room shows its name (and links to its party page, for a scheduled one) until a moderator removes it, then
  // it is "no longer available". A host the reporter blocked is left out.
  const tubeRoomIds = ids(rows, 'tube-room');
  if (tubeRoomIds.length) {
    const blockedHosts = [...new Set(await getBlockedAuthorIds(viewerId))];
    const rooms = await prisma.rmhTubeRoom.findMany({
      where: { id: { in: tubeRoomIds }, moderatedAt: null, hostId: { notIn: blockedHosts } },
      select: { id: true, name: true, scheduledFor: true },
    });
    for (const room of rooms) {
      set('tube-room', room.id, {
        kind: 'tube-room',
        available: true,
        name: snippet(room.name ?? '') || null,
        href: room.scheduledFor ? partyPath(room.id) : null,
      });
    }
  }

  // Sprint 15 (docs/autonomous/sprint-15/plan.md §Anchors)
  // s15-04 workshop-reports
  // A reported HUD, loadout or story shows its title (and links to its page, for a HUD or a loadout) until a moderator
  // removes it or it goes private; one by an author the reporter blocked, or a banned one, is left out.
  const workshopIds = {
    'tf2-hud': ids(rows, 'tf2-hud'),
    'tf2-loadout': ids(rows, 'tf2-loadout'),
    'versecraft-seed': ids(rows, 'versecraft-seed'),
  };
  if (workshopIds['tf2-hud'].length || workshopIds['tf2-loadout'].length || workshopIds['versecraft-seed'].length) {
    const hiddenAuthors = [...new Set(await getBlockedAuthorIds(viewerId))];
    const items = await (
      await import('@/lib/moderation/workshop-moderation.server')
    ).workshopTargets(workshopIds, hiddenAuthors);
    for (const item of items) {
      set(item.type, item.id, { kind: item.type, available: true, name: snippet(item.title) || null, href: item.href });
    }
  }

  // s15-05 prediction-comments
  // A reported market comment shows its words while the reporter may still see it (the market is visible to them and
  // the author is not blocked either way); a deleted comment reads as "no longer available".
  const predictionCommentIds = ids(rows, 'prediction-comment');
  if (predictionCommentIds.length) {
    const { predictionCommentTargets } = await import('@/lib/forecasting/comment-reports.server');
    for (const c of await predictionCommentTargets(viewerId, predictionCommentIds)) {
      set('prediction-comment', c.id, {
        kind: 'prediction-comment',
        available: true,
        name: snippet(c.body),
        href: null,
      });
    }
  }

  // s15-06 member-text-reports
  // A reported guestbook entry or announcement comment shows its words (and links to where it is shown) until it is
  // hidden, deleted or taken down; one by an author the reporter blocked, or a banned commenter, is left out.
  const memberTextIds = { 'guestbook-entry': ids(rows, 'guestbook-entry'), 'blog-comment': ids(rows, 'blog-comment') };
  if (memberTextIds['guestbook-entry'].length || memberTextIds['blog-comment'].length) {
    const hiddenAuthors = [...new Set(await getBlockedAuthorIds(viewerId))];
    const items = await (
      await import('@/lib/moderation/member-text-reports.server')
    ).memberTextTargets(memberTextIds, hiddenAuthors);
    for (const item of items) {
      set(item.type, item.id, { kind: item.type, available: true, name: snippet(item.text) || null, href: item.href });
    }
  }

  return out;
}

/** Types whose content is looked up above; any other type shows only its kind. */
const LOOKED_UP: ReadonlySet<string> = new Set([
  'rmhark',
  'comment',
  'user',
  'build',
  // s12-16 member-reports
  'connections-grid',
  'study-deck',
  'persona',
  'home-listing',

  // Sprint 13 (docs/autonomous/sprint-13/plan.md §Anchors)
  // s13-06 tube-chat-reports
  'tube-chat',

  // s13-15 rideshare-safety
  'ride',

  // s13-16 pack-reports
  'rmhbox-pack',

  // s13-17 dm-reports
  'dm',

  // Sprint 14 (docs/autonomous/sprint-14/plan.md §Anchors)
  // s14-07 slice-reports
  'song',
  'song-comment',

  // s14-08 game-reports
  'game-review',
  'game-guide',
  'game-thread',
  'game-thread-post',
  'achievement-tip',

  // s14-09 profile-reports
  'impersonation',

  // s14-10 tube-room-reports
  'tube-room',

  // Sprint 15 (docs/autonomous/sprint-15/plan.md §Anchors)
  // s15-04 workshop-reports
  'tf2-hud',
  'tf2-loadout',
  'versecraft-seed',

  // s15-05 prediction-comments
  'prediction-comment',

  // s15-06 member-text-reports
  'guestbook-entry',
  'blog-comment',
]);

export async function listMyReports(
  userId: string,
  opts: { filter?: MyReportsFilter | undefined; cursor?: string | undefined; now?: Date } = {},
): Promise<MyReportsPage> {
  const rows = await prisma.contentReport.findMany({
    where: {
      reporterId: userId,
      createdAt: { gte: windowStart(opts.now ?? new Date()) },
      ...statusWhere(opts.filter ?? 'all'),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: MY_REPORTS_PAGE_SIZE + 1,
    ...(opts.cursor ? { skip: 1, cursor: { id: opts.cursor } } : {}),
    // The allow-list: no moderatorNote, resolvedById, resolvedAt or targetUserId ever leaves this query.
    select: {
      id: true,
      reason: true,
      createdAt: true,
      status: true,
      withdrawnAt: true,
      entityType: true,
      entityId: true,
    },
  });
  const hasMore = rows.length > MY_REPORTS_PAGE_SIZE;
  const page = hasMore ? rows.slice(0, MY_REPORTS_PAGE_SIZE) : rows;
  const targets = await targetsFor(userId, page);

  const items: MyReport[] = page.map((r) => {
    const kind = r.entityType as ReportEntityType;
    const status = reporterStatus(r);
    return {
      id: r.id,
      reason: r.reason as ReportReason,
      createdAt: r.createdAt.toISOString(),
      status,
      canWithdraw: canWithdraw(status),
      target: LOOKED_UP.has(r.entityType)
        ? (targets.get(`${r.entityType}:${r.entityId}`) ?? unavailableTarget(kind))
        : { kind, available: true, name: null, href: null },
    };
  });
  return { items, nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null };
}

export type WithdrawResult = 'withdrawn' | 'not_found' | 'not_pending';

/**
 * Withdraw one of the caller's own reports. The ownership and the PENDING check are part of the same conditional
 * update, so a report that is not theirs is `not_found` (the same answer as one that does not exist) and one a
 * moderator already picked up is `not_pending`. The reporter is not notified of their own withdrawal.
 */
export async function withdrawReport(userId: string, reportId: string): Promise<WithdrawResult> {
  const now = new Date();
  const claimed = await prisma.contentReport.updateMany({
    where: { id: reportId, reporterId: userId, status: 'PENDING' },
    data: { status: 'DISMISSED', withdrawnAt: now, reporterNotifiedAt: now },
  });
  if (claimed.count === 1) {
    // s13-16: taking back the last open report of a pack the reports hid brings the pack back, as a dismissal does.
    try {
      const row = await prisma.contentReport.findUnique({
        where: { id: reportId },
        select: { entityType: true, entityId: true },
      });
      if (row?.entityType === 'rmhbox-pack') {
        await (await import('@/lib/party/pack-moderation.server')).restoreReportedPack(row.entityId);
      }
    } catch (e) {
      console.error('Pack restore failed:', e);
    }
    return 'withdrawn';
  }
  const mine = await prisma.contentReport.findFirst({
    where: { id: reportId, reporterId: userId },
    select: { id: true },
  });
  if (!mine) return 'not_found';
  // Withdrawing twice is the same answer as withdrawing once.
  const again = await prisma.contentReport.findFirst({
    where: { id: reportId, reporterId: userId, withdrawnAt: { not: null } },
    select: { id: true },
  });
  return again ? 'withdrawn' : 'not_pending';
}

/**
 * Tell each reporter, once, that their report was decided. Call it after the status moved to RESOLVED or DISMISSED
 * (the admin action; feature 20's bulk decisions). Safe to call twice and with reports that were not decided: a
 * report is announced only while `reporterNotifiedAt` is null, and the claim that sets it is the same conditional
 * write that decides who sends. A withdrawn report is never announced. The text is the two-word outcome and nothing
 * else: no moderator, note, macro message or action. Returns how many reporters were told.
 */
export async function notifyReportersOfOutcome(reportIds: readonly string[]): Promise<number> {
  if (reportIds.length === 0) return 0;
  const rows = await prisma.contentReport.findMany({
    where: {
      id: { in: [...reportIds] },
      status: { in: ['RESOLVED', 'DISMISSED'] },
      withdrawnAt: null,
      reporterNotifiedAt: null,
    },
    select: { id: true, reporterId: true, status: true, withdrawnAt: true },
  });
  let told = 0;
  for (const row of rows) {
    const outcome = outcomeOf(row);
    if (!outcome) continue;
    const claimed = await prisma.contentReport.updateMany({
      where: { id: row.id, status: row.status, withdrawnAt: null, reporterNotifiedAt: null },
      data: { reporterNotifiedAt: new Date() },
    });
    if (claimed.count !== 1) continue;
    await createNotification({
      userId: row.reporterId,
      type: 'SYSTEM',
      entityType: REPORT_OUTCOME_ENTITY_TYPE,
      entityId: row.id,
      preview: outcome === 'ACTION_TAKEN' ? notice('report-action-taken', {}) : notice('report-no-violation', {}),
      link: MY_REPORTS_LINK,
    });
    told += 1;
  }
  return told;
}

/** Everything the member wrote or caused on the reports they filed, for the account export. */
export async function exportMyReports(userId: string) {
  const rows = await prisma.contentReport.findMany({
    where: { reporterId: userId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      entityType: true,
      entityId: true,
      reason: true,
      details: true,
      status: true,
      withdrawnAt: true,
      createdAt: true,
    },
  });
  return rows.map((r) => ({
    id: r.id,
    entityType: r.entityType,
    entityId: r.entityId,
    reason: r.reason,
    details: r.details,
    status: reporterStatus(r),
    withdrawnAt: r.withdrawnAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  }));
}
