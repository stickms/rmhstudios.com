import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  ECHO_TAIL_MS,
  REPLAY_CONFIRM_MS,
  createEchoGuard,
  hearStillWanted,
  type GuardNote,
} from './echo-window';

const RELEASE = 250;
const guard =
  () =>
    createEchoGuard(
      {
        tailMs:
          ECHO_TAIL_MS,
        releaseMs:
          RELEASE,
      },
    );

const mic =
  (
    type:
      | 'on'
      | 'off',
    midi: number,
    time: number,
    cents?: number,
  ): GuardNote => ({
    type,
    midi,
    time,
    source:
      'mic',
    ...(cents ===
    undefined
      ? {}
      : {
          cents,
        }),
  });
const local =
  (
    type:
      | 'on'
      | 'off',
    midi: number,
    time: number,
    source:
      | 'screen'
      | 'keys' = 'screen',
  ): GuardNote => ({
    type,
    midi,
    time,
    source,
  });

describe('echo guard: the hint window', () => {
  it('lets a mic note through when nothing is sounding', () => {
    expect(
      guard().admit(
        mic(
          'on',
          60,
          100,
        ),
      ),
    ).toBe(
      true,
    );
  });

  it('drops mic notes while the hint sounds and for the tail, and not at the boundary', () => {
    const g =
      guard();
    g.hint(
      1000,
      900,
    );
    const end =
      1000 +
      900 +
      ECHO_TAIL_MS;
    expect(
      g.admit(
        mic(
          'on',
          60,
          1000,
        ),
      ),
    ).toBe(
      false,
    );
    expect(
      g.admit(
        mic(
          'on',
          60,
          end -
            1,
        ),
      ),
    ).toBe(
      false,
    );
    expect(
      g.admit(
        mic(
          'on',
          60,
          end,
        ),
      ),
    ).toBe(
      true,
    );
  });

  it('never drops notes from the other sources', () => {
    const g =
      guard();
    g.hint(
      1000,
      900,
    );
    expect(
      g.admit(
        {
          type: 'on',
          midi: 60,
          time: 1100,
          source:
            'midi',
        },
      ),
    ).toBe(
      true,
    );
    expect(
      g.admit(
        local(
          'on',
          60,
          1100,
          'keys',
        ),
      ),
    ).toBe(
      true,
    );
    expect(
      g.admit(
        local(
          'on',
          60,
          1100,
          'screen',
        ),
      ),
    ).toBe(
      true,
    );
  });

  it('a stopped hint shrinks the window to the tail, and never widens it', () => {
    const g =
      guard();
    g.hint(
      1000,
      900,
    );
    g.hintStopped(
      1200,
    );
    expect(
      g.admit(
        mic(
          'on',
          60,
          1200 +
            ECHO_TAIL_MS -
            1,
        ),
      ),
    ).toBe(
      false,
    );
    expect(
      g.admit(
        mic(
          'on',
          62,
          1200 +
            ECHO_TAIL_MS,
        ),
      ),
    ).toBe(
      true,
    );
    // A hint that already ended is not stretched by stopping it.
    const h =
      guard();
    h.hint(
      1000,
      100,
    );
    h.hintStopped(
      5000,
    );
    expect(
      h.admit(
        mic(
          'on',
          60,
          1100 +
            ECHO_TAIL_MS,
        ),
      ),
    ).toBe(
      true,
    );
  });

  it('a second hint extends the window to its own end', () => {
    const g =
      guard();
    g.hint(
      1000,
      900,
    );
    g.hint(
      1500,
      900,
    );
    expect(
      g.admit(
        mic(
          'on',
          60,
          1500 +
            900 +
            ECHO_TAIL_MS -
            1,
        ),
      ),
    ).toBe(
      false,
    );
    expect(
      g.admit(
        mic(
          'on',
          60,
          1500 +
            900 +
            ECHO_TAIL_MS,
        ),
      ),
    ).toBe(
      true,
    );
  });
});

