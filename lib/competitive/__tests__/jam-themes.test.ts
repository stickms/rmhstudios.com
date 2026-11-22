import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

// Theme voting for game jams (s07-07): marks only while voting is open, the 3-mark cap under concurrent requests,
// no counts or winner before the start, winner by count / tie to first / none to first, resolution claimed once by two
// concurrent cron runs, banned voters not counted, candidates locked after the first vote.

interface Jam {
  id: string;
  slug: string;
  title: string;
  theme: string;
  startsAt: Date;
  themeVoting: boolean;
  themeVoteOpensAt: Date | null;
  themeResolvedAt: Date | null;
}
interface Cand {
  id: string;
  jamId: string;
  text: string;
  position: number;
}
interface Vote {
  jamId: string;
  candidateId: string;
  userId: string;
}

const h =
  vi.hoisted(
    () => ({
      jams: [] as Jam[],
      cands:
        [] as Cand[],
      votes:
        [] as Vote[],
      banned:
        new Map<
          string,
          Date
        >(),
      locks:
        new Map<
          string,
          Promise<void>
        >(),
      audits:
        [] as string[],
      notices:
        [] as Array<{
          userId: string;
          entityType?: string;
          preview?: string;
        }>,
    }),
  );

vi.mock(
  '@/lib/admin-audit.server',
  () => ({
    recordAdminActionIn:
      vi.fn(
        async (
          _tx: unknown,
          _admin: string,
          action: string,
        ) => {
          h.audits.push(
            action,
          );
        },
      ),
  }),
);
vi.mock(
  '@/lib/notifications.server',
  () => ({
    createNotification:
      vi.fn(
        async (n: {
          userId: string;
          entityType?: string;
          preview?: string;
        }) => {
          h.notices.push(
            n,
          );
        },
      ),
  }),
);

