import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

let ctx: unknown =
  null;
vi.mock(
  '@/lib/shared/platform',
  () => ({
    getAudioContext:
      () =>
        ctx,
  }),
);

import { INSTRUMENT_CATALOG } from './catalog';
import {
  LOAD_WAIT_MS,
  MAX_DECODED,
  __setInstrumentFactory,
  beginSoundSession,
  currentSession,
  getInstrument,
  instrumentFor,
  sessionFallback,
} from './engine';
import type { LoadState } from './load-machine';
import type {
  Instrument,
  InstrumentId,
} from './types';
import {
  RELEASE_MS,
  playNote,
  soundReleaseMs,
  soundStatus,
} from '../voice';

function fakeContext() {
  const param =
    () => ({
      value: 0,
      setValueAtTime:
        vi.fn(),
      linearRampToValueAtTime:
        vi.fn(),
      cancelScheduledValues:
        vi.fn(),
      setTargetAtTime:
        vi.fn(),
    });
  return {
    state:
      'running',
    currentTime: 1,
    destination:
      {},
    resume:
      vi.fn(
        () =>
          Promise.resolve(),
      ),
    addEventListener:
      vi.fn(),
    removeEventListener:
      vi.fn(),
    createOscillator:
      vi.fn(
        () => ({
          frequency:
            {
              value: 0,
            },
          type: '',
          connect:
            vi.fn(),
          disconnect:
            vi.fn(),
          start:
            vi.fn(),
          stop: vi.fn(),
          onended:
            null,
        }),
      ),
    createGain:
      vi.fn(
        () => ({
          gain: param(),
          connect:
            vi.fn(),
          disconnect:
            vi.fn(),
        }),
      ),
  };
}

/** A stand-in instrument whose load the test settles by hand. */
function fakeInstrument(
  id: InstrumentId,
) {
  let state: LoadState =
    {
      kind: 'idle',
    };
  const subs =
    new Set<
      () => void
    >();
  const set =
    (
      s: LoadState,
    ) => {
      state =
        s;
      for (const fn of subs)
        fn();
    };
  const stop =
    vi.fn();
  const inst: Instrument =
    {
      ...INSTRUMENT_CATALOG[
        id
      ],
      get state() {
        return state;
      },
      load: vi.fn(
        async () => {
          if (
            state.kind ===
              'idle' ||
            state.kind ===
              'failed'
          )
            set(
              {
                kind: 'loading',
                done: 0,
                total: 1,
                failed: 0,
                startedAt: 0,
                slow: false,
                attempts: 0,
                lastReason:
                  null,
              },
            );
          return state;
        },
      ),
      canPlay:
        (
          midi,
        ) =>
          state.kind ===
            'ready' &&
          midi >=
            36 &&
          midi <=
            96,
      play: vi.fn(
        () => ({
          stop,
          done: Promise.resolve(),
        }),
      ),
      stopAll:
        vi.fn(),
      dispose:
        vi.fn(
          () => {
            if (
              state.kind ===
                'ready' ||
              state.kind ===
                'failed'
            )
              set(
                {
                  kind: 'idle',
                },
              );
          },
        ),
      subscribe:
        (
          fn,
        ) => {
          subs.add(
            fn,
          );
          return () =>
            subs.delete(
              fn,
            );
        },
    };
  return {
    inst,
    stop,
    ready:
      () =>
        set(
          {
            kind: 'ready',
            degraded: false,
          },
        ),
    fail: () =>
      set(
        {
          kind: 'failed',
          reason:
            'network',
          attempts: 1,
          at: 0,
        },
      ),
  };
}

let piano: ReturnType<
  typeof fakeInstrument
>;

beforeEach(
  () => {
    vi.useFakeTimers();
    ctx =
      fakeContext();
    piano =
      fakeInstrument(
        'piano',
      );
    __setInstrumentFactory(
      () =>
        piano.inst,
    );
  },
);
afterEach(
  () => {
    __setInstrumentFactory(
      null,
    );
    vi.useRealTimers();
  },
);

