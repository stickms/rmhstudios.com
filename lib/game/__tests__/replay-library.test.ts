import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The replay library's ownership and visibility rules, against a small in-memory stand-in for the tables:
 * another member's replay answers "not found" to a patch or delete, a speedrun proof refuses both (409) and a ghost
 * is never made public. The board's query must leave out other versions, unscored runs, banned authors and authors
 * the viewer has blocked or who blocked the viewer.
 */

interface Row {
  id: string;
  userId: string;
  game: string;
  version: string;
  score: number | null;
  durationMs: number;
  visibility: string;
  createdAt: Date;
}

const db = vi.hoisted(() => ({
  replays: [] as Row[],
  proofs: [] as string[],
  boardArgs: undefined as unknown,
  blocked: [] as string[],
}));

vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    gameReplay: {
      findFirst: async ({ where }: { where: { id: string; userId: string } }) =>
        db.replays.find((r) => r.id === where.id && r.userId === where.userId) ?? null,
      findMany: async (args: { where: { userId?: string; game?: string; visibility?: string }; take: number }) => {
        if (!('visibility' in args.where)) {
          const mine = db.replays.filter(
            (r) => r.userId === args.where.userId && (!args.where.game || r.game === args.where.game),
          );
          return mine.slice(0, args.take);
        }
        db.boardArgs = args;
        return [];
      },
      groupBy: async () => [],
      updateMany: async ({ where, data }: { where: { id: string; userId: string }; data: { visibility: string } }) => {
        for (const r of db.replays) if (r.id === where.id && r.userId === where.userId) r.visibility = data.visibility;
        return { count: 1 };
      },
      deleteMany: async ({ where }: { where: { id: string; userId: string } }) => {
        db.replays = db.replays.filter((r) => !(r.id === where.id && r.userId === where.userId));
        return { count: 1 };
      },
    },
    speedrunEntry: {
      findMany: async ({ where }: { where: { replayId: { in: string[] } } }) =>
        db.proofs.filter((id) => where.replayId.in.includes(id)).map((replayId) => ({ replayId })),
    },
  },
}));
vi.mock('@/lib/moderation.server', () => ({ getBlockedAuthorIds: async () => db.blocked }));
vi.mock('@/lib/game/adapters.server', () => ({ getGameAdapter: () => undefined }));
vi.mock('@/lib/daily-puzzles/replay.server', () => ({ verifyDailyPuzzle: async () => null }));

import {
  canViewReplay,
  deleteReplay,
  listMyReplays,
  listReplaysForGame,
  ReplayError,
  setReplayVisibility,
} from '@/lib/replays.server';
import { getReplayable } from '@/lib/game/replay';

const row = (over: Partial<Row>): Row => ({
  id: 'r1',
  userId: 'owner',
  game: 'lights-out',
  version: 'lo-1',
  score: 100,
  durationMs: 1000,
  visibility: 'public',
  createdAt: new Date('2026-11-01T00:00:00Z'),
  ...over,
});

beforeEach(() => {
  db.replays = [];
  db.proofs = [];
  db.blocked = [];
  db.boardArgs = undefined;
});

describe('owner-only changes', () => {
  it('answers not found when another member patches or deletes a replay', async () => {
    db.replays = [row({})];
    expect(await setReplayVisibility('r1', 'intruder', 'unlisted')).toBeNull();
    expect(await deleteReplay('r1', 'intruder')).toBe(false);
    expect(db.replays).toHaveLength(1);
    expect(db.replays[0]!.visibility).toBe('public');
  });

  it('lets the owner unlist and delete an ordinary run', async () => {
    db.replays = [row({})];
    const changed = await setReplayVisibility('r1', 'owner', 'unlisted');
    expect(changed).toMatchObject({ id: 'r1', visibility: 'unlisted', kind: 'run' });
    expect(await deleteReplay('r1', 'owner')).toBe(true);
    expect(db.replays).toHaveLength(0);
  });
});

describe('a speedrun proof', () => {
  it('refuses delete and unlist with SPEEDRUN_PROOF and keeps the row', async () => {
    db.replays = [row({})];
    db.proofs = ['r1'];
    await expect(deleteReplay('r1', 'owner')).rejects.toMatchObject({ code: 'SPEEDRUN_PROOF' });
    await expect(setReplayVisibility('r1', 'owner', 'unlisted')).rejects.toBeInstanceOf(ReplayError);
    expect(db.replays).toHaveLength(1);
    expect(db.replays[0]!.visibility).toBe('public');
  });

  it('is marked as a speedrun proof in the member’s list', async () => {
    db.replays = [row({}), row({ id: 'r2' })];
    db.proofs = ['r1'];
    const page = await listMyReplays({ userId: 'owner' });
    expect(page.items.map((r) => [r.id, r.kind])).toEqual([
      ['r1', 'speedrun'],
      ['r2', 'run'],
    ]);
  });
});

describe('a ghost', () => {
  it('cannot be made public but can be deleted', async () => {
    db.replays = [row({ game: 'neon-driftway', visibility: 'unlisted' })];
    await expect(setReplayVisibility('r1', 'owner', 'public')).rejects.toMatchObject({ code: 'GHOST' });
    expect(db.replays[0]!.visibility).toBe('unlisted');
    expect(await deleteReplay('r1', 'owner')).toBe(true);
  });
});

describe('the game board query', () => {
  it('lists public, scored replays of the current version by authors who are not banned', async () => {
    await listReplaysForGame('lights-out', 10, null);
    const args = db.boardArgs as { where: Record<string, unknown>; take: number; orderBy: unknown };
    expect(args.take).toBe(10);
    expect(args.where).toMatchObject({
      game: 'lights-out',
      version: getReplayable('lights-out')!.version,
      visibility: 'public',
      score: { not: null },
    });
    expect(args.where.user).toEqual({ OR: [{ bannedUntil: null }, { bannedUntil: { lte: expect.any(Date) } }] });
    expect(args.where).not.toHaveProperty('userId');
    expect(args.orderBy).toEqual([{ score: 'desc' }, { createdAt: 'desc' }]);
  });

  it('leaves out authors the viewer blocked and authors who blocked the viewer', async () => {
    db.blocked = ['blocked-by-me', 'blocked-me'];
    await listReplaysForGame('lights-out', 10, 'viewer');
    const args = db.boardArgs as { where: { userId: unknown } };
    expect(args.where.userId).toEqual({ notIn: ['blocked-by-me', 'blocked-me'] });
  });

  it('answers nothing for a game that records no replays', async () => {
    expect(await listReplaysForGame('tetris', 10, null)).toEqual([]);
    expect(db.boardArgs).toBeUndefined();
  });
});

describe('canViewReplay', () => {
  const pub = { visibility: 'public', author: { id: 'owner' } };
  it('shows a public replay to anyone, and an unlisted one only to its owner', async () => {
    expect(await canViewReplay(pub, null)).toBe(true);
    expect(await canViewReplay({ ...pub, visibility: 'unlisted' }, 'other')).toBe(false);
    expect(await canViewReplay({ ...pub, visibility: 'unlisted' }, 'owner')).toBe(true);
  });
  it('hides a public replay from a viewer in a block with its author, but never from the author', async () => {
    db.blocked = ['owner'];
    expect(await canViewReplay(pub, 'viewer')).toBe(false);
    expect(await canViewReplay(pub, 'owner')).toBe(true);
  });
});
