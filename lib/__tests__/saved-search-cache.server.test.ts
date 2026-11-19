import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
} from 'vitest';

const prismaMock =
  vi.hoisted(
    () => ({
      customFeed:
        {
          findMany:
            vi.fn(),
          count:
            vi.fn(),
          create:
            vi.fn(),
          updateMany:
            vi.fn(),
          deleteMany:
            vi.fn(),
        },
    }),
  );
vi.mock(
  '@/lib/prisma.server',
  () => ({
    prisma:
      prismaMock,
  }),
);

import {
  listSaved,
  createSaved,
  updateSaved,
  deleteSaved,
} from '@/lib/search/saved.server';

beforeEach(
  () => {
    prismaMock.customFeed.findMany
      .mockReset()
      .mockResolvedValue(
        [],
      );
    prismaMock.customFeed.count
      .mockReset()
      .mockResolvedValue(
        0,
      );
    prismaMock.customFeed.create
      .mockReset()
      .mockResolvedValue(
        {
          id: 'x',
          query:
            'q',
          types:
            [],
          notify: false,
          createdAt:
            new Date(
              0,
            ),
        },
      );
    prismaMock.customFeed.updateMany
      .mockReset()
      .mockResolvedValue(
        {
          count: 1,
        },
      );
    prismaMock.customFeed.deleteMany
      .mockReset()
      .mockResolvedValue(
        {
          count: 1,
        },
      );
  },
);

describe('listSaved caching', () => {
  it('serves a repeat read from cache (one DB round trip)', async () => {
    await listSaved(
      'cache-user-a',
    );
    await listSaved(
      'cache-user-a',
    );
    expect(
      prismaMock
        .customFeed
        .findMany,
    ).toHaveBeenCalledTimes(
      1,
    );
  });

  it('never crosses users', async () => {
    await listSaved(
      'cache-user-b',
    );
    await listSaved(
      'cache-user-c',
    );
    expect(
      prismaMock
        .customFeed
        .findMany,
    ).toHaveBeenCalledTimes(
      2,
    );
  });

  it('re-queries after a create invalidates the cache', async () => {
    await listSaved(
      'cache-user-d',
    ); // 1: warms cache
    await createSaved(
      'cache-user-d',
      'from:alex has:media',
    );
    await listSaved(
      'cache-user-d',
    ); // 2: cache dropped by the write
    expect(
      prismaMock
        .customFeed
        .findMany,
    ).toHaveBeenCalledTimes(
      2,
    );
  });

  it('re-queries after an update or delete invalidates the cache', async () => {
    await listSaved(
      'cache-user-e',
    ); // 1
    await updateSaved(
      'cache-user-e',
      'id1',
      true,
    );
    await listSaved(
      'cache-user-e',
    ); // 2
    await deleteSaved(
      'cache-user-e',
      'id1',
    );
    await listSaved(
      'cache-user-e',
    ); // 3
    expect(
      prismaMock
        .customFeed
        .findMany,
    ).toHaveBeenCalledTimes(
      3,
    );
  });
});