vi.mock(
  '@/lib/prisma.server',
  () => {
    const userOk =
      (
        userId: string,
        where:
          | {
              OR?: Array<{
                bannedUntil: null | {
                  lte: Date;
                };
              }>;
            }
          | undefined,
        now = new Date(),
      ) => {
        if (
          !where?.OR
        )
          return true;
        const b =
          h.banned.get(
            userId,
          ) ??
          null;
        return where.OR.some(
          (
            c,
          ) =>
            c.bannedUntil ===
            null
              ? b ===
                null
              : b !==
                  null &&
                b.getTime() <=
                  (
                    (
                      c.bannedUntil as {
                        lte: Date;
                      }
                    )
                      .lte ??
                    now
                  ).getTime(),
        );
      };
    const matchVote =
      (
        v: Vote,
        w: Record<
          string,
          unknown
        > = {},
      ) =>
        Object.entries(
          w,
        ).every(
          ([
            k,
            c,
          ]) => {
            if (
              k ===
              'user'
            )
              return userOk(
                v.userId,
                c as never,
              );
            const val =
              (
                v as unknown as Record<
                  string,
                  unknown
                >
              )[
                k
              ];
            if (
              c &&
              typeof c ===
                'object'
            ) {
              const o =
                c as {
                  notIn?: unknown[];
                  in?: unknown[];
                  gt?: string;
                };
              if (
                o.notIn
              )
                return !o.notIn.includes(
                  val,
                );
              if (
                o.in
              )
                return o.in.includes(
                  val,
                );
              if (
                o.gt !==
                undefined
              )
                return (
                  (val as string) >
                  o.gt
                );
            }
            return (
              val ===
              c
            );
          },
        );
    const gameJam =
      {
        async findUnique({
          where,
        }: {
          where: {
            id?: string;
            slug?: string;
          };
        }) {
          return (
            h.jams.find(
              (
                j,
              ) =>
                where.id
                  ? j.id ===
                    where.id
                  : j.slug ===
                    where.slug,
            ) ??
            null
          );
        },
        async findMany({
          where,
          take,
        }: {
          where: {
            themeVoting: boolean;
            themeResolvedAt: null;
            startsAt: {
              lte: Date;
            };
          };
          take: number;
        }) {
          return h.jams
            .filter(
              (
                j,
              ) =>
                j.themeVoting ===
                  where.themeVoting &&
                j.themeResolvedAt ===
                  null &&
                j.startsAt <=
                  where
                    .startsAt
                    .lte,
            )
            .slice(
              0,
              take,
            );
        },
        async updateMany({
          where,
          data,
        }: {
          where: {
            id: string;
            themeResolvedAt: null;
          };
          data: Partial<Jam>;
        }) {
          const j =
            h.jams.find(
              (
                x,
              ) =>
                x.id ===
                  where.id &&
                x.themeResolvedAt ===
                  where.themeResolvedAt,
            );
          if (
            !j
          )
            return {
              count: 0,
            };
          Object.assign(
            j,
            data,
          );
          return {
            count: 1,
          };
        },
        async update({
          where,
          data,
        }: {
          where: {
            id: string;
          };
          data: Partial<Jam>;
        }) {
          Object.assign(
            h.jams.find(
              (
                j,
              ) =>
                j.id ===
                where.id,
            )!,
            data,
          );
        },
      };
    const gameJamThemeCandidate =
      {
        async findMany({
          where,
        }: {
          where: {
            jamId: string;
            id?: {
              in: string[];
            };
          };
        }) {
          return h.cands
            .filter(
              (
                c,
              ) =>
                c.jamId ===
                  where.jamId &&
                (!where.id ||
                  where.id.in.includes(
                    c.id,
                  )),
            )
            .sort(
              (
                a,
                b,
              ) =>
                a.position -
                b.position,
            );
        },
        async deleteMany({
          where,
        }: {
          where: {
            jamId: string;
          };
        }) {
          h.cands =
            h.cands.filter(
              (
                c,
              ) =>
                c.jamId !==
                where.jamId,
            );
        },
        async createMany({
          data,
        }: {
          data: Array<{
            jamId: string;
            text: string;
            position: number;
          }>;
        }) {
          for (const d of data)
            h.cands.push(
              {
                id: `c${h.cands.length + 100}-${d.position}`,
                ...d,
              },
            );
        },
      };
    const gameJamThemeVote =
      {
        async findMany({
          where,
          take,
        }: {
          where: Record<
            string,
            unknown
          >;
          take?: number;
        }) {
          let rows =
            h.votes.filter(
              (
                v,
              ) =>
                matchVote(
                  v,
                  where,
                ),
            );
          const seen =
            new Set<string>();
          if (
            take !==
            undefined
          ) {
            rows =
              rows
                .filter(
                  (
                    v,
                  ) =>
                    seen.has(
                      v.userId,
                    )
                      ? false
                      : (seen.add(
                          v.userId,
                        ),
                        true),
                )
                .sort(
                  (
                    a,
                    b,
                  ) =>
                    a.userId.localeCompare(
                      b.userId,
                    ),
                );
            rows =
              rows.slice(
                0,
                take,
              );
          }
          return rows;
        },
        async count({
          where,
        }: {
          where: Record<
            string,
            unknown
          >;
        }) {
          return h.votes.filter(
            (
              v,
            ) =>
              matchVote(
                v,
                where,
              ),
          )
            .length;
        },
        async groupBy({
          where,
        }: {
          where: Record<
            string,
            unknown
          >;
        }) {
          const m =
            new Map<
              string,
              number
            >();
          for (const v of h.votes.filter(
            (
              x,
            ) =>
              matchVote(
                x,
                where,
              ),
          ))
            m.set(
              v.candidateId,
              (m.get(
                v.candidateId,
              ) ??
                0) +
                1,
            );
          return [
            ...m,
          ].map(
            ([
              candidateId,
              n,
            ]) => ({
              candidateId,
              _count:
                {
                  _all: n,
                },
            }),
          );
        },
        async deleteMany({
          where,
        }: {
          where: Record<
            string,
            unknown
          >;
        }) {
          h.votes =
            h.votes.filter(
              (
                v,
              ) =>
                !matchVote(
                  v,
                  where,
                ),
            );
        },
        async createMany({
          data,
        }: {
          data: Vote[];
        }) {
          for (const d of data)
            if (
              !h.votes.some(
                (
                  v,
                ) =>
                  v.candidateId ===
                    d.candidateId &&
                  v.userId ===
                    d.userId,
              )
            )
              h.votes.push(
                {
                  ...d,
                },
              );
        },
      };
    const user =
      {
        async findUnique({
          where,
        }: {
          where: {
            id: string;
          };
        }) {
          return {
            bannedUntil:
              h.banned.get(
                where.id,
              ) ??
              null,
          };
        },
      };
    const db =
      {
        gameJam,
        gameJamThemeCandidate,
        gameJamThemeVote,
        user,
        // The advisory lock: one holder per key until the transaction ends (hashtext(key) is the key here).
        $executeRaw:
          undefined as unknown,
        $transaction:
          async (
            fn: (
              tx: unknown,
            ) => Promise<unknown>,
          ) => {
            const held: Array<
              () => void
            > =
              [];
            const tx =
              {
                gameJam,
                gameJamThemeCandidate,
                gameJamThemeVote,
                user,
                async $executeRaw(
                  _s: TemplateStringsArray,
                  key: string,
                ) {
                  const prev =
                    h.locks.get(
                      key,
                    ) ??
                    Promise.resolve();
                  let release!: () => void;
                  const mine =
                    new Promise<void>(
                      (
                        r,
                      ) =>
                        (release =
                          r),
                    );
                  h.locks.set(
                    key,
                    prev.then(
                      () =>
                        mine,
                    ),
                  );
                  held.push(
                    release,
                  );
                  await prev;
                },
              };
            try {
              // Yield first so concurrent callers genuinely interleave.
              await Promise.resolve();
              return await fn(
                tx,
              );
            } finally {
              for (const r of held)
                r();
            }
          },
      };
    return {
      prisma:
        db,
    };
  },
);

