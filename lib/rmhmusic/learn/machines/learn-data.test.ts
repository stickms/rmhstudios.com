import {
  describe,
  expect,
  it,
} from 'vitest';
import type {
  LessonProgressRow,
  Profile,
} from '../progress.server';
import {
  errorCode,
  initial,
  status,
  step,
  viewProfile,
  viewProgress,
  type Effect,
  type Event,
  type State,
} from './learn-data';

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
const AT =
  '2026-11-08T12:00:00.000Z';

const ready: State =
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
  };
const loading: State =
  {
    ...initial,
    seq: 1,
    load: {
      kind: 'loading',
      token: 1,
    },
  };
const latency =
  (
    v: number,
  ): Event => ({
    type: 'change',
    change:
      {
        key: 'latencyMs',
        value:
          v,
      },
  });

function run(
  from: State,
  events: Event[],
): {
  state: State;
  effects: Effect[];
} {
  let state =
    from;
  const effects: Effect[] =
    [];
  for (const e of events) {
    const next =
      step(
        state,
        e,
      );
    state =
      next.state;
    effects.push(
      ...next.effects,
    );
  }
  return {
    state,
    effects,
  };
}

describe('learn data: load transitions', () => {
  it('idle + load fetches and joins the token', () => {
    expect(
      step(
        initial,
        {
          type: 'load',
        },
      ),
    ).toEqual(
      {
        state:
          loading,
        effects:
          [
            {
              type: 'fetch',
              token: 1,
            },
            {
              type: 'join',
              id: 1,
            },
          ],
      },
    );
  });

  it('loading + load joins the load in flight (no second fetch)', () => {
    expect(
      step(
        loading,
        {
          type: 'load',
        },
      )
        .effects,
    ).toEqual(
      [
        {
          type: 'join',
          id: 1,
        },
      ],
    );
  });

  it('ready + load answers now and never refetches', () => {
    expect(
      step(
        ready,
        {
          type: 'load',
        },
      ),
    ).toEqual(
      {
        state:
          ready,
        effects:
          [
            {
              type: 'answer-now',
            },
          ],
      },
    );
  });

  it('ready after a 401 + load fetches again', () => {
    const r =
      step(
        {
          ...ready,
          expired: true,
        },
        {
          type: 'load',
        },
      );
    expect(
      r
        .state
        .load
        .kind,
    ).toBe(
      'loading',
    );
    expect(
      r
        .effects[0],
    ).toEqual(
      {
        type: 'fetch',
        token: 1,
      },
    );
  });

  it('failed + load fetches again (Retry)', () => {
    const failed: State =
      {
        ...initial,
        load: {
          kind: 'failed',
          reason:
            'load_failed',
        },
      };
    expect(
      step(
        failed,
        {
          type: 'load',
        },
      )
        .state
        .load
        .kind,
    ).toBe(
      'loading',
    );
  });

  it('loading + loaded becomes ready with the server data', () => {
    const r =
      step(
        loading,
        {
          type: 'loaded',
          token: 1,
          profile:
            PROFILE,
          progress:
            [
              ROW,
            ],
        },
      );
    expect(
      r
        .state
        .load,
    ).toEqual(
      {
        kind: 'ready',
      },
    );
    expect(
      viewProfile(
        r.state,
      ),
    ).toEqual(
      PROFILE,
    );
    expect(
      r.effects,
    ).toEqual(
      [
        {
          type: 'settle',
          id: 1,
        },
      ],
    );
  });

  it('loading + load-failed maps 401 and other failures', () => {
    expect(
      errorCode(
        step(
          loading,
          {
            type: 'load-failed',
            token: 1,
            unauthorized: true,
          },
        )
          .state,
      ),
    ).toBe(
      'unauthorized',
    );
    expect(
      errorCode(
        step(
          loading,
          {
            type: 'load-failed',
            token: 1,
            unauthorized: false,
          },
        )
          .state,
      ),
    ).toBe(
      'load_failed',
    );
  });

  it('a load answer for another token is ignored', () => {
    expect(
      step(
        loading,
        {
          type: 'loaded',
          token: 9,
          profile:
            PROFILE,
          progress:
            [],
        },
      )
        .state,
    ).toBe(
      loading,
    );
    expect(
      step(
        ready,
        {
          type: 'load-failed',
          token: 1,
          unauthorized: true,
        },
      )
        .state,
    ).toBe(
      ready,
    );
  });
});

