import {
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  createSampler,
  ATTACK_S,
  HANDOVER_S,
  type SamplerDeps,
} from './sampler';
import type {
  InstrumentMeta,
  Zone,
} from './types';
import { chordGain } from './chord';
import { velocityGain } from './zones';
import { ZONE_TIMEOUT_MS } from './loader';

const zone =
  (
    keyCenter: number,
    tuneCents = 0,
    gainDb = 0,
  ): Zone => ({
    file: `${keyCenter}.mp3`,
    keyCenter,
    tuneCents,
    gainDb,
    startOffsetS: 0.01,
    durationS: 3,
  });

const meta =
  (
    over: Partial<InstrumentMeta> = {},
  ): InstrumentMeta => ({
    id: 'piano',
    labelKey:
      'sound-piano',
    range:
      [
        58,
        64,
      ],
    polyphony:
      'chord',
    maxVoices: 4,
    releaseMs: 300,
    strumMs: 0,
    busGain: 1,
    maxShift: 1,
    softLowpass: false,
    credit:
      'salamander',
    ...over,
  });

function param() {
  return {
    value: 0,
    setValueAtTime:
      vi.fn(),
    linearRampToValueAtTime:
      vi.fn(),
    cancelScheduledValues:
      vi.fn(),
  };
}

function fakeCtx() {
  const sources: ReturnType<
    typeof makeSource
  >[] =
    [];
  const gains: {
    gain: ReturnType<
      typeof param
    >;
    connect: ReturnType<
      typeof vi.fn
    >;
    disconnect: ReturnType<
      typeof vi.fn
    >;
  }[] =
    [];
  function makeSource() {
    const s =
      {
        buffer:
          null as unknown,
        playbackRate:
          {
            value: 1,
          },
        connect:
          vi.fn(),
        disconnect:
          vi.fn(),
        start:
          vi.fn(),
        stop: vi.fn(),
        onended:
          null as
            | null
            | (() => void),
      };
    return s;
  }
  const ctx =
    {
      state:
        'running',
      currentTime: 10,
      destination:
        {},
      decodeAudioData:
        vi.fn(
          async (
            b: ArrayBuffer,
          ) =>
            ({
              bytes:
                b.byteLength,
            }) as unknown as AudioBuffer,
        ),
      createBufferSource:
        vi.fn(
          () => {
            const s =
              makeSource();
            sources.push(
              s,
            );
            return s;
          },
        ),
      createGain:
        vi.fn(
          () => {
            const g =
              {
                gain: param(),
                connect:
                  vi.fn(),
                disconnect:
                  vi.fn(),
              };
            gains.push(
              g,
            );
            return g;
          },
        ),
      createBiquadFilter:
        vi.fn(
          () => ({
            type: '',
            frequency:
              {
                value: 0,
              },
            Q: {
              value: 0,
            },
            connect:
              vi.fn(),
            disconnect:
              vi.fn(),
          }),
        ),
    };
  return {
    ctx,
    sources,
    gains,
  };
}

function setup(
  m = meta(),
  zones = [
    zone(
      57,
    ),
    zone(
      60,
      -6,
      2,
    ),
    zone(
      63,
    ),
  ],
  ok = (
    _url: string,
  ) =>
    true,
) {
  const f =
    fakeCtx();
  const fetch =
    vi.fn(
      async (
        url: string,
      ) => ({
        ok: ok(
          url,
        ),
        status:
          ok(
            url,
          )
            ? 200
            : 404,
        arrayBuffer:
          async () =>
            new ArrayBuffer(
              8,
            ),
      }),
    );
  const deps: SamplerDeps =
    {
      ctx: () =>
        f.ctx as unknown as AudioContext,
      output:
        () =>
          ({}) as AudioNode,
      urlOf:
        (
          z,
        ) =>
          `/s/${z.file}`,
      loader:
        {
          fetch,
          sleep:
            async () => {},
          crossOrigin:
            () =>
              false,
          online:
            () =>
              true,
        },
      now: () =>
        0,
    };
  return {
    ...f,
    fetch,
    inst: createSampler(
      m,
      zones,
      deps,
    ),
    deps,
  };
}

