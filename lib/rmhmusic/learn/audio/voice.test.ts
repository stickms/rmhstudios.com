import {
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

import {
  MAX_VOICES,
  RELEASE_MS,
  playNote,
  soundReleaseMs,
  soundStatus,
  type SoundStatus,
} from './voice';

function fakeContext(
  state:
    | 'running'
    | 'suspended'
    | 'closed' = 'running',
) {
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
    state,
    currentTime: 1,
    destination:
      {},
    resume:
      vi.fn(
        () =>
          Promise.resolve(),
      ),
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

beforeEach(
  () => {
    ctx =
      fakeContext();
  },
);

describe('playNote onStart', () => {
  it('is called once, during the call, when the synth note begins', () => {
    const onStart =
      vi.fn();
    const release =
      playNote(
        60,
        {
          onStart,
        },
      );
    expect(
      onStart,
    ).toHaveBeenCalledTimes(
      1,
    );
    release();
    release();
    expect(
      onStart,
    ).toHaveBeenCalledTimes(
      1,
    );
  });

  it('is not called when nothing sounds: no Web Audio, a closed context, or a bad note', () => {
    const onStart =
      vi.fn();
    ctx =
      null;
    playNote(
      60,
      {
        onStart,
      },
    );
    ctx =
      fakeContext(
        'closed',
      );
    playNote(
      60,
      {
        onStart,
      },
    );
    ctx =
      fakeContext();
    playNote(
      Number.NaN,
      {
        onStart,
      },
    );
    expect(
      onStart,
    ).not.toHaveBeenCalled();
  });

  it('still takes a bare velocity', () => {
    expect(
      () =>
        playNote(
          60,
          0.5,
        )(),
    ).not.toThrow();
  });
});

describe('the sound the synth makes', () => {
  it('reads its release from soundReleaseMs, which is the synth RELEASE_MS for any options', () => {
    expect(
      soundReleaseMs(),
    ).toBe(
      RELEASE_MS,
    );
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
      RELEASE_MS,
    ).toBe(
      250,
    );
    expect(
      MAX_VOICES,
    ).toBe(
      6,
    );
  });

  it('reports ready, asleep and none today; loading and failed are in the type for a sampled engine', () => {
    ctx =
      fakeContext(
        'running',
      );
    expect(
      soundStatus(),
    ).toBe(
      'ready',
    );
    ctx =
      fakeContext(
        'suspended',
      );
    expect(
      soundStatus(),
    ).toBe(
      'asleep',
    );
    ctx =
      fakeContext(
        'closed',
      );
    expect(
      soundStatus(),
    ).toBe(
      'none',
    );
    ctx =
      null;
    expect(
      soundStatus(),
    ).toBe(
      'none',
    );
    const all: SoundStatus[] =
      [
        'ready',
        'asleep',
        'none',
        'loading',
        'failed',
      ];
    expect(
      all,
    ).toHaveLength(
      5,
    );
  });
});
