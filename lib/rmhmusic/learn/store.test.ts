import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

// The adapters need browser APIs; the store only needs to know they were built.
const created =
  vi.hoisted(
    () => ({
      hub: 0,
      mic: 0,
      midi: 0,
      keyboard: 0,
      screen: 0,
    }),
  );
vi.mock(
  './input/hub',
  () => ({
    createInputHub:
      vi.fn(
        (
          adapters: unknown[],
        ) => {
          created.hub += 1;
          return {
            adapters,
          };
        },
      ),
  }),
);
vi.mock(
  './input/mic',
  () => ({
    createMicInput:
      vi.fn(
        () => (
          created.mic++,
          {
            source:
              'mic',
          }
        ),
      ),
  }),
);
vi.mock(
  './input/midi',
  () => ({
    createMidiInput:
      vi.fn(
        () => (
          created.midi++,
          {
            source:
              'midi',
          }
        ),
      ),
  }),
);
vi.mock(
  './input/keyboard',
  () => ({
    createKeyboardInput:
      vi.fn(
        () => (
          created.keyboard++,
          {
            source:
              'keys',
          }
        ),
      ),
  }),
);
vi.mock(
  './input/screen',
  () => ({
    createScreenInput:
      vi.fn(
        () => (
          created.screen++,
          {
            source:
              'screen',
          }
        ),
      ),
  }),
);

import {
  initial,
  type State,
} from './machines/learn-data';
import {
  project,
  useLearnStore,
  type LessonProgressRow,
  type Profile,
} from './store';

const PROFILE: Profile =
  {
    instrument:
      'piano',
    input:
      'screen',
    latencyMs: 0,
    dailyGoal: 1,
  };
const ROW: LessonProgressRow =
  {
    lessonId:
      'staff-what-is-a-staff',
    stars: 1,
    bestScore: 60,
    completedAt:
      '2026-11-01T00:00:00.000Z',
  };

function json(
  body: unknown,
  status = 200,
): Response {
  return new Response(
    JSON.stringify(
      body,
    ),
    {
      status,
      headers:
        {
          'content-type':
            'application/json',
        },
    },
  );
}

const fetchMock =
  vi.fn<
    (
      url: string,
      init?: RequestInit,
    ) => Promise<Response>
  >();

function reset() {
  useLearnStore.setState(
    {
      sync: initial,
      ...project(
        initial,
      ),
      hub: null,
      screen:
        null,
    },
  );
}

/** Start a test from a loaded store (what a successful `load()` leaves). */
function seedReady(
  profile: Profile,
  progress: LessonProgressRow[] = [],
) {
  const sync: State =
    {
      ...initial,
      load: {
        kind: 'ready',
      },
      confirmed:
        profile,
      progress,
    };
  useLearnStore.setState(
    {
      sync,
      ...project(
        sync,
      ),
    },
  );
}

beforeEach(
  () => {
    fetchMock.mockReset();
    vi.stubGlobal(
      'fetch',
      fetchMock,
    );
    vi.stubGlobal(
      'window',
      {},
    );
    reset();
  },
);

afterEach(
  () => {
    vi.unstubAllGlobals();
  },
);

