import {
  describe,
  expect,
  it,
} from 'vitest';
import { TRY_AGAIN_AFTER_MS } from '../../engine/boot-watchdog';
import {
  announcedProgress,
  failureKey,
  tryAgainVisible,
} from '../boot-state';

describe('failureKey', () => {
  it('names the kind of failure first, then the reason of a load failure', () => {
    expect(
      failureKey(
        'corrupt',
        {
          error:
            'x',
          reason:
            'stalled',
        },
      ),
    ).toBe(
      'corrupt',
    );
    expect(
      failureKey(
        'locked',
        undefined,
      ),
    ).toBe(
      'locked',
    );
    expect(
      failureKey(
        'handshake',
        {
          error:
            'agent: timeout',
        },
      ),
    ).toBe(
      'handshake',
    );
    expect(
      failureKey(
        'load',
        {
          error:
            'x',
          reason:
            'image-missing',
        },
      ),
    ).toBe(
      'image-missing',
    );
    expect(
      failureKey(
        'load',
        {
          error:
            'x',
          reason:
            'network',
        },
      ),
    ).toBe(
      'network',
    );
    expect(
      failureKey(
        'load',
        {
          error:
            'x',
          reason:
            'stalled',
        },
      ),
    ).toBe(
      'stalled',
    );
    expect(
      failureKey(
        'load',
        {
          error:
            'x',
          reason:
            'boot-timeout',
        },
      ),
    ).toBe(
      'boot-timeout',
    );
  });

  it('an unknown or missing reason is the plain "could not be loaded"', () => {
    expect(
      failureKey(
        'load',
        {
          error:
            'x',
        },
      ),
    ).toBe(
      'load',
    );
    expect(
      failureKey(
        'load',
        {
          error:
            'x',
          reason:
            'start',
        },
      ),
    ).toBe(
      'load',
    );
    expect(
      failureKey(
        null,
        undefined,
      ),
    ).toBe(
      'load',
    );
    expect(
      failureKey(
        'load',
        {
          loaded: 1,
          total: 2,
        },
      ),
    ).toBe(
      'load',
    );
  });
});

describe('tryAgainVisible', () => {
  it.each(
    [
      [
        'downloading',
        TRY_AGAIN_AFTER_MS -
          1,
        false,
      ],
      [
        'downloading',
        TRY_AGAIN_AFTER_MS,
        true,
      ],
      [
        'booting',
        TRY_AGAIN_AFTER_MS,
        true,
      ],
      [
        'session',
        TRY_AGAIN_AFTER_MS,
        true,
      ],
      [
        'running',
        10 *
          TRY_AGAIN_AFTER_MS,
        false,
      ],
      [
        'failed',
        10 *
          TRY_AGAIN_AFTER_MS,
        false,
      ], // a failure has its own button
      [
        'idle',
        10 *
          TRY_AGAIN_AFTER_MS,
        false,
      ],
    ] as const,
  )(
    '%s after %i ms: %s',
    (
      phase,
      ms,
      shown,
    ) => {
      expect(
        tryAgainVisible(
          phase,
          ms,
        ),
      ).toBe(
        shown,
      );
    },
  );
});

describe('announcedProgress', () => {
  it('announces at every 25 %, not every percent', () => {
    expect(
      announcedProgress(
        null,
      ),
    ).toBeNull();
    expect(
      announcedProgress(
        0.0,
      ),
    ).toBe(
      0,
    );
    expect(
      announcedProgress(
        0.24,
      ),
    ).toBe(
      0,
    );
    expect(
      announcedProgress(
        0.25,
      ),
    ).toBe(
      25,
    );
    expect(
      announcedProgress(
        0.74,
      ),
    ).toBe(
      50,
    );
    expect(
      announcedProgress(
        1,
      ),
    ).toBe(
      100,
    );
  });
});
