import {
  describe,
  expect,
  it,
  vi,
} from 'vitest';

vi.mock(
  '@/lib/prisma.server',
  () => ({
    prisma:
      {},
  }),
);

import {
  VIBE_THUMB_BATCH,
  VIBE_THUMB_CRON,
  VIBE_THUMB_QUEUE,
  processStaleBatch,
  registerVibeThumbnailCron,
  runVibeThumbnailTick,
  type StalePage,
  type VibeThumbRepo,
} from '../rmhvibe/thumbnail-worker.server';

const quiet =
  {
    info: () => {},
    warn: () => {},
    error:
      () => {},
  };

/** In-memory repo modelling the optimistic-concurrency clear (ported from the Go fakeRepo). */
function fakeRepo(
  stale: StalePage[],
  current: Record<
    string,
    Date
  >,
) {
  const cleared: Record<
    string,
    string
  > =
    {};
  const set: Record<
    string,
    string
  > =
    {};
  const queue =
    [
      ...stale,
    ];
  const repo: VibeThumbRepo =
    {
      selectStale:
        async (
          limit,
        ) =>
          queue.slice(
            0,
            limit,
          ),
      clearStale:
        async (
          id,
          url,
          expected,
        ) => {
          if (
            current[
              id
            ]?.getTime() ===
            expected.getTime()
          ) {
            cleared[
              id
            ] =
              url;
            const i =
              queue.findIndex(
                (
                  p,
                ) =>
                  p.id ===
                  id,
              );
            if (
              i >=
              0
            )
              queue.splice(
                i,
                1,
              );
            return true;
          }
          return false;
        },
      setThumbnailUrl:
        async (
          id,
          url,
        ) => {
          set[
            id
          ] =
            url;
        },
    };
  return {
    repo,
    cleared,
    set,
  };
}

const url =
  (
    slug: string,
  ) =>
    `/api/vibe/thumb/${slug}?v=1`;

