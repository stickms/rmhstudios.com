import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  RESUME_TIMEOUT_MS,
  resumeAudio,
} from './resume';

// A resume() that never settles (an iOS audio interruption, a missing output device, headless
// Firefox) used to leave the microphone row on "Starting…" and the timing check on its intro,
// with every other choice disabled. The wait is bounded.
type Ctx =
  Parameters<
    typeof resumeAudio
  >[0];

describe('resumeAudio', () => {
  beforeEach(
    () =>
      vi.useFakeTimers(),
  );
  afterEach(
    () =>
      vi.useRealTimers(),
  );

  it('a running context is ready without asking', async () => {
    const resume =
      vi.fn();
    expect(
      await resumeAudio(
        {
          state:
            'running',
          resume,
        } as unknown as Ctx,
      ),
    ).toBe(
      true,
    );
    expect(
      resume,
    ).not.toHaveBeenCalled();
  });

  it('a closed context is never ready', async () => {
    const resume =
      vi.fn();
    expect(
      await resumeAudio(
        {
          state:
            'closed',
          resume,
        } as unknown as Ctx,
      ),
    ).toBe(
      false,
    );
    expect(
      resume,
    ).not.toHaveBeenCalled();
  });

  it('a suspended context that resumes is ready, and no timer is left', async () => {
    const ctx =
      {
        state:
          'suspended',
        resume:
          vi.fn(),
      } as {
        state: string;
        resume: () => Promise<void>;
      };
    ctx.resume =
      vi.fn(
        async () => {
          ctx.state =
            'running';
        },
      );
    expect(
      await resumeAudio(
        ctx as unknown as Ctx,
      ),
    ).toBe(
      true,
    );
    expect(
      vi.getTimerCount(),
    ).toBe(
      0,
    );
  });

  it('asks synchronously, inside the gesture that called it', () => {
    const resume =
      vi.fn(
        () =>
          new Promise<void>(
            () => {},
          ),
      );
    void resumeAudio(
      {
        state:
          'suspended',
        resume,
      } as unknown as Ctx,
    );
    expect(
      resume,
    ).toHaveBeenCalledTimes(
      1,
    );
  });

  it('a resume that never settles gives up after the timeout', async () => {
    const resume =
      vi.fn(
        () =>
          new Promise<void>(
            () => {},
          ),
      );
    const ready =
      resumeAudio(
        {
          state:
            'suspended',
          resume,
        } as unknown as Ctx,
      );
    await vi.advanceTimersByTimeAsync(
      RESUME_TIMEOUT_MS -
        1,
    );
    let settled = false;
    void ready.then(
      () =>
        (settled = true),
    );
    await Promise.resolve();
    expect(
      settled,
    ).toBe(
      false,
    );
    await vi.advanceTimersByTimeAsync(
      1,
    );
    expect(
      await ready,
    ).toBe(
      false,
    );
    expect(
      vi.getTimerCount(),
    ).toBe(
      0,
    );
  });

  it('a rejected resume is not ready', async () => {
    const resume =
      vi.fn(
        () =>
          Promise.reject(
            new Error(
              'blocked',
            ),
          ),
      );
    expect(
      await resumeAudio(
        {
          state:
            'suspended',
          resume,
        } as unknown as Ctx,
      ),
    ).toBe(
      false,
    );
  });

  it("older Safari's resume() returns undefined: ready once the state is running", async () => {
    const ctx =
      {
        state:
          'interrupted',
        resume:
          () =>
            undefined,
      } as {
        state: string;
        resume: () => undefined;
      };
    ctx.resume =
      () => {
        ctx.state =
          'running';
        return undefined;
      };
    expect(
      await resumeAudio(
        ctx as unknown as Ctx,
      ),
    ).toBe(
      true,
    );
  });

  it('a resume that resolves while the context stays suspended is not ready', async () => {
    const resume =
      vi.fn(
        async () => {},
      );
    expect(
      await resumeAudio(
        {
          state:
            'suspended',
          resume,
        } as unknown as Ctx,
      ),
    ).toBe(
      false,
    );
  });
});