describe('learn store', () => {
  it('builds no adapters on import, even where a window exists', () => {
    expect(
      created,
    ).toEqual(
      {
        hub: 0,
        mic: 0,
        midi: 0,
        keyboard: 0,
        screen: 0,
      },
    );
    const s =
      useLearnStore.getState();
    expect(
      s.hub,
    ).toBeNull();
    expect(
      s.screen,
    ).toBeNull();
    expect(
      s.status,
    ).toBe(
      'idle',
    );
  });

  it('load() reads the profile, builds the input once, and becomes ready', async () => {
    fetchMock.mockResolvedValue(
      json(
        {
          profile:
            PROFILE,
          progress:
            [
              ROW,
            ],
        },
      ),
    );
    await useLearnStore
      .getState()
      .load();
    const s =
      useLearnStore.getState();
    expect(
      s.status,
    ).toBe(
      'ready',
    );
    expect(
      s.profile,
    ).toEqual(
      PROFILE,
    );
    expect(
      s.progress,
    ).toEqual(
      [
        ROW,
      ],
    );
    expect(
      s.hub,
    ).not.toBeNull();
    expect(
      s.screen,
    ).not.toBeNull();
    expect(
      fetchMock,
    ).toHaveBeenCalledWith(
      '/api/rmhmusic/learn/profile',
      expect.objectContaining(
        {
          credentials:
            'include',
        },
      ),
    );

    const hub =
      s.hub;
    await useLearnStore
      .getState()
      .load();
    expect(
      useLearnStore.getState()
        .hub,
    ).toBe(
      hub,
    );
    expect(
      created.hub,
    ).toBe(
      1,
    );
  });

  it('load() does not refetch while a load is in flight', async () => {
    let release!: (
      r: Response,
    ) => void;
    fetchMock.mockReturnValue(
      new Promise<Response>(
        (
          r,
        ) =>
          (release =
            r),
      ),
    );
    const a =
      useLearnStore
        .getState()
        .load();
    const b =
      useLearnStore
        .getState()
        .load();
    release(
      json(
        {
          profile:
            PROFILE,
          progress:
            [],
        },
      ),
    );
    await Promise.all(
      [
        a,
        b,
      ],
    );
    expect(
      fetchMock,
    ).toHaveBeenCalledTimes(
      1,
    );
  });

  it('load() after a successful load issues no request and stays ready', async () => {
    fetchMock.mockResolvedValue(
      json(
        {
          profile:
            PROFILE,
          progress:
            [
              ROW,
            ],
        },
      ),
    );
    await useLearnStore
      .getState()
      .load();
    fetchMock.mockClear();
    await useLearnStore
      .getState()
      .load();
    expect(
      fetchMock,
    ).not.toHaveBeenCalled();
    const s =
      useLearnStore.getState();
    expect(
      s.status,
    ).toBe(
      'ready',
    );
    expect(
      s.profile,
    ).toEqual(
      PROFILE,
    );
    expect(
      s.progress,
    ).toEqual(
      [
        ROW,
      ],
    );
  });

  it('load() after an error fetches again and recovers', async () => {
    fetchMock.mockResolvedValue(
      json(
        {
          error:
            'x',
        },
        500,
      ),
    );
    await useLearnStore
      .getState()
      .load();
    expect(
      useLearnStore.getState()
        .status,
    ).toBe(
      'error',
    );
    fetchMock.mockClear();
    fetchMock.mockResolvedValue(
      json(
        {
          profile:
            PROFILE,
          progress:
            [
              ROW,
            ],
        },
      ),
    );
    await useLearnStore
      .getState()
      .load();
    expect(
      fetchMock,
    ).toHaveBeenCalledTimes(
      1,
    );
    expect(
      useLearnStore.getState()
        .status,
    ).toBe(
      'ready',
    );
    expect(
      useLearnStore.getState()
        .error,
    ).toBeNull();
  });

  it('load() maps a failure to status error without throwing', async () => {
    fetchMock.mockResolvedValue(
      json(
        {
          error:
            'x',
        },
        500,
      ),
    );
    await expect(
      useLearnStore
        .getState()
        .load(),
    ).resolves.toBeUndefined();
    expect(
      useLearnStore.getState()
        .status,
    ).toBe(
      'error',
    );
    expect(
      useLearnStore.getState()
        .error,
    ).toBe(
      'load_failed',
    );

    fetchMock.mockRejectedValue(
      new TypeError(
        'offline',
      ),
    );
    await useLearnStore
      .getState()
      .load();
    expect(
      useLearnStore.getState()
        .status,
    ).toBe(
      'error',
    );
    expect(
      useLearnStore.getState()
        .error,
    ).toBe(
      'load_failed',
    );

    fetchMock.mockResolvedValue(
      json(
        {
          error:
            'Unauthorized',
        },
        401,
      ),
    );
    await useLearnStore
      .getState()
      .load();
    expect(
      useLearnStore.getState()
        .error,
    ).toBe(
      'unauthorized',
    );
  });

  it('setInstrument updates at once, PUTs the whole profile, and keeps it on success', async () => {
    seedReady(
      PROFILE,
    );
    fetchMock.mockResolvedValue(
      json(
        {
          profile:
            {
              ...PROFILE,
              instrument:
                'guitar',
            },
        },
      ),
    );
    const done =
      useLearnStore
        .getState()
        .setInstrument(
          'guitar',
        );
    expect(
      useLearnStore.getState()
        .profile
        ?.instrument,
    ).toBe(
      'guitar',
    );
    await done;
    expect(
      useLearnStore.getState()
        .profile
        ?.instrument,
    ).toBe(
      'guitar',
    );
    const [
      url,
      init,
    ] =
      fetchMock
        .mock
        .calls[0];
    expect(
      url,
    ).toBe(
      '/api/rmhmusic/learn/profile',
    );
    expect(
      init?.method,
    ).toBe(
      'PUT',
    );
    expect(
      JSON.parse(
        String(
          init?.body,
        ),
      ),
    ).toEqual(
      {
        ...PROFILE,
        instrument:
          'guitar',
      },
    );
  });

  it('setInstrument rolls back and records an error when the PUT fails', async () => {
    seedReady(
      PROFILE,
    );
    fetchMock.mockResolvedValue(
      json(
        {
          error:
            'x',
        },
        500,
      ),
    );
    const done =
      useLearnStore
        .getState()
        .setInstrument(
          'guitar',
        );
    expect(
      useLearnStore.getState()
        .profile
        ?.instrument,
    ).toBe(
      'guitar',
    );
    await done;
    expect(
      useLearnStore.getState()
        .profile
        ?.instrument,
    ).toBe(
      'piano',
    );
    expect(
      useLearnStore.getState()
        .error,
    ).toBe(
      'save_failed',
    );
    expect(
      useLearnStore.getState()
        .status,
    ).toBe(
      'ready',
    );
  });

  it('setLatency rounds and clamps to the schema range before sending', async () => {
    seedReady(
      PROFILE,
    );
    fetchMock.mockImplementation(
      async (
        _url,
        init,
      ) =>
        json(
          {
            profile:
              JSON.parse(
                String(
                  init?.body,
                ),
              ),
          },
        ),
    );
    await useLearnStore
      .getState()
      .setLatency(
        812.6,
      );
    expect(
      useLearnStore.getState()
        .profile
        ?.latencyMs,
    ).toBe(
      500,
    );
    await useLearnStore
      .getState()
      .setLatency(
        -41.4,
      );
    expect(
      useLearnStore.getState()
        .profile
        ?.latencyMs,
    ).toBe(
      -41,
    );
    expect(
      JSON.parse(
        String(
          fetchMock
            .mock
            .calls[1][1]
            ?.body,
        ),
      )
        .latencyMs,
    ).toBe(
      -41,
    );
  });

  it('completeLesson merges optimistically, then the server progress replaces it', async () => {
    seedReady(
      PROFILE,
      [
        ROW,
      ],
    );
    const serverProgress: LessonProgressRow[] =
      [
        {
          ...ROW,
          stars: 3,
          bestScore: 95,
        },
      ];
    fetchMock.mockResolvedValue(
      json(
        {
          stars: 3,
          xpAwarded: 20,
          progress:
            serverProgress,
        },
      ),
    );

    const done =
      useLearnStore
        .getState()
        .completeLesson(
          'staff-what-is-a-staff',
          3,
          95,
        );
    expect(
      useLearnStore.getState()
        .progress,
    ).toEqual(
      [
        {
          ...ROW,
          stars: 3,
          bestScore: 95,
        },
      ],
    );
    // A worse replay would not lower it: the optimistic merge is the server's rule.
    await done;
    expect(
      useLearnStore.getState()
        .progress,
    ).toEqual(
      serverProgress,
    );
    const [
      url,
      init,
    ] =
      fetchMock
        .mock
        .calls[0];
    expect(
      url,
    ).toBe(
      '/api/rmhmusic/learn/lesson-complete',
    );
    expect(
      init?.method,
    ).toBe(
      'POST',
    );
    expect(
      JSON.parse(
        String(
          init?.body,
        ),
      ),
    ).toEqual(
      {
        lessonId:
          'staff-what-is-a-staff',
        stars: 3,
        score: 95,
      },
    );
  });

  it('completeLesson adds a row for a first completion and rolls it back on failure', async () => {
    seedReady(
      PROFILE,
      [
        ROW,
      ],
    );
    fetchMock.mockResolvedValue(
      json(
        {
          error:
            'x',
        },
        500,
      ),
    );
    const done =
      useLearnStore
        .getState()
        .completeLesson(
          'staff-treble-notes',
          2,
          80,
        );
    const optimistic =
      useLearnStore
        .getState()
        .progress.find(
          (
            r,
          ) =>
            r.lessonId ===
            'staff-treble-notes',
        );
    expect(
      optimistic,
    ).toMatchObject(
      {
        stars: 2,
        bestScore: 80,
      },
    );
    // The failure is the lesson's to show: it is returned, not left in the shared `error`.
    expect(
      await done,
    ).toBe(
      'failed',
    );
    expect(
      useLearnStore.getState()
        .progress,
    ).toEqual(
      [
        ROW,
      ],
    );
    expect(
      useLearnStore.getState()
        .error,
    ).toBeNull();
  });

  it('completeLesson rolls an improved row back to what it was', async () => {
    seedReady(
      PROFILE,
      [
        ROW,
      ],
    );
    fetchMock.mockRejectedValue(
      new TypeError(
        'offline',
      ),
    );
    await useLearnStore
      .getState()
      .completeLesson(
        'staff-what-is-a-staff',
        3,
        99,
      );
    expect(
      useLearnStore.getState()
        .progress,
    ).toEqual(
      [
        ROW,
      ],
    );
  });

  it('completeLesson ignores an unknown lesson without a request', async () => {
    seedReady(
      PROFILE,
      [
        ROW,
      ],
    );
    await useLearnStore
      .getState()
      .completeLesson(
        'nope',
        3,
        100,
      );
    expect(
      fetchMock,
    ).not.toHaveBeenCalled();
    expect(
      useLearnStore.getState()
        .progress,
    ).toEqual(
      [
        ROW,
      ],
    );
  });
});

