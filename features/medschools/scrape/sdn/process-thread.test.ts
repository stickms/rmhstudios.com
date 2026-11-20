import {
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  SourceHaltedError,
  type PoliteClient,
} from '../http';
import {
  NEEDLES,
  assertNoLeak,
  createFakeHost,
  createFakePrisma,
} from '../test-support';
import { readFixture } from '../adapters/sdn/test-fixtures';
import type {
  Logger,
  MedSdnThreadRow,
} from '../types';
import type { BudgetGate } from './budget';
import type { SdnAi } from './extract';
import {
  processThread,
  type ThreadDeps,
} from './process-thread';

const SECRET =
  'unit-test-secret-0123456789';
const SLUG =
  'test-thread';
const TID = 77;

interface P {
  id: number;
  text: string;
}
const path =
  (
    page: number,
  ) =>
    page <=
    1
      ? `/threads/${SLUG}.${TID}/`
      : `/threads/${SLUG}.${TID}/page-${page}`;

function page(
  posts: P[],
  lastPage: number,
): string {
  const nav =
    Array.from(
      {
        length:
          lastPage,
      },
      (
        _,
        i,
      ) =>
        `<li class="pageNav-page"><a>${i + 1}</a></li>`,
    ).join(
      '',
    );
  const arts =
    posts
      .map(
        (
          p,
        ) =>
          `<article class="message message--post" data-author="authorzz${p.id}" data-content="post-${p.id}" id="js-post-${p.id}">` +
          `<header class="message-attribution"><ul class="message-attribution-main"><li><time class="u-dt" datetime="2026-11-20T10:00:00-0500" data-timestamp="1795186800"></time></li></ul></header>` +
          `<div class="bbWrapper">${p.text}</div></article>`,
      )
      .join(
        '',
      );
  return `<html><body><ul>${nav}</ul>${arts}</body></html>`;
}

const posts =
  (
    from: number,
    n: number,
    text = 'I got an interview invite today',
  ): P[] =>
    Array.from(
      {
        length:
          n,
      },
      (
        _,
        i,
      ) => ({
        id:
          from +
          i,
        text,
      }),
    );

type Req =
  {
    ref: number;
    postedOn: string;
    text: string;
  };
type Answer =
  (
    reqs: Req[],
  ) => unknown;
const eventFor: Answer =
  (
    reqs,
  ) => ({
    posts:
      reqs.map(
        (
          r,
        ) => ({
          postRef:
            r.ref,
          events:
            [
              {
                type: 'INTERVIEW',
                date: '2026-11-18',
              },
            ],
          questions:
            [],
        }),
      ),
  });

