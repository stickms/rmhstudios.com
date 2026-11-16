import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

// The board's cache against a consent change in ANOTHER process: a rebuild that read the rows
// before the change must never be served after it. Redis is faked as a counter map; the cache is
// a plain map that keeps whatever a loader returns, like an L1 and an L2 that never expire.
const h =
  vi.hoisted(
    () => {
      const counters =
        new Map<
          string,
          number
        >();
      const store =
        new Map<
          string,
          unknown
        >();
      return {
        counters,
        store,
        redisOn: true,
        incr: vi.fn(
          async (
            key: string,
            by: number,
          ) => {
            if (
              !h.redisOn
            )
              return null;
            const next =
              (counters.get(
                key,
              ) ??
                0) +
              by;
            counters.set(
              key,
              next,
            );
            return next;
          },
        ),
        cached:
          vi.fn(
            async (
              key: string,
              _ttl: number,
              loader: () => Promise<unknown>,
              _opts?: unknown,
            ) => {
              if (
                !store.has(
                  key,
                )
              )
                store.set(
                  key,
                  await loader(),
                );
              return store.get(
                key,
              );
            },
          ),
        invalidate:
          vi.fn(
            async (
              key: string,
            ) => {
              store.delete(
                key,
              );
            },
          ),
      };
    },
  );
vi.mock(
  '@/lib/redis.server',
  () => ({
    redisIncrBy:
      h.incr,
  }),
);
vi.mock(
  '@/lib/cached.server',
  () => ({
    cached:
      h.cached,
    invalidateCached:
      h.invalidate,
  }),
);

import {
  BOARD_LOCAL_TTL_MS,
  cachedBoard,
  dropLearnerBoardCaches,
  invalidateBoard,
} from './board-cache.server';
import {
  boardCacheKey,
  friendsCacheKey,
} from './cache-keys';

const NOW =
  Date.UTC(
    2026,
    10,
    16,
    9,
  );

beforeEach(
  () => {
    h.counters.clear();
    h.store.clear();
    h.redisOn = true;
    vi.clearAllMocks();
  },
);

describe('cachedBoard', () => {
  it('a rebuild that started before a consent change is never served after it', async () => {
    let release!: (
      v: string[],
    ) => void;
    // Process A starts a rebuild and reads the rows before the change commits.
    const stale =
      cachedBoard(
        '2026-11-16',
        () =>
          new Promise<
            string[]
          >(
            (
              r,
            ) =>
              (release =
                r),
          ),
      );
    await vi.waitFor(
      () =>
        expect(
          release,
        ).toBeDefined(),
    );
    // Process B commits the learner's switch and drops the board.
    await invalidateBoard(
      '2026-11-16',
    );
    // A finishes with the rows it read before the change; its caller gets them, nobody else.
    release(
      [
        'old',
      ],
    );
    await expect(
      stale,
    ).resolves.toEqual(
      [
        'old',
      ],
    );
    await expect(
      cachedBoard(
        '2026-11-16',
        async () => [
          'new',
        ],
      ),
    ).resolves.toEqual(
      [
        'new',
      ],
    );
    await expect(
      cachedBoard(
        '2026-11-16',
        async () => [
          'newer',
        ],
      ),
    ).resolves.toEqual(
      [
        'new',
      ],
    );
  });

  it('without Redis the list is cached in-process only, for at most 5 s', async () => {
    h.redisOn = false;
    await cachedBoard(
      '2026-11-16',
      async () => [
        'a',
      ],
    );
    expect(
      BOARD_LOCAL_TTL_MS,
    ).toBeLessThanOrEqual(
      5_000,
    );
    expect(
      h.cached,
    ).toHaveBeenCalledWith(
      boardCacheKey(
        '2026-11-16',
      ),
      BOARD_LOCAL_TTL_MS,
      expect.any(
        Function,
      ),
      {
        l2: false,
      },
    );
  });
});

describe('dropLearnerBoardCaches', () => {
  it("drops today's and yesterday's boards and the learner's friends list", async () => {
    await cachedBoard(
      '2026-11-16',
      async () => [
        'a',
      ],
    );
    await cachedBoard(
      '2026-11-15',
      async () => [
        'b',
      ],
    );
    await dropLearnerBoardCaches(
      'u1',
      NOW,
    );
    await expect(
      cachedBoard(
        '2026-11-16',
        async () => [
          'a2',
        ],
      ),
    ).resolves.toEqual(
      [
        'a2',
      ],
    );
    await expect(
      cachedBoard(
        '2026-11-15',
        async () => [
          'b2',
        ],
      ),
    ).resolves.toEqual(
      [
        'b2',
      ],
    );
    expect(
      h.invalidate,
    ).toHaveBeenCalledWith(
      friendsCacheKey(
        'u1',
      ),
    );
  });
});
