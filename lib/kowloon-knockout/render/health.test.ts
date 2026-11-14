import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  BLANK_STREAK_LIMIT,
  decideRecovery,
  FAIL_STREAK_LIMIT,
  GPU_ERROR_LIMIT,
  renderHealthSnapshot,
  reportFrameOk,
  reportGpuError,
  reportProbe,
  resetRenderHealth,
  STALL_LIMIT_MS,
  type RenderHealthSnapshot,
} from './health';
import { isBlankSample } from './probe';
import {
  FrametimeMonitor,
  shouldDownscale,
} from './governor';

const snap =
  (
    over: Partial<RenderHealthSnapshot> = {},
  ): RenderHealthSnapshot => ({
    ok: 100,
    failStreak: 0,
    fatal: false,
    lastOkAt: 10_000,
    since: 1_000,
    gpuErrors: 0,
    blankStreak: 0,
    probed: 0,
    painted: false,
    ...over,
  });
const webgpu =
  {
    backendIsWebGPU: true,
    alreadyForcedWebGL: false,
    hidden: false,
  };
const webgl =
  {
    backendIsWebGPU: false,
    alreadyForcedWebGL: false,
    hidden: false,
  };

describe('decideRecovery', () => {
  it('leaves a painting renderer alone', () => {
    expect(
      decideRecovery(
        snap(),
        10_500,
        webgpu,
      ),
    ).toBe(
      'none',
    );
  });
  it('falls back to WebGL 2 when WebGPU loses its device', () => {
    expect(
      decideRecovery(
        snap(
          {
            fatal: true,
          },
        ),
        10_100,
        webgpu,
      ),
    ).toBe(
      'force-webgl',
    );
  });
  it('falls back after a sustained failure streak, not a single bad frame', () => {
    expect(
      decideRecovery(
        snap(
          {
            failStreak: 1,
          },
        ),
        10_100,
        webgpu,
      ),
    ).toBe(
      'none',
    );
    expect(
      decideRecovery(
        snap(
          {
            failStreak:
              FAIL_STREAK_LIMIT,
          },
        ),
        10_100,
        webgpu,
      ),
    ).toBe(
      'force-webgl',
    );
  });
  it('treats a long stall as frozen but not a slow software renderer', () => {
    expect(
      decideRecovery(
        snap(),
        10_000 +
          4_500,
        webgl,
      ),
    ).toBe(
      'none',
    );
    expect(
      decideRecovery(
        snap(),
        10_000 +
          STALL_LIMIT_MS,
        webgl,
      ),
    ).toBe(
      'give-up',
    );
  });
  it('gives up once WebGL 2 has also failed', () => {
    expect(
      decideRecovery(
        snap(
          {
            fatal: true,
          },
        ),
        10_100,
        {
          ...webgpu,
          alreadyForcedWebGL: true,
        },
      ),
    ).toBe(
      'give-up',
    );
    expect(
      decideRecovery(
        snap(
          {
            fatal: true,
          },
        ),
        10_100,
        webgl,
      ),
    ).toBe(
      'give-up',
    );
  });
  it('never judges a hidden tab', () => {
    expect(
      decideRecovery(
        snap(
          {
            fatal: true,
          },
        ),
        99_999,
        {
          ...webgpu,
          hidden: true,
        },
      ),
    ).toBe(
      'none',
    );
  });
});

