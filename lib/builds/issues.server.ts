/**
 * Bug reports on user builds, the server half (s10-09): the list, a report, the reporter's edit and close, the
 * creator's status change and hide, "I see this too", and the erasure and export pieces.
 *
 * Every path starts from `readIssueBuild`: a private build answers like a missing one (to anyone but its creator) before anything else is read.
 * The creator's decisions (status, hide) are checked inside each function against the build's own `userId`, and the
 * writes are conditional `updateMany`s so a stale tab changes nothing.
 */
import { prisma } from '@/lib/prisma.server';
import { lockKey } from '@/lib/db/advisory-lock.server';
import { mapWithConcurrency } from '@/lib/async-pool';
import { createNotification } from '@/lib/notifications.server';
import { notice } from '@/lib/notifications/notice-keys';
import { userDisplaySelect, resolveUser } from '@/lib/user-display';
import {
  BUILD_ISSUE_NOTICE_ENTITY,
  ISSUE_FIXED_NOTIFY_CAP,
  ISSUE_NOTIFY_CONCURRENCY,
  ISSUE_REFUSAL_MESSAGE,
  ISSUES_PAGE,
  ISSUES_PER_BUILD_PER_DAY,
  checkTransition,
  isIssueStatus,
  issueRights,
  issueVisibleTo,
  issuesReadable,
  statusColumns,
  statusFilter,
  type IssueFilter,
  type IssueListPage,
  type IssuePlatform,
  type IssueRefusal,
  type IssueSort,
  type IssueStatus,
  type IssueView,
  type StatusChange,
} from '@/lib/builds/issues';

export interface IssueBuild {
  id: string;
  userId: string;
  slug: string;
  title: string;
  visibility: 'PUBLIC' | 'UNLISTED' | 'PRIVATE';
}

export type IssueFailure = { ok: false; status: 400 | 403 | 404 | 409; reason: IssueRefusal };
export type IssueResult<T = object> = ({ ok: true } & T) | IssueFailure;

const refuse = (status: IssueFailure['status'], reason: IssueRefusal): IssueFailure => ({ ok: false, status, reason });

/** The JSON body of a refusal: a static sentence and the stable reason (never a caught error). */
export function refusedResponse(f: IssueFailure): Response {
  return Response.json({ error: ISSUE_REFUSAL_MESSAGE[f.reason], reason: f.reason }, { status: f.status });
}

/** Thrown inside a transaction to roll it back and carry the refusal out. */
class Refused extends Error {
  constructor(readonly failure: IssueFailure) {
    super('refused');
  }
}

/**
 * The build a request names (by id, then slug), or null when it does not exist or is private and the viewer is not its
 * creator. Every issue path calls this first, so a private build's issues answer exactly like a build that is not
 * there, except to the creator.
 */
export async function readIssueBuild(idOrSlug: string, viewerId: string | null = null): Promise<IssueBuild | null> {
  const select = { id: true, userId: true, slug: true, title: true, visibility: true } as const;
  const build =
    (await prisma.userBuild.findUnique({ where: { id: idOrSlug }, select })) ??
    (await prisma.userBuild.findUnique({ where: { slug: idOrSlug }, select }));
  if (!build || !issuesReadable(build.visibility, viewerId !== null && viewerId === build.userId)) return null;
  return build;
}

const issueSelect = {
  id: true,
  buildId: true,
  reporterId: true,
  title: true,
  body: true,
  steps: true,
  platform: true,
  status: true,
  wontFixReason: true,
  hiddenAt: true,
  voteCount: true,
  createdAt: true,
  statusChangedAt: true,
  reporter: { select: userDisplaySelect },
  version: { select: { id: true, version: true } },
  fixedIn: { select: { id: true, version: true } },
  duplicateOf: { select: { id: true, title: true } },
} as const;

type IssueRow = {
  id: string;
  reporterId: string;
  title: string;
  body: string;
  steps: string | null;
  platform: string;
  status: string;
  wontFixReason: string | null;
  hiddenAt: Date | null;
  voteCount: number;
  createdAt: Date;
  statusChangedAt: Date | null;
  reporter: Parameters<typeof resolveUser>[0];
  version: { id: string; version: string } | null;
  fixedIn: { id: string; version: string } | null;
  duplicateOf: { id: string; title: string } | null;
};