/** A fetch whose responses the test settles by hand, in whatever order it likes. */
function manualFetch() {
  const calls: {
    body: Profile;
    settle: (
      r:
        | Response
        | Error,
    ) => void;
  }[] =
    [];
  fetchMock.mockImplementation(
    (
      _url,
      init,
    ) =>
      new Promise<Response>(
        (
          resolve,
          reject,
        ) => {
          calls.push(
            {
              body: JSON.parse(
                String(
                  init?.body,
                ),
              ),
              settle:
                (
                  r,
                ) =>
                  r instanceof
                  Error
                    ? reject(
                        r,
                      )
                    : resolve(
                        r,
                      ),
            },
          );
        },
      ),
  );
  return calls;
}
const sent =
  (
    n: number,
  ) =>
    vi.waitFor(
      () =>
        expect(
          fetchMock,
        ).toHaveBeenCalledTimes(
          n,
        ),
    );

describe('learn store profile writes are serialised', () => {
  beforeEach(
    () =>
      seedReady(
        PROFILE,
      ),
  );

  it('a failed first write does not leave the client ahead of the server', async () => {
    const calls =
      manualFetch();
    const a =
      useLearnStore
        .getState()
        .setInstrument(
          'guitar',
        );
    const b =
      useLearnStore
        .getState()
        .setInput(
          'mic',
        );
    await sent(
      1,
    );
    // The second PUT waits for the first to settle.
    expect(
      fetchMock,
    ).toHaveBeenCalledTimes(
      1,
    );
    calls[0].settle(
      json(
        {
          error:
            'x',
        },
        500,
      ),
    );
    await sent(
      2,
    );
    // The instrument change never reached the server, so the next body must not claim it.
    expect(
      calls[1]
        .body,
    ).toEqual(
      {
        ...PROFILE,
        input:
          'mic',
      },
    );
    calls[1].settle(
      json(
        {
          profile:
            calls[1]
              .body,
        },
      ),
    );
    await Promise.all(
      [
        a,
        b,
      ],
    );
    expect(
      useLearnStore.getState()
        .profile,
    ).toEqual(
      calls[1]
        .body,
    );
    expect(
      useLearnStore.getState()
        .error,
    ).toBe(
      'save_failed',
    );
  });

  it('sends rapid writes one at a time, in order, and keeps the newest state', async () => {
    const calls =
      manualFetch();
    const a =
      useLearnStore
        .getState()
        .setLatency(
          10,
        );
    const b =
      useLearnStore
        .getState()
        .setLatency(
          20,
        );
    await sent(
      1,
    );
    // Bodies are built from the latest state when sent, so the first already carries 20.
    expect(
      calls[0]
        .body
        .latencyMs,
    ).toBe(
      20,
    );
    expect(
      fetchMock,
    ).toHaveBeenCalledTimes(
      1,
    );
    // A stale-looking answer must not overwrite the newer optimistic value.
    calls[0].settle(
      json(
        {
          profile:
            {
              ...calls[0]
                .body,
              latencyMs: 10,
            },
        },
      ),
    );
    await sent(
      2,
    );
    // The first answer did not overwrite the newer optimistic value while the second was pending.
    expect(
      useLearnStore.getState()
        .profile
        ?.latencyMs,
    ).toBe(
      20,
    );
    expect(
      calls[1]
        .body
        .latencyMs,
    ).toBe(
      20,
    );
    calls[1].settle(
      json(
        {
          profile:
            calls[1]
              .body,
        },
      ),
    );
    await Promise.all(
      [
        a,
        b,
      ],
    );
    expect(
      useLearnStore.getState()
        .profile
        ?.latencyMs,
    ).toBe(
      20,
    );
  });

  it('rolls back to what the server last accepted when every write fails', async () => {
    const calls =
      manualFetch();
    const a =
      useLearnStore
        .getState()
        .setLatency(
          10,
        );
    const b =
      useLearnStore
        .getState()
        .setLatency(
          20,
        );
    await sent(
      1,
    );
    calls[0].settle(
      new TypeError(
        'offline',
      ),
    );
    await sent(
      2,
    );
    calls[1].settle(
      new TypeError(
        'offline',
      ),
    );
    await Promise.all(
      [
        a,
        b,
      ],
    );
    expect(
      useLearnStore.getState()
        .profile
        ?.latencyMs,
    ).toBe(
      0,
    );
  });

  it('adopts the profile the server returns', async () => {
    fetchMock.mockImplementation(
      async () =>
        json(
          {
            profile:
              {
                ...PROFILE,
                dailyGoal: 4,
              },
          },
        ),
    );
    await useLearnStore
      .getState()
      .setInput(
        'keys',
      );
    expect(
      useLearnStore.getState()
        .profile,
    ).toEqual(
      {
        ...PROFILE,
        dailyGoal: 4,
      },
    );
  });

  it('a failed write does not wedge the queue', async () => {
    const calls =
      manualFetch();
    const a =
      useLearnStore
        .getState()
        .setInstrument(
          'guitar',
        );
    await sent(
      1,
    );
    calls[0].settle(
      json(
        {
          error:
            'x',
        },
        500,
      ),
    );
    await a;
    const b =
      useLearnStore
        .getState()
        .setInput(
          'keys',
        );
    await sent(
      2,
    );
    calls[1].settle(
      json(
        {
          profile:
            calls[1]
              .body,
        },
      ),
    );
    await b;
    expect(
      useLearnStore.getState()
        .profile,
    ).toEqual(
      {
        ...PROFILE,
        input:
          'keys',
      },
    );
  });

  it('a 401 on a write reports unauthorized', async () => {
    fetchMock.mockImplementation(
      async () =>
        json(
          {
            error:
              'Unauthorized',
          },
          401,
        ),
    );
    await useLearnStore
      .getState()
      .setInstrument(
        'guitar',
      );
    expect(
      useLearnStore.getState()
        .error,
    ).toBe(
      'unauthorized',
    );
    expect(
      useLearnStore.getState()
        .status,
    ).toBe(
      'error',
    );
    expect(
      useLearnStore.getState()
        .profile
        ?.instrument,
    ).toBe(
      'piano',
    );
  });
});

