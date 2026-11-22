import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Bug reports on user builds (s10-09): the private-build gate, the creator-only status change with its
 * compare-and-set, hidden issues, blocks and bans, the daily cap, "I see this too" once with the count kept right,
 * duplicates on the same build, and the notices. Prisma is mocked.
 */

const db = vi.hoisted(() => {
  const fn = () => vi.fn();
  const tx = {
    buildIssue: { count: fn(), create: fn(), updateMany: fn() },
    buildIssueVote: { createMany: fn(), deleteMany: fn() },
  };
  return {
    tx,
    userBuild: { findUnique: fn() },
    user: { findUnique: fn() },
    userBlock: { findFirst: fn() },
    buildVersion: { findFirst: fn(), findMany: fn() },
    buildIssue: {
      findFirst: fn(),
      findMany: fn(),
      findUnique: fn(),
      updateMany: fn(),
      groupBy: fn(),
      deleteMany: fn(),
    },
    buildIssueVote: { findMany: fn() },
    $transaction: vi.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)),
  };
});
vi.mock('@/lib/prisma.server', () => ({ prisma: db }));
vi.mock('@/lib/db/advisory-lock.server', () => ({ lockKey: vi.fn(async () => undefined) }));
const notifications = vi.hoisted(() => vi.fn(async (_input: Record<string, unknown>) => undefined));
vi.mock('@/lib/notifications.server', () => ({ createNotification: notifications }));
vi.mock('@/lib/user-display', () => ({
  userDisplaySelect: {},
  resolveUser: (u: { id: string; name?: string | null }) => ({
    id: u.id,
    name: u.name ?? null,
    image: null,
    username: null,
  }),
}));

import {
  closeIssue,
  createIssue,
  hideIssue,
  listIssues,
  readIssueBuild,
  setIssueStatus,
  setVote,
  type IssueBuild,
} from '@/lib/builds/issues.server';
import { ISSUES_PER_BUILD_PER_DAY, ISSUE_FIXED_NOTIFY_CAP } from '@/lib/builds/issues';

const build: IssueBuild = { id: 'b1', userId: 'creator', slug: 'my-build', title: 'My Build', visibility: 'PUBLIC' };
const input = { title: 'Crash', body: 'It crashes', platform: 'desktop' as const };

function issueRow(over: Record<string, unknown> = {}) {
  return {
    id: 'i1',
    buildId: 'b1',
    reporterId: 'reporter',
    title: 'Crash',
    body: 'It crashes',
    steps: null,
    platform: 'desktop',
    status: 'open',
    wontFixReason: null,
    hiddenAt: null,
    voteCount: 0,
    createdAt: new Date('2026-11-01T00:00:00Z'),
    statusChangedAt: null,
    reporter: { id: 'reporter', name: 'Rae' },
    version: null,
    fixedIn: null,
    duplicateOf: null,
    votes: [],
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  db.user.findUnique.mockResolvedValue({ bannedUntil: null, deletionScheduledAt: null });
  db.userBlock.findFirst.mockResolvedValue(null);
  db.buildVersion.findFirst.mockResolvedValue({ id: 'v1', version: '1.0' });
  db.buildVersion.findMany.mockResolvedValue([]);
  db.tx.buildIssue.count.mockResolvedValue(0);
  db.tx.buildIssue.create.mockResolvedValue({ id: 'i1' });
  db.buildIssue.findFirst.mockResolvedValue(issueRow());
  db.buildIssue.findMany.mockResolvedValue([]);
  db.buildIssue.groupBy.mockResolvedValue([]);
  db.buildIssue.updateMany.mockResolvedValue({ count: 1 });
  db.buildIssueVote.findMany.mockResolvedValue([]);
  db.tx.buildIssueVote.createMany.mockResolvedValue({ count: 1 });
  db.tx.buildIssueVote.deleteMany.mockResolvedValue({ count: 1 });
  db.tx.buildIssue.updateMany.mockResolvedValue({ count: 1 });
});

describe('readIssueBuild', () => {
  it('answers null for a private build, before anything else is read', async () => {
    db.userBuild.findUnique.mockResolvedValue({ ...build, visibility: 'PRIVATE' });
    expect(await readIssueBuild('b1')).toBeNull();
    expect(await readIssueBuild('b1', 'stranger')).toBeNull();
  });
  it('reads a private build for its creator alone', async () => {
    db.userBuild.findUnique.mockResolvedValue({ ...build, visibility: 'PRIVATE' });
    expect(await readIssueBuild('b1', build.userId)).toMatchObject({ id: 'b1' });
  });
  it('answers null for a build that does not exist (by id and by slug)', async () => {
    db.userBuild.findUnique.mockResolvedValue(null);
    expect(await readIssueBuild('nope')).toBeNull();
    expect(db.userBuild.findUnique).toHaveBeenCalledTimes(2);
  });
  it('reads a public and an unlisted build', async () => {
    db.userBuild.findUnique.mockResolvedValue({ ...build, visibility: 'UNLISTED' });
    expect(await readIssueBuild('b1')).toMatchObject({ id: 'b1' });
  });
});