function toView(row: IssueRow, build: IssueBuild, viewerId: string | null, voted: boolean): IssueView {
  const status: IssueStatus = isIssueStatus(row.status) ? row.status : 'open';
  const reporter = resolveUser(row.reporter);
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    steps: row.steps,
    platform: row.platform === 'phone' || row.platform === 'tablet' ? row.platform : 'desktop',
    status,
    version: row.version,
    fixedIn: row.fixedIn,
    duplicateOf: row.duplicateOf,
    wontFixReason: row.wontFixReason,
    hidden: row.hiddenAt !== null,
    voteCount: row.voteCount,
    voted,
    createdAt: row.createdAt.toISOString(),
    statusChangedAt: row.statusChangedAt?.toISOString() ?? null,
    reporter: { id: reporter.id, name: reporter.name, image: reporter.image, username: reporter.username },
    rights: issueRights(
      { reporterId: row.reporterId, status, hiddenAt: row.hiddenAt },
      { userId: viewerId, buildOwnerId: build.userId },
    ),
  };
}

async function isBanned(userId: string): Promise<boolean> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { bannedUntil: true, deletionScheduledAt: true },
  });
  if (!u) return true;
  return (!!u.bannedUntil && u.bannedUntil.getTime() > Date.now()) || !!u.deletionScheduledAt;
}

/** A block in either direction between the member and any of `others`. */
async function blockedWithAny(userId: string, others: string[]): Promise<boolean> {
  const ids = others.filter((o) => o !== userId);
  if (ids.length === 0) return false;
  const hit = await prisma.userBlock.findFirst({
    where: {
      OR: [
        { blockerId: userId, blockedId: { in: ids } },
        { blockerId: { in: ids }, blockedId: userId },
      ],
    },
    select: { id: true },
  });
  return !!hit;
}

/** Why this member may not report on (or add "me too" to) this build, or null. */
export async function interactionRefusal(
  build: IssueBuild,
  userId: string,
  alsoOthers: string[] = [],
): Promise<'banned' | 'blocked' | null> {
  if (await isBanned(userId)) return 'banned';
  if (await blockedWithAny(userId, [build.userId, ...alsoOthers])) return 'blocked';
  return null;
}

/** Keyset cursors: the last row of the page, in the order the list is sorted. */
function encodeCursor(sort: IssueSort, row: { voteCount: number; createdAt: Date; id: string }): string {
  return sort === 'popular'
    ? `${row.voteCount}~${row.createdAt.toISOString()}~${row.id}`
    : `${row.createdAt.toISOString()}~${row.id}`;
}

function cursorWhere(sort: IssueSort, cursor: string | undefined) {
  if (!cursor) return {};
  const parts = cursor.split('~');
  if (sort === 'popular') {
    const [votes, at, id] = parts;
    const v = Number(votes);
    const when = new Date(at ?? '');
    if (parts.length !== 3 || !Number.isInteger(v) || Number.isNaN(when.getTime()) || !id) return {};
    return {
      OR: [
        { voteCount: { lt: v } },
        { voteCount: v, createdAt: { lt: when } },
        { voteCount: v, createdAt: when, id: { lt: id } },
      ],
    };
  }
  const [at, id] = parts;
  const when = new Date(at ?? '');
  if (parts.length !== 2 || Number.isNaN(when.getTime()) || !id) return {};
  return { OR: [{ createdAt: { lt: when } }, { createdAt: when, id: { lt: id } }] };
}

/** What a viewer may see of a build's issues: everything, or for anyone but the creator, not what the creator hid (their own excepted). */
function visibleWhere(build: IssueBuild, viewerId: string | null) {
  if (viewerId !== null && viewerId === build.userId) return {};
  return viewerId === null ? { hiddenAt: null } : { OR: [{ hiddenAt: null }, { reporterId: viewerId }] };
}