import {
  castVotes,
  computeWinner,
  effectiveThemes,
  resolveDueThemes,
  setCandidates,
  themeVoteView,
} from '@/lib/competitive/jam-themes.server';

const NOW =
  new Date(
    '2026-12-01T12:00:00Z',
  );
const HOUR = 3_600_000;

function seed(
  over: Partial<Jam> = {},
  texts = [
    'Alpha',
    'Beta',
    'Gamma',
    'Delta',
  ],
) {
  h.jams =
    [
      {
        id: 'j1',
        slug: 'jam-1',
        title:
          'Jam One',
        theme:
          texts[0]!,
        startsAt:
          new Date(
            NOW.getTime() +
              24 *
                HOUR,
          ),
        themeVoting: true,
        themeVoteOpensAt:
          new Date(
            NOW.getTime() -
              HOUR,
          ),
        themeResolvedAt:
          null,
        ...over,
      },
    ];
  h.cands =
    texts.map(
      (
        text,
        position,
      ) => ({
        id: `c${position}`,
        jamId:
          'j1',
        text,
        position,
      }),
    );
  h.votes =
    [];
}
const vote =
  (
    userId: string,
    ...ids: string[]
  ) =>
    ids.forEach(
      (
        candidateId,
      ) =>
        h.votes.push(
          {
            jamId:
              'j1',
            candidateId,
            userId,
          },
        ),
    );

beforeEach(
  () => {
    h.banned.clear();
    h.locks.clear();
    h.audits.length = 0;
    h.notices.length = 0;
    seed();
  },
);