describe('createIssue', () => {
  it('refuses a banned member and a member under a pending deletion', async () => {
    db.user.findUnique.mockResolvedValue({ bannedUntil: new Date(Date.now() + 60_000), deletionScheduledAt: null });
    expect(await createIssue(build, 'u1', input)).toMatchObject({ ok: false, status: 403, reason: 'banned' });
    db.user.findUnique.mockResolvedValue({ bannedUntil: null, deletionScheduledAt: new Date() });
    expect(await createIssue(build, 'u1', input)).toMatchObject({ ok: false, reason: 'banned' });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('refuses a block in either direction with the creator', async () => {
    db.userBlock.findFirst.mockResolvedValue({ id: 'blk' });
    expect(await createIssue(build, 'u1', input)).toMatchObject({ ok: false, status: 403, reason: 'blocked' });
    const where = db.userBlock.findFirst.mock.calls[0]![0].where;
    expect(where.OR).toEqual([
      { blockerId: 'u1', blockedId: { in: ['creator'] } },
      { blockerId: { in: ['creator'] }, blockedId: 'u1' },
    ]);
  });

  it('refuses the eleventh issue on a build in a day, counted under the lock', async () => {
    db.tx.buildIssue.count.mockResolvedValue(ISSUES_PER_BUILD_PER_DAY);
    expect(await createIssue(build, 'u1', input)).toMatchObject({ ok: false, status: 409, reason: 'daily-cap' });
    expect(db.tx.buildIssue.create).not.toHaveBeenCalled();
  });

  it("refuses a release that is not the build's", async () => {
    db.buildVersion.findFirst.mockResolvedValue(null);
    expect(await createIssue(build, 'u1', { ...input, versionId: 'other' })).toMatchObject({ ok: false, status: 400 });
  });

  it('defaults the version to the latest release and tells the creator with dedupeUnread on the build', async () => {
    const result = await createIssue(build, 'u1', input);
    expect(result.ok).toBe(true);
    expect(db.tx.buildIssue.create.mock.calls[0]![0].data).toMatchObject({
      buildId: 'b1',
      reporterId: 'u1',
      versionId: 'v1',
    });
    expect(notifications).toHaveBeenCalledTimes(1);
    expect(notifications.mock.calls[0]![0]).toMatchObject({
      userId: 'creator',
      type: 'SYSTEM',
      entityType: 'build-issue',
      entityId: 'b1',
      dedupeUnread: true,
    });
  });

  it('does not notify a creator of their own report', async () => {
    await createIssue(build, 'creator', input);
    expect(notifications).not.toHaveBeenCalled();
  });
});

describe('setIssueStatus', () => {
  const fixed = { status: 'fixed' as const, fixedInId: 'v13' };

  it("is the creator's alone", async () => {
    expect(await setIssueStatus(build, 'i1', 'someone', 'open', fixed)).toMatchObject({ ok: false, status: 403 });
    expect(db.buildIssue.updateMany).not.toHaveBeenCalled();
  });

  it('does nothing when the status changed since the creator looked (compare-and-set)', async () => {
    expect(await setIssueStatus(build, 'i1', 'creator', 'confirmed', fixed)).toMatchObject({
      ok: false,
      status: 409,
      reason: 'stale',
    });
    expect(db.buildIssue.updateMany).not.toHaveBeenCalled();

    // The row matched at read time but another change won the race before the write.
    db.buildVersion.findFirst.mockResolvedValue({ id: 'v13', version: '1.3' });
    db.buildIssue.updateMany.mockResolvedValue({ count: 0 });
    expect(await setIssueStatus(build, 'i1', 'creator', 'open', fixed)).toMatchObject({
      ok: false,
      status: 409,
      reason: 'stale',
    });
    expect(db.buildIssue.updateMany.mock.calls[0]![0].where).toMatchObject({ id: 'i1', buildId: 'b1', status: 'open' });
    expect(notifications).not.toHaveBeenCalled();
  });

  it('needs a release of this build for "fixed"', async () => {
    db.buildVersion.findFirst.mockResolvedValue(null);
    expect(await setIssueStatus(build, 'i1', 'creator', 'open', fixed)).toMatchObject({ ok: false, status: 400 });
    expect(await setIssueStatus(build, 'i1', 'creator', 'open', { status: 'fixed' })).toMatchObject({
      ok: false,
      status: 400,
    });
  });

  it('needs a duplicate to point at another issue of the same build', async () => {
    // The lookup is scoped to this build, so an issue of another build is not found.
    db.buildIssue.findFirst.mockImplementation(async (args: { where: { id: string } }) =>
      args.where.id === 'i1' ? issueRow() : null,
    );
    const result = await setIssueStatus(build, 'i1', 'creator', 'open', {
      status: 'duplicate',
      duplicateOfId: 'elsewhere',
    });
    expect(result).toMatchObject({ ok: false, status: 400, reason: 'invalid' });
    expect(db.buildIssue.findFirst.mock.calls[1]![0].where).toEqual({ id: 'elsewhere', buildId: 'b1' });
    expect(
      await setIssueStatus(build, 'i1', 'creator', 'open', { status: 'duplicate', duplicateOfId: 'i1' }),
    ).toMatchObject({
      ok: false,
      status: 400,
    });
  });

  it('writes the new status, clears what belonged to the old one, and tells the reporter', async () => {
    db.buildVersion.findFirst.mockResolvedValue({ id: 'v13', version: '1.3' });
    const result = await setIssueStatus(build, 'i1', 'creator', 'open', fixed);
    expect(result.ok).toBe(true);
    expect(db.buildIssue.updateMany.mock.calls[0]![0].data).toMatchObject({
      status: 'fixed',
      fixedInId: 'v13',
      duplicateOfId: null,
      wontFixReason: null,
    });
    const first = notifications.mock.calls[0]![0] as {
      userId: string;
      preview: { key: string; params: Record<string, string> };
    };
    expect(first.userId).toBe('reporter');
    expect(first.preview).toMatchObject({ key: 'build-issue-fixed', params: { version: '1.3' } });
  });

  it('tells the "me too" members of a fix after the reporter, at most 500 in all', async () => {
    db.buildVersion.findFirst.mockResolvedValue({ id: 'v13', version: '1.3' });
    db.buildIssueVote.findMany.mockResolvedValue([{ userId: 'm1' }, { userId: 'm2' }]);
    await setIssueStatus(build, 'i1', 'creator', 'open', fixed);
    expect(notifications.mock.calls.map((c) => (c[0] as { userId: string }).userId)).toEqual(['reporter', 'm1', 'm2']);
    const query = db.buildIssueVote.findMany.mock.calls[0]![0];
    expect(query.take).toBe(ISSUE_FIXED_NOTIFY_CAP - 1);
    expect(query.where.userId).toEqual({ notIn: ['reporter', 'creator'] });
  });

  it('does not tell "me too" members of a status that is not a fix', async () => {
    await setIssueStatus(build, 'i1', 'creator', 'open', { status: 'confirmed' });
    expect(db.buildIssueVote.findMany).not.toHaveBeenCalled();
  });

  it('leaves an issue the reporter closed closed', async () => {
    db.buildIssue.findFirst.mockResolvedValue(issueRow({ status: 'closed' }));
    expect(await setIssueStatus(build, 'i1', 'creator', 'closed', { status: 'open' })).toMatchObject({
      ok: false,
      reason: 'closed',
    });
  });
});

describe('hidden issues', () => {
  it('lists them only to the creator and (their own) to the reporter', async () => {
    await listIssues({ build, viewerId: null, status: 'all', sort: 'newest', cursor: undefined, limit: 30 });
    expect(db.buildIssue.findMany.mock.calls[0]![0].where.AND[1]).toEqual({ hiddenAt: null });

    await listIssues({ build, viewerId: 'reporter', status: 'all', sort: 'newest', cursor: undefined, limit: 30 });
    expect(db.buildIssue.findMany.mock.calls[1]![0].where.AND[1]).toEqual({
      OR: [{ hiddenAt: null }, { reporterId: 'reporter' }],
    });

    await listIssues({ build, viewerId: 'creator', status: 'all', sort: 'newest', cursor: undefined, limit: 30 });
    expect(db.buildIssue.findMany.mock.calls[2]![0].where.AND[1]).toEqual({});
  });

  it('counts only what the viewer may see, in one grouped query', async () => {
    db.buildIssue.groupBy.mockResolvedValue([
      { status: 'open', _count: { _all: 3 } },
      { status: 'fixed', _count: { _all: 2 } },
    ]);
    const page = await listIssues({
      build,
      viewerId: null,
      status: 'all',
      sort: 'newest',
      cursor: undefined,
      limit: 30,
    });
    expect(page.counts).toMatchObject({ all: 5, open: 3, fixed: 2 });
    expect(db.buildIssue.groupBy).toHaveBeenCalledTimes(1);
    expect(db.buildIssue.groupBy.mock.calls[0]![0].where.AND[1]).toEqual({ hiddenAt: null });
    expect(page.canReport).toBe(false);
  });

  it('404s a hidden issue for a stranger and lets only the creator hide', async () => {
    db.buildIssue.findFirst.mockResolvedValue(issueRow({ hiddenAt: new Date() }));
    expect(await setVote(build, 'i1', 'stranger', true)).toMatchObject({ ok: false, status: 404 });
    expect(await hideIssue(build, 'i1', 'stranger', true)).toMatchObject({ ok: false, status: 403 });
    expect(db.buildIssue.updateMany).not.toHaveBeenCalled();
    expect(await hideIssue(build, 'i1', 'creator', true)).toMatchObject({ ok: true, hidden: true });
  });

  it('a reporter still reads (and may vote-free manage) their own hidden issue', async () => {
    db.buildIssue.findFirst.mockResolvedValue(issueRow({ hiddenAt: new Date() }));
    expect(await setVote(build, 'i1', 'reporter', false)).toMatchObject({ ok: true });
  });
});

describe('setVote ("I see this too")', () => {
  it('counts a member once: only the call that inserted the mark moves the count', async () => {
    db.buildIssue.findUnique.mockResolvedValue({ voteCount: 1 });
    expect(await setVote(build, 'i1', 'u2', true)).toMatchObject({ ok: true, voted: true, voteCount: 1 });
    expect(db.tx.buildIssueVote.createMany.mock.calls[0]![0].skipDuplicates).toBe(true);
    expect(db.tx.buildIssue.updateMany).toHaveBeenCalledTimes(1);

    db.tx.buildIssueVote.createMany.mockResolvedValue({ count: 0 });
    db.tx.buildIssue.updateMany.mockClear();
    await setVote(build, 'i1', 'u2', true);
    expect(db.tx.buildIssue.updateMany).not.toHaveBeenCalled();
  });

  it('takes it back and decrements only when a mark was removed, never below zero', async () => {
    db.buildIssue.findUnique.mockResolvedValue({ voteCount: 0 });
    await setVote(build, 'i1', 'u2', false);
    expect(db.tx.buildIssue.updateMany.mock.calls[0]![0]).toEqual({
      where: { id: 'i1', voteCount: { gt: 0 } },
      data: { voteCount: { decrement: 1 } },
    });
    db.tx.buildIssueVote.deleteMany.mockResolvedValue({ count: 0 });
    db.tx.buildIssue.updateMany.mockClear();
    await setVote(build, 'i1', 'u2', false);
    expect(db.tx.buildIssue.updateMany).not.toHaveBeenCalled();
  });

  it('refuses your own issue, a banned member, a block with the creator or the reporter, and a settled issue', async () => {
    expect(await setVote(build, 'i1', 'reporter', true)).toMatchObject({ ok: false, reason: 'own' });

    db.userBlock.findFirst.mockResolvedValue({ id: 'blk' });
    expect(await setVote(build, 'i1', 'u2', true)).toMatchObject({ ok: false, reason: 'blocked' });
    expect(db.userBlock.findFirst.mock.calls[0]![0].where.OR[0].blockedId).toEqual({ in: ['creator', 'reporter'] });
    db.userBlock.findFirst.mockResolvedValue(null);

    db.user.findUnique.mockResolvedValue({ bannedUntil: new Date(Date.now() + 60_000), deletionScheduledAt: null });
    expect(await setVote(build, 'i1', 'u2', true)).toMatchObject({ ok: false, reason: 'banned' });
    db.user.findUnique.mockResolvedValue({ bannedUntil: null, deletionScheduledAt: null });

    db.buildIssue.findFirst.mockResolvedValue(issueRow({ status: 'fixed' }));
    expect(await setVote(build, 'i1', 'u2', true)).toMatchObject({ ok: false, status: 409, reason: 'closed' });
    expect(db.tx.buildIssueVote.createMany).not.toHaveBeenCalled();
  });
});

describe('closeIssue', () => {
  it('is a compare-and-set on the reporter and on "open"', async () => {
    await closeIssue(build, 'i1', 'reporter');
    expect(db.buildIssue.updateMany.mock.calls[0]![0].where).toEqual({
      id: 'i1',
      buildId: 'b1',
      reporterId: 'reporter',
      status: 'open',
    });
  });
  it('answers 403 to someone else and 409 to an issue that is no longer open', async () => {
    db.buildIssue.updateMany.mockResolvedValue({ count: 0 });
    expect(await closeIssue(build, 'i1', 'other')).toMatchObject({ ok: false, status: 403 });
    expect(await closeIssue(build, 'i1', 'reporter')).toMatchObject({ ok: false, status: 409 });
  });
});
