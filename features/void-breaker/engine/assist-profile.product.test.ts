import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  NO_ASSISTS,
  type AssistProfile,
} from '@/lib/game/assist';
import {
  BOSS_MARK,
  ENEMY_MARKS,
  HEART_MARK,
  NO_ASSIST_FLAGS,
  SHARD_MARK,
  abilityTriggers,
  comboLapses,
  enemyMark,
  hitFlashUntil,
  scaledDt,
  voidBreakerAssistFlags,
} from './assist-profile';

const assisted =
  (
    over: Partial<
      Extract<
        AssistProfile,
        {
          ranked: false;
        }
      >
    >,
  ): AssistProfile => ({
    ranked: false,
    holdToPress: false,
    speedFloor: 1,
    calmVisuals: false,
    colorSafe: false,
    noTimedInput: false,
    ...over,
  });

describe('Void Breaker assist flags', () => {
  it('leaves the ranked profile and a missing profile as the plain game', () => {
    expect(
      voidBreakerAssistFlags(
        NO_ASSISTS,
      ),
    ).toEqual(
      NO_ASSIST_FLAGS,
    );
    expect(
      voidBreakerAssistFlags(
        undefined,
      ),
    ).toEqual(
      NO_ASSIST_FLAGS,
    );
    expect(
      scaledDt(
        0.016,
        NO_ASSIST_FLAGS,
      ),
    ).toBe(
      0.016,
    );
    expect(
      abilityTriggers(
        true,
        true,
        NO_ASSIST_FLAGS,
      ),
    ).toBe(
      false,
    );
    expect(
      hitFlashUntil(
        1000,
        NO_ASSIST_FLAGS,
      ),
    ).toBe(
      1080,
    );
    expect(
      comboLapses(
        NO_ASSIST_FLAGS,
      ),
    ).toBe(
      true,
    );
  });

  it('maps each of the five settings onto one lever', () => {
    expect(
      voidBreakerAssistFlags(
        assisted(
          {
            calmVisuals: true,
          },
        ),
      ),
    ).toMatchObject(
      {
        active: true,
        calm: true,
      },
    );
    expect(
      voidBreakerAssistFlags(
        assisted(
          {
            colorSafe: true,
          },
        ),
      ),
    ).toMatchObject(
      {
        colorSafe: true,
        calm: false,
      },
    );
    expect(
      voidBreakerAssistFlags(
        assisted(
          {
            holdToPress: true,
          },
        ),
      ),
    ).toMatchObject(
      {
        holdRepeat: true,
      },
    );
    expect(
      voidBreakerAssistFlags(
        assisted(
          {
            noTimedInput: true,
          },
        ),
      ),
    ).toMatchObject(
      {
        untimed: true,
      },
    );
    expect(
      voidBreakerAssistFlags(
        assisted(
          {
            speedFloor: 0.5,
          },
        ),
      ),
    ).toMatchObject(
      {
        clockScale: 0.5,
      },
    );
  });

  it('scales simulation time by the speed floor and clamps it', () => {
    const half =
      voidBreakerAssistFlags(
        assisted(
          {
            speedFloor: 0.5,
          },
        ),
      );
    expect(
      scaledDt(
        0.04,
        half,
      ),
    ).toBeCloseTo(
      0.02,
    );
    expect(
      voidBreakerAssistFlags(
        assisted(
          {
            speedFloor: 0.2,
          },
        ),
      )
        .clockScale,
    ).toBe(
      0.5,
    );
    expect(
      voidBreakerAssistFlags(
        assisted(
          {
            speedFloor: 2,
          },
        ),
      )
        .clockScale,
    ).toBe(
      1,
    );
  });

  it('repeats a held ability only under hold-to-press', () => {
    const hold =
      voidBreakerAssistFlags(
        assisted(
          {
            holdToPress: true,
          },
        ),
      );
    expect(
      abilityTriggers(
        true,
        true,
        hold,
      ),
    ).toBe(
      true,
    );
    expect(
      abilityTriggers(
        false,
        true,
        hold,
      ),
    ).toBe(
      false,
    );
    expect(
      abilityTriggers(
        true,
        false,
        NO_ASSIST_FLAGS,
      ),
    ).toBe(
      true,
    );
    expect(
      abilityTriggers(
        true,
        true,
        NO_ASSIST_FLAGS,
      ),
    ).toBe(
      false,
    );
  });

  it('removes hit flashes under calm visuals', () => {
    expect(
      hitFlashUntil(
        1000,
        voidBreakerAssistFlags(
          assisted(
            {
              calmVisuals: true,
            },
          ),
        ),
      ),
    ).toBe(
      0,
    );
  });

  it('stops the combo window lapsing with no timed input', () => {
    expect(
      comboLapses(
        voidBreakerAssistFlags(
          assisted(
            {
              noTimedInput: true,
            },
          ),
        ),
      ),
    ).toBe(
      false,
    );
  });

  it('gives every enemy type, the boss and each pickup a distinct mark', () => {
    const all =
      [
        ...Object.values(
          ENEMY_MARKS,
        ),
        BOSS_MARK,
        SHARD_MARK,
        HEART_MARK,
      ];
    const signatures =
      all.map(
        (
          m,
        ) =>
          `${m.letter}|${m.dash.join(',')}`,
      );
    expect(
      new Set(
        signatures,
      )
        .size,
    ).toBe(
      all.length,
    );
    expect(
      new Set(
        all.map(
          (
            m,
          ) =>
            m.letter,
        ),
      )
        .size,
    ).toBe(
      all.length,
    );
    expect(
      enemyMark(
        'tank',
        true,
      ),
    ).toBe(
      BOSS_MARK,
    );
    expect(
      enemyMark(
        'tank',
        false,
      ),
    ).toBe(
      ENEMY_MARKS.tank,
    );
  });
});