describe('a canvas that is not painting although frames "succeed"', () => {
  it('falls back to WebGL 2 on a sustained burst of uncaptured GPU errors', () => {
    expect(
      decideRecovery(
        snap(
          {
            gpuErrors:
              GPU_ERROR_LIMIT -
              1,
          },
        ),
        10_100,
        webgpu,
      ),
    ).toBe(
      'none',
    );
    expect(
      decideRecovery(
        snap(
          {
            gpuErrors:
              GPU_ERROR_LIMIT,
          },
        ),
        10_100,
        webgpu,
      ),
    ).toBe(
      'force-webgl',
    );
  });
  it('keeps counting GPU errors across frames that return normally', () => {
    resetRenderHealth(
      true,
    );
    for (
      let i = 0;
      i <
      GPU_ERROR_LIMIT;
      i++
    ) {
      reportGpuError(
        'validation',
      );
      reportFrameOk();
    }
    const s =
      renderHealthSnapshot();
    expect(
      s.failStreak,
    ).toBe(
      0,
    );
    expect(
      decideRecovery(
        s,
        s.lastOkAt +
          100,
        webgpu,
      ),
    ).toBe(
      'force-webgl',
    );
  });
  it('gives up on a canvas that stays blank under WebGL 2', () => {
    expect(
      decideRecovery(
        snap(
          {
            blankStreak:
              BLANK_STREAK_LIMIT -
              1,
          },
        ),
        10_100,
        webgl,
      ),
    ).toBe(
      'none',
    );
    expect(
      decideRecovery(
        snap(
          {
            blankStreak:
              BLANK_STREAK_LIMIT,
          },
        ),
        10_100,
        webgl,
      ),
    ).toBe(
      'give-up',
    );
  });
  it('counts blank probes, and one painted probe ends the run', () => {
    resetRenderHealth(
      false,
    );
    reportProbe(
      true,
    );
    reportProbe(
      true,
    );
    reportProbe(
      null,
    );
    expect(
      renderHealthSnapshot()
        .blankStreak,
    ).toBe(
      2,
    );
    reportProbe(
      false,
    );
    expect(
      renderHealthSnapshot()
        .blankStreak,
    ).toBe(
      0,
    );
  });
  it('does not trust a WebGPU probe that has never seen a picture', () => {
    resetRenderHealth(
      true,
    );
    for (
      let i = 0;
      i <
      BLANK_STREAK_LIMIT +
        2;
      i++
    )
      reportProbe(
        true,
      );
    expect(
      renderHealthSnapshot()
        .blankStreak,
    ).toBe(
      0,
    );
    reportProbe(
      false,
    );
    for (
      let i = 0;
      i <
      BLANK_STREAK_LIMIT;
      i++
    )
      reportProbe(
        true,
      );
    expect(
      renderHealthSnapshot()
        .blankStreak,
    ).toBe(
      BLANK_STREAK_LIMIT,
    );
  });
});

describe('isBlankSample', () => {
  const px =
    (
      ...rgba: number[]
    ) =>
      Uint8ClampedArray.from(
        rgba,
      );
  it('reads a flat clear colour and a transparent canvas as blank', () => {
    expect(
      isBlankSample(
        px(
          7,
          0,
          16,
          255,
          7,
          0,
          16,
          255,
          8,
          1,
          17,
          255,
        ),
      ),
    ).toBe(
      true,
    );
    expect(
      isBlankSample(
        px(
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
        ),
      ),
    ).toBe(
      true,
    );
  });
  it('reads any real contrast as a picture', () => {
    expect(
      isBlankSample(
        px(
          7,
          0,
          16,
          255,
          255,
          51,
          102,
          255,
        ),
      ),
    ).toBe(
      false,
    );
  });
  it('has no verdict on an empty read', () => {
    expect(
      isBlankSample(
        px(),
      ),
    ).toBeNull();
  });
});

describe('governor on a very slow machine', () => {
  it('downscales after a handful of frames, not a full 90-frame window', () => {
    const m =
      new FrametimeMonitor(
        90,
      );
    for (
      let i = 0;
      i <
      6;
      i++
    )
      m.push(
        100,
      );
    expect(
      shouldDownscale(
        m,
        20,
      ),
    ).toBe(
      true,
    );
  });
  it('ignores a short burst of one slow frame', () => {
    const m =
      new FrametimeMonitor(
        90,
      );
    for (
      let i = 0;
      i <
      5;
      i++
    )
      m.push(
        16,
      );
    m.push(
      100,
    );
    expect(
      shouldDownscale(
        m,
        20,
      ),
    ).toBe(
      false,
    );
  });
});