describe('echo guard: sounds the lesson plays for a key', () => {
  it('is deaf for as long as a screen or computer key is held', () => {
    for (const source of [
      'screen',
      'keys',
    ] as const) {
      const g =
        guard();
      g.admit(
        local(
          'on',
          64,
          1000,
          source,
        ),
      );
      expect(
        g.admit(
          mic(
            'on',
            64,
            60_000,
          ),
        ),
      ).toBe(
        false,
      );
    }
  });

  it('stays deaf for the voice release and the tail after the key goes up', () => {
    const g =
      guard();
    g.admit(
      local(
        'on',
        64,
        1000,
      ),
    );
    g.admit(
      local(
        'off',
        64,
        1100,
      ),
    );
    const end =
      1100 +
      RELEASE +
      ECHO_TAIL_MS;
    expect(
      g.admit(
        mic(
          'on',
          64,
          end -
            1,
        ),
      ),
    ).toBe(
      false,
    );
    expect(
      g.admit(
        mic(
          'on',
          64,
          end,
        ),
      ),
    ).toBe(
      true,
    );
  });

  it('is deaf until every held key is up', () => {
    const g =
      guard();
    g.admit(
      local(
        'on',
        64,
        1000,
      ),
    );
    g.admit(
      local(
        'on',
        67,
        1010,
        'keys',
      ),
    );
    g.admit(
      local(
        'off',
        64,
        1100,
      ),
    );
    expect(
      g.admit(
        mic(
          'on',
          64,
          9000,
        ),
      ),
    ).toBe(
      false,
    );
    g.admit(
      local(
        'off',
        67,
        9100,
        'keys',
      ),
    );
    expect(
      g.admit(
        mic(
          'on',
          64,
          9100 +
            RELEASE +
            ECHO_TAIL_MS,
        ),
      ),
    ).toBe(
      true,
    );
  });

  it('a screen key and a computer key of the same pitch are two sounds', () => {
    const g =
      guard();
    g.admit(
      local(
        'on',
        64,
        1000,
        'screen',
      ),
    );
    g.admit(
      local(
        'on',
        64,
        1010,
        'keys',
      ),
    );
    g.admit(
      local(
        'off',
        64,
        1100,
        'screen',
      ),
    );
    expect(
      g.admit(
        mic(
          'on',
          64,
          9000,
        ),
      ),
    ).toBe(
      false,
    );
  });
});