function setup(opts: {
  routes:
    | Record<
        string,
        | string
        | null
      >
    | ((
        p: string,
      ) =>
        | string
        | null);
  answer?:
    | Answer
    | ((
        reqs: Req[],
      ) => string);
  configured?: boolean;
  allow?: () => Promise<boolean>;
  limits?: {
    maxPages: number;
    maxLlmCalls: number;
  };
  schoolId?: string;
  threadId?: number;
}) {
  const {
    prisma,
    writes,
    tables,
  } =
    createFakePrisma();
  const routesExtra =
    new Map<
      string,
      string
    >();
  const base =
    opts.routes;
  const {
    host,
    requested,
  } =
    createFakeHost(
      (
        p,
      ) =>
        routesExtra.has(
          p,
        )
          ? (routesExtra.get(
              p,
            ) ??
            null)
          : typeof base ===
              'function'
            ? base(
                p,
              )
            : (base[
                p
              ] ??
              null),
    );
  const client =
    host.session();
  const payloads: string[] =
    [];
  const logs: string[] =
    [];
  const run =
    vi.fn(
      async (
        _s: string,
        user: string,
      ): Promise<string> => {
        payloads.push(
          user,
        );
        const reqs =
          JSON.parse(
            user.slice(
              user.indexOf(
                '[',
              ),
              user.lastIndexOf(
                ']',
              ) +
                1,
            ),
          ) as Req[];
        const out =
          (
            opts.answer ??
            eventFor
          )(
            reqs,
          );
        return typeof out ===
          'string'
          ? out
          : JSON.stringify(
              out,
            );
      },
    );
  const ai: SdnAi =
    {
      configured:
        () =>
          opts.configured ??
          true,
      run,
    };
  const budget: BudgetGate =
    {
      allow:
        opts.allow ??
        (async () =>
          true),
    };
  const log: Logger =
    {
      info: (
        l,
      ) =>
        logs.push(
          l,
        ),
      warn: (
        l,
      ) =>
        logs.push(
          l,
        ),
      error:
        (
          l,
        ) =>
          logs.push(
            l,
          ),
    };
  const state =
    {
      pages: 0,
      llmCalls: 0,
    };
  const deps: ThreadDeps =
    {
      prisma,
      client,
      ai,
      budget,
      kind: 'live',
      secret:
        SECRET,
      now: () =>
        new Date(
          '2026-11-20T12:00:00Z',
        ),
      log,
      limits:
        opts.limits ?? {
          maxPages: 50,
          maxLlmCalls: 50,
        },
      state,
      shouldStop:
        () =>
          false,
    };
  const threadId =
    opts.threadId ??
    TID;
  const seed =
    async (
      over: Partial<MedSdnThreadRow> = {},
    ): Promise<MedSdnThreadRow> =>
      prisma.medSdnThread.upsert(
        {
          where:
            {
              threadId,
            },
          create:
            {
              threadId,
              slug: SLUG,
              schoolId:
                opts.schoolId ??
                'school-a',
              cycleYear: 2027,
              degree:
                'MD',
              archive: false,
              repliesSeen: 10,
              repliesDone: 0,
              lastActivityAt:
                null,
              cursorPage: 1,
              cursorPostHash:
                null,
              postsProcessed: 0,
              ...over,
            },
          update:
            {},
        },
      );
  const fresh =
    async (): Promise<MedSdnThreadRow> => {
      const rows =
        await prisma.medSdnThread.findMany(
          {
            where:
              {
                threadId,
              },
          },
        );
      return rows[0] as MedSdnThreadRow;
    };
  return {
    routesExtra,
    prisma,
    writes,
    tables,
    deps,
    client,
    requested,
    run,
    payloads,
    logs,
    seed,
    fresh,
    state,
  };
}

const eventRows =
  (
    t: Record<
      string,
      unknown[]
    >,
  ) =>
    (t.medCycleEvent ??
      []) as Array<
      Record<
        string,
        unknown
      >
    >;
const questionRows =
  (
    t: Record<
      string,
      unknown[]
    >,
  ) =>
    (t.medInterviewQuestion ??
      []) as Array<
      Record<
        string,
        unknown
      >
    >;