export async function listIssues(opts: {
  build: IssueBuild;
  viewerId: string | null;
  status: IssueFilter;
  sort: IssueSort;
  cursor: string | undefined;
  limit: number;
}): Promise<IssueListPage> {
  const { build, viewerId, status, sort, cursor } = opts;
  const limit = Math.min(Math.max(opts.limit, 1), ISSUES_PAGE);
  const seen = visibleWhere(build, viewerId);
  const filter = statusFilter(status);
  const orderBy =
    sort === 'popular'
      ? [{ voteCount: 'desc' as const }, { createdAt: 'desc' as const }, { id: 'desc' as const }]
      : [{ createdAt: 'desc' as const }, { id: 'desc' as const }];

  const [rows, grouped, releases, refusal] = await Promise.all([
    prisma.buildIssue.findMany({
      where: { AND: [{ buildId: build.id }, seen, filter ? { status: filter } : {}, cursorWhere(sort, cursor)] },
      orderBy,
      take: limit + 1,
      select: {
        ...issueSelect,
        votes: viewerId ? { where: { userId: viewerId }, select: { userId: true }, take: 1 } : false,
      },
    }),
    // One query for the filter tabs and for the build page's "N open".
    prisma.buildIssue.groupBy({
      by: ['status'],
      where: { AND: [{ buildId: build.id }, seen] },
      _count: { _all: true },
    }),
    cursor
      ? Promise.resolve([])
      : prisma.buildVersion.findMany({
          where: { buildId: build.id },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 50,
          select: { id: true, version: true },
        }),
    viewerId ? interactionRefusal(build, viewerId) : Promise.resolve('banned' as const),
  ]);

  const counts: Record<IssueFilter, number> = {
    all: 0,
    open: 0,
    confirmed: 0,
    fixed: 0,
    wont_fix: 0,
    duplicate: 0,
    closed: 0,
  };
  for (const g of Array.isArray(grouped) ? grouped : []) {
    if (isIssueStatus(g.status)) counts[g.status] = g._count._all;
    counts.all += g._count._all;
  }

  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return {
    items: page.map((r) => toView(r, build, viewerId, 'votes' in r && Array.isArray(r.votes) && r.votes.length > 0)),
    nextCursor: hasMore && last ? encodeCursor(sort, last) : null,
    counts,
    canReport: viewerId !== null && refusal === null,
    isCreator: viewerId !== null && viewerId === build.userId,
    releases: Array.isArray(releases) ? releases : [],
  };
}

/** One issue as the viewer may see it, or a 404 (hidden from them, or not this build's). */
async function loadIssue(build: IssueBuild, issueId: string, viewerId: string | null) {
  const row = await prisma.buildIssue.findFirst({
    where: { id: issueId, buildId: build.id },
    select: {
      ...issueSelect,
      votes: viewerId ? { where: { userId: viewerId }, select: { userId: true }, take: 1 } : false,
    },
  });
  if (!row) return null;
  if (
    !issueVisibleTo(
      { reporterId: row.reporterId, hiddenAt: row.hiddenAt },
      { userId: viewerId, buildOwnerId: build.userId },
    )
  )
    return null;
  return row;
}

async function viewOf(build: IssueBuild, issueId: string, viewerId: string): Promise<IssueView | null> {
  const row = await loadIssue(build, issueId, viewerId);
  return row ? toView(row, build, viewerId, 'votes' in row && Array.isArray(row.votes) && row.votes.length > 0) : null;
}

/** A release id that belongs to this build, or null. */
async function releaseOf(buildId: string, id: string): Promise<{ id: string; version: string } | null> {
  return prisma.buildVersion.findFirst({ where: { id, buildId }, select: { id: true, version: true } });
}

export interface CreateIssueInput {
  title: string;
  body: string;
  steps?: string | undefined;
  versionId?: string | undefined;
  platform: IssuePlatform;
}

/**
 * Report an issue. Refused for a banned member and a block in either direction with the creator. At most 10 per
 * member per build per day, counted under a lock so two tabs cannot both pass the check. The creator is told once
 * while an earlier "New issues" notice for the build is still unread.
 */
export async function createIssue(
  build: IssueBuild,
  userId: string,
  input: CreateIssueInput,
): Promise<IssueResult<{ issue: IssueView }>> {
  const refusal = await interactionRefusal(build, userId);
  if (refusal) return refuse(403, refusal);

  let versionId: string | null = null;
  if (input.versionId) {
    const release = await releaseOf(build.id, input.versionId);
    if (!release) return refuse(400, 'invalid');
    versionId = release.id;
  } else {
    const latest = await prisma.buildVersion.findFirst({
      where: { buildId: build.id },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { id: true },
    });
    versionId = latest?.id ?? null;
  }

  try {
    const id = await prisma.$transaction(async (tx) => {
      await lockKey(tx, `build-issue:${build.id}:${userId}`);
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const today = await tx.buildIssue.count({
        where: { buildId: build.id, reporterId: userId, createdAt: { gte: since } },
      });
      if (today >= ISSUES_PER_BUILD_PER_DAY) throw new Refused(refuse(409, 'daily-cap'));
      const row = await tx.buildIssue.create({
        data: {
          buildId: build.id,
          reporterId: userId,
          title: input.title.trim(),
          body: input.body.trim(),
          steps: input.steps?.trim() ? input.steps.trim() : null,
          versionId,
          platform: input.platform,
        },
        select: { id: true },
      });
      return row.id;
    });
    if (build.userId !== userId) await notifyCreator(build);
    const issue = await viewOf(build, id, userId);
    return issue ? { ok: true, issue } : refuse(404, 'not-found');
  } catch (error) {
    if (error instanceof Refused) return error.failure;
    throw error;
  }
}

