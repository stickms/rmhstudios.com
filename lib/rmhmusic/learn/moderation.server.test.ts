import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

type Hideable =
  {
    id: string;
    userId: string;
    date?: string;
    hiddenAt: Date | null;
  };

/** One in-memory `music_sprint_daily` and `music_share`, enough for the owner lookup and the hide. */
const h =
  vi.hoisted(
    () => {
      const rows =
        new Map<
          string,
          Hideable
        >();
      const shares =
        new Map<
          string,
          Hideable
        >();
      const table =
        (
          m: Map<
            string,
            Hideable
          >,
        ) => ({
          findUnique:
            vi.fn(
              async ({
                where,
              }: {
                where: {
                  id: string;
                };
              }) =>
                m.get(
                  where.id,
                ) ??
                null,
            ),
          updateMany:
            vi.fn(
              async ({
                where,
                data,
              }: {
                where: {
                  id: string;
                  hiddenAt: null;
                };
                data: {
                  hiddenAt: Date;
                };
              }) => {
                const row =
                  m.get(
                    where.id,
                  );
                if (
                  !row ||
                  row.hiddenAt !==
                    null
                )
                  return {
                    count: 0,
                  };
                row.hiddenAt =
                  data.hiddenAt;
                return {
                  count: 1,
                };
              },
            ),
        });
      return {
        rows,
        shares,
        invalidate:
          vi.fn(
            async () => {},
          ),
        prisma:
          {
            musicSprintDaily:
              table(
                rows,
              ),
            musicShare:
              table(
                shares,
              ),
          },
      };
    },
  );
vi.mock(
  '@/lib/prisma.server',
  () => ({
    prisma:
      h.prisma,
  }),
);
vi.mock(
  '@/lib/cached.server',
  () => ({
    invalidateCached:
      h.invalidate,
  }),
);

import {
  hideMusicContent,
  musicReportOwner,
} from './moderation.server';

beforeEach(
  () => {
    h.rows.clear();
    h.shares.clear();
    h.rows.set(
      'd1',
      {
        id: 'd1',
        userId:
          'u1',
        date: '2026-11-16',
        hiddenAt:
          null,
      },
    );
    h.shares.set(
      's1',
      {
        id: 's1',
        userId:
          'u2',
        hiddenAt:
          null,
      },
    );
  },
);

describe('music-score reports', () => {
  it('resolve to the learner who played the run', async () => {
    await expect(
      musicReportOwner(
        'music-score',
        'd1',
      ),
    ).resolves.toBe(
      'u1',
    );
    await expect(
      musicReportOwner(
        'music-score',
        'nope',
      ),
    ).resolves.toBeNull();
  });

  it('other types are not ours', async () => {
    await expect(
      musicReportOwner(
        'rmhark',
        'd1',
      ),
    ).resolves.toBeNull();
  });

  it('"Resolve & remove content" hides the score once (idempotent); the result stays the learner\'s', async () => {
    const first =
      new Date(
        '2026-11-16T10:00:00Z',
      );
    await hideMusicContent(
      'music-score',
      'd1',
      first,
    );
    expect(
      h.rows.get(
        'd1',
      )
        ?.hiddenAt,
    ).toEqual(
      first,
    );
    await hideMusicContent(
      'music-score',
      'd1',
      new Date(
        '2026-11-16T11:00:00Z',
      ),
    );
    expect(
      h.rows.get(
        'd1',
      )
        ?.hiddenAt,
    ).toEqual(
      first,
    );
    expect(
      h.rows.get(
        'd1',
      )
        ?.userId,
    ).toBe(
      'u1',
    );
    // The date's cached board is dropped, so the row leaves every board at once.
    expect(
      h.invalidate,
    ).toHaveBeenCalledWith(
      'rmhmusic:board:2026-11-16',
    );
  });

  it('hiding a row that is gone is not a failure', async () => {
    await expect(
      hideMusicContent(
        'music-score',
        'gone',
      ),
    ).resolves.toBeUndefined();
  });
});

describe('music-share reports', () => {
  it('resolve to the learner who shared the link', async () => {
    await expect(
      musicReportOwner(
        'music-share',
        's1',
      ),
    ).resolves.toBe(
      'u2',
    );
    await expect(
      musicReportOwner(
        'music-share',
        'd1',
      ),
    ).resolves.toBeNull();
  });

  it('"Resolve & remove content" hides the link once (idempotent): its page and card go dark', async () => {
    const first =
      new Date(
        '2026-11-16T10:00:00Z',
      );
    await hideMusicContent(
      'music-share',
      's1',
      first,
    );
    expect(
      h.shares.get(
        's1',
      )
        ?.hiddenAt,
    ).toEqual(
      first,
    );
    await hideMusicContent(
      'music-share',
      's1',
      new Date(
        '2026-11-16T11:00:00Z',
      ),
    );
    expect(
      h.shares.get(
        's1',
      )
        ?.hiddenAt,
    ).toEqual(
      first,
    );
    // A share is not a score: no board is touched.
    expect(
      h.rows.get(
        'd1',
      )
        ?.hiddenAt,
    ).toBeNull();
    await expect(
      hideMusicContent(
        'music-share',
        'gone',
      ),
    ).resolves.toBeUndefined();
  });
});
