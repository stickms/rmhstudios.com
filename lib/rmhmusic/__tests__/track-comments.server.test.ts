import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  findMany: vi.fn(),
  count: vi.fn(),
  create: vi.fn(),
  deleteMany: vi.fn(),
}));
vi.mock('@/lib/prisma.server', () => ({ prisma: { rmhMusicTrackComment: m } }));

import { addTrackComment, deleteTrackComment, listTrackComments } from '../track-comments.server';
import { COMMENTS_PER_USER_PER_TRACK } from '../track-comments';

beforeEach(() => vi.resetAllMocks());

describe('listTrackComments', () => {
  it("maps rows, prefers displayName and flags the viewer's own", async () => {
    m.findMany.mockResolvedValue([
      { id: 'a', positionMs: 1000, body: 'one', userId: 'u1', user: { name: 'N', profile: { displayName: 'Disp' } } },
      { id: 'b', positionMs: 2000, body: 'two', userId: 'u2', user: { name: null, profile: null } },
    ]);
    const out = await listTrackComments('spotify:track:1', 'u1');
    expect(m.findMany.mock.calls[0][0].where).toEqual({ trackUri: 'spotify:track:1' });
    expect(out).toEqual([
      { id: 'a', positionMs: 1000, body: 'one', author: 'Disp', mine: true },
      { id: 'b', positionMs: 2000, body: 'two', author: 'Member', mine: false },
    ]);
  });
  it('marks nothing as mine for a signed-out viewer', async () => {
    m.findMany.mockResolvedValue([{ id: 'a', positionMs: 0, body: 'x', userId: 'u1', user: { name: 'N', profile: null } }]);
    expect((await listTrackComments('t', null))[0].mine).toBe(false);
  });
});

describe('addTrackComment', () => {
  it('returns null at the per-track cap without writing', async () => {
    m.count.mockResolvedValue(COMMENTS_PER_USER_PER_TRACK);
    expect(await addTrackComment('u1', 't', 5, 'hi')).toBeNull();
    expect(m.create).not.toHaveBeenCalled();
  });
  it('creates under the cap', async () => {
    m.count.mockResolvedValue(COMMENTS_PER_USER_PER_TRACK - 1);
    m.create.mockResolvedValue({ id: 'n', positionMs: 5, body: 'hi', user: { name: 'N', profile: null } });
    expect(await addTrackComment('u1', 't', 5, 'hi')).toEqual({ id: 'n', positionMs: 5, body: 'hi', author: 'N', mine: true });
    expect(m.create.mock.calls[0][0].data).toEqual({ userId: 'u1', trackUri: 't', positionMs: 5, body: 'hi' });
  });
});

describe('deleteTrackComment', () => {
  it('scopes the delete to the author', async () => {
    m.deleteMany.mockResolvedValue({ count: 1 });
    expect(await deleteTrackComment('u1', 'c1')).toBe(true);
    expect(m.deleteMany).toHaveBeenCalledWith({ where: { id: 'c1', userId: 'u1' } });
  });
  it('reports false when nothing matched', async () => {
    m.deleteMany.mockResolvedValue({ count: 0 });
    expect(await deleteTrackComment('u2', 'c1')).toBe(false);
  });
});