/** The reporter fixes their words and platform while the issue is open (a compare-and-set on `open`). */
export async function editIssue(
  build: IssueBuild,
  issueId: string,
  userId: string,
  patch: Partial<CreateIssueInput>,
): Promise<IssueResult<{ issue: IssueView }>> {
  const refusal = await interactionRefusal(build, userId);
  if (refusal) return refuse(403, refusal);
  let versionId: string | undefined;
  if (patch.versionId) {
    const release = await releaseOf(build.id, patch.versionId);
    if (!release) return refuse(400, 'invalid');
    versionId = release.id;
  }
  const changed = await prisma.buildIssue.updateMany({
    where: { id: issueId, buildId: build.id, reporterId: userId, status: 'open' },
    data: {
      ...(patch.title !== undefined ? { title: patch.title.trim() } : {}),
      ...(patch.body !== undefined ? { body: patch.body.trim() } : {}),
      ...(patch.steps !== undefined ? { steps: patch.steps.trim() ? patch.steps.trim() : null } : {}),
      ...(patch.platform !== undefined ? { platform: patch.platform } : {}),
      ...(versionId !== undefined ? { versionId } : {}),
    },
  });
  if (changed.count !== 1) return failureFor(build, issueId, userId);
  const issue = await viewOf(build, issueId, userId);
  return issue ? { ok: true, issue } : refuse(404, 'not-found');
}

/** Why a reporter's conditional write matched nothing: not theirs (403), gone (404), or no longer open (409). */
async function failureFor(build: IssueBuild, issueId: string, userId: string): Promise<IssueFailure> {
  const row = await prisma.buildIssue.findFirst({
    where: { id: issueId, buildId: build.id },
    select: { reporterId: true, hiddenAt: true },
  });
  if (!row) return refuse(404, 'not-found');
  if (row.reporterId !== userId) {
    // What the viewer may not see answers like a missing one.
    return row.hiddenAt && userId !== build.userId ? refuse(404, 'not-found') : refuse(403, 'forbidden');
  }
  return refuse(409, 'closed');
}

/** The reporter closes their own open issue. */
export async function closeIssue(
  build: IssueBuild,
  issueId: string,
  userId: string,
): Promise<IssueResult<{ issue: IssueView }>> {
  const changed = await prisma.buildIssue.updateMany({
    where: { id: issueId, buildId: build.id, reporterId: userId, status: 'open' },
    data: { status: 'closed', statusChangedAt: new Date() },
  });
  if (changed.count !== 1) return failureFor(build, issueId, userId);
  const issue = await viewOf(build, issueId, userId);
  return issue ? { ok: true, issue } : refuse(404, 'not-found');
}

/**
 * The creator sets a status. `expected` is the status they were looking at; the write is a compare-and-set on it, so
 * a concurrent change (or a double click) changes nothing and answers 409. The reporter is told, and when the issue is
 * fixed every "me too" member is told as well (the reporter first, 500 at most, through a bounded pool).
 */