describe('castVotes', () => {
  it('takes marks while voting is open and replaces the previous set', async () => {
    expect(
      await castVotes(
        'jam-1',
        'u1',
        [
          'c0',
          'c1',
        ],
        NOW,
      ),
    ).toEqual(
      {
        ok: true,
        mine: [
          'c0',
          'c1',
        ],
      },
    );
    expect(
      await castVotes(
        'jam-1',
        'u1',
        [
          'c2',
        ],
        NOW,
      ),
    ).toEqual(
      {
        ok: true,
        mine: [
          'c2',
        ],
      },
    );
    expect(
      h.votes
        .filter(
          (
            v,
          ) =>
            v.userId ===
            'u1',
        )
        .map(
          (
            v,
          ) =>
            v.candidateId,
        ),
    ).toEqual(
      [
        'c2',
      ],
    );
    expect(
      await castVotes(
        'jam-1',
        'u1',
        [],
        NOW,
      ),
    ).toMatchObject(
      {
        ok: true,
      },
    );
    expect(
      h.votes,
    ).toHaveLength(
      0,
    );
  });

  it('refuses before voting opens, after the start and for a jam without voting', async () => {
    seed(
      {
        themeVoteOpensAt:
          new Date(
            NOW.getTime() +
              HOUR,
          ),
      },
    );
    expect(
      await castVotes(
        'jam-1',
        'u1',
        [
          'c0',
        ],
        NOW,
      ),
    ).toMatchObject(
      {
        ok: false,
        status: 409,
      },
    );
    seed(
      {
        startsAt:
          new Date(
            NOW.getTime() -
              1,
          ),
      },
    );
    expect(
      await castVotes(
        'jam-1',
        'u1',
        [
          'c0',
        ],
        NOW,
      ),
    ).toMatchObject(
      {
        ok: false,
        status: 409,
      },
    );
    seed(
      {
        themeVoting: false,
      },
    );
    expect(
      await castVotes(
        'jam-1',
        'u1',
        [
          'c0',
        ],
        NOW,
      ),
    ).toMatchObject(
      {
        ok: false,
        status: 404,
      },
    );
    expect(
      await castVotes(
        'nope',
        'u1',
        [
          'c0',
        ],
        NOW,
      ),
    ).toMatchObject(
      {
        ok: false,
        status: 404,
      },
    );
    expect(
      h.votes,
    ).toHaveLength(
      0,
    );
  });

  it('refuses a fourth mark, a candidate of another jam and a banned member', async () => {
    expect(
      await castVotes(
        'jam-1',
        'u1',
        [
          'c0',
          'c1',
          'c2',
          'c3',
        ],
        NOW,
      ),
    ).toMatchObject(
      {
        ok: false,
        status: 400,
      },
    );
    expect(
      await castVotes(
        'jam-1',
        'u1',
        [
          'c0',
          'zzz',
        ],
        NOW,
      ),
    ).toMatchObject(
      {
        ok: false,
        status: 400,
      },
    );
    h.banned.set(
      'u2',
      new Date(
        NOW.getTime() +
          HOUR,
      ),
    );
    expect(
      await castVotes(
        'jam-1',
        'u2',
        [
          'c0',
        ],
        NOW,
      ),
    ).toMatchObject(
      {
        ok: false,
        status: 403,
      },
    );
    expect(
      h.votes,
    ).toHaveLength(
      0,
    );
  });

  it('keeps a member at three marks when two requests race', async () => {
    const [
      a,
      b,
    ] =
      await Promise.all(
        [
          castVotes(
            'jam-1',
            'u1',
            [
              'c0',
              'c1',
              'c2',
            ],
            NOW,
          ),
          castVotes(
            'jam-1',
            'u1',
            [
              'c1',
              'c2',
              'c3',
            ],
            NOW,
          ),
        ],
      );
    expect(
      a.ok &&
        b.ok,
    ).toBe(
      true,
    );
    expect(
      h.votes.filter(
        (
          v,
        ) =>
          v.userId ===
          'u1',
      ),
    ).toHaveLength(
      3,
    );
  });
});