describe('learn store regressions (state-machine review findings)', () => {
  beforeEach(
    () =>
      seedReady(
        PROFILE,
        [
          ROW,
        ],
      ),
  );

  it('(a) a failure superseded by a newer change to the same field is not reported', async () => {
    const calls =
      manualFetch();
    const a =
      useLearnStore
        .getState()
        .setLatency(
          10,
        );
    await sent(
      1,
    );
    const b =
      useLearnStore
        .getState()
        .setLatency(
          20,
        );
    calls[0].settle(
      json(
        {
          error:
            'x',
        },
        500,
      ),
    );
    await sent(
      2,
    );
    expect(
      useLearnStore.getState()
        .error,
    ).toBeNull();
    calls[1].settle(
      json(
        {
          profile:
            calls[1]
              .body,
        },
      ),
    );
    await Promise.all(
      [
        a,
        b,
      ],
    );
    expect(
      useLearnStore.getState()
        .profile
        ?.latencyMs,
    ).toBe(
      20,
    );
    expect(
      useLearnStore.getState()
        .error,
    ).toBeNull();
    expect(
      useLearnStore.getState()
        .saveFailed,
    ).toEqual(
      [],
    );
  });

  it('(a) changing a failed field again clears its failure', async () => {
    fetchMock.mockResolvedValueOnce(
      json(
        {
          error:
            'x',
        },
        500,
      ),
    );
    await useLearnStore
      .getState()
      .setLatency(
        10,
      );
    expect(
      useLearnStore.getState()
        .error,
    ).toBe(
      'save_failed',
    );
    expect(
      useLearnStore.getState()
        .saveFailed,
    ).toEqual(
      [
        'latencyMs',
      ],
    );
    fetchMock.mockImplementation(
      async (
        _url,
        init,
      ) =>
        json(
          {
            profile:
              JSON.parse(
                String(
                  init?.body,
                ),
              ),
          },
        ),
    );
    const again =
      useLearnStore
        .getState()
        .setLatency(
          30,
        );
    expect(
      useLearnStore.getState()
        .error,
    ).toBeNull();
    await again;
    expect(
      useLearnStore.getState()
        .error,
    ).toBeNull();
  });

  it('(b) overlapping writes: the last intent wins when an earlier one fails (10, 20, 10)', async () => {
    const calls =
      manualFetch();
    const w1 =
      useLearnStore
        .getState()
        .setLatency(
          10,
        );
    await sent(
      1,
    );
    const w2 =
      useLearnStore
        .getState()
        .setLatency(
          20,
        );
    const w3 =
      useLearnStore
        .getState()
        .setLatency(
          10,
        );
    calls[0].settle(
      new TypeError(
        'offline',
      ),
    );
    await sent(
      2,
    );
    // Not rolled back to 0: the newest intent (10) still stands.
    expect(
      useLearnStore.getState()
        .profile
        ?.latencyMs,
    ).toBe(
      10,
    );
    expect(
      calls[1]
        .body
        .latencyMs,
    ).toBe(
      10,
    );
    calls[1].settle(
      json(
        {
          profile:
            calls[1]
              .body,
        },
      ),
    );
    await sent(
      3,
    );
    calls[2].settle(
      json(
        {
          profile:
            calls[2]
              .body,
        },
      ),
    );
    await Promise.all(
      [
        w1,
        w2,
        w3,
      ],
    );
    expect(
      useLearnStore.getState()
        .profile
        ?.latencyMs,
    ).toBe(
      10,
    );
    expect(
      useLearnStore.getState()
        .error,
    ).toBeNull();
  });

  it('(c) a later successful write clears the error a 401 left', async () => {
    fetchMock.mockResolvedValueOnce(
      json(
        {
          error:
            'Unauthorized',
        },
        401,
      ),
    );
    await useLearnStore
      .getState()
      .setInstrument(
        'guitar',
      );
    expect(
      useLearnStore.getState()
        .status,
    ).toBe(
      'error',
    );
    fetchMock.mockImplementation(
      async (
        _url,
        init,
      ) =>
        json(
          {
            profile:
              JSON.parse(
                String(
                  init?.body,
                ),
              ),
          },
        ),
    );
    await useLearnStore
      .getState()
      .setInput(
        'keys',
      );
    expect(
      useLearnStore.getState()
        .status,
    ).toBe(
      'ready',
    );
    // The instrument change itself still failed, and says so.
    expect(
      useLearnStore.getState()
        .error,
    ).toBe(
      'save_failed',
    );
    expect(
      useLearnStore.getState()
        .saveFailed,
    ).toEqual(
      [
        'instrument',
      ],
    );
  });

  it('(d) a load landing while a write is queued keeps the optimistic field', async () => {
    // A 401 since loading lets load() fetch again while a write is still out.
    const sync: State =
      {
        ...initial,
        load: {
          kind: 'ready',
        },
        confirmed:
          PROFILE,
        progress:
          [
            ROW,
          ],
        expired: true,
      };
    useLearnStore.setState(
      {
        sync,
        ...project(
          sync,
        ),
      },
    );
    let releasePut!: (
      r: Response,
    ) => void;
    fetchMock.mockImplementation(
      (
        _url,
        init,
      ) =>
        init?.method ===
        'PUT'
          ? new Promise<Response>(
              (
                r,
              ) =>
                (releasePut =
                  r),
            )
          : Promise.resolve(
              json(
                {
                  profile:
                    PROFILE,
                  progress:
                    [
                      ROW,
                    ],
                },
              ),
            ),
    );
    const write =
      useLearnStore
        .getState()
        .setLatency(
          50,
        );
    await sent(
      1,
    );
    await useLearnStore
      .getState()
      .load();
    expect(
      useLearnStore.getState()
        .status,
    ).toBe(
      'ready',
    );
    expect(
      useLearnStore.getState()
        .profile
        ?.latencyMs,
    ).toBe(
      50,
    );
    releasePut(
      json(
        {
          profile:
            {
              ...PROFILE,
              latencyMs: 50,
            },
        },
      ),
    );
    await write;
    expect(
      useLearnStore.getState()
        .profile
        ?.latencyMs,
    ).toBe(
      50,
    );
  });

  it('a ready store never refetches, however often it is asked', async () => {
    await Promise.all(
      [
        1,
        2,
        3,
      ].map(
        () =>
          useLearnStore
            .getState()
            .load(),
      ),
    );
    expect(
      fetchMock,
    ).not.toHaveBeenCalled();
  });

  it('overlapping completions of two lessons: one answer does not drop the other row', async () => {
    let answerFirst!: (
      r: Response,
    ) => void;
    let answerSecond!: (
      r: Response,
    ) => void;
    fetchMock
      .mockImplementationOnce(
        () =>
          new Promise<Response>(
            (
              r,
            ) =>
              (answerFirst =
                r),
          ),
      )
      .mockImplementationOnce(
        () =>
          new Promise<Response>(
            (
              r,
            ) =>
              (answerSecond =
                r),
          ),
      );
    const a =
      useLearnStore
        .getState()
        .completeLesson(
          'play-first-note',
          3,
          100,
        );
    const b =
      useLearnStore
        .getState()
        .completeLesson(
          'staff-treble-notes',
          2,
          80,
        );
    const first: LessonProgressRow =
      {
        lessonId:
          'play-first-note',
        stars: 3,
        bestScore: 100,
        completedAt:
          'x',
      };
    // The server answers the first with its whole progress, which does not know the second yet.
    answerFirst(
      json(
        {
          progress:
            [
              ROW,
              first,
            ],
        },
      ),
    );
    expect(
      await a,
    ).toBe(
      'saved',
    );
    const ids =
      () =>
        useLearnStore
          .getState()
          .progress.map(
            (
              r,
            ) =>
              r.lessonId,
          )
          .sort();
    expect(
      ids(),
    ).toEqual(
      [
        'play-first-note',
        'staff-treble-notes',
        'staff-what-is-a-staff',
      ],
    );
    answerSecond(
      json(
        {
          error:
            'x',
        },
        500,
      ),
    );
    expect(
      await b,
    ).toBe(
      'failed',
    );
    expect(
      ids(),
    ).toEqual(
      [
        'play-first-note',
        'staff-what-is-a-staff',
      ],
    );
  });

  it('a completion 401 returns unauthorized and ends the session view', async () => {
    fetchMock.mockResolvedValue(
      json(
        {
          error:
            'Unauthorized',
        },
        401,
      ),
    );
    expect(
      await useLearnStore
        .getState()
        .completeLesson(
          'play-first-note',
          3,
          100,
        ),
    ).toBe(
      'unauthorized',
    );
    expect(
      useLearnStore.getState()
        .status,
    ).toBe(
      'error',
    );
    expect(
      useLearnStore.getState()
        .error,
    ).toBe(
      'unauthorized',
    );
  });

  it('an unrelated transition keeps profile and progress referentially stable', async () => {
    const before =
      useLearnStore.getState();
    fetchMock.mockResolvedValue(
      json(
        {
          error:
            'x',
        },
        500,
      ),
    );
    await useLearnStore
      .getState()
      .completeLesson(
        'nope',
        3,
        100,
      );
    useLearnStore.setState(
      {},
    ); // no-op publish
    const s =
      useLearnStore.getState();
    expect(
      s.profile,
    ).toBe(
      before.profile,
    );
    expect(
      s.progress,
    ).toBe(
      before.progress,
    );
  });
});