describe('learn data: profile write transitions', () => {
  it('change before a profile exists is refused as not_loaded', () => {
    const r =
      step(
        initial,
        latency(
          10,
        ),
      );
    expect(
      errorCode(
        r.state,
      ),
    ).toBe(
      'not_loaded',
    );
    expect(
      r.effects,
    ).toEqual(
      [
        {
          type: 'answer-now',
        },
      ],
    );
  });

  it('an invalid change is refused, nothing queued', () => {
    const r =
      step(
        ready,
        {
          type: 'change',
          change:
            {
              key: 'dailyGoal',
              value: 99,
            },
        },
      );
    expect(
      errorCode(
        r.state,
      ),
    ).toBe(
      'invalid',
    );
    expect(
      r
        .state
        .intents,
    ).toEqual(
      [],
    );
  });

  it('change while idle queues an intent, shows it at once and schedules a flush', () => {
    const r =
      step(
        ready,
        latency(
          10,
        ),
      );
    expect(
      viewProfile(
        r.state,
      )
        ?.latencyMs,
    ).toBe(
      10,
    );
    expect(
      r.effects,
    ).toEqual(
      [
        {
          type: 'join',
          id: 1,
        },
        {
          type: 'schedule-flush',
        },
      ],
    );
  });

  it('change while a write is in flight only queues', () => {
    const r =
      run(
        ready,
        [
          latency(
            10,
          ),
          {
            type: 'flush',
          },
          latency(
            20,
          ),
        ],
      );
    expect(
      r.effects.at(
        -1,
      ),
    ).toEqual(
      {
        type: 'join',
        id: 2,
      },
    );
  });

  it('flush sends the head with the whole view; a second flush is a no-op', () => {
    const queued =
      run(
        ready,
        [
          latency(
            10,
          ),
          {
            type: 'change',
            change:
              {
                key: 'input',
                value:
                  'mic',
              },
          },
        ],
      ).state;
    const r =
      step(
        queued,
        {
          type: 'flush',
        },
      );
    expect(
      r.effects,
    ).toEqual(
      [
        {
          type: 'put',
          id: 1,
          body: {
            ...PROFILE,
            latencyMs: 10,
            input:
              'mic',
          },
        },
      ],
    );
    expect(
      step(
        r.state,
        {
          type: 'flush',
        },
      )
        .effects,
    ).toEqual(
      [],
    );
  });

  it('put-ok confirms, settles, and schedules the next write', () => {
    const s =
      run(
        ready,
        [
          latency(
            10,
          ),
          latency(
            20,
          ),
          {
            type: 'flush',
          },
        ],
      ).state;
    const r =
      step(
        s,
        {
          type: 'put-ok',
          id: 1,
          profile:
            {
              ...PROFILE,
              latencyMs: 20,
            },
        },
      );
    expect(
      r
        .state
        .sending,
    ).toBeNull();
    expect(
      r.state.intents.map(
        (
          i,
        ) =>
          i.id,
      ),
    ).toEqual(
      [
        2,
      ],
    );
    expect(
      r.effects,
    ).toEqual(
      [
        {
          type: 'settle',
          id: 1,
        },
        {
          type: 'schedule-flush',
        },
      ],
    );
  });

  it('put-failed drops the intent and marks the field failed when it was the newest', () => {
    const s =
      run(
        ready,
        [
          latency(
            10,
          ),
          {
            type: 'flush',
          },
        ],
      ).state;
    const r =
      step(
        s,
        {
          type: 'put-failed',
          id: 1,
          unauthorized: false,
        },
      );
    expect(
      viewProfile(
        r.state,
      )
        ?.latencyMs,
    ).toBe(
      0,
    );
    expect(
      r
        .state
        .failed,
    ).toEqual(
      [
        'latencyMs',
      ],
    );
    expect(
      errorCode(
        r.state,
      ),
    ).toBe(
      'save_failed',
    );
  });

  it('put-failed with 401 expires the session view', () => {
    const s =
      run(
        ready,
        [
          latency(
            10,
          ),
          {
            type: 'flush',
          },
        ],
      ).state;
    const r =
      step(
        s,
        {
          type: 'put-failed',
          id: 1,
          unauthorized: true,
        },
      );
    expect(
      status(
        r.state,
      ),
    ).toBe(
      'error',
    );
    expect(
      errorCode(
        r.state,
      ),
    ).toBe(
      'unauthorized',
    );
  });

  it('a put answer for an intent not in flight is ignored', () => {
    const s =
      run(
        ready,
        [
          latency(
            10,
          ),
        ],
      ).state;
    expect(
      step(
        s,
        {
          type: 'put-ok',
          id: 1,
          profile:
            PROFILE,
        },
      )
        .state,
    ).toBe(
      s,
    );
  });
});