describe('secrecy before the start', () => {
  it('sends no counts and no winner while voting is open', async () => {
    vote(
      'u1',
      'c1',
    );
    vote(
      'u2',
      'c1',
    );
    const view =
      await themeVoteView(
        'jam-1',
        'u1',
        NOW,
      );
    expect(
      view,
    ).toMatchObject(
      {
        enabled: true,
        phase:
          'open',
        winnerId:
          null,
        mine: [
          'c1',
        ],
        locked: false,
      },
    );
    expect(
      view!.candidates.every(
        (
          c,
        ) =>
          c.votes ===
          null,
      ),
    ).toBe(
      true,
    );
    expect(
      JSON.stringify(
        view,
      ),
    ).not.toContain(
      '"votes":1',
    );
  });

  it('computes nothing for a jam that has not started', async () => {
    vote(
      'u1',
      'c3',
    );
    const jam =
      h
        .jams[0]!;
    expect(
      (
        await effectiveThemes(
          [
            jam,
          ],
          NOW,
        )
      )
        .size,
    ).toBe(
      0,
    );
  });

  it('shows counts and the winner after the start, even before the cron ran', async () => {
    vote(
      'u1',
      'c2',
    );
    vote(
      'u2',
      'c2',
    );
    vote(
      'u3',
      'c0',
    );
    const later =
      new Date(
        NOW.getTime() +
          48 *
            HOUR,
      );
    const view =
      await themeVoteView(
        'jam-1',
        null,
        later,
      );
    expect(
      view,
    ).toMatchObject(
      {
        phase:
          'closed',
        winnerId:
          'c2',
        mine: [],
      },
    );
    expect(
      view!.candidates.map(
        (
          c,
        ) =>
          c.votes,
      ),
    ).toEqual(
      [
        1,
        0,
        2,
        0,
      ],
    );
    expect(
      (
        await effectiveThemes(
          [
            h
              .jams[0]!,
          ],
          later,
        )
      ).get(
        'j1',
      ),
    ).toBe(
      'Gamma',
    );
  });

  it('is not a voting jam: an empty view', async () => {
    seed(
      {
        themeVoting: false,
      },
    );
    expect(
      await themeVoteView(
        'jam-1',
        null,
        NOW,
      ),
    ).toMatchObject(
      {
        enabled: false,
        candidates:
          [],
        winnerId:
          null,
      },
    );
  });
});

describe('the winner', () => {
  it('goes to the most marks, ties to the first listed, no marks to the first', async () => {
    const later =
      new Date(
        NOW.getTime() +
          48 *
            HOUR,
      );
    expect(
      (
        await computeWinner(
          await dbOf(),
          'j1',
          later,
        )
      )
        ?.text,
    ).toBe(
      'Alpha',
    );
    vote(
      'u1',
      'c1',
      'c2',
    );
    vote(
      'u2',
      'c2',
      'c1',
    );
    expect(
      (
        await computeWinner(
          await dbOf(),
          'j1',
          later,
        )
      )
        ?.text,
    ).toBe(
      'Beta',
    );
    vote(
      'u3',
      'c3',
    );
    vote(
      'u4',
      'c3',
    );
    vote(
      'u5',
      'c3',
    );
    expect(
      (
        await computeWinner(
          await dbOf(),
          'j1',
          later,
        )
      )
        ?.text,
    ).toBe(
      'Delta',
    );
  });

  it('does not count a banned voter', async () => {
    const later =
      new Date(
        NOW.getTime() +
          48 *
            HOUR,
      );
    vote(
      'u1',
      'c0',
    );
    vote(
      'b1',
      'c3',
    );
    vote(
      'b2',
      'c3',
    );
    h.banned.set(
      'b1',
      new Date(
        later.getTime() +
          HOUR,
      ),
    );
    h.banned.set(
      'b2',
      new Date(
        later.getTime() +
          HOUR,
      ),
    );
    expect(
      (
        await computeWinner(
          await dbOf(),
          'j1',
          later,
        )
      )
        ?.text,
    ).toBe(
      'Alpha',
    );
    h.banned.clear(); // lifted: both marks count again
    expect(
      (
        await computeWinner(
          await dbOf(),
          'j1',
          later,
        )
      )
        ?.text,
    ).toBe(
      'Delta',
    );
  });
});

async function dbOf() {
  return (
    await import('@/lib/prisma.server')
  )
    .prisma;
}

