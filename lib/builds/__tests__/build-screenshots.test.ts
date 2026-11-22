import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Build screenshots (s07-17), the server rules against an in-memory stand-in for the three tables they touch:
 * owner-only upload and save, the cap of eight, the refusal of an undescribed screenshot, the saved order, who can
 * read the list, the `build` ingest surface, and the real table and column names behind the raw lock.
 */

type Shot = {
  id: string;
  buildId: string;
  url: string;
  width: number;
  height: number;
  description: string;
  position: number;
};
type MediaRow = {
  id: string;
  userId: string;
  url: string;
  key: string;
  status: string;
  postId: string | null;
  attachedAt: Date | null;
};

const state = vi.hoisted(() => ({
  shots: [] as Shot[],
  media: [] as MediaRow[],
  builds: [] as {
    id: string;
    slug: string;
    userId: string;
    visibility: string;
    thumbnailUrl: string | null;
  }[],
  locks: [] as string[],
  seq: 0,
}));
const ingestMock = vi.hoisted(() => vi.fn());
const deleteObject = vi.hoisted(() => vi.fn(async () => {}));

vi.mock('@/lib/media/ingest.server', () => ({
  ingest: ingestMock,
  IngestError: class IngestError extends Error {
    constructor(
      message: string,
      readonly status: number = 400,
    ) {
      super(message);
    }
  },
}));
vi.mock('@/lib/storage/s3.server', () => ({
  deleteObject,
}));
vi.mock('@/lib/db/advisory-lock.server', () => ({
  lockKey: vi.fn(async (_tx: unknown, key: string) => {
    state.locks.push(key);
  }),
}));

const fake = vi.hoisted(() => {
  const make = () => ({
    userBuild: {
      findUnique: async ({
        where,
      }: {
        where: {
          id?: string;
          slug?: string;
        };
      }) => state.builds.find((b) => (where.id ? b.id === where.id : b.slug === where.slug)) ?? null,
      count: async ({
        where,
      }: {
        where: {
          thumbnailUrl: string;
        };
      }) => state.builds.filter((b) => b.thumbnailUrl === where.thumbnailUrl).length,
    },
    buildScreenshot: {
      findMany: async ({
        where,
      }: {
        where: {
          buildId: string;
        };
      }) => state.shots.filter((s) => s.buildId === where.buildId).sort((a, b) => a.position - b.position),
      count: async ({
        where,
      }: {
        where: {
          url: string;
        };
      }) => state.shots.filter((s) => s.url === where.url).length,
      delete: async ({
        where,
      }: {
        where: {
          id: string;
        };
      }) => {
        state.shots = state.shots.filter((s) => s.id !== where.id);
      },
      update: async ({
        where,
        data,
      }: {
        where: {
          id: string;
        };
        data: Partial<Shot>;
      }) => {
        Object.assign(
          state.shots.find((s) => s.id === where.id)!,
          data,
        );
      },
      create: async ({ data }: { data: Omit<Shot, 'id'> }) => {
        state.shots.push({
          id: `s${++state.seq}`,
          ...data,
        });
      },
    },
    media: {
      updateMany: async ({
        where,
        data,
      }: {
        where: {
          userId: string;
          url: string;
          status: string;
        };
        data: {
          status: string;
        };
      }) => {
        const rows = state.media.filter(
          (m) => m.userId === where.userId && m.url === where.url && m.status === where.status,
        );
        rows.forEach((m) => Object.assign(m, data));
        return {
          count: rows.length,
        };
      },
      findMany: async ({
        where,
      }: {
        where: {
          userId: string;
          url: string;
          status: string;
        };
      }) =>
        state.media.filter(
          (m) =>
            m.userId === where.userId &&
            m.url === where.url &&
            m.status === where.status &&
            m.postId === null &&
            m.attachedAt === null,
        ),
      delete: async ({
        where,
      }: {
        where: {
          id: string;
        };
      }) => {
        state.media = state.media.filter((m) => m.id !== where.id);
      },
    },
  });
  const db = make() as ReturnType<typeof make> & {
    $transaction: <T>(fn: (tx: unknown) => Promise<T>) => Promise<T>;
  };
  // Rolls back on a throw, as the real transaction does.
  // One at a time: the stand-in for `pg_advisory_xact_lock`, which the real code takes first (asserted below).
  let queue: Promise<unknown> = Promise.resolve();
  db.$transaction = (fn) => {
    const run = queue.then(() => runTx(fn));
    queue = run.catch(() => {});
    return run;
  };
  const runTx = async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
    await new Promise((r) => setTimeout(r, 0));
    const before = {
      shots: state.shots.map((s) => ({
        ...s,
      })),
      media: state.media.map((m) => ({
        ...m,
      })),
    };
    try {
      return await fn(db);
    } catch (err) {
      state.shots = before.shots;
      state.media = before.media;
      throw err;
    }
  };
  return db;
});
vi.mock('@/lib/prisma.server', () => ({
  prisma: fake,
}));