describe('learn data: regressions', () => {
  it('(b) 10, 20, 10 and the first fails: the view stays at the last intent', () => {
    const r =
      run(
        ready,
        [
          latency(
            10,
          ),
          {
            type: 'flush',
          },
          latency(
            20,
          ),
          latency(
            10,
          ),
          {
            type: 'put-failed',
            id: 1,
            unauthorized: false,
          },
        ],
      );
    expect(
      viewProfile(
        r.state,
      )
        ?.latencyMs,
    ).toBe(
      10,
    );
    expect(
      r
        .state
        .failed,
    ).toEqual(
      [],
    );
  });

  it('(a) a failure superseded by a newer change of the field is not reported', () => {
    const r =
      run(
        ready,
        [
          latency(
            10,
          ),
          {
            type: 'flush',
          },
          latency(
            20,
          ),
          {
            type: 'put-failed',
            id: 1,
            unauthorized: false,
          },
        ],
      );
    expect(
      errorCode(
        r.state,
      ),
    ).toBeNull();
  });

  it('(a) changing a failed field clears its failure; other fields keep theirs', () => {
    const failedBoth =
      run(
        ready,
        [
          latency(
            10,
          ),
          {
            type: 'change',
            change:
              {
                key: 'instrument',
                value:
                  'guitar',
              },
          },
          {
            type: 'flush',
          },
          {
            type: 'put-failed',
            id: 1,
            unauthorized: false,
          },
          {
            type: 'flush',
          },
          {
            type: 'put-failed',
            id: 2,
            unauthorized: false,
          },
        ],
      ).state;
    expect(
      failedBoth.failed,
    ).toEqual(
      [
        'latencyMs',
        'instrument',
      ],
    );
    expect(
      step(
        failedBoth,
        latency(
          30,
        ),
      )
        .state
        .failed,
    ).toEqual(
      [
        'instrument',
      ],
    );
  });

  it('(c) a success after a 401 clears the expired session', () => {
    const r =
      run(
        ready,
        [
          latency(
            10,
          ),
          {
            type: 'flush',
          },
          {
            type: 'put-failed',
            id: 1,
            unauthorized: true,
          },
          latency(
            20,
          ),
          {
            type: 'flush',
          },
          {
            type: 'put-ok',
            id: 2,
            profile:
              {
                ...PROFILE,
                latencyMs: 20,
              },
          },
        ],
      );
    expect(
      status(
        r.state,
      ),
    ).toBe(
      'ready',
    );
    expect(
      errorCode(
        r.state,
      ),
    ).toBeNull();
  });

  it('(d) a load landing during queued writes keeps the optimistic fields', () => {
    const r =
      run(
        {
          ...ready,
          expired: true,
        },
        [
          latency(
            50,
          ),
          {
            type: 'flush',
          },
          {
            type: 'load',
          },
          {
            type: 'loaded',
            token: 2,
            profile:
              {
                ...PROFILE,
                dailyGoal: 3,
              },
            progress:
              [],
          },
        ],
      );
    expect(
      viewProfile(
        r.state,
      ),
    ).toEqual(
      {
        ...PROFILE,
        latencyMs: 50,
        dailyGoal: 3,
      },
    );
  });

  it('a stale load answer after a newer load is ignored', () => {
    const r =
      run(
        initial,
        [
          {
            type: 'load',
          },
          {
            type: 'load-failed',
            token: 1,
            unauthorized: false,
          },
          {
            type: 'load',
          },
          {
            type: 'loaded',
            token: 1,
            profile:
              PROFILE,
            progress:
              [],
          },
        ],
      );
    expect(
      r
        .state
        .load,
    ).toEqual(
      {
        kind: 'loading',
        token: 2,
      },
    );
  });
});