describe('resolveDueThemes', () => {
  it('writes the winner and tells each voter once', async () => {
    seed(
      {
        startsAt:
          new Date(
            NOW.getTime() -
              1000,
          ),
      },
    );
    vote(
      'u1',
      'c2',
    );
    vote(
      'u2',
      'c2',
      'c1',
    );
    expect(
      await resolveDueThemes(
        NOW,
      ),
    ).toBe(
      1,
    );
    expect(
      h
        .jams[0],
    ).toMatchObject(
      {
        theme:
          'Gamma',
        themeResolvedAt:
          NOW,
      },
    );
    expect(
      h.notices
        .map(
          (
            n,
          ) =>
            n.userId,
        )
        .sort(),
    ).toEqual(
      [
        'u1',
        'u2',
      ],
    );
    expect(
      h
        .notices[0],
    ).toMatchObject(
      {
        entityType:
          'jam_theme',
        preview:
          'The theme of Jam One is Gamma',
      },
    );
    expect(
      await resolveDueThemes(
        NOW,
      ),
    ).toBe(
      0,
    );
    expect(
      h.notices,
    ).toHaveLength(
      2,
    );
  });

  it('is claimed once when two cron runs overlap', async () => {
    seed(
      {
        startsAt:
          new Date(
            NOW.getTime() -
              1000,
          ),
      },
    );
    vote(
      'u1',
      'c1',
    );
    const [
      a,
      b,
    ] =
      await Promise.all(
        [
          resolveDueThemes(
            NOW,
          ),
          resolveDueThemes(
            NOW,
          ),
        ],
      );
    expect(
      a +
        b,
    ).toBe(
      1,
    );
    expect(
      h.notices,
    ).toHaveLength(
      1,
    );
  });

  it('leaves a jam that has not started, and a non-voting jam, alone', async () => {
    expect(
      await resolveDueThemes(
        NOW,
      ),
    ).toBe(
      0,
    );
    seed(
      {
        startsAt:
          new Date(
            NOW.getTime() -
              1000,
          ),
        themeVoting: false,
      },
    );
    expect(
      await resolveDueThemes(
        NOW,
      ),
    ).toBe(
      0,
    );
  });

  it('does not notify a banned voter', async () => {
    seed(
      {
        startsAt:
          new Date(
            NOW.getTime() -
              1000,
          ),
      },
    );
    vote(
      'u1',
      'c1',
    );
    vote(
      'b1',
      'c1',
    );
    h.banned.set(
      'b1',
      new Date(
        NOW.getTime() +
          HOUR,
      ),
    );
    await resolveDueThemes(
      NOW,
    );
    expect(
      h.notices.map(
        (
          n,
        ) =>
          n.userId,
      ),
    ).toEqual(
      [
        'u1',
      ],
    );
  });
});

describe('setCandidates', () => {
  it('replaces the shortlist, sets the stand-in theme and audits it', async () => {
    expect(
      await setCandidates(
        'admin',
        'jam-1',
        [
          '  One ',
          'Two',
          'Three',
        ],
      ),
    ).toEqual(
      {
        ok: true,
      },
    );
    expect(
      h.cands.map(
        (
          c,
        ) =>
          c.text,
      ),
    ).toEqual(
      [
        'One',
        'Two',
        'Three',
      ],
    );
    expect(
      h
        .jams[0]!
        .theme,
    ).toBe(
      'One',
    );
    expect(
      h.audits,
    ).toEqual(
      [
        'jam.theme-candidates',
      ],
    );
  });

  it('is locked once the first vote exists', async () => {
    vote(
      'u1',
      'c0',
    );
    expect(
      await setCandidates(
        'admin',
        'jam-1',
        [
          'One',
          'Two',
          'Three',
        ],
      ),
    ).toMatchObject(
      {
        ok: false,
        status: 409,
      },
    );
    expect(
      h.cands,
    ).toHaveLength(
      4,
    );
    expect(
      h.audits,
    ).toHaveLength(
      0,
    );
  });

  it('refuses a bad shortlist and a jam without voting', async () => {
    expect(
      await setCandidates(
        'admin',
        'jam-1',
        [
          'One',
          'two',
          'ONE',
        ],
      ),
    ).toMatchObject(
      {
        ok: false,
        status: 400,
      },
    );
    expect(
      await setCandidates(
        'admin',
        'jam-1',
        [
          'One',
          'Two',
        ],
      ),
    ).toMatchObject(
      {
        ok: false,
        status: 400,
      },
    );
    seed(
      {
        themeVoting: false,
      },
    );
    expect(
      await setCandidates(
        'admin',
        'jam-1',
        [
          'One',
          'Two',
          'Three',
        ],
      ),
    ).toMatchObject(
      {
        ok: false,
        status: 404,
      },
    );
  });
});