import {
  findScreenshotBuild,
  listScreenshots,
  saveScreenshots,
  uploadBuildImage,
  canSeeScreenshots,
  exportBuildScreenshots,
} from '@/lib/builds/screenshots.server';

const pending = (url: string, userId = 'owner'): MediaRow => ({
  id: `m-${url}`,
  userId,
  url,
  key: `k-${url}`,
  status: 'PENDING',
  postId: null,
  attachedAt: null,
});
const item = (url: string, description = `About ${url}`) => ({
  url,
  width: 1280,
  height: 720,
  description,
});

beforeEach(() => {
  state.shots = [];
  state.media = [];
  state.locks = [];
  state.seq = 0;
  state.builds = [
    {
      id: 'b1',
      slug: 'pub',
      userId: 'owner',
      visibility: 'PUBLIC',
      thumbnailUrl: null,
    },
    {
      id: 'b2',
      slug: 'priv',
      userId: 'owner',
      visibility: 'PRIVATE',
      thumbnailUrl: null,
    },
  ];
  ingestMock.mockReset();
  deleteObject.mockClear();
});

describe('uploadBuildImage', () => {
  const file = new File([new Uint8Array([1, 2, 3])], 'a.png', {
    type: 'image/png',
  });

  it('stores through the build ingest surface as a recorded upload', async () => {
    ingestMock.mockResolvedValue({
      url: 'https://x/a.webp',
      width: 1280,
      height: 720,
    });
    const build = await findScreenshotBuild('pub');
    const result = await uploadBuildImage(build, 'owner', file);
    expect(result).toEqual({
      ok: true,
      url: 'https://x/a.webp',
      width: 1280,
      height: 720,
    });
    expect(ingestMock).toHaveBeenCalledWith(file, 'build', {
      userId: 'owner',
      record: true,
    });
  });

  it('is the owner’s alone: a stranger is refused and a private build looks absent', async () => {
    expect(await uploadBuildImage(await findScreenshotBuild('pub'), 'stranger', file)).toMatchObject({
      ok: false,
      status: 403,
    });
    expect(await uploadBuildImage(await findScreenshotBuild('priv'), 'stranger', file)).toMatchObject({
      ok: false,
      status: 404,
    });
    expect(await uploadBuildImage(null, 'owner', file)).toMatchObject({
      ok: false,
      status: 404,
    });
    expect(ingestMock).not.toHaveBeenCalled();
  });

  it('passes the ingest refusal on with its status', async () => {
    const { IngestError } = await import('@/lib/media/ingest.server');
    ingestMock.mockRejectedValue(new IngestError('Image is too large.', 413));
    expect(await uploadBuildImage(await findScreenshotBuild('pub'), 'owner', file)).toEqual({
      ok: false,
      status: 413,
      error: 'Image is too large.',
    });
  });

  it('needs a file', async () => {
    expect(await uploadBuildImage(await findScreenshotBuild('pub'), 'owner', null)).toMatchObject({
      ok: false,
      status: 400,
    });
  });
});

