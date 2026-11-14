import {
  describe,
  it,
  expect,
} from 'vitest';
import type { GameWorld } from '../types';
import {
  createWaveDirectorState,
  updateWaveDirector,
} from '../wave-director';

function worldAt(
  time: number,
) {
  // The director only reads these fields; a full world needs sprite sheets (DOM).
  return {
    time,
    bossActive: false,
    enemies:
      [],
    player:
      {
        x: 0,
        y: 0,
      },
  } as unknown as GameWorld;
}

describe('wave director boss spawns', () => {
  it('emits the Hollow King at 5:00 even though a recovery wave starts at the same instant', () => {
    const state =
      createWaveDirectorState();
    expect(
      updateWaveDirector(
        worldAt(
          299,
        ),
        createWaveDirectorState(),
        1 /
          60,
      )
        .bossSpawn,
    ).toBeUndefined();
    const world =
      worldAt(
        300,
      );
    expect(
      updateWaveDirector(
        world,
        state,
        1 /
          60,
      )
        .bossSpawn,
    ).toBe(
      'hollow_king',
    );
    // Only once.
    expect(
      updateWaveDirector(
        world,
        state,
        1 /
          60,
      )
        .bossSpawn,
    ).toBeUndefined();
  });

  it('emits each later boss at its time', () => {
    for (const [
      t,
      id,
    ] of [
      [
        600,
        'crimson_countess',
      ],
      [
        900,
        'elder_lich_malachar',
      ],
      [
        1200,
        'terminus',
      ],
    ] as const) {
      const state =
        createWaveDirectorState();
      expect(
        updateWaveDirector(
          worldAt(
            t,
          ),
          state,
          1 /
            60,
        )
          .bossSpawn,
      ).toBe(
        id,
      );
    }
  });

  it('does not stack on a living boss, and waits for it to end', () => {
    const world =
      worldAt(
        300,
      );
    world.bossActive = true;
    const state =
      createWaveDirectorState();
    expect(
      updateWaveDirector(
        world,
        state,
        1 /
          60,
      )
        .bossSpawn,
    ).toBeUndefined();
    world.bossActive = false;
    world.time = 310;
    expect(
      updateWaveDirector(
        world,
        state,
        1 /
          60,
      )
        .bossSpawn,
    ).toBe(
      'hollow_king',
    );
  });

  it('does not summon past bosses when a run is fast-forwarded far beyond their window', () => {
    expect(
      updateWaveDirector(
        worldAt(
          400,
        ),
        createWaveDirectorState(),
        1 /
          60,
      )
        .bossSpawn,
    ).toBeUndefined();
  });
});