describe('sampler loading', () => {
  it('loads every zone once, settles ready, and notifies', async () => {
    const {
      inst,
      fetch,
    } =
      setup();
    const seen: string[] =
      [];
    inst.subscribe(
      () =>
        seen.push(
          inst
            .state
            .kind,
        ),
    );
    expect(
      inst
        .state
        .kind,
    ).toBe(
      'idle',
    );
    const p =
      inst.load();
    expect(
      inst.load(),
    ).toBe(
      p,
    );
    await expect(
      p,
    ).resolves.toMatchObject(
      {
        kind: 'ready',
        degraded: false,
      },
    );
    expect(
      fetch,
    ).toHaveBeenCalledTimes(
      3,
    );
    expect(
      seen[0],
    ).toBe(
      'loading',
    );
    expect(
      seen.at(
        -1,
      ),
    ).toBe(
      'ready',
    );
    await inst.load();
    expect(
      fetch,
    ).toHaveBeenCalledTimes(
      3,
    );
  });

  it('fails when a missing zone leaves part of the range unreachable', async () => {
    const {
      inst,
    } =
      setup(
        meta(),
        undefined,
        (
          url,
        ) =>
          !url.includes(
            '63',
          ),
      );
    await expect(
      inst.load(),
    ).resolves.toMatchObject(
      {
        kind: 'failed',
        reason:
          'network',
      },
    );
    expect(
      inst.canPlay(
        60,
      ),
    ).toBe(
      false,
    );
  });

  it('gives up on a zone whose request hangs: aborted after ZONE_TIMEOUT_MS, failed as network, retried by a later load', async () => {
    vi.useFakeTimers();
    try {
      const {
        deps,
      } =
        setup();
      const signals: AbortSignal[] =
        [];
      const hung =
        vi.fn(
          (
            _url: string,
            signal?: AbortSignal,
          ) =>
            new Promise<never>(
              () => {
                if (
                  signal
                )
                  signals.push(
                    signal,
                  );
              },
            ),
        );
      const inst =
        createSampler(
          meta(),
          [
            zone(
              60,
            ),
          ],
          {
            ...deps,
            loader:
              {
                ...deps.loader,
                fetch:
                  hung,
              },
          },
        );
      const first =
        inst.load(
          {
            user: true,
          },
        );
      expect(
        inst
          .state
          .kind,
      ).toBe(
        'loading',
      );
      await vi.advanceTimersByTimeAsync(
        ZONE_TIMEOUT_MS -
          1,
      );
      expect(
        inst
          .state
          .kind,
      ).toBe(
        'loading',
      );
      await vi.advanceTimersByTimeAsync(
        1,
      );
      await expect(
        first,
      ).resolves.toMatchObject(
        {
          kind: 'failed',
          reason:
            'network',
        },
      );
      expect(
        signals[0]
          .aborted,
      ).toBe(
        true,
      );
      // Not retried against the hung server, and the single flight is over: a new load fetches.
      expect(
        hung,
      ).toHaveBeenCalledTimes(
        1,
      );
      const second =
        inst.load(
          {
            user: true,
          },
        );
      expect(
        second,
      ).not.toBe(
        first,
      );
      expect(
        hung,
      ).toHaveBeenCalledTimes(
        2,
      );
      await vi.advanceTimersByTimeAsync(
        ZONE_TIMEOUT_MS,
      );
      await expect(
        second,
      ).resolves.toMatchObject(
        {
          kind: 'failed',
        },
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('times out a body that never arrives, too', async () => {
    vi.useFakeTimers();
    try {
      const {
        deps,
      } =
        setup();
      const inst =
        createSampler(
          meta(),
          [
            zone(
              60,
            ),
          ],
          {
            ...deps,
            loader:
              {
                ...deps.loader,
                fetch:
                  async () => ({
                    ok: true,
                    status: 200,
                    arrayBuffer:
                      () =>
                        new Promise<ArrayBuffer>(
                          () => {},
                        ),
                  }),
              },
          },
        );
      const p =
        inst.load();
      await vi.advanceTimersByTimeAsync(
        ZONE_TIMEOUT_MS,
      );
      await expect(
        p,
      ).resolves.toMatchObject(
        {
          kind: 'failed',
          reason:
            'network',
        },
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('fails as unsupported without Web Audio, and plays nothing', async () => {
    const {
      deps,
    } =
      setup();
    const inst =
      createSampler(
        meta(),
        [
          zone(
            60,
          ),
        ],
        {
          ...deps,
          ctx: () =>
            null,
        },
      );
    await expect(
      inst.load(),
    ).resolves.toMatchObject(
      {
        kind: 'failed',
        reason:
          'unsupported',
      },
    );
  });
});

describe('sampler playing', () => {
  it('is a silent handle before it is ready and outside its range', async () => {
    const {
      inst,
      sources,
    } =
      setup();
    const h =
      inst.play(
        60,
      );
    expect(
      sources,
    ).toHaveLength(
      0,
    );
    await expect(
      h.done,
    ).resolves.toBeUndefined();
    await inst.load();
    inst.play(
      70,
    );
    expect(
      sources,
    ).toHaveLength(
      0,
    );
  });

  it('plays the nearest zone at the detuned rate from its start offset', async () => {
    const {
      inst,
      sources,
      gains,
    } =
      setup();
    await inst.load();
    inst.play(
      61,
      {
        velocity: 1,
      },
    );
    expect(
      sources,
    ).toHaveLength(
      1,
    );
    expect(
      sources[0]
        .playbackRate
        .value,
    ).toBeCloseTo(
      2 **
        (1 /
          12 -
          6 /
            1200),
      10,
    );
    expect(
      sources[0]
        .start,
    ).toHaveBeenCalledWith(
      10,
      0.01,
    );
    // A short attack to the zone's trimmed level, never an instant jump.
    const level =
      velocityGain(
        1,
      ) *
      10 **
        (2 /
          20);
    expect(
      gains[0]
        .gain
        .setValueAtTime,
    ).toHaveBeenCalledWith(
      0,
      10,
    );
    expect(
      gains[0]
        .gain
        .linearRampToValueAtTime,
    ).toHaveBeenCalledWith(
      level,
      10 +
        ATTACK_S,
    );
  });

  it('trims each voice of a chord by 1/sqrt(n)', async () => {
    const {
      inst,
      gains,
    } =
      setup();
    await inst.load();
    inst.play(
      60,
      {
        velocity: 1,
        chordOf: 3,
      },
    );
    const level =
      velocityGain(
        1,
      ) *
      chordGain(
        3,
      ) *
      10 **
        (2 /
          20);
    expect(
      gains[0]
        .gain
        .linearRampToValueAtTime
        .mock
        .calls[0][0],
    ).toBeCloseTo(
      level,
      10,
    );
  });

  it('releases over releaseMs, once', async () => {
    const {
      inst,
      sources,
      gains,
    } =
      setup();
    await inst.load();
    const h =
      inst.play(
        60,
      );
    h.stop(
      11,
    );
    h.stop(
      12,
    );
    const ramps =
      gains[0]
        .gain
        .linearRampToValueAtTime
        .mock
        .calls;
    expect(
      ramps.at(
        -1,
      ),
    ).toEqual(
      [
        0,
        11.3,
      ],
    );
    expect(
      sources[0]
        .stop,
    ).toHaveBeenCalledTimes(
      1,
    );
    sources[0].onended?.();
    await expect(
      h.done,
    ).resolves.toBeUndefined();
    expect(
      sources[0]
        .disconnect,
    ).toHaveBeenCalled();
  });

  it('steals the oldest voice when full, and hands over at once when monophonic', async () => {
    const full =
      setup(
        meta(
          {
            maxVoices: 2,
          },
        ),
      );
    await full.inst.load();
    full.inst.play(
      58,
    );
    full.inst.play(
      60,
    );
    full.inst.play(
      62,
    );
    expect(
      full
        .sources[0]
        .stop,
    ).toHaveBeenCalledWith(
      10 +
        HANDOVER_S +
        0.01,
    );
    expect(
      full
        .sources[1]
        .stop,
    ).not.toHaveBeenCalled();

    const mono =
      setup(
        meta(
          {
            maxVoices: 1,
            polyphony:
              'mono',
          },
        ),
      );
    await mono.inst.load();
    mono.inst.play(
      58,
    );
    mono.inst.play(
      60,
    );
    expect(
      mono
        .sources[0]
        .stop,
    ).toHaveBeenCalledTimes(
      1,
    );
    expect(
      mono
        .sources[1]
        .stop,
    ).not.toHaveBeenCalled();
  });

  it('darkens soft notes through a low-pass only where the instrument asks', async () => {
    const piano =
      setup(
        meta(
          {
            softLowpass: true,
          },
        ),
      );
    await piano.inst.load();
    piano.inst.play(
      60,
      {
        velocity: 0.2,
      },
    );
    expect(
      piano
        .ctx
        .createBiquadFilter,
    ).toHaveBeenCalledTimes(
      1,
    );
    const other =
      setup();
    await other.inst.load();
    other.inst.play(
      60,
    );
    expect(
      other
        .ctx
        .createBiquadFilter,
    ).not.toHaveBeenCalled();
  });

  it('a voice released before its start (a cancelled strum) is stopped by then and never ramps', async () => {
    const {
      inst,
      sources,
      gains,
    } =
      setup();
    await inst.load();
    const h =
      inst.play(
        60,
        {
          when: 10.05,
        },
      );
    h.stop(
      10,
    );
    expect(
      sources[0]
        .start,
    ).toHaveBeenCalledWith(
      10.05,
      0.01,
    );
    expect(
      sources[0]
        .stop,
    ).toHaveBeenCalledTimes(
      1,
    );
    expect(
      sources[0]
        .stop
        .mock
        .calls[0][0],
    ).toBeLessThanOrEqual(
      10.05,
    );
    expect(
      gains[0]
        .gain
        .cancelScheduledValues,
    ).not.toHaveBeenCalled();
  });

  it('releases from the level the attack reached, computed, never read from the param', async () => {
    const {
      inst,
      gains,
    } =
      setup();
    await inst.load();
    const level =
      velocityGain(
        1,
      ) *
      10 **
        (2 /
          20);
    // Half-way up the attack ramp.
    const mid =
      inst.play(
        60,
        {
          velocity: 1,
        },
      );
    gains[0].gain.value = 123; // what an automated param's `value` might report: never used
    mid.stop(
      10 +
        ATTACK_S /
          2,
    );
    const [
      held0,
      at0,
    ] =
      gains[0].gain.setValueAtTime.mock.calls.at(
        -1,
      )!;
    expect(
      held0,
    ).toBeCloseTo(
      level /
        2,
      9,
    );
    expect(
      at0,
    ).toBe(
      10 +
        ATTACK_S /
          2,
    );
    // After the attack: the full level.
    const held =
      inst.play(
        60,
        {
          velocity: 1,
        },
      );
    held.stop(
      11,
    );
    expect(
      gains[1]
        .gain
        .setValueAtTime,
    ).toHaveBeenLastCalledWith(
      level,
      11,
    );
  });

  it('dispose stops the voices and frees the buffers', async () => {
    const {
      inst,
      sources,
    } =
      setup();
    await inst.load();
    inst.play(
      60,
    );
    inst.dispose();
    expect(
      inst
        .state
        .kind,
    ).toBe(
      'idle',
    );
    expect(
      sources[0]
        .stop,
    ).toHaveBeenCalled();
    expect(
      inst.canPlay(
        60,
      ),
    ).toBe(
      false,
    );
  });
});