describe('saveScreenshots', () => {
  it('saves in order, attaches the uploads and takes the build’s lock', async () => {
    state.media = [pending('a'), pending('b')];
    const result = await saveScreenshots(await findScreenshotBuild('b1'), 'owner', [item('b'), item('a')]);
    expect(result).toMatchObject({
      ok: true,
    });
    expect(result.ok && result.items.map((i) => i.url)).toEqual(['b', 'a']);
    expect(state.media.every((m) => m.status === 'ATTACHED' && m.postId === null && m.attachedAt === null)).toBe(true);
    expect(state.locks).toEqual(['build-screenshots:b1']);
  });

  it('persists a reorder and a changed description', async () => {
    state.media = [pending('a'), pending('b'), pending('c')];
    const build = await findScreenshotBuild('b1');
    await saveScreenshots(build, 'owner', [item('a'), item('b'), item('c')]);
    const result = await saveScreenshots(build, 'owner', [item('c'), item('a', 'New words'), item('b')]);
    expect(result.ok && result.items.map((i) => [i.url, i.description])).toEqual([
      ['c', 'About c'],
      ['a', 'New words'],
      ['b', 'About b'],
    ]);
  });

  it('refuses a screenshot with no description, naming its index, and saves nothing', async () => {
    state.media = [pending('a'), pending('b')];
    const result = await saveScreenshots(await findScreenshotBuild('b1'), 'owner', [item('a'), item('b', '   ')]);
    expect(result).toMatchObject({
      ok: false,
      status: 400,
      code: 'DESCRIPTION_REQUIRED',
      index: 1,
    });
    expect(state.shots).toHaveLength(0);
    expect(state.media.every((m) => m.status === 'PENDING')).toBe(true);
  });

  it('refuses a ninth screenshot', async () => {
    const nine = Array.from(
      {
        length: 9,
      },
      (_, i) => item(`u${i}`),
    );
    state.media = nine.map((n) => pending(n.url));
    const result = await saveScreenshots(await findScreenshotBuild('b1'), 'owner', nine);
    expect(result).toMatchObject({
      ok: false,
      status: 400,
      code: 'TOO_MANY',
    });
    expect(state.shots).toHaveLength(0);
  });

  it('holds the cap of eight under two concurrent saves of different pictures', async () => {
    const mk = (prefix: string) =>
      Array.from(
        {
          length: 8,
        },
        (_, i) => item(`${prefix}${i}`),
      );
    state.media = [...mk('x'), ...mk('y')].map((n) => pending(n.url));
    const build = await findScreenshotBuild('b1');
    await Promise.all([saveScreenshots(build, 'owner', mk('x')), saveScreenshots(build, 'owner', mk('y'))]);
    expect(state.shots.filter((s) => s.buildId === 'b1').length).toBeLessThanOrEqual(8);
    expect(state.locks).toEqual(['build-screenshots:b1', 'build-screenshots:b1']);
  });

  it('is the owner’s alone', async () => {
    state.media = [pending('a', 'stranger')];
    expect(await saveScreenshots(await findScreenshotBuild('b1'), 'stranger', [item('a')])).toMatchObject({
      ok: false,
      status: 403,
    });
    expect(await saveScreenshots(await findScreenshotBuild('b2'), 'stranger', [item('a')])).toMatchObject({
      ok: false,
      status: 404,
    });
    expect(state.shots).toHaveLength(0);
  });

  it('refuses a picture that is not the owner’s own pending upload, and rolls back', async () => {
    state.media = [pending('a'), pending('theirs', 'someone-else')];
    const result = await saveScreenshots(await findScreenshotBuild('b1'), 'owner', [item('a'), item('theirs')]);
    expect(result).toMatchObject({
      ok: false,
      status: 409,
    });
    expect(state.shots).toHaveLength(0);
    expect(state.media.find((m) => m.url === 'a')!.status).toBe('PENDING');
  });

  it('deletes the object and row of a removed screenshot', async () => {
    state.media = [pending('a'), pending('b')];
    const build = await findScreenshotBuild('b1');
    await saveScreenshots(build, 'owner', [item('a'), item('b')]);
    await saveScreenshots(build, 'owner', [item('a')]);
    expect(deleteObject).toHaveBeenCalledWith('k-b');
    expect(state.media.map((m) => m.url)).toEqual(['a']);
  });
});