describe('a lesson sound session', () => {
  it('reads loading while the samples come, then plays them once ready', () => {
    const end =
      beginSoundSession(
        'piano',
      );
    expect(
      piano
        .inst
        .load,
    ).toHaveBeenCalledWith(
      {
        user: true,
      },
    );
    expect(
      soundStatus(),
    ).toBe(
      'loading',
    );
    // While the session decides, a note of its sound is dropped: neither the samples nor the synth,
    // and never reported as started. A note of no instrument is the synth as ever.
    const synthBefore =
      (
        ctx as ReturnType<
          typeof fakeContext
        >
      )
        .createOscillator
        .mock
        .calls
        .length;
    const early =
      vi.fn();
    playNote(
      60,
      {
        instrument:
          'piano',
        onStart:
          early,
      },
    );
    expect(
      piano
        .inst
        .play,
    ).not.toHaveBeenCalled();
    expect(
      (
        ctx as ReturnType<
          typeof fakeContext
        >
      )
        .createOscillator
        .mock
        .calls
        .length,
    ).toBe(
      synthBefore,
    );
    expect(
      early,
    ).not.toHaveBeenCalled();
    expect(
      soundReleaseMs(
        {
          instrument:
            'piano',
        },
      ),
    ).toBe(
      Math.max(
        RELEASE_MS,
        INSTRUMENT_CATALOG
          .piano
          .releaseMs,
      ),
    );
    playNote(
      60,
    );
    expect(
      (
        ctx as ReturnType<
          typeof fakeContext
        >
      )
        .createOscillator
        .mock
        .calls
        .length,
    ).toBe(
      synthBefore +
        1,
    );
    piano.ready();
    expect(
      currentSession()
        ?.choice,
    ).toEqual(
      {
        kind: 'instrument',
      },
    );
    expect(
      soundStatus(),
    ).toBe(
      'ready',
    );
    const onStart =
      vi.fn();
    const release =
      playNote(
        60,
        {
          instrument:
            'piano',
          onStart,
        },
      );
    expect(
      piano
        .inst
        .play,
    ).toHaveBeenCalledTimes(
      1,
    );
    expect(
      onStart,
    ).toHaveBeenCalledTimes(
      1,
    );
    release();
    release();
    expect(
      piano.stop,
    ).toHaveBeenCalledTimes(
      1,
    );
    expect(
      soundReleaseMs(
        {
          instrument:
            'piano',
        },
      ),
    ).toBe(
      INSTRUMENT_CATALOG
        .piano
        .releaseMs,
    );
    end();
    expect(
      currentSession(),
    ).toBeNull();
  });

  it(`settles for the synth after ${LOAD_WAIT_MS} ms and keeps it for the session even if the samples arrive`, () => {
    beginSoundSession(
      'piano',
    );
    vi.advanceTimersByTime(
      LOAD_WAIT_MS -
        1,
    );
    expect(
      soundStatus(),
    ).toBe(
      'loading',
    );
    vi.advanceTimersByTime(
      1,
    );
    expect(
      currentSession()
        ?.choice,
    ).toEqual(
      {
        kind: 'synth',
        reason:
          'timeout',
      },
    );
    expect(
      soundStatus(),
    ).toBe(
      'ready',
    );
    piano.ready();
    playNote(
      60,
      {
        instrument:
          'piano',
      },
    );
    expect(
      piano
        .inst
        .play,
    ).not.toHaveBeenCalled();
    // The echo guard follows the sound in use now: the synth's release, not the samples'.
    expect(
      soundReleaseMs(
        {
          instrument:
            'piano',
        },
      ),
    ).toBe(
      RELEASE_MS,
    );
    expect(
      sessionFallback(),
    ).toBe(
      'piano',
    );
    // The next session uses them.
    beginSoundSession(
      'piano',
    );
    expect(
      currentSession()
        ?.choice,
    ).toEqual(
      {
        kind: 'instrument',
      },
    );
  });

  it('starts the wait only once sound can play (the context is running)', () => {
    const listeners =
      new Set<
        () => void
      >();
    const sleepy =
      {
        ...fakeContext(),
        state:
          'suspended' as string,
      };
    sleepy.addEventListener =
      vi.fn(
        (
          _: string,
          fn: () => void,
        ) =>
          listeners.add(
            fn,
          ),
      );
    sleepy.removeEventListener =
      vi.fn(
        (
          _: string,
          fn: () => void,
        ) =>
          listeners.delete(
            fn,
          ),
      );
    ctx =
      sleepy;
    beginSoundSession(
      'piano',
    );
    vi.advanceTimersByTime(
      LOAD_WAIT_MS *
        3,
    );
    expect(
      currentSession()
        ?.choice,
    ).toEqual(
      {
        kind: 'pending',
      },
    );
    expect(
      soundStatus(),
    ).toBe(
      'asleep',
    );
    sleepy.state =
      'running';
    for (const fn of [
      ...listeners,
    ])
      fn();
    expect(
      soundStatus(),
    ).toBe(
      'loading',
    );
    vi.advanceTimersByTime(
      LOAD_WAIT_MS,
    );
    expect(
      currentSession()
        ?.choice,
    ).toEqual(
      {
        kind: 'synth',
        reason:
          'timeout',
      },
    );
    expect(
      listeners.size,
    ).toBe(
      0,
    );
  });

  it('goes to the synth at once when the samples fail', () => {
    beginSoundSession(
      'piano',
    );
    piano.fail();
    expect(
      currentSession()
        ?.choice,
    ).toEqual(
      {
        kind: 'synth',
        reason:
          'failed',
      },
    );
    expect(
      soundStatus(),
    ).toBe(
      'ready',
    );
  });

  it('never reports a delayed (strummed) voice as started before it sounds, nor after a release', () => {
    beginSoundSession(
      'piano',
    );
    piano.ready();
    const onStart =
      vi.fn();
    const r =
      playNote(
        64,
        {
          instrument:
            'piano',
          delayS: 0.024,
          onStart,
        },
      );
    expect(
      onStart,
    ).not.toHaveBeenCalled();
    vi.advanceTimersByTime(
      24,
    );
    expect(
      onStart,
    ).toHaveBeenCalledTimes(
      1,
    );
    const late =
      vi.fn();
    const r2 =
      playNote(
        67,
        {
          instrument:
            'piano',
          delayS: 0.05,
          onStart:
            late,
        },
      );
    r2();
    vi.advanceTimersByTime(
      100,
    );
    expect(
      late,
    ).not.toHaveBeenCalled();
    r();
  });
});

