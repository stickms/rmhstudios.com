import { describe, it, expect, vi, beforeEach } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  playlist: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  playlistItem: { findFirst: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
  playlistCollaborator: {
    count: vi.fn(),
    upsert: vi.fn(),
    findMany: vi.fn(),
    deleteMany: vi.fn(),
  },
  user: { findUnique: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock('@/lib/prisma.server', () => ({ prisma: prismaMock }));

import {
  addCollaborator,
  addItem,
  canEditPlaylist,
  isPlaylistOwner,
  MAX_COLLABORATORS,
  removeCollaborator,
  removeItem,
} from '@/lib/playlists.server';

beforeEach(() => {
  vi.resetAllMocks();
});

describe('canEditPlaylist', () => {
  it('queries for owner OR collaborator and is true when a row matches', async () => {
    prismaMock.playlist.findFirst.mockResolvedValue({ id: 'p1' });
    expect(await canEditPlaylist('u1', 'p1')).toBe(true);
    expect(prismaMock.playlist.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'p1',
        OR: [{ userId: 'u1' }, { collaborators: { some: { userId: 'u1' } } }],
      },
      select: { id: true },
    });
  });

  it('is false for strangers and unknown playlists', async () => {
    prismaMock.playlist.findFirst.mockResolvedValue(null);
    expect(await canEditPlaylist('u2', 'p1')).toBe(false);
  });
});

describe('item edits go through canEditPlaylist', () => {
  it('addItem 404s when the caller cannot edit', async () => {
    prismaMock.playlist.findFirst.mockResolvedValue(null);
    const r = await addItem('p1', 'stranger', { externalId: 'x', title: 't' });
    expect(r).toEqual({ ok: false, error: 'Playlist not found', status: 404 });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('addItem succeeds for a collaborator', async () => {
    prismaMock.playlist.findFirst.mockResolvedValue({ id: 'p1' });
    prismaMock.playlist.findUnique.mockResolvedValue({ id: 'p1', itemCount: 0 });
    prismaMock.playlistItem.findFirst.mockResolvedValue(null);
    prismaMock.$transaction.mockResolvedValue([]);
    const r = await addItem('p1', 'collab', { externalId: 'x', title: 't' });
    expect(r).toEqual({ ok: true, duplicate: false });
  });

  it('removeItem is refused for non-editors', async () => {
    prismaMock.playlist.findFirst.mockResolvedValue(null);
    expect(await removeItem('p1', 'i1', 'stranger')).toBe(false);
    expect(prismaMock.playlistItem.deleteMany).not.toHaveBeenCalled();
  });
});

describe('collaborator management is owner-only', () => {
  it('isPlaylistOwner checks Playlist.userId only', async () => {
    prismaMock.playlist.findFirst.mockResolvedValue(null);
    expect(await isPlaylistOwner('collab', 'p1')).toBe(false);
    expect(prismaMock.playlist.findFirst).toHaveBeenCalledWith({
      where: { id: 'p1', userId: 'collab' },
      select: { id: true },
    });
  });

  it('a non-owner cannot add or remove collaborators', async () => {
    prismaMock.playlist.findFirst.mockResolvedValue(null);
    expect(await addCollaborator('p1', 'collab', 'bob')).toMatchObject({ ok: false, status: 404 });
    expect(await removeCollaborator('p1', 'collab', 'u3')).toBe(false);
    expect(prismaMock.playlistCollaborator.upsert).not.toHaveBeenCalled();
    expect(prismaMock.playlistCollaborator.deleteMany).not.toHaveBeenCalled();
  });

  it('owner can add by handle', async () => {
    prismaMock.playlist.findFirst.mockResolvedValue({ id: 'p1' });
    prismaMock.user.findUnique.mockResolvedValue({ id: 'u3' });
    prismaMock.playlistCollaborator.count.mockResolvedValue(2);
    expect(await addCollaborator('p1', 'owner', 'bob')).toEqual({ ok: true });
    expect(prismaMock.playlistCollaborator.upsert).toHaveBeenCalled();
  });

  it('rejects unknown handles and adding yourself', async () => {
    prismaMock.playlist.findFirst.mockResolvedValue({ id: 'p1' });
    prismaMock.user.findUnique.mockResolvedValueOnce(null);
    expect(await addCollaborator('p1', 'owner', 'nobody')).toMatchObject({ status: 404 });
    prismaMock.user.findUnique.mockResolvedValueOnce({ id: 'owner' });
    expect(await addCollaborator('p1', 'owner', 'me')).toMatchObject({ status: 400 });
  });

  it('enforces the collaborator cap', async () => {
    prismaMock.playlist.findFirst.mockResolvedValue({ id: 'p1' });
    prismaMock.user.findUnique.mockResolvedValue({ id: 'u9' });
    prismaMock.playlistCollaborator.count.mockResolvedValue(MAX_COLLABORATORS);
    expect(await addCollaborator('p1', 'owner', 'bob')).toMatchObject({ ok: false, status: 400 });
    expect(prismaMock.playlistCollaborator.upsert).not.toHaveBeenCalled();
  });
});