describe('processThread', () => {
  it('a first pass processes every page and ends caught-up', async () => {
    const s =
      setup(
        {
          routes:
            {
              [path(
                1,
              )]:
                page(
                  posts(
                    100,
                    3,
                  ),
                  2,
                ),
              [path(
                2,
              )]:
                page(
                  posts(
                    200,
                    3,
                  ),
                  2,
                ),
            },
        },
      );
    const r =
      await processThread(
        s.deps,
        await s.seed(),
      );
    expect(
      r.outcome,
    ).toBe(
      'caught-up',
    );
    expect(
      r.eventsCreated,
    ).toBe(
      6,
    );
    expect(
      r
        .counters
        .pages,
    ).toBe(
      2,
    );
    const t =
      await s.fresh();
    expect(
      t.repliesDone,
    ).toBe(
      t.repliesSeen,
    );
    expect(
      t.cursorPage,
    ).toBe(
      2,
    );
    expect(
      t.postsProcessed,
    ).toBe(
      6,
    );
    expect(
      s.requested,
    ).toEqual(
      [
        path(
          1,
        ),
        path(
          2,
        ),
      ],
    );
    for (const e of eventRows(
      s.tables,
    )) {
      expect(
        Object.keys(
          e,
        ).sort(),
      ).toEqual(
        [
          'cycleYear',
          'dedupeHash',
          'eventType',
          'id',
          'inState',
          'occurredAt',
          'program',
          'schoolId',
          'source',
        ].sort(),
      );
      expect(
        e.program,
      ).toBe(
        'REG',
      );
    }
  });

  it('only prefilter survivors reach the model; the rest advance the cursor', async () => {
    const mixed =
      [
        ...posts(
          100,
          2,
        ),
        {
          id: 110,
          text: 'lol nice',
        },
        ...posts(
          120,
          1,
        ),
        {
          id: 130,
          text: 'thanks all',
        },
      ];
    const s =
      setup(
        {
          routes:
            {
              [path(
                1,
              )]:
                page(
                  mixed,
                  1,
                ),
            },
        },
      );
    const r =
      await processThread(
        s.deps,
        await s.seed(),
      );
    expect(
      s.run,
    ).toHaveBeenCalledTimes(
      1,
    );
    expect(
      s
        .payloads[0],
    ).not.toContain(
      'lol nice',
    );
    expect(
      r
        .counters
        .scannedCount,
    ).toBe(
      5,
    );
    expect(
      r
        .counters
        .filteredCount,
    ).toBe(
      2,
    );
    const t =
      await s.fresh();
    expect(
      t.postsProcessed,
    ).toBe(
      5,
    );
    expect(
      r.eventsCreated,
    ).toBe(
      3,
    );
  });

  it('events carry school and cycle from the thread, never from the model', async () => {
    const s =
      setup(
        {
          routes:
            {
              [path(
                1,
              )]:
                page(
                  posts(
                    100,
                    1,
                  ),
                  1,
                ),
            },
        },
      );
    await processThread(
      s.deps,
      await s.seed(),
    );
    expect(
      eventRows(
        s.tables,
      )[0],
    ).toMatchObject(
      {
        cycleYear: 2027,
        schoolId:
          'school-a',
        source:
          'SDN',
      },
    );

    const bad =
      setup(
        {
          routes:
            {
              [path(
                1,
              )]:
                page(
                  posts(
                    100,
                    1,
                  ),
                  1,
                ),
            },
          answer:
            (
              reqs,
            ) => ({
              posts:
                reqs.map(
                  (
                    r,
                  ) => ({
                    postRef:
                      r.ref,
                    cycleYear: 2030,
                    schoolId:
                      'school-z',
                    events:
                      [
                        {
                          type: 'INTERVIEW',
                          date: '2026-11-18',
                        },
                      ],
                    questions:
                      [],
                  }),
                ),
            }),
        },
      );
    const r =
      await processThread(
        bad.deps,
        await bad.seed(),
      );
    expect(
      eventRows(
        bad.tables,
      ),
    ).toHaveLength(
      0,
    );
    expect(
      r
        .counters
        .extractFailed,
    ).toBe(
      1,
    );
  });

  it('a second identical pass writes nothing and calls the model zero times', async () => {
    const s =
      setup(
        {
          routes:
            {
              [path(
                1,
              )]:
                page(
                  posts(
                    100,
                    3,
                  ),
                  1,
                ),
            },
        },
      );
    await processThread(
      s.deps,
      await s.seed(),
    );
    const callsBefore =
      s
        .run
        .mock
        .calls
        .length;
    const writesBefore =
      s
        .writes
        .length;
    const r =
      await processThread(
        s.deps,
        await s.fresh(),
      );
    expect(
      r.outcome,
    ).toBe(
      'caught-up',
    );
    expect(
      s
        .run
        .mock
        .calls
        .length,
    ).toBe(
      callsBefore,
    );
    expect(
      s
        .writes
        .length,
    ).toBe(
      writesBefore,
    );
    expect(
      r.eventsCreated,
    ).toBe(
      0,
    );
  });

  it('a refetched last page with 3 new posts processes only the 3', async () => {
    let body =
      page(
        posts(
          100,
          3,
        ),
        1,
      );
    const s =
      setup(
        {
          routes:
            (
              p,
            ) =>
              p ===
              path(
                1,
              )
                ? body
                : null,
        },
      );
    await processThread(
      s.deps,
      await s.seed(),
    );
    body =
      page(
        posts(
          100,
          6,
        ),
        1,
      );
    const r =
      await processThread(
        s.deps,
        await s.fresh(),
      );
    expect(
      r.eventsCreated,
    ).toBe(
      3,
    );
    expect(
      r
        .counters
        .scannedCount,
    ).toBe(
      3,
    );
    expect(
      r
        .counters
        .cursorLost,
    ).toBe(
      0,
    );
    expect(
      JSON.parse(
        s.payloads[1]!.slice(
          s.payloads[1]!.indexOf(
            '[',
          ),
          s.payloads[1]!.lastIndexOf(
            ']',
          ) +
            1,
        ),
      ),
    ).toHaveLength(
      3,
    );
    expect(
      eventRows(
        s.tables,
      ),
    ).toHaveLength(
      6,
    );
  });

  it('a missing cursor hash reprocesses the page, counts cursorLost and creates no duplicates', async () => {
    const ask =
      (
        reqs: Req[],
      ) => ({
        posts:
          reqs.map(
            (
              r,
            ) => ({
              postRef:
                r.ref,
              events:
                [
                  {
                    type: 'INTERVIEW',
                    date: '2026-11-18',
                  },
                ],
              questions:
                [
                  'Why do you want to attend this program?',
                ],
            }),
          ),
      });
    let body =
      page(
        posts(
          100,
          3,
        ),
        1,
      );
    const s =
      setup(
        {
          routes:
            (
              p,
            ) =>
              p ===
              path(
                1,
              )
                ? body
                : null,
          answer:
            ask,
        },
      );
    await processThread(
      s.deps,
      await s.seed(),
    );
    const events =
      eventRows(
        s.tables,
      ).length;
    const questions =
      questionRows(
        s.tables,
      ).length;
    expect(
      questions,
    ).toBe(
      1,
    );
    body =
      page(
        posts(
          100,
          2,
        ),
        1,
      ); // the cursor post (102) was deleted
    const r =
      await processThread(
        s.deps,
        await s.fresh(),
      );
    expect(
      r
        .counters
        .cursorLost,
    ).toBe(
      1,
    );
    expect(
      r.eventsCreated,
    ).toBe(
      0,
    );
    expect(
      r.questionsCreated,
    ).toBe(
      0,
    );
    expect(
      eventRows(
        s.tables,
      ),
    ).toHaveLength(
      events,
    );
    expect(
      questionRows(
        s.tables,
      ),
    ).toHaveLength(
      questions,
    );
  });

  it('a post with two events creates two rows with distinct hashes; a later pass dedupes', async () => {
    const two: Answer =
      (
        reqs,
      ) => ({
        posts:
          reqs.map(
            (
              r,
            ) => ({
              postRef:
                r.ref,
              events:
                [
                  {
                    type: 'INTERVIEW',
                    date: '2026-11-18',
                  },
                  {
                    type: 'SECONDARY',
                    date: '2026-08-10',
                  },
                ],
              questions:
                [],
            }),
          ),
      });
    const s =
      setup(
        {
          routes:
            {
              [path(
                1,
              )]:
                page(
                  posts(
                    100,
                    1,
                  ),
                  1,
                ),
            },
          answer:
            two,
        },
      );
    const r =
      await processThread(
        s.deps,
        await s.seed(),
      );
    expect(
      r.eventsCreated,
    ).toBe(
      2,
    );
    const hashes =
      eventRows(
        s.tables,
      ).map(
        (
          e,
        ) =>
          e.dedupeHash,
      );
    expect(
      new Set(
        hashes,
      )
        .size,
    ).toBe(
      2,
    );
    const again =
      await processThread(
        s.deps,
        await s.seed(
          {
            cursorPage: 1,
            cursorPostHash:
              null,
          },
        ),
      );
    // seed() upserts with update {}, so reset the cursor explicitly
    await s.prisma.medSdnThread.update(
      {
        where:
          {
            threadId:
              TID,
          },
        data: {
          cursorPage: 1,
          cursorPostHash:
            null,
        },
      },
    );
    const third =
      await processThread(
        s.deps,
        await s.fresh(),
      );
    expect(
      again.eventsCreated,
    ).toBe(
      0,
    );
    expect(
      third.eventsCreated,
    ).toBe(
      0,
    );
    expect(
      eventRows(
        s.tables,
      ),
    ).toHaveLength(
      2,
    );
  });

  it('question dedupe: case and punctuation variants store once per school; another school stores separately', async () => {
    const ask: Answer =
      (
        reqs,
      ) => ({
        posts:
          reqs.map(
            (
              r,
            ) => ({
              postRef:
                r.ref,
              events:
                [],
              questions:
                [
                  'Why do you want to attend this program?',
                  'why do you want to attend this program',
                ],
            }),
          ),
      });
    const a =
      setup(
        {
          routes:
            {
              [path(
                1,
              )]:
                page(
                  posts(
                    100,
                    1,
                  ),
                  1,
                ),
            },
          answer:
            ask,
        },
      );
    await processThread(
      a.deps,
      await a.seed(),
    );
    expect(
      questionRows(
        a.tables,
      ),
    ).toHaveLength(
      1,
    );
    expect(
      Object.keys(
        questionRows(
          a.tables,
        )[0]!,
      ).sort(),
    ).toEqual(
      [
        'cycleYear',
        'dedupeHash',
        'id',
        'schoolId',
        'source',
        'text',
        'votes',
      ].sort(),
    );
    // a second thread for another school, in the same database
    const other =
      await a.prisma.medSdnThread.upsert(
        {
          where:
            {
              threadId: 78,
            },
          create:
            {
              threadId: 78,
              slug: SLUG,
              schoolId:
                'school-b',
              cycleYear: 2027,
              degree:
                'MD',
              archive: false,
              repliesSeen: 1,
              repliesDone: 0,
              lastActivityAt:
                null,
              cursorPage: 1,
              cursorPostHash:
                null,
              postsProcessed: 0,
            },
          update:
            {},
        },
      );
    a.routesExtra.set(
      `/threads/${SLUG}.78/`,
      page(
        posts(
          100,
          1,
        ),
        1,
      ),
    );
    const r =
      await processThread(
        a.deps,
        other,
      );
    expect(
      r.questionsCreated,
    ).toBe(
      1,
    );
    const rows =
      questionRows(
        a.tables,
      );
    expect(
      rows
        .map(
          (
            q,
          ) =>
            q.schoolId,
        )
        .sort(),
    ).toEqual(
      [
        'school-a',
        'school-b',
      ],
    );
    expect(
      new Set(
        rows.map(
          (
            q,
          ) =>
            q.dedupeHash,
        ),
      )
        .size,
    ).toBe(
      2,
    );
  });

  it('a failure inside the chunk transaction leaves events, questions and cursor unchanged', async () => {
    const s =
      setup(
        {
          routes:
            {
              [path(
                1,
              )]:
                page(
                  posts(
                    100,
                    2,
                  ),
                  1,
                ),
            },
          answer:
            (
              reqs,
            ) => ({
              posts:
                reqs.map(
                  (
                    r,
                  ) => ({
                    postRef:
                      r.ref,
                    events:
                      [
                        {
                          type: 'INTERVIEW',
                          date: '2026-11-18',
                        },
                      ],
                    questions:
                      [
                        'Why do you want to attend this program?',
                      ],
                  }),
                ),
            }),
        },
      );
    const seeded =
      await s.seed();
    // fail the cursor update, the last statement of the transaction
    const real =
      s.prisma.medSdnThread.update.bind(
        s
          .prisma
          .medSdnThread,
      );
    s.prisma.medSdnThread.update =
      async () => {
        throw new Error(
          'boom',
        );
      };
    const r =
      await processThread(
        s.deps,
        seeded,
      );
    s.prisma.medSdnThread.update =
      real;
    expect(
      r.outcome,
    ).toBe(
      'failed',
    );
    expect(
      eventRows(
        s.tables,
      ),
    ).toHaveLength(
      0,
    );
    expect(
      questionRows(
        s.tables,
      ),
    ).toHaveLength(
      0,
    );
    const t =
      await s.fresh();
    expect(
      t.cursorPostHash,
    ).toBeNull();
    expect(
      t.postsProcessed,
    ).toBe(
      0,
    );
    expect(
      r.touched,
    ).toEqual(
      [],
    );
  });

  it('ai.run throwing is ai-unavailable: nothing written, cursor unchanged', async () => {
    const s =
      setup(
        {
          routes:
            {
              [path(
                1,
              )]:
                page(
                  posts(
                    100,
                    2,
                  ),
                  1,
                ),
            },
          answer:
            () => {
              throw new Error(
                'provider down',
              );
            },
        },
      );
    const r =
      await processThread(
        s.deps,
        await s.seed(),
      );
    expect(
      r.outcome,
    ).toBe(
      'ai-unavailable',
    );
    expect(
      eventRows(
        s.tables,
      ),
    ).toHaveLength(
      0,
    );
    expect(
      (
        await s.fresh()
      )
        .cursorPostHash,
    ).toBeNull();
  });

  it('ai not configured is ai-unavailable before any model call', async () => {
    const s =
      setup(
        {
          routes:
            {
              [path(
                1,
              )]:
                page(
                  posts(
                    100,
                    2,
                  ),
                  1,
                ),
            },
          configured: false,
        },
      );
    const r =
      await processThread(
        s.deps,
        await s.seed(),
      );
    expect(
      r.outcome,
    ).toBe(
      'ai-unavailable',
    );
    expect(
      s.run,
    ).not.toHaveBeenCalled();
  });

  it('budget refusing pauses with the cursor at the last committed chunk', async () => {
    // 13 survivors => chunks of 12 + 1; allow exactly one call
    let n = 0;
    const s =
      setup(
        {
          routes:
            {
              [path(
                1,
              )]:
                page(
                  posts(
                    100,
                    13,
                  ),
                  1,
                ),
            },
          allow:
            async () =>
              ++n <=
              1,
        },
      );
    const r =
      await processThread(
        s.deps,
        await s.seed(),
      );
    expect(
      r.outcome,
    ).toBe(
      'paused-budget',
    );
    expect(
      r.eventsCreated,
    ).toBe(
      12,
    );
    const t =
      await s.fresh();
    expect(
      t.postsProcessed,
    ).toBe(
      12,
    );
    expect(
      t.repliesDone,
    ).toBe(
      0,
    );
  });

  it('the llm cap pauses (paused-cap) and the page cap pauses (paused-cap)', async () => {
    const llm =
      setup(
        {
          routes:
            {
              [path(
                1,
              )]:
                page(
                  posts(
                    100,
                    13,
                  ),
                  1,
                ),
            },
          limits:
            {
              maxPages: 10,
              maxLlmCalls: 1,
            },
        },
      );
    const r1 =
      await processThread(
        llm.deps,
        await llm.seed(),
      );
    expect(
      r1.outcome,
    ).toBe(
      'paused-cap',
    );
    expect(
      llm.run,
    ).toHaveBeenCalledTimes(
      1,
    );

    const pg =
      setup(
        {
          routes:
            {
              [path(
                1,
              )]:
                page(
                  posts(
                    100,
                    1,
                  ),
                  3,
                ),
              [path(
                2,
              )]:
                page(
                  posts(
                    200,
                    1,
                  ),
                  3,
                ),
              [path(
                3,
              )]:
                page(
                  posts(
                    300,
                    1,
                  ),
                  3,
                ),
            },
          limits:
            {
              maxPages: 2,
              maxLlmCalls: 50,
            },
        },
      );
    const r2 =
      await processThread(
        pg.deps,
        await pg.seed(),
      );
    expect(
      r2.outcome,
    ).toBe(
      'paused-cap',
    );
    expect(
      r2
        .counters
        .pages,
    ).toBe(
      2,
    );
    expect(
      (
        await pg.fresh()
      )
        .cursorPage,
    ).toBe(
      2,
    );
  });

  it('a poisoned chunk is retried per post; the bad post is skipped and the cursor advances past it', async () => {
    const mixed =
      [
        {
          id: 100,
          text: 'interview ok one',
        },
        {
          id: 101,
          text: 'interview POISON',
        },
        {
          id: 102,
          text: 'interview ok two',
        },
      ];
    const s =
      setup(
        {
          routes:
            {
              [path(
                1,
              )]:
                page(
                  mixed,
                  1,
                ),
            },
          answer:
            (
              reqs,
            ) =>
              reqs.some(
                (
                  r,
                ) =>
                  r.text.includes(
                    'POISON',
                  ),
              )
                ? 'not json at all'
                : eventFor(
                    reqs,
                  ),
        },
      );
    const r =
      await processThread(
        s.deps,
        await s.seed(),
      );
    expect(
      r.outcome,
    ).toBe(
      'caught-up',
    );
    expect(
      r
        .counters
        .batchesDropped,
    ).toBe(
      1,
    );
    expect(
      r
        .counters
        .extractFailed,
    ).toBe(
      1,
    );
    expect(
      r.eventsCreated,
    ).toBe(
      2,
    );
    const t =
      await s.fresh();
    expect(
      t.postsProcessed,
    ).toBe(
      3,
    );
    // whole chunk x2, then one call per post (the bad one tried twice by extractBatch)
    expect(
      s.run,
    ).toHaveBeenCalledTimes(
      2 +
        1 +
        2 +
        1,
    );
  });

  it('a challenge page fails the thread, is counted once by assertPage and leaves the cursor', async () => {
    const s =
      setup(
        {
          routes:
            {
              [path(
                1,
              )]:
                readFixture(
                  'thread-challenge.html',
                ),
            },
        },
      );
    const spy =
      vi.spyOn(
        s.client,
        'noteFailure',
      );
    const r =
      await processThread(
        s.deps,
        await s.seed(),
      );
    expect(
      r.outcome,
    ).toBe(
      'failed',
    );
    expect(
      spy,
    ).toHaveBeenCalledTimes(
      1,
    );
    expect(
      (
        await s.fresh()
      )
        .cursorPostHash,
    ).toBeNull();
  });

  it('three challenges halt the session: outcome halted', async () => {
    const s =
      setup(
        {
          routes:
            () =>
              readFixture(
                'thread-challenge.html',
              ),
        },
      );
    const out: string[] =
      [];
    for (
      let i = 0;
      i <
      3;
      i++
    )
      out.push(
        (
          await processThread(
            s.deps,
            await s.seed(),
          )
        )
          .outcome,
      );
    expect(
      out,
    ).toEqual(
      [
        'failed',
        'failed',
        'halted',
      ],
    );
    const again =
      await processThread(
        s.deps,
        await s.fresh(),
      );
    expect(
      again.outcome,
    ).toBe(
      'halted',
    );
  });

  it('a 404 skips the thread without counting a failure; an explicit SourceHaltedError halts', async () => {
    const s =
      setup(
        {
          routes:
            {},
        },
      );
    const spy =
      vi.spyOn(
        s.client,
        'noteFailure',
      );
    const r =
      await processThread(
        s.deps,
        await s.seed(),
      );
    expect(
      r.outcome,
    ).toBe(
      'skipped',
    );
    expect(
      spy,
    ).not.toHaveBeenCalled();

    const h =
      setup(
        {
          routes:
            {},
        },
      );
    const client =
      {
        ...h.client,
        get: async () => {
          throw new SourceHaltedError();
        },
      } as unknown as PoliteClient;
    const r2 =
      await processThread(
        {
          ...h.deps,
          client,
        },
        await h.seed(),
      );
    expect(
      r2.outcome,
    ).toBe(
      'halted',
    );
  });

  it('a 5xx fails the thread without a second count', async () => {
    const s =
      setup(
        {
          routes:
            {},
        },
      );
    const client =
      {
        ...s.client,
        get: async () => ({
          ok: false,
          status: 503,
          body: '',
        }),
        noteFailure:
          vi.fn(),
        halted: false,
      } as unknown as PoliteClient;
    const r =
      await processThread(
        {
          ...s.deps,
          client,
        },
        await s.seed(),
      );
    expect(
      r.outcome,
    ).toBe(
      'failed',
    );
    expect(
      client.noteFailure,
    ).not.toHaveBeenCalled();
  });

  it('quoted text never reaches the model', async () => {
    const s =
      setup(
        {
          routes:
            {
              [path(
                1,
              )]:
                page(
                  [
                    {
                      id: 100,
                      text: '<blockquote>Accepted 11/3 QUOTEDZZ</blockquote>I got an interview too, congrats',
                    },
                  ],
                  1,
                ),
            },
        },
      );
    await processThread(
      s.deps,
      await s.seed(),
    );
    expect(
      s.payloads,
    ).toHaveLength(
      1,
    );
    expect(
      s
        .payloads[0],
    ).not.toContain(
      'QUOTEDZZ',
    );
    expect(
      s
        .payloads[0],
    ).not.toContain(
      'Accepted 11/3',
    );
    expect(
      s
        .payloads[0],
    ).toContain(
      'congrats',
    );
  });

  it('counters and touched cells are numbers and plain cells only; the hostile thread leaks nothing', async () => {
    const hostileIds =
      [
        '8000001',
        '8000002',
        '8000003',
        '8000004',
      ];
    const ask: Answer =
      (
        reqs,
      ) => ({
        posts:
          reqs.map(
            (
              r,
            ) => ({
              postRef:
                r.ref,
              events:
                [
                  {
                    type: 'INTERVIEW',
                    date: '2026-11-18',
                  },
                ],
              questions:
                [
                  'Why did @handle_zq77 and MentionedUserZQ say that?',
                  'What would you do about hostile_author_zq at zq.person@example.com?',
                  'Why do you want to attend this program?',
                ],
            }),
          ),
      });
    // force every post through the prefilter by routing the fixture as served
    const html =
      readFixture(
        'thread-hostile.html',
      );
    const s =
      setup(
        {
          routes:
            {
              [path(
                1,
              )]:
                html,
            },
          answer:
            ask,
        },
      );
    const r =
      await processThread(
        s.deps,
        await s.seed(),
      );
    for (const v of Object.values(
      r.counters,
    ))
      expect(
        typeof v,
      ).toBe(
        'number',
      );
    for (const c of r.touched)
      expect(
        Object.keys(
          c,
        ).sort(),
      ).toEqual(
        [
          'cycleYear',
          'date',
          'program',
          'schoolId',
        ],
      );
    expect(
      Object.keys(
        r.counters,
      ).sort(),
    ).toEqual(
      [
        'batchesDropped',
        'cursorLost',
        'extractFailed',
        'filteredCount',
        'llmCalls',
        'pages',
        'rejected',
        'scannedCount',
      ].sort(),
    );
    const everything =
      [
        s.writes,
        s.payloads,
        s.logs,
        r,
      ];
    assertNoLeak(
      everything,
      [
        ...NEEDLES,
        ...hostileIds,
        'authorzz',
      ],
    );
    expect(
      s.run,
    ).toHaveBeenCalled();
  });
});
