import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  EVENT_TIME_TOLERANCE_MS,
  eventTime,
} from './event-time';

// A note's time is when the key went down, not when a stalled main thread got round to the
// handler: two notes queued behind a long task must keep their own times (the Daily board's
// too-fast check reads the gaps between them).
describe('eventTime', () => {
  it("takes the event's own stamp when it is on the performance.now() clock", () => {
    expect(
      eventTime(
        1_000,
        1_180,
      ),
    ).toBe(
      1_000,
    );
    expect(
      eventTime(
        1_179.5,
        1_180,
      ),
    ).toBe(
      1_179.5,
    );
  });

  it('falls back to now for a missing, zero or non-finite stamp', () => {
    expect(
      eventTime(
        undefined,
        500,
      ),
    ).toBe(
      500,
    );
    expect(
      eventTime(
        0,
        500,
      ),
    ).toBe(
      500,
    );
    expect(
      eventTime(
        Number.NaN,
        500,
      ),
    ).toBe(
      500,
    );
  });

  it('falls back to now for a stamp on another clock (an epoch time, or far from now)', () => {
    expect(
      eventTime(
        1_763_300_000_000,
        2_000,
      ),
    ).toBe(
      2_000,
    );
    expect(
      eventTime(
        2_000 -
          EVENT_TIME_TOLERANCE_MS -
          1,
        2_000,
      ),
    ).toBe(
      2_000,
    );
    expect(
      eventTime(
        2_050,
        2_000,
      ),
    ).toBe(
      2_000,
    );
  });
});