describe('echo guard: a note sung along with the hint', () => {
  it('replays a dropped note that is still sounding when the window closes', () => {
    const g =
      guard();
    g.hint(
      1000,
      900,
    );
    expect(
      g.admit(
        mic(
          'on',
          60,
          1800,
          12,
        ),
      ),
    ).toBe(
      false,
    );
    const end =
      1000 +
      900 +
      ECHO_TAIL_MS +
      REPLAY_CONFIRM_MS;
    expect(
      g.waitMs(
        1800,
      ),
    ).toBe(
      end -
        1800,
    );
    expect(
      g.takeReplay(
        end -
          1,
      ),
    ).toBeNull();
    expect(
      g.takeReplay(
        end,
      ),
    ).toEqual(
      {
        type: 'on',
        midi: 60,
        time: end,
        source:
          'mic',
        cents: 12,
      },
    );
    // Once only.
    expect(
      g.takeReplay(
        end +
          1,
      ),
    ).toBeNull();
    expect(
      g.waitMs(
        end +
          1,
      ),
    ).toBeNull();
  });

  it('does not replay an echo that rings past the window but ends within the confirm time', () => {
    const g =
      guard();
    g.hint(
      1000,
      900,
    );
    g.admit(
      mic(
        'on',
        60,
        1100,
      ),
    );
    const closes =
      1000 +
      900 +
      ECHO_TAIL_MS;
    expect(
      g.takeReplay(
        closes,
      ),
    ).toBeNull();
    g.admit(
      mic(
        'off',
        60,
        closes +
          REPLAY_CONFIRM_MS -
          1,
      ),
    );
    expect(
      g.takeReplay(
        closes +
          REPLAY_CONFIRM_MS,
      ),
    ).toBeNull();
  });

  it('does not replay a note that ended inside the window', () => {
    const g =
      guard();
    g.hint(
      1000,
      900,
    );
    g.admit(
      mic(
        'on',
        60,
        1100,
      ),
    );
    expect(
      g.admit(
        mic(
          'off',
          60,
          1500,
        ),
      ),
    ).toBe(
      true,
    );
    expect(
      g.takeReplay(
        9000,
      ),
    ).toBeNull();
    expect(
      g.waitMs(
        1500,
      ),
    ).toBeNull();
  });

  it('an off for another pitch does not cancel it', () => {
    const g =
      guard();
    g.hint(
      1000,
      900,
    );
    g.admit(
      mic(
        'on',
        60,
        1100,
      ),
    );
    g.admit(
      mic(
        'off',
        62,
        1500,
      ),
    );
    expect(
      g.takeReplay(
        9000,
      ),
    ).toMatchObject(
      {
        midi: 60,
      },
    );
  });

  it('replays the latest dropped note only', () => {
    const g =
      guard();
    g.hint(
      1000,
      900,
    );
    g.admit(
      mic(
        'on',
        60,
        1100,
      ),
    );
    g.admit(
      mic(
        'off',
        60,
        1200,
      ),
    );
    g.admit(
      mic(
        'on',
        62,
        1300,
      ),
    );
    expect(
      g.takeReplay(
        9000,
      ),
    ).toMatchObject(
      {
        midi: 62,
      },
    );
  });

  it('a note admitted after the window supersedes a dropped one', () => {
    const g =
      guard();
    g.hint(
      1000,
      100,
    );
    g.admit(
      mic(
        'on',
        60,
        1100,
      ),
    );
    expect(
      g.admit(
        mic(
          'on',
          62,
          1100 +
            ECHO_TAIL_MS,
        ),
      ),
    ).toBe(
      true,
    );
    expect(
      g.takeReplay(
        9000,
      ),
    ).toBeNull();
  });

  it('a note dropped after Next (hint stopped, tail only) is replayed once the tail and the confirm time are past', () => {
    const g =
      guard();
    g.hint(
      1000,
      900,
    );
    g.hintStopped(
      1300,
    );
    g.forgetPending();
    expect(
      g.admit(
        mic(
          'on',
          64,
          1500,
        ),
      ),
    ).toBe(
      false,
    );
    expect(
      g.takeReplay(
        1300 +
          ECHO_TAIL_MS +
          REPLAY_CONFIRM_MS,
      ),
    ).toMatchObject(
      {
        midi: 64,
        time:
          1300 +
          ECHO_TAIL_MS +
          REPLAY_CONFIRM_MS,
      },
    );
  });

  it('forgetPending drops a note held over from before the target changed', () => {
    const g =
      guard();
    g.hint(
      1000,
      900,
    );
    g.admit(
      mic(
        'on',
        60,
        1100,
      ),
    );
    g.forgetPending();
    expect(
      g.takeReplay(
        9000,
      ),
    ).toBeNull();
  });

  it('waits for a held key: no replay, and no timer to arm, until it is up', () => {
    const g =
      guard();
    g.admit(
      local(
        'on',
        64,
        1000,
      ),
    );
    g.admit(
      mic(
        'on',
        64,
        1200,
      ),
    );
    expect(
      g.waitMs(
        1300,
      ),
    ).toBeNull();
    expect(
      g.takeReplay(
        99_000,
      ),
    ).toBeNull();
    g.admit(
      local(
        'off',
        64,
        1400,
      ),
    );
    const end =
      1400 +
      RELEASE +
      ECHO_TAIL_MS +
      REPLAY_CONFIRM_MS;
    expect(
      g.waitMs(
        1400,
      ),
    ).toBe(
      end -
        1400,
    );
    expect(
      g.takeReplay(
        end,
      ),
    ).toMatchObject(
      {
        midi: 64,
      },
    );
  });

  it('waits for the later of a hint and a key sound', () => {
    const g =
      guard();
    g.hint(
      1000,
      900,
    );
    g.admit(
      local(
        'on',
        64,
        1500,
      ),
    );
    g.admit(
      local(
        'off',
        64,
        1600,
      ),
    );
    g.admit(
      mic(
        'on',
        64,
        1700,
      ),
    );
    const hintEnd =
      1000 +
      900 +
      ECHO_TAIL_MS;
    const keyEnd =
      1600 +
      RELEASE +
      ECHO_TAIL_MS;
    const end =
      Math.max(
        hintEnd,
        keyEnd,
      ) +
      REPLAY_CONFIRM_MS;
    expect(
      g.takeReplay(
        end -
          1,
      ),
    ).toBeNull();
    expect(
      g.takeReplay(
        end,
      ),
    ).not.toBeNull();
  });
});

describe('hearStillWanted', () => {
  it('plays only for the target it was asked for and while mounted', () => {
    expect(
      hearStillWanted(
        {
          askedIndex: 3,
          currentIndex: 3,
          mounted: true,
        },
      ),
    ).toBe(
      true,
    );
    expect(
      hearStillWanted(
        {
          askedIndex: 3,
          currentIndex: 4,
          mounted: true,
        },
      ),
    ).toBe(
      false,
    );
    expect(
      hearStillWanted(
        {
          askedIndex: 3,
          currentIndex:
            -1,
          mounted: true,
        },
      ),
    ).toBe(
      false,
    );
    expect(
      hearStillWanted(
        {
          askedIndex: 3,
          currentIndex: 3,
          mounted: false,
        },
      ),
    ).toBe(
      false,
    );
  });

  it('a hint asked outside a session (index -1) is never wanted', () => {
    expect(
      hearStillWanted(
        {
          askedIndex:
            -1,
          currentIndex:
            -1,
          mounted: true,
        },
      ),
    ).toBe(
      false,
    );
  });
});
