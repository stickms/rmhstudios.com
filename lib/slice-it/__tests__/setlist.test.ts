/**
 * S8 — setlists (`lib/slice-it/setlist.server.ts`).
 *
 * The array column is the design decision under test. Two consequences of it
 * are the things that break:
 *
 *  - **Order has to be reimposed on read.** `findMany({ id: { in: [...] } })`
 *    returns rows in whatever order Postgres likes, so a setlist that renders in
 *    insertion order in development can render shuffled in production. The test
 *    for this feeds the mock a deliberately scrambled result set.
 *  - **A dangling id must shrink the list, not break it.** Songs get deleted;
 *    an array column has no foreign key to clean up after them.
 *
 * Plus the privacy rule: a private setlist is indistinguishable from a missing
 * one, because a 403 that differs from a 404 tells a stranger the id exists.
 *
 * Prisma is mocked; there is no Postgres in this repository.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

process.env.DATABASE_URL ??= 'postgresql://user:pass@127.0.0.1:5432/unused';

type FakeSetlist = {
  id: string;
  ownerId: string;
  name: string;
  description: string | null;
  isPublic: boolean;
  songIds: string[];
  createdAt: Date;
  updatedAt: Date;
  owner: { id: string; name: string | null; username: string | null };
};

type FakeSong = { id: string; title: string; isPublic: boolean; uploadedBy: string };

/** The only two `where` shapes `setlist.server.ts` builds against `song`. */
type SongWhere = {
  id?: { in: string[] };
  OR?: { isPublic?: boolean; uploadedBy?: string }[];
};

const state: { setlists: FakeSetlist[]; songs: FakeSong[]; likes: string[] } = {
  setlists: [],
  songs: [],
  likes: [],
};

/** Rows come back in an order the caller did not ask for — on purpose. */
function scrambled<T>(rows: T[]): T[] {
  return [...rows].reverse();
}

vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    sliceSetlist: {
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
        state.setlists.filter((s) =>
          'ownerId' in where ? s.ownerId === where.ownerId : s.isPublic === where.isPublic,
        ),
      ),
      findUnique: vi.fn(
        async ({ where }: { where: { id: string } }) =>
          state.setlists.find((s) => s.id === where.id) ?? null,
      ),
      count: vi.fn(
        async ({ where }: { where: { ownerId: string } }) =>
          state.setlists.filter((s) => s.ownerId === where.ownerId).length,
      ),
      create: vi.fn(async ({ data }: { data: Partial<FakeSetlist> & { id: string } }) => {
        const row: FakeSetlist = {
          id: data.id,
          ownerId: data.ownerId!,
          name: data.name!,
          description: data.description ?? null,
          isPublic: data.isPublic ?? false,
          songIds: data.songIds ?? [],
          createdAt: new Date(),
          updatedAt: new Date(),
          owner: { id: data.ownerId!, name: 'Owner', username: 'owner' },
        };
        state.setlists.push(row);
        return row;
      }),
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string; ownerId: string };
          data: Partial<FakeSetlist>;
        }) => {
          const row = state.setlists.find((s) => s.id === where.id && s.ownerId === where.ownerId);
          if (!row) return { count: 0 };
          Object.assign(row, data);
          return { count: 1 };
        },
      ),
      deleteMany: vi.fn(async ({ where }: { where: { id: string; ownerId: string } }) => {
        const before = state.setlists.length;
        state.setlists = state.setlists.filter(
          (s) => !(s.id === where.id && s.ownerId === where.ownerId),
        );
        return { count: before - state.setlists.length };
      }),
    },
    song: {
      findMany: vi.fn(async ({ where }: { where: SongWhere }) => {
        const ids: string[] = where.id?.in ?? [];
        let rows = state.songs.filter((s) => ids.includes(s.id));
        if (where.OR) {
          const owner = where.OR.find((c) => c.uploadedBy)?.uploadedBy;
          rows = rows.filter((s) => s.isPublic || s.uploadedBy === owner);
        }
        return scrambled(
          rows.map((s) => ({
            id: s.id,
            title: s.title,
            artist: 'Artist',
            coverUrl: null,
            duration: 100,
            chartRating: null,
          })),
        );
      }),
    },
    songLike: {
      findMany: vi.fn(async () =>
        state.likes.map((id) => ({
          song: {
            id,
            title: `Track ${id}`,
            artist: 'Artist',
            coverUrl: null,
            duration: 100,
            chartRating: null,
          },
        })),
      ),
    },
  },
}));

const {
  LIKED_SETLIST_ID,
  createSetlist,
  deleteSetlist,
  likedSongsSetlist,
  listOwnSetlists,
  listPublicSetlists,
  resolveSetlist,
  updateSetlist,
} = await import('@/lib/slice-it/setlist.server');

beforeEach(() => {
  state.setlists = [];
  state.songs = ['s1', 's2', 's3', 's4'].map((id) => ({
    id,
    title: `Track ${id}`,
    isPublic: true,
    uploadedBy: 'someone',
  }));
  state.likes = [];
});