export async function setIssueStatus(
  build: IssueBuild,
  issueId: string,
  viewerId: string,
  expected: IssueStatus,
  change: StatusChange,
): Promise<IssueResult<{ issue: IssueView }>> {
  if (viewerId !== build.userId) return refuse(403, 'forbidden');
  const row = await prisma.buildIssue.findFirst({
    where: { id: issueId, buildId: build.id },
    select: { id: true, status: true, title: true, reporterId: true },
  });
  if (!row) return refuse(404, 'not-found');
  const current: IssueStatus = isIssueStatus(row.status) ? row.status : 'open';
  if (current !== expected) return refuse(409, 'stale');
  const problem = checkTransition(current, change, issueId);
  if (problem === 'closed') return refuse(409, 'closed');
  if (problem) return refuse(400, 'invalid');

  let fixedVersion: string | null = null;
  if (change.status === 'fixed') {
    const release = change.fixedInId ? await releaseOf(build.id, change.fixedInId) : null;
    if (!release) return refuse(400, 'invalid');
    fixedVersion = release.version;
  }
  if (change.status === 'duplicate') {
    // A duplicate must point at another issue of the same build.
    const target = change.duplicateOfId
      ? await prisma.buildIssue.findFirst({
          where: { id: change.duplicateOfId, buildId: build.id },
          select: { id: true },
        })
      : null;
    if (!target) return refuse(400, 'invalid');
  }

  const changed = await prisma.buildIssue.updateMany({
    where: { id: issueId, buildId: build.id, status: current },
    data: { ...statusColumns(change), statusChangedAt: new Date() },
  });
  if (changed.count !== 1) return refuse(409, 'stale');

  await notifyStatus(build, row, current, change.status, fixedVersion);
  const issue = await viewOf(build, issueId, viewerId);
  return issue ? { ok: true, issue } : refuse(404, 'not-found');
}

/** The creator hides (or unhides) an issue: only they and its reporter see it then. */
export async function hideIssue(
  build: IssueBuild,
  issueId: string,
  viewerId: string,
  hidden: boolean,
): Promise<IssueResult<{ hidden: boolean }>> {
  if (viewerId !== build.userId) return refuse(403, 'forbidden');
  const changed = await prisma.buildIssue.updateMany({
    where: { id: issueId, buildId: build.id },
    data: { hiddenAt: hidden ? new Date() : null },
  });
  return changed.count === 1 ? { ok: true, hidden } : refuse(404, 'not-found');
}

/**
 * "I see this too", once per member per issue. The vote row is created with `skipDuplicates`, so only the call that
 * really inserted it moves the count; taking it back moves the count only when a row was removed.
 */
export async function setVote(
  build: IssueBuild,
  issueId: string,
  userId: string,
  voted: boolean,
): Promise<IssueResult<{ voted: boolean; voteCount: number }>> {
  const issue = await loadIssue(build, issueId, userId);
  if (!issue) return refuse(404, 'not-found');

  if (voted) {
    if (issue.reporterId === userId) return refuse(403, 'own');
    const refusal = await interactionRefusal(build, userId, [issue.reporterId]);
    if (refusal) return refuse(403, refusal);
    if (issue.status !== 'open' && issue.status !== 'confirmed') return refuse(409, 'closed');
    await prisma.$transaction(async (tx) => {
      const made = await tx.buildIssueVote.createMany({ data: [{ issueId, userId }], skipDuplicates: true });
      if (made.count === 1)
        await tx.buildIssue.updateMany({ where: { id: issueId }, data: { voteCount: { increment: 1 } } });
    });
  } else {
    await prisma.$transaction(async (tx) => {
      const gone = await tx.buildIssueVote.deleteMany({ where: { issueId, userId } });
      if (gone.count === 1)
        await tx.buildIssue.updateMany({
          where: { id: issueId, voteCount: { gt: 0 } },
          data: { voteCount: { decrement: 1 } },
        });
    });
  }
  const fresh = await prisma.buildIssue.findUnique({ where: { id: issueId }, select: { voteCount: true } });
  return { ok: true, voted, voteCount: fresh?.voteCount ?? 0 };
}

// ── Notices ────────────────────────────────────────────────────────────────

const issuesLink = (build: IssueBuild) => `/builds/${build.slug}/issues`;

/** The creator's "New issues on <build>": one while an earlier one is unread. Best-effort. */
async function notifyCreator(build: IssueBuild): Promise<void> {
  try {
    await createNotification({
      userId: build.userId,
      type: 'SYSTEM',
      entityType: BUILD_ISSUE_NOTICE_ENTITY,
      entityId: build.id,
      preview: notice('build-issues-new', { build: build.title }),
      link: issuesLink(build),
      dedupeUnread: true,
    });
  } catch (error) {
    console.error('[build-issues] could not notify the creator', error);
  }
}

async function notifyOne(
  build: IssueBuild,
  userId: string,
  entityId: string,
  preview: ReturnType<typeof notice>,
): Promise<void> {
  try {
    await createNotification({
      userId,
      type: 'SYSTEM',
      entityType: BUILD_ISSUE_NOTICE_ENTITY,
      entityId,
      preview,
      link: issuesLink(build),
    });
  } catch (error) {
    console.error('[build-issues] could not notify a member', error);
  }
}

