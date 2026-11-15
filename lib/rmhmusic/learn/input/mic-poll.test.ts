import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import type { NoteEvent } from './events';

// The 25 ms poll: silence never reaches the pitch detector, a steady tone
// becomes one note, and stopping leaves no timer and releases the note.
const signal =
  vi.hoisted(
    () => ({
      freq: 0,
    }),
  );
const ctx =
  vi.hoisted(
    () => ({
      state:
        'running',
      sampleRate: 48000,
      resume:
        () =>
          Promise.resolve(),
      createMediaStreamSource:
        () => ({
          connect:
            () => {},
          disconnect:
            () => {},
        }),
      createAnalyser:
        () => ({
          fftSize: 0,
          disconnect:
            () => {},
          getFloatTimeDomainData:
            (
              buf: Float32Array,
            ) => {
              for (
                let i = 0;
                i <
                buf.length;
                i++
              ) {
                buf[
                  i
                ] =
                  signal.freq
                    ? 0.4 *
                      Math.sin(
                        (2 *
                          Math.PI *
                          signal.freq *
                          i) /
                          48000,
                      )
                    : 0;
              }
            },
        }),
    }),
  );
vi.mock(
  '@/lib/shared/platform',
  () => ({
    getAudioContext:
      () =>
        ctx,
  }),
);
const detect =
  vi.hoisted(
    () => ({
      calls: 0,
    }),
  );
vi.mock(
  '../pitch/yin',
  async (
    orig,
  ) => {
    const real =
      await orig<
        typeof import('../pitch/yin')
      >();
    return {
      ...real,
      detectPitch:
        (
          ...args: Parameters<
            typeof real.detectPitch
          >
        ) => {
          detect.calls++;
          return real.detectPitch(
            ...args,
          );
        },
    };
  },
);

import { createMicInput } from './mic';

describe('mic poll', () => {
  beforeEach(
    () => {
      vi.useFakeTimers();
      signal.freq = 0;
      detect.calls = 0;
      const track =
        {
          stop: vi.fn(),
        };
      vi.stubGlobal(
        'navigator',
        {
          mediaDevices:
            {
              getUserMedia:
                () =>
                  Promise.resolve(
                    {
                      getTracks:
                        () => [
                          track,
                        ],
                    },
                  ),
            },
        },
      );
    },
  );

  afterEach(
    () => {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    },
  );

  it('skips the detector on silence, hears a steady A4 once, and stops clean', async () => {
    const levels: number[] =
      [];
    const mic =
      createMicInput(
        {
          onLevel:
            (
              rms,
            ) =>
              levels.push(
                rms,
              ),
        },
      );
    const got: NoteEvent[] =
      [];
    mic.subscribe(
      (
        e,
      ) =>
        got.push(
          e,
        ),
    );
    await mic.start();

    await vi.advanceTimersByTimeAsync(
      250,
    );
    expect(
      levels.length,
    ).toBe(
      10,
    );
    expect(
      levels.every(
        (
          l,
        ) =>
          l ===
          0,
      ),
    ).toBe(
      true,
    );
    expect(
      detect.calls,
    ).toBe(
      0,
    );
    expect(
      got,
    ).toEqual(
      [],
    );

    signal.freq = 440;
    await vi.advanceTimersByTimeAsync(
      250,
    );
    expect(
      detect.calls,
    ).toBe(
      10,
    );
    expect(
      got.map(
        (
          e,
        ) => [
          e.type,
          e.midi,
        ],
      ),
    ).toEqual(
      [
        [
          'on',
          69,
        ],
      ],
    );
    expect(
      Math.abs(
        got[0]
          .cents ??
          99,
      ),
    ).toBeLessThan(
      5,
    );

    mic.stop();
    expect(
      vi.getTimerCount(),
    ).toBe(
      0,
    );
    expect(
      got.map(
        (
          e,
        ) => [
          e.type,
          e.midi,
        ],
      ),
    ).toEqual(
      [
        [
          'on',
          69,
        ],
        [
          'off',
          69,
        ],
      ],
    );
  });
});