describe('learn store on the server', () => {
  it('load() without a window leaves hub and screen null and does not throw', async () => {
    vi.stubGlobal(
      'window',
      undefined,
    );
    fetchMock.mockImplementation(
      async () =>
        json(
          {
            profile:
              PROFILE,
            progress:
              [],
          },
        ),
    );
    await expect(
      useLearnStore
        .getState()
        .load(),
    ).resolves.toBeUndefined();
    const s =
      useLearnStore.getState();
    expect(
      s.hub,
    ).toBeNull();
    expect(
      s.screen,
    ).toBeNull();
    expect(
      s.status,
    ).toBe(
      'ready',
    );
  });
});

describe('learn store remembered cards', () => {
  const CARD =
    {
      cardId:
        'treble:64',
      due: '2026-11-10T00:00:00.000Z',
      lastReviewAt:
        '2026-11-08T00:00:00.000Z',
      stability: 2.2,
      difficulty: 4.8,
      reps: 1,
      lapses: 0,
    };
  beforeEach(
    () =>
      useLearnStore.setState(
        {
          cards:
            [],
          cardsStatus:
            'idle',
        },
      ),
  );

  it('a failed card load leaves the profile alone, and a later call tries again', async () => {
    seedReady(
      PROFILE,
    );
    fetchMock.mockResolvedValueOnce(
      json(
        {
          error:
            'x',
        },
        500,
      ),
    );
    await useLearnStore
      .getState()
      .loadCards();
    let s =
      useLearnStore.getState();
    expect(
      s.cardsStatus,
    ).toBe(
      'load_failed',
    );
    expect(
      s.status,
    ).toBe(
      'ready',
    );
    expect(
      s.error,
    ).toBeNull();

    fetchMock.mockResolvedValueOnce(
      json(
        {
          cards:
            [
              CARD,
              {
                cardId: 1,
              },
            ],
        },
      ),
    );
    await useLearnStore
      .getState()
      .loadCards();
    s =
      useLearnStore.getState();
    expect(
      s.cardsStatus,
    ).toBe(
      'ready',
    );
    expect(
      s.cards,
    ).toEqual(
      [
        CARD,
      ],
    );
    // Loaded once per page: a second call does not fetch.
    await useLearnStore
      .getState()
      .loadCards();
    expect(
      fetchMock,
    ).toHaveBeenCalledTimes(
      2,
    );
  });

  it('saveReviews merges the answer by card id and reports a 401 as unauthorized', async () => {
    useLearnStore.setState(
      {
        cards:
          [
            CARD,
          ],
        cardsStatus:
          'ready',
      },
    );
    const again =
      {
        ...CARD,
        reps: 2,
        stability: 0.66,
      };
    const fresh =
      {
        ...CARD,
        cardId:
          'treble:67',
      };
    fetchMock.mockResolvedValueOnce(
      json(
        {
          cards:
            [
              again,
              fresh,
            ],
        },
      ),
    );
    const reviews =
      [
        {
          cardId:
            'treble:64',
          grade:
            'again' as const,
        },
      ];
    expect(
      await useLearnStore
        .getState()
        .saveReviews(
          reviews,
        ),
    ).toBe(
      'saved',
    );
    expect(
      useLearnStore.getState()
        .cards,
    ).toEqual(
      [
        again,
        fresh,
      ],
    );
    const [
      ,
      init,
    ] =
      fetchMock
        .mock
        .calls[0];
    expect(
      JSON.parse(
        String(
          init?.body,
        ),
      ),
    ).toEqual(
      {
        reviews,
      },
    );

    fetchMock.mockResolvedValueOnce(
      json(
        {},
        401,
      ),
    );
    expect(
      await useLearnStore
        .getState()
        .saveReviews(
          reviews,
        ),
    ).toBe(
      'unauthorized',
    );
    fetchMock.mockRejectedValueOnce(
      new TypeError(
        'offline',
      ),
    );
    expect(
      await useLearnStore
        .getState()
        .saveReviews(
          reviews,
        ),
    ).toBe(
      'failed',
    );
    expect(
      useLearnStore.getState()
        .cards,
    ).toEqual(
      [
        again,
        fresh,
      ],
    );
  });
});