describe('outside a session', () => {
  it('uses a ready instrument and the synth otherwise', () => {
    playNote(
      60,
      {
        instrument:
          'piano',
      },
    );
    expect(
      piano
        .inst
        .play,
    ).not.toHaveBeenCalled();
    piano.ready();
    playNote(
      60,
      {
        instrument:
          'piano',
      },
    );
    expect(
      piano
        .inst
        .play,
    ).toHaveBeenCalledTimes(
      1,
    );
    expect(
      soundStatus(),
    ).toBe(
      'ready',
    );
  });
});

describe('instrumentFor: the pending path', () => {
  it('is pending while the session decides, then holds the choice for the rest of the lesson', () => {
    beginSoundSession(
      'piano',
    );
    expect(
      instrumentFor(
        'piano',
        60,
      ),
    ).toEqual(
      {
        kind: 'pending',
      },
    );
    // Another sound, or none, is not the session's to decide.
    expect(
      instrumentFor(
        undefined,
        60,
      ),
    ).toEqual(
      {
        kind: 'synth',
      },
    );
    piano.ready();
    expect(
      instrumentFor(
        'piano',
        60,
      ),
    ).toEqual(
      {
        kind: 'instrument',
        inst: piano.inst,
      },
    );
    // A note out of the samples' reach is the one exception: the synth, for that note only.
    expect(
      instrumentFor(
        'piano',
        20,
      ),
    ).toEqual(
      {
        kind: 'synth',
      },
    );
  });

  it('once the session fell back to the synth, ready samples never take over mid-lesson', () => {
    beginSoundSession(
      'piano',
    );
    piano.fail();
    expect(
      instrumentFor(
        'piano',
        60,
      ),
    ).toEqual(
      {
        kind: 'synth',
      },
    );
    expect(
      sessionFallback(),
    ).toBe(
      'piano',
    );
    piano.ready();
    expect(
      instrumentFor(
        'piano',
        60,
      ),
    ).toEqual(
      {
        kind: 'synth',
      },
    );
    const onStart =
      vi.fn();
    playNote(
      60,
      {
        instrument:
          'piano',
        onStart,
      },
    );
    expect(
      piano
        .inst
        .play,
    ).not.toHaveBeenCalled();
    expect(
      onStart,
    ).toHaveBeenCalledTimes(
      1,
    );
  });

  it('says nothing about a fallback while deciding or when the samples play', () => {
    beginSoundSession(
      'piano',
    );
    expect(
      sessionFallback(),
    ).toBeNull();
    piano.ready();
    expect(
      sessionFallback(),
    ).toBeNull();
  });
});