async function seed(songIds: string[], overrides: Partial<FakeSetlist> = {}) {
  const result = await createSetlist('me', { name: 'Set', songIds });
  const row = state.setlists[0];
  Object.assign(row, overrides);
  return { result, row };
}

describe('createSetlist', () => {
  it('gets a time-sortable uuid, not the column default', async () => {
    await seed(['s1']);
    // uuidv7: version nibble is 7. A `gen_random_uuid()` fallback would be 4.
    expect(state.setlists[0].id[14]).toBe('7');
  });

  it('drops ids that are not real songs', async () => {
    await seed(['s1', 'ghost', 's2']);
    expect(state.setlists[0].songIds).toEqual(['s1', 's2']);
  });

  it('is private by default', async () => {
    await seed(['s1']);
    expect(state.setlists[0].isPublic).toBe(false);
  });
});

describe('resolveSetlist', () => {
  it('returns songs in the STORED order, not the database’s', async () => {
    await seed(['s3', 's1', 's4', 's2']);
    const resolved = await resolveSetlist(state.setlists[0].id, 'me');
    expect(resolved?.songs.map((s) => s.id)).toEqual(['s3', 's1', 's4', 's2']);
  });

  it('shrinks around a song that no longer exists and says how many', async () => {
    await seed(['s1', 's2', 's3']);
    state.songs = state.songs.filter((s) => s.id !== 's2');
    const resolved = await resolveSetlist(state.setlists[0].id, 'me');
    expect(resolved?.songs.map((s) => s.id)).toEqual(['s1', 's3']);
    expect(resolved?.missingCount).toBe(1);
    // The read does NOT repair the stored array — a read path that writes is a
    // read path that writes under load.
    expect(state.setlists[0].songIds).toEqual(['s1', 's2', 's3']);
  });

  it('hides a private setlist from a stranger the same way a missing one is hidden', async () => {
    await seed(['s1']);
    expect(await resolveSetlist(state.setlists[0].id, 'someone-else')).toBeNull();
    expect(await resolveSetlist('no-such-id', 'someone-else')).toBeNull();
  });

  it('shows a shared setlist to anyone, marked not-owned', async () => {
    await seed(['s1'], { isPublic: true });
    const resolved = await resolveSetlist(state.setlists[0].id, 'stranger');
    expect(resolved?.isOwner).toBe(false);
    expect(resolved?.songs).toHaveLength(1);
  });
});

describe('updateSetlist', () => {
  it('replaces the order wholesale — the array IS the move', async () => {
    await seed(['s1', 's2', 's3']);
    const id = state.setlists[0].id;
    const result = await updateSetlist('me', id, { songIds: ['s3', 's1', 's2'] });
    expect(result.ok).toBe(true);
    expect(state.setlists[0].songIds).toEqual(['s3', 's1', 's2']);
    if (result.ok) expect(result.setlist.songs.map((s) => s.id)).toEqual(['s3', 's1', 's2']);
  });

  it('refuses an edit from anyone but the owner, in the WHERE clause', async () => {
    await seed(['s1']);
    const result = await updateSetlist('intruder', state.setlists[0].id, { name: 'Mine now' });
    expect(result).toEqual({ ok: false, reason: 'not-found' });
    expect(state.setlists[0].name).toBe('Set');
  });

  it('leaves unmentioned fields alone', async () => {
    await seed(['s1', 's2']);
    await updateSetlist('me', state.setlists[0].id, { isPublic: true });
    expect(state.setlists[0].songIds).toEqual(['s1', 's2']);
    expect(state.setlists[0].name).toBe('Set');
  });
});

describe('deleteSetlist', () => {
  it('deletes your own and refuses someone else’s', async () => {
    await seed(['s1']);
    const id = state.setlists[0].id;
    expect(await deleteSetlist('intruder', id)).toBe(false);
    expect(await deleteSetlist('me', id)).toBe(true);
    expect(state.setlists).toHaveLength(0);
  });
});

describe('listing', () => {
  it('marks ownership on the public browse', async () => {
    await seed(['s1'], { isPublic: true });
    const rows = await listPublicSetlists('me');
    expect(rows[0].isOwner).toBe(true);
    expect((await listPublicSetlists('stranger'))[0].isOwner).toBe(false);
  });

  it('counts songs from the stored array, without resolving them', async () => {
    await seed(['s1', 's2', 's3']);
    const rows = await listOwnSetlists('me');
    expect(rows[0].songCount).toBe(3);
  });
});

describe('likedSongsSetlist', () => {
  it('is virtual — never a row, and never editable', async () => {
    state.likes = ['s2', 's1'];
    const liked = await likedSongsSetlist('me');
    expect(liked.id).toBe(LIKED_SETLIST_ID);
    expect(liked.isOwner).toBe(false);
    expect(liked.songs.map((s) => s.id)).toEqual(['s2', 's1']);
    expect(state.setlists).toHaveLength(0);
  });
});
