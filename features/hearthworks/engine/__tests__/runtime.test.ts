import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  cameraRelativeMove,
  createRuntime,
} from '../runtime';

describe('cameraRelativeMove', () => {
  it('forward goes the way the camera faces, whatever its yaw', () => {
    for (const yaw of [
      0,
      0.7,
      Math.PI /
        2,
      -2.2,
      Math.PI,
    ]) {
      const m =
        cameraRelativeMove(
          {
            forward: 1,
            right: 0,
          },
          yaw,
        );
      expect(
        m.x,
      ).toBeCloseTo(
        Math.sin(
          yaw,
        ),
        9,
      );
      expect(
        m.z,
      ).toBeCloseTo(
        Math.cos(
          yaw,
        ),
        9,
      );
    }
  });

  it('right is on the right-hand side of forward (looking along +z, right is −x)', () => {
    const m =
      cameraRelativeMove(
        {
          forward: 0,
          right: 1,
        },
        0,
      );
    expect(
      m.x,
    ).toBeCloseTo(
      -1,
      9,
    );
    expect(
      m.z,
    ).toBeCloseTo(
      0,
      9,
    );
    const east =
      cameraRelativeMove(
        {
          forward: 0,
          right: 1,
        },
        Math.PI /
          2,
      ); // facing +x → right is +z
    expect(
      east.x,
    ).toBeCloseTo(
      0,
      9,
    );
    expect(
      east.z,
    ).toBeCloseTo(
      1,
      9,
    );
  });

  it('ignores non-finite input', () => {
    expect(
      cameraRelativeMove(
        {
          forward:
            Number.NaN,
          right:
            Infinity,
        },
        1,
      ),
    ).toEqual(
      {
        x: 0,
        z: 0,
      },
    );
  });
});

describe('createRuntime', () => {
  it('starts isometric, at rest, at the spawn point', () => {
    const r =
      createRuntime(
        {
          x: 5,
          z: 6,
        },
      );
    expect(
      r.progress,
    ).toBe(
      0,
    );
    expect(
      r.avatar,
    ).toMatchObject(
      {
        x: 5,
        z: 6,
        speed: 0,
      },
    );
    expect(
      r.isoCenter,
    ).toEqual(
      {
        x: 5,
        z: 6,
      },
    );
  });
});