describe('decoded instruments', () => {
  let fakes: Record<
    InstrumentId,
    ReturnType<
      typeof fakeInstrument
    >
  >;
  beforeEach(
    () => {
      fakes =
        {
          piano:
            fakeInstrument(
              'piano',
            ),
          guitar:
            fakeInstrument(
              'guitar',
            ),
          violin:
            fakeInstrument(
              'violin',
            ),
          flute:
            fakeInstrument(
              'flute',
            ),
        };
      __setInstrumentFactory(
        (
          id,
        ) =>
          fakes[
            id
          ]
            .inst,
      );
    },
  );

  it(`keeps at most ${MAX_DECODED}: the least recently used is disposed when a third is ready`, () => {
    getInstrument(
      'piano',
    );
    fakes.piano.ready();
    getInstrument(
      'guitar',
    );
    fakes.guitar.ready();
    expect(
      fakes
        .piano
        .inst
        .dispose,
    ).not.toHaveBeenCalled();
    // Piano used again: guitar is now the least recent.
    getInstrument(
      'piano',
    );
    getInstrument(
      'violin',
    );
    fakes.violin.ready();
    expect(
      fakes
        .guitar
        .inst
        .dispose,
    ).toHaveBeenCalledTimes(
      1,
    );
    expect(
      fakes
        .piano
        .inst
        .dispose,
    ).not.toHaveBeenCalled();
    expect(
      fakes
        .violin
        .inst
        .dispose,
    ).not.toHaveBeenCalled();
    expect(
      fakes
        .guitar
        .inst
        .state
        .kind,
    ).toBe(
      'idle',
    );
  });

  it("never disposes the running lesson's instrument, however old", () => {
    beginSoundSession(
      'piano',
    );
    fakes.piano.ready();
    getInstrument(
      'guitar',
    );
    fakes.guitar.ready();
    getInstrument(
      'violin',
    );
    fakes.violin.ready();
    expect(
      fakes
        .piano
        .inst
        .dispose,
    ).not.toHaveBeenCalled();
    expect(
      fakes
        .guitar
        .inst
        .dispose,
    ).toHaveBeenCalledTimes(
      1,
    );
    expect(
      instrumentFor(
        'piano',
        60,
      ),
    ).toEqual(
      {
        kind: 'instrument',
        inst: fakes
          .piano
          .inst,
      },
    );
  });
});
