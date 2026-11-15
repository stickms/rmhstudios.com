import {
  describe,
  expect,
  it,
} from 'vitest';
import { ECHO_TAIL_MS } from '../input/echo-window';
import {
  inputBlockedUntil,
  takesNote,
  type Hearing,
} from './hear-gate';

const played: Hearing =
  {
    startedAt: 1000,
    endsAt: 5000,
    cancelledAt:
      null,
  };
const cancelled: Hearing =
  {
    startedAt: 1000,
    endsAt: 5000,
    cancelledAt: 2000,
  };

describe('the "Hear it" gate', () => {
  it('takes every note when nothing has been heard, and notes from before the phrase', () => {
    expect(
      takesNote(
        null,
        {
          time: 10,
          source:
            'mic',
        },
      ),
    ).toBe(
      true,
    );
    expect(
      takesNote(
        played,
        {
          time: 999,
          source:
            'mic',
        },
      ),
    ).toBe(
      true,
    );
  });

  it('holds every input while the phrase sounds', () => {
    for (const source of [
      'mic',
      'midi',
      'keys',
      'screen',
    ] as const)
      expect(
        takesNote(
          played,
          {
            time: 3000,
            source,
          },
        ),
      ).toBe(
        false,
      );
  });

  it('after the phrase, holds only the microphone through the echo tail', () => {
    expect(
      takesNote(
        played,
        {
          time: 5000,
          source:
            'midi',
        },
      ),
    ).toBe(
      true,
    );
    expect(
      takesNote(
        played,
        {
          time: 5000,
          source:
            'keys',
        },
      ),
    ).toBe(
      true,
    );
    expect(
      takesNote(
        played,
        {
          time:
            5000 +
            ECHO_TAIL_MS -
            1,
          source:
            'mic',
        },
      ),
    ).toBe(
      false,
    );
    expect(
      takesNote(
        played,
        {
          time:
            5000 +
            ECHO_TAIL_MS,
          source:
            'mic',
        },
      ),
    ).toBe(
      true,
    );
  });

  it('cancelled, ends at the cancel, not at the phrase’s own end', () => {
    expect(
      takesNote(
        cancelled,
        {
          time: 2000,
          source:
            'screen',
        },
      ),
    ).toBe(
      true,
    );
    expect(
      takesNote(
        cancelled,
        {
          time:
            2000 +
            ECHO_TAIL_MS -
            1,
          source:
            'mic',
        },
      ),
    ).toBe(
      false,
    );
    expect(
      takesNote(
        cancelled,
        {
          time:
            2000 +
            ECHO_TAIL_MS,
          source:
            'mic',
        },
      ),
    ).toBe(
      true,
    );
  });

  it('says how long Start waits: the echo tail for a mic learner, nothing for the others', () => {
    expect(
      inputBlockedUntil(
        cancelled,
        'mic',
      ),
    ).toBe(
      2000 +
        ECHO_TAIL_MS,
    );
    expect(
      inputBlockedUntil(
        cancelled,
        'keys',
      ),
    ).toBe(
      2000,
    );
    expect(
      inputBlockedUntil(
        played,
        'midi',
      ),
    ).toBe(
      5000,
    );
    expect(
      inputBlockedUntil(
        null,
        'mic',
      ),
    ).toBe(
      -Infinity,
    );
  });
});