describe('vibe thumbnail worker (ported Go golden cases)', () => {
  it('happy path clears the flag optimistically', async () => {
    const now =
      new Date();
    const {
      repo,
      cleared,
      set,
    } =
      fakeRepo(
        [
          {
            id: '1',
            slug: 'a',
            html: '<h1>a</h1>',
            updatedAt:
              now,
          },
          {
            id: '2',
            slug: 'b',
            html: '<h1>b</h1>',
            updatedAt:
              now,
          },
        ],
        {
          '1': now,
          '2': now,
        },
      );
    const captured: string[] =
      [];
    const out =
      await processStaleBatch(
        {
          repo,
          log: quiet,
          capture:
            async (
              slug,
            ) => (
              captured.push(
                slug,
              ),
              url(
                slug,
              )
            ),
        },
      );
    expect(
      captured,
    ).toEqual(
      [
        'a',
        'b',
      ],
    );
    expect(
      cleared[
        '1'
      ],
    ).toBe(
      '/api/vibe/thumb/a?v=1',
    );
    expect(
      cleared[
        '2'
      ],
    ).toBeDefined();
    expect(
      set,
    ).toEqual(
      {},
    );
    expect(
      out.outcome,
    ).toBe(
      'ok',
    );
  });

  it('a page changed mid-render keeps its stale flag but records the URL', async () => {
    const readAt =
      new Date();
    const {
      repo,
      cleared,
      set,
    } =
      fakeRepo(
        [
          {
            id: '1',
            slug: 'a',
            html: 'x',
            updatedAt:
              readAt,
          },
        ],
        {
          '1': new Date(
            readAt.getTime() +
              1000,
          ),
        },
      );
    const out =
      await processStaleBatch(
        {
          repo,
          log: quiet,
          capture:
            async (
              s,
            ) =>
              url(
                s,
              ),
        },
      );
    expect(
      cleared[
        '1'
      ],
    ).toBeUndefined();
    expect(
      set[
        '1'
      ],
    ).toBe(
      '/api/vibe/thumb/a?v=1',
    );
    expect(
      out.outcome,
    ).toBe(
      'ok',
    );
  });

  it('a capture failure leaves the row untouched and the batch is an error', async () => {
    const now =
      new Date();
    const {
      repo,
      cleared,
      set,
    } =
      fakeRepo(
        [
          {
            id: '1',
            slug: 'a',
            html: 'x',
            updatedAt:
              now,
          },
        ],
        {
          '1': now,
        },
      );
    const out =
      await processStaleBatch(
        {
          repo,
          log: quiet,
          capture:
            async () =>
              null,
        },
      );
    expect(
      cleared,
    ).toEqual(
      {},
    );
    expect(
      set,
    ).toEqual(
      {},
    );
    expect(
      out,
    ).toMatchObject(
      {
        attempted: 1,
        succeeded: 0,
        outcome:
          'error',
      },
    );
  });

  it('records partial when some succeed and some fail', async () => {
    const now =
      new Date();
    const {
      repo,
    } =
      fakeRepo(
        [
          {
            id: '1',
            slug: 'a',
            html: 'x',
            updatedAt:
              now,
          },
          {
            id: '2',
            slug: 'b',
            html: 'x',
            updatedAt:
              now,
          },
        ],
        {
          '1': now,
          '2': now,
        },
      );
    const out =
      await processStaleBatch(
        {
          repo,
          log: quiet,
          capture:
            async (
              s,
            ) =>
              s ===
              'a'
                ? url(
                    s,
                  )
                : null,
        },
      );
    expect(
      out.outcome,
    ).toBe(
      'partial',
    );
  });

  it('a tick never throws, even when selection panics', async () => {
    const repo: VibeThumbRepo =
      {
        selectStale:
          async () => {
            throw new Error(
              'simulated nil-DB dereference',
            );
          },
        clearStale:
          async () =>
            false,
        setThumbnailUrl:
          async () => {},
      };
    await expect(
      runVibeThumbnailTick(
        {
          repo,
          log: quiet,
        },
      ),
    ).resolves.toBe(
      'error',
    );
  });

  it('a tick drains full batches but stops when nothing succeeds', async () => {
    const now =
      new Date();
    const pages =
      Array.from(
        {
          length:
            VIBE_THUMB_BATCH *
            2,
        },
        (
          _,
          i,
        ) => ({
          id: String(
            i,
          ),
          slug: `s${i}`,
          html: 'x',
          updatedAt:
            now,
        }),
      );
    const current =
      Object.fromEntries(
        pages.map(
          (
            p,
          ) => [
            p.id,
            now,
          ],
        ),
      );
    const a =
      fakeRepo(
        pages,
        current,
      );
    const capture =
      vi.fn(
        async (
          s: string,
        ) =>
          url(
            s,
          ),
      );
    await runVibeThumbnailTick(
      {
        repo: a.repo,
        capture,
        log: quiet,
      },
    );
    expect(
      capture,
    ).toHaveBeenCalledTimes(
      pages.length,
    );

    const b =
      fakeRepo(
        pages,
        current,
      );
    const failing =
      vi.fn(
        async () =>
          null,
      );
    await runVibeThumbnailTick(
      {
        repo: b.repo,
        capture:
          failing,
        log: quiet,
      },
    );
    expect(
      failing,
    ).toHaveBeenCalledTimes(
      VIBE_THUMB_BATCH,
    ); // not hammered
  });

  it('registers an exclusive, non-retrying every-minute queue and kicks once at boot', async () => {
    const boss =
      {
        createQueue:
          vi.fn(
            async () =>
              undefined,
          ),
        schedule:
          vi.fn(
            async () =>
              undefined,
          ),
        work: vi.fn(
          async () =>
            undefined,
        ),
        send: vi.fn(
          async () =>
            undefined,
        ),
      };
    await registerVibeThumbnailCron(
      boss,
    );
    expect(
      boss.createQueue,
    ).toHaveBeenCalledWith(
      VIBE_THUMB_QUEUE,
      expect.objectContaining(
        {
          policy:
            'exclusive',
          retryLimit: 0,
        },
      ),
    );
    expect(
      boss.schedule,
    ).toHaveBeenCalledWith(
      VIBE_THUMB_QUEUE,
      VIBE_THUMB_CRON,
      {},
      {
        tz: 'UTC',
      },
    );
    expect(
      boss.work,
    ).toHaveBeenCalledTimes(
      1,
    );
    expect(
      boss.send,
    ).toHaveBeenCalledWith(
      VIBE_THUMB_QUEUE,
      {},
    );
  });
});