/** Tell the reporter of a status change, and on `fixed` every "me too" member (reporter first, 500 at most). */
async function notifyStatus(
  build: IssueBuild,
  issue: { id: string; title: string; reporterId: string },
  from: IssueStatus,
  to: IssueStatus,
  fixedVersion: string | null,
): Promise<void> {
  const params = { build: build.title, issue: issue.title };
  const entityId = `${issue.id}:${to}`;
  let own: ReturnType<typeof notice> | null;
  switch (to) {
    case 'confirmed':
      own = notice('build-issue-confirmed', params);
      break;
    case 'fixed':
      own = notice('build-issue-fixed', { ...params, version: fixedVersion ?? '' });
      break;
    case 'wont_fix':
      own = notice('build-issue-wont-fix', params);
      break;
    case 'duplicate':
      own = notice('build-issue-duplicate', params);
      break;
    case 'open':
      own = from === 'open' ? null : notice('build-issue-reopened', params);
      break;
    default:
      own = null;
  }
  if (own && issue.reporterId !== build.userId) await notifyOne(build, issue.reporterId, entityId, own);

  if (to !== 'fixed') return;
  try {
    const voters = await prisma.buildIssueVote.findMany({
      where: { issueId: issue.id, userId: { notIn: [issue.reporterId, build.userId] } },
      orderBy: { createdAt: 'asc' },
      take: ISSUE_FIXED_NOTIFY_CAP - 1,
      select: { userId: true },
    });
    const preview = notice('build-issue-fixed-seen', { ...params, version: fixedVersion ?? '' });
    await mapWithConcurrency(Array.isArray(voters) ? voters : [], ISSUE_NOTIFY_CONCURRENCY, (v) =>
      notifyOne(build, v.userId, entityId, preview),
    );
  } catch (error) {
    console.error('[build-issues] could not notify the members who see it too', error);
  }
}

// ── Moderation, erasure and export ─────────────────────────────────────────

/** A report's "remove": the issue (and its "me too" marks, by cascade) is deleted. Idempotent. */
export async function moderatorRemoveIssue(issueId: string): Promise<void> {
  await prisma.buildIssue.deleteMany({ where: { id: issueId } });
}

/**
 * Account erasure. Published issues stay under "Deleted user" (the reporter row is anonymised in place, as build
 * comments are); the member's "I see this too" marks are deleted and each issue's count is corrected. The marks are
 * read before the transaction, so the returned operations are plain Prisma calls for its array.
 */
export async function buildIssueErasureOps(userId: string) {
  const marks = await prisma.buildIssueVote.findMany({ where: { userId }, select: { issueId: true } });
  const issueIds = Array.isArray(marks) ? marks.map((m) => m.issueId) : [];
  return [
    ...issueIds.map((id) =>
      prisma.buildIssue.updateMany({ where: { id, voteCount: { gt: 0 } }, data: { voteCount: { decrement: 1 } } }),
    ),
    prisma.buildIssueVote.deleteMany({ where: { userId } }),
  ];
}

/** The data export: the issues the member reported (build, title, text, status) and the issues they see too. */
export async function exportBuildIssues(userId: string) {
  const [issues, marks] = await Promise.all([
    prisma.buildIssue.findMany({
      where: { reporterId: userId },
      orderBy: { createdAt: 'asc' },
      take: 5000,
      select: {
        title: true,
        body: true,
        steps: true,
        platform: true,
        status: true,
        wontFixReason: true,
        createdAt: true,
        build: { select: { title: true, slug: true } },
        version: { select: { version: true } },
        fixedIn: { select: { version: true } },
      },
    }),
    prisma.buildIssueVote.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      take: 5000,
      select: { createdAt: true, issue: { select: { title: true, build: { select: { title: true, slug: true } } } } },
    }),
  ]);
  return {
    issues: issues.map((i) => ({
      buildTitle: i.build.title,
      buildSlug: i.build.slug,
      title: i.title,
      body: i.body,
      steps: i.steps,
      platform: i.platform,
      version: i.version?.version ?? null,
      status: i.status,
      fixedIn: i.fixedIn?.version ?? null,
      wontFixReason: i.wontFixReason,
      createdAt: i.createdAt.toISOString(),
    })),
    seenToo: marks.map((m) => ({
      buildTitle: m.issue.build.title,
      buildSlug: m.issue.build.slug,
      issueTitle: m.issue.title,
      at: m.createdAt.toISOString(),
    })),
  };
}
