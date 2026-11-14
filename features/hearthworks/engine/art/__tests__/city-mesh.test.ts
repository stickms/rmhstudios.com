import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  LEVEL_HEIGHT,
  packCell,
  tileIndex,
} from '../../world';
import {
  mid,
  run,
  townWorld,
} from '../../world/__tests__/town';
import {
  ROAD_HALF_WIDTH,
  ROAD_LIFT,
  buildRoadMesh,
  buildZoneMesh,
} from '..';

const finite =
  (
    a: Float32Array,
  ) =>
    a.every(
      (
        v,
      ) =>
        Number.isFinite(
          v,
        ),
    );
const ys =
  (
    positions: Float32Array,
  ) =>
    Array.from(
      {
        length:
          positions.length /
          3,
      },
      (
        _,
        i,
      ) =>
        positions[
          i *
            3 +
            1
        ],
    );

describe('road mesh', () => {
  it('is empty without roads and well-formed with them', () => {
    const w =
      townWorld();
    expect(
      buildRoadMesh(
        w,
      )
        .indices,
    ).toHaveLength(
      0,
    );
    const m =
      mid(
        w,
      );
    run(
      w,
      {
        type: 'placeRoad',
        x: m,
        z: m,
        x2:
          m +
          3,
        z2: m,
      },
    );
    const d =
      buildRoadMesh(
        w,
      );
    expect(
      finite(
        d.positions,
      ) &&
        finite(
          d.normals,
        ) &&
        finite(
          d.colors,
        ),
    ).toBe(
      true,
    );
    expect(
      d
        .positions
        .length,
    ).toBe(
      d
        .normals
        .length,
    );
    expect(
      d
        .positions
        .length,
    ).toBe(
      d
        .colors
        .length,
    );
    expect(
      Math.max(
        ...d.indices,
      ),
    ).toBeLessThan(
      d
        .positions
        .length /
        3,
    );
    // 4 junction squares + 6 arms (the two ends have one arm each, the middle two have two) = 10 quads.
    expect(
      d
        .indices
        .length /
        6,
    ).toBe(
      10,
    );
  });

  it('lies flat just above the ground on level road and spans the lane width', () => {
    const w =
      townWorld();
    const m =
      mid(
        w,
      );
    run(
      w,
      {
        type: 'placeRoad',
        x: m,
        z: m,
      },
    );
    const d =
      buildRoadMesh(
        w,
      );
    const top =
      3 *
      LEVEL_HEIGHT;
    for (const y of ys(
      d.positions,
    ))
      expect(
        y,
      ).toBeCloseTo(
        top +
          ROAD_LIFT,
        5,
      );
    const xs =
      Array.from(
        {
          length:
            d
              .positions
              .length /
            3,
        },
        (
          _,
          i,
        ) =>
          d
            .positions[
            i *
              3
          ],
      );
    expect(
      Math.max(
        ...xs,
      ) -
        Math.min(
          ...xs,
        ),
    ).toBeCloseTo(
      2 *
        ROAD_HALF_WIDTH,
      5,
    );
  });

  it('ramps across the lower tile of a one-block step and meets the higher tile exactly', () => {
    const w =
      townWorld();
    const m =
      mid(
        w,
      );
    w.height[
      tileIndex(
        w,
        m +
          1,
        m,
      )
    ] =
      4;
    run(
      w,
      {
        type: 'placeRoad',
        x: m,
        z: m,
        x2:
          m +
          1,
        z2: m,
      },
    );
    const d =
      buildRoadMesh(
        w,
      );
    const high =
      4 *
        LEVEL_HEIGHT +
      ROAD_LIFT;
    const low =
      3 *
        LEVEL_HEIGHT +
      ROAD_LIFT;
    const heights =
      ys(
        d.positions,
      );
    expect(
      Math.max(
        ...heights,
      ),
    ).toBeCloseTo(
      high,
      5,
    );
    // The vertices on the shared edge (x = m + 0.5) of the lower tile are at the higher tile's surface.
    let onEdge = 0;
    for (
      let i = 0;
      i <
      d
        .positions
        .length /
        3;
      i++
    ) {
      if (
        Math.abs(
          d
            .positions[
            i *
              3
          ] -
            (m +
              0.5),
        ) <
          1e-6 &&
        d
          .positions[
          i *
            3 +
            1
        ] >
          low +
            1e-3
      ) {
        expect(
          d
            .positions[
            i *
              3 +
              1
          ],
        ).toBeCloseTo(
          high,
          5,
        );
        onEdge++;
      }
    }
    expect(
      onEdge,
    ).toBeGreaterThan(
      0,
    );
  });

  it('does not join across a cliff', () => {
    const w =
      townWorld();
    const m =
      mid(
        w,
      );
    w.height[
      tileIndex(
        w,
        m +
          1,
        m,
      )
    ] =
      6;
    run(
      w,
      {
        type: 'placeRoad',
        x: m,
        z: m,
        x2:
          m +
          1,
        z2: m,
      },
    );
    // Two unjoined junction squares and no arms.
    expect(
      buildRoadMesh(
        w,
      )
        .indices
        .length /
        6,
    ).toBe(
      2,
    );
  });
});

describe('zone mesh', () => {
  it('draws one pad per zoned tile, and the pad is stronger once a road reaches it', () => {
    const w =
      townWorld();
    const m =
      mid(
        w,
      );
    expect(
      buildZoneMesh(
        w,
      )
        .indices,
    ).toHaveLength(
      0,
    );
    w.city.cells[
      tileIndex(
        w,
        m +
          3,
        m +
          3,
      )
    ] =
      packCell(
        {
          zone: 'homes',
        },
      );
    w.city.cells[
      tileIndex(
        w,
        m +
          4,
        m +
          3,
      )
    ] =
      packCell(
        {
          zone: 'market',
          level: 2,
        },
      );
    const lone =
      buildZoneMesh(
        w,
      );
    expect(
      lone
        .indices
        .length /
        6,
    ).toBe(
      2,
    );
    run(
      w,
      {
        type: 'placeRoad',
        x: m,
        z: m,
        x2:
          m +
          3,
        z2: m,
      },
    );
    run(
      w,
      {
        type: 'placeRoad',
        x:
          m +
          3,
        z: m,
        x2:
          m +
          3,
        z2:
          m +
          2,
      },
    );
    const reached =
      buildZoneMesh(
        w,
      );
    expect(
      reached
        .indices
        .length,
    ).toBe(
      lone
        .indices
        .length,
    );
    expect(
      Array.from(
        reached.colors.slice(
          0,
          3,
        ),
      ),
    ).not.toEqual(
      Array.from(
        lone.colors.slice(
          0,
          3,
        ),
      ),
    );
    expect(
      finite(
        reached.positions,
      ) &&
        finite(
          reached.colors,
        ),
    ).toBe(
      true,
    );
  });
});