describe('learn data: completions', () => {
  const complete =
    (
      lessonId: string,
      stars = 3,
      score = 100,
    ): Event => ({
      type: 'complete',
      lessonId,
      stars,
      score,
      at: AT,
    });

  it('an unknown lesson is refused without a request', () => {
    expect(
      step(
        ready,
        complete(
          'nope',
        ),
      ),
    ).toEqual(
      {
        state:
          ready,
        effects:
          [
            {
              type: 'answer-now',
              outcome:
                'invalid',
            },
          ],
      },
    );
  });

  it('a completion posts, clamps, and shows an optimistic row at once', () => {
    const r =
      step(
        ready,
        complete(
          'play-first-note',
          9,
          400,
        ),
      );
    expect(
      r.effects,
    ).toEqual(
      [
        {
          type: 'post',
          id: 1,
          body: {
            lessonId:
              'play-first-note',
            stars: 3,
            score: 100,
          },
        },
        {
          type: 'join',
          id: 1,
        },
      ],
    );
    expect(
      viewProgress(
        r.state,
      ).at(
        -1,
      ),
    ).toEqual(
      {
        lessonId:
          'play-first-note',
        stars: 3,
        bestScore: 100,
        completedAt:
          AT,
      },
    );
  });

  it('an improved row keeps its first completedAt; a worse replay does not lower it', () => {
    const better =
      viewProgress(
        step(
          ready,
          complete(
            'staff-what-is-a-staff',
            3,
            95,
          ),
        )
          .state,
      );
    expect(
      better,
    ).toEqual(
      [
        {
          ...ROW,
          stars: 3,
          bestScore: 95,
        },
      ],
    );
    const worse =
      viewProgress(
        step(
          ready,
          complete(
            'staff-what-is-a-staff',
            0,
            10,
          ),
        )
          .state,
      );
    expect(
      worse,
    ).toEqual(
      [
        ROW,
      ],
    );
  });

  it('post-ok replaces the server rows; post-failed drops the optimistic row', () => {
    const s =
      step(
        ready,
        complete(
          'play-first-note',
        ),
      ).state;
    const ok =
      step(
        s,
        {
          type: 'post-ok',
          id: 1,
          progress:
            [
              ROW,
            ],
        },
      );
    expect(
      ok.effects,
    ).toEqual(
      [
        {
          type: 'settle',
          id: 1,
          outcome:
            'saved',
        },
      ],
    );
    expect(
      viewProgress(
        ok.state,
      ),
    ).toEqual(
      [
        ROW,
      ],
    );
    const bad =
      step(
        s,
        {
          type: 'post-failed',
          id: 1,
          unauthorized: false,
        },
      );
    expect(
      bad.effects,
    ).toEqual(
      [
        {
          type: 'settle',
          id: 1,
          outcome:
            'failed',
        },
      ],
    );
    expect(
      viewProgress(
        bad.state,
      ),
    ).toEqual(
      [
        ROW,
      ],
    );
    // A completion failure does not raise the shared error: the lesson shows its own.
    expect(
      errorCode(
        bad.state,
      ),
    ).toBeNull();
  });

  it('post-ok without rows is a failure; a 401 is unauthorized', () => {
    const s =
      step(
        ready,
        complete(
          'play-first-note',
        ),
      ).state;
    expect(
      step(
        s,
        {
          type: 'post-ok',
          id: 1,
          progress:
            null,
        },
      )
        .effects[0],
    ).toEqual(
      {
        type: 'settle',
        id: 1,
        outcome:
          'failed',
      },
    );
    const r =
      step(
        s,
        {
          type: 'post-failed',
          id: 1,
          unauthorized: true,
        },
      );
    expect(
      r
        .effects[0],
    ).toEqual(
      {
        type: 'settle',
        id: 1,
        outcome:
          'unauthorized',
      },
    );
    expect(
      status(
        r.state,
      ),
    ).toBe(
      'error',
    );
  });

  it('an answer for a completion no longer pending is ignored', () => {
    expect(
      step(
        ready,
        {
          type: 'post-ok',
          id: 4,
          progress:
            [],
        },
      )
        .state,
    ).toBe(
      ready,
    );
  });
});
