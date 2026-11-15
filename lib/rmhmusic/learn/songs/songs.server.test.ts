import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

/**
 * One in-memory `music_song_best` behind the save's single atomic statement (INSERT … ON CONFLICT
 * DO UPDATE SET bestScore = GREATEST(…)), and the list's findMany.
 */
const h =
  vi.hoisted(
    () => {
      const rows =
        new Map<
          string,
          {
            userId: string;
            songId: string;
            mode: string;
            bestScore: number;
          }
        >();
      const sql: string[] =
        [];
      return {
        rows,
        sql,
        prisma:
          {
            $queryRaw:
              vi.fn(
                async (
                  strings: TemplateStringsArray,
                  ...values: unknown[]
                ) => {
                  sql.push(
                    strings.join(
                      '?',
                    ),
                  );
                  const [
                    ,
                    userId,
                    songId,
                    mode,
                    score,
                  ] =
                    values as [
                      string,
                      string,
                      string,
                      string,
                      number,
                    ];
                  const k = `${userId}|${songId}|${mode}`;
                  const prev =
                    rows.get(
                      k,
                    );
                  const bestScore =
                    prev
                      ? Math.max(
                          prev.bestScore,
                          score,
                        )
                      : score;
                  rows.set(
                    k,
                    {
                      userId,
                      songId,
                      mode,
                      bestScore,
                    },
                  );
                  return [
                    {
                      bestScore,
                    },
                  ];
                },
              ),
            musicSongBest:
              {
                findMany:
                  vi.fn(
                    async ({
                      where,
                    }: {
                      where: {
                        userId: string;
                      };
                    }) =>
                      [
                        ...rows.values(),
                      ].filter(
                        (
                          r,
                        ) =>
                          r.userId ===
                          where.userId,
                      ),
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

import { songById } from './catalog';
import { notesOf } from './score';
import type { PlayNoteResult } from './scoring';
import {
  loadSongBests,
  saveSongRun,
} from './songs.server';

const SONG =
  'mary-had-a-little-lamb';
const n =
  notesOf(
    songById(
      SONG,
    ) ??
      (null as never),
  ).length;
const perfect: PlayNoteResult[] =
  new Array<PlayNoteResult>(
    n,
  ).fill(
    {
      outcome:
        'right',
      offMs: 0,
    },
  );

beforeEach(
  () => {
    h.rows.clear();
    h.sql.length = 0;
  },
);

describe('saveSongRun', () => {
  it('keeps the recomputed score as the best, and only a higher one replaces it', async () => {
    const half =
      await saveSongRun(
        'u1',
        SONG,
        {
          mode: 'wait',
          wrong:
            new Array<number>(
              n,
            ).fill(
              1,
            ),
        },
      );
    expect(
      half,
    ).toEqual(
      {
        songId:
          SONG,
        mode: 'wait',
        bestScore: 50,
        score: 50,
      },
    );
    const full =
      await saveSongRun(
        'u1',
        SONG,
        {
          mode: 'wait',
          wrong:
            new Array<number>(
              n,
            ).fill(
              0,
            ),
        },
      );
    expect(
      full,
    ).toEqual(
      {
        songId:
          SONG,
        mode: 'wait',
        bestScore: 100,
        score: 100,
      },
    );
    const worse =
      await saveSongRun(
        'u1',
        SONG,
        {
          mode: 'wait',
          wrong:
            new Array<number>(
              n,
            ).fill(
              2,
            ),
        },
      );
    expect(
      worse,
    ).toEqual(
      {
        songId:
          SONG,
        mode: 'wait',
        bestScore: 100,
        score: 0,
      },
    );
  });

  it('keeps the best in one atomic statement (no read-then-write race between two saves)', async () => {
    await saveSongRun(
      'u1',
      SONG,
      {
        mode: 'wait',
        wrong:
          new Array<number>(
            n,
          ).fill(
            0,
          ),
      },
    );
    expect(
      h.sql,
    ).toHaveLength(
      1,
    );
    expect(
      h
        .sql[0],
    ).toMatch(
      /INSERT INTO "music_song_best"/,
    );
    expect(
      h
        .sql[0],
    ).toMatch(
      /ON CONFLICT \("userId", "songId", "mode"\)/,
    );
    expect(
      h
        .sql[0],
    ).toMatch(
      /GREATEST\("music_song_best"\."bestScore", EXCLUDED\."bestScore"\)/,
    );
    expect(
      h
        .sql[0],
    ).toMatch(
      /RETURNING "bestScore"/,
    );
  });

  it('keeps one best per song per mode per learner', async () => {
    await saveSongRun(
      'u1',
      SONG,
      {
        mode: 'play',
        notes:
          perfect,
        extras: 0,
      },
    );
    await saveSongRun(
      'u1',
      SONG,
      {
        mode: 'wait',
        wrong:
          new Array<number>(
            n,
          ).fill(
            1,
          ),
      },
    );
    await saveSongRun(
      'u2',
      SONG,
      {
        mode: 'wait',
        wrong:
          new Array<number>(
            n,
          ).fill(
            0,
          ),
      },
    );
    const bests =
      await loadSongBests(
        'u1',
      );
    expect(
      bests,
    ).toEqual(
      expect.arrayContaining(
        [
          {
            songId:
              SONG,
            mode: 'play',
            bestScore: 100,
          },
          {
            songId:
              SONG,
            mode: 'wait',
            bestScore: 50,
          },
        ],
      ),
    );
    expect(
      bests,
    ).toHaveLength(
      2,
    );
  });

  it('refuses an unknown song or an impossible run, and writes nothing', async () => {
    expect(
      await saveSongRun(
        'u1',
        'nope',
        {
          mode: 'wait',
          wrong:
            [
              0,
            ],
        },
      ),
    ).toBeNull();
    expect(
      await saveSongRun(
        'u1',
        SONG,
        {
          mode: 'wait',
          wrong:
            [
              0,
            ],
        },
      ),
    ).toBeNull();
    expect(
      h
        .rows
        .size,
    ).toBe(
      0,
    );
  });

  it('lists only rows of songs that still exist', async () => {
    h.rows.set(
      'u1|gone|wait',
      {
        userId:
          'u1',
        songId:
          'gone',
        mode: 'wait',
        bestScore: 90,
      },
    );
    expect(
      await loadSongBests(
        'u1',
      ),
    ).toEqual(
      [],
    );
  });
});
