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
  CALM_COLOR_GAP_MS,
  NO_ASSIST_FLAGS,
  colorGlyph,
  mayChangeScreenColor,
  puzzleDrainSeconds,
  rampSeconds,
  spawnDelayMs,
  synapseAssistFlags,
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

describe('Synapse Storm assist flags', () => {
  it('leaves the ranked profile and a missing profile as the plain game', () => {
    expect(
      synapseAssistFlags(
        NO_ASSISTS,
      ),
    ).toEqual(
      NO_ASSIST_FLAGS,
    );
    expect(
      synapseAssistFlags(
        null,
      ),
    ).toEqual(
      NO_ASSIST_FLAGS,
    );
    expect(
      puzzleDrainSeconds(
        0.1,
        NO_ASSIST_FLAGS,
      ),
    ).toBe(
      0.1,
    );
    expect(
      spawnDelayMs(
        2000,
        NO_ASSIST_FLAGS,
      ),
    ).toBe(
      2000,
    );
  });

  it('maps each of the five settings onto one lever', () => {
    expect(
      synapseAssistFlags(
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
        colorSafe: false,
      },
    );
    expect(
      synapseAssistFlags(
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
      synapseAssistFlags(
        assisted(
          {
            holdToPress: true,
          },
        ),
      ),
    ).toMatchObject(
      {
        holdToPress: true,
      },
    );
    expect(
      synapseAssistFlags(
        assisted(
          {
            noTimedInput: true,
          },
        ),
      ),
    ).toMatchObject(
      {
        frozenTimers: true,
      },
    );
    expect(
      synapseAssistFlags(
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

  it('scales the clock: timers drain and spawns arrive at the floor speed', () => {
    const flags =
      synapseAssistFlags(
        assisted(
          {
            speedFloor: 0.5,
          },
        ),
      );
    expect(
      puzzleDrainSeconds(
        0.1,
        flags,
      ),
    ).toBeCloseTo(
      0.05,
    );
    expect(
      spawnDelayMs(
        2000,
        flags,
      ),
    ).toBe(
      4000,
    );
    expect(
      rampSeconds(
        100,
        flags,
      ),
    ).toBe(
      50,
    );
  });

  it('clamps a profile outside the allowed range', () => {
    expect(
      synapseAssistFlags(
        assisted(
          {
            speedFloor: 0.1,
          },
        ),
      )
        .clockScale,
    ).toBe(
      0.5,
    );
    expect(
      synapseAssistFlags(
        assisted(
          {
            speedFloor: 3,
          },
        ),
      )
        .clockScale,
    ).toBe(
      1,
    );
  });

  it('freezes timers when timed input is off, whatever the clock scale', () => {
    const flags =
      synapseAssistFlags(
        assisted(
          {
            noTimedInput: true,
            speedFloor: 0.75,
          },
        ),
      );
    expect(
      puzzleDrainSeconds(
        0.5,
        flags,
      ),
    ).toBe(
      0,
    );
  });

  it('caps full-screen colour changes to one per second under calm visuals only', () => {
    const calm =
      synapseAssistFlags(
        assisted(
          {
            calmVisuals: true,
          },
        ),
      );
    expect(
      mayChangeScreenColor(
        1000,
        1000 +
          CALM_COLOR_GAP_MS -
          1,
        calm,
      ),
    ).toBe(
      false,
    );
    expect(
      mayChangeScreenColor(
        1000,
        1000 +
          CALM_COLOR_GAP_MS,
        calm,
      ),
    ).toBe(
      true,
    );
    expect(
      mayChangeScreenColor(
        1000,
        1001,
        NO_ASSIST_FLAGS,
      ),
    ).toBe(
      true,
    );
  });

  it('gives every puzzle colour its own glyph', () => {
    const colours =
      [
        '#ff5252',
        '#00e5ff',
        '#76ff03',
        '#ffab00',
        '#b388ff',
        '#ff6ec7',
      ];
    const glyphs =
      colours.map(
        colorGlyph,
      );
    expect(
      new Set(
        glyphs,
      )
        .size,
    ).toBe(
      colours.length,
    );
    expect(
      glyphs.every(
        (
          g,
        ) =>
          g.length ===
          1,
      ),
    ).toBe(
      true,
    );
    expect(
      colorGlyph(
        '#FF5252',
      ),
    ).toBe(
      colorGlyph(
        '#ff5252',
      ),
    );
    expect(
      colorGlyph(
        '#123456',
      ),
    ).toBe(
      '',
    );
  });
});