describe('who can read the list', () => {
  beforeEach(() => {
    state.shots = [
      {
        id: 's1',
        buildId: 'b1',
        url: 'a',
        width: 1,
        height: 1,
        description: 'd',
        position: 0,
      },
      {
        id: 's2',
        buildId: 'b2',
        url: 'p',
        width: 1,
        height: 1,
        description: 'd',
        position: 0,
      },
    ];
  });

  it('shows a public build’s screenshots to anyone', async () => {
    expect(await listScreenshots(await findScreenshotBuild('pub'), null)).toHaveLength(1);
  });

  it('keeps a private (or taken-down) build’s screenshots from everyone but the owner', async () => {
    const build = await findScreenshotBuild('priv');
    expect(await listScreenshots(build, null)).toBeNull();
    expect(await listScreenshots(build, 'stranger')).toBeNull();
    expect(await listScreenshots(build, 'owner')).toHaveLength(1);
    expect(
      canSeeScreenshots(
        {
          userId: 'owner',
          visibility: 'PRIVATE',
        },
        'other',
      ),
    ).toBe(false);
    expect(
      canSeeScreenshots(
        {
          userId: 'owner',
          visibility: 'UNLISTED',
        },
        null,
      ),
    ).toBe(true);
  });

  it('puts the screenshots in the member’s export', async () => {
    (
      fake.buildScreenshot as unknown as {
        findMany: unknown;
      }
    ).findMany = async () => [
      {
        url: 'a',
        description: 'd',
        position: 0,
        build: {
          slug: 'pub',
          thumbnailAlt: null,
        },
      },
    ];
    expect(await exportBuildScreenshots('owner')).toEqual([
      {
        build: 'pub',
        position: 0,
        url: 'a',
        description: 'd',
      },
    ]);
  });
});

describe('read paths and storage names', () => {
  it('serves screenshots only through the build’s own projections', () => {
    const detail = readFileSync('lib/user-builds-detail.server.ts', 'utf8');
    expect(detail).toContain('screenshots: build.screenshots');
    // the list endpoints never select them
    expect(readFileSync('lib/user-builds-list.ts', 'utf8')).not.toContain('screenshots');
    // the public API route answers only PUBLIC builds
    const v1 = readFileSync('app/routes/api/v1/builds/$slug.ts', 'utf8');
    expect(v1).toContain("build.visibility !== 'PUBLIC'");
    expect(v1).toContain('screenshots: build.screenshots');
  });

  it('declares the real table and columns in the schema and the migration', () => {
    const schema = readFileSync('prisma/schema/builds.prisma', 'utf8');
    expect(schema).toContain('@@map("build_screenshot")');
    const sql = readFileSync('prisma/migrations/20261127040200_s07_build_screenshots/migration.sql', 'utf8');
    for (const col of ['"buildId"', '"description"', '"position"', '"width"', '"height"', '"thumbnailAlt"']) {
      expect(sql).toContain(col);
    }
    expect(sql).toContain('CREATE TABLE "build_screenshot"');
    // the one raw statement is the advisory lock, which names no table
    const server = readFileSync('lib/builds/screenshots.server.ts', 'utf8');
    expect(server).not.toMatch(/\$(query|execute)Raw/);
    expect(server).toContain('lockKey(tx, `build-screenshots:${build.id}`)');
  });
});
