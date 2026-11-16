import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

/** One in-memory `music_sprint_daily`, enough for the owner lookup and the hide. */
const h =
  vi.hoisted(
    () => {
      const rows =
        new Map<
          string,
          {
            id: string;
            userId: string;
            date: string;
            hiddenAt: Date | null;
          }
        >();
      return {
        rows,
        invalidate:
          vi.fn(
            async () => {},
          ),
        prisma:
          {
            musicSprintDaily:
              {
                findUnique:
                  vi.fn(
                    async ({
                      where,
                    }: {
                      where: {
                        id: string;
                      };
                    }) =>
                      rows.get(
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
                        rows.get(
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
              },
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

import {
  hideMusicContent,
  musicReportOwner,
} from './moderation.server';

beforeEach(
  () => {
    h.rows.clear();
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

  it('a music-share report has no owner until shares exist, and other types are not ours', async () => {
    await expect(
      musicReportOwner(
        'music-share',
        'd1',
      ),
    ).resolves.toBeNull();
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
