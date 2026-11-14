import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  BEATS,
  HIT_ONSETS,
  IMPACT_DELAY,
  JOINT_COUNT,
  LOOP_SECONDS,
  createFighterSample,
  sampleFighter,
  standingX,
} from '../choreography';
import {
  FIGHTER_SCALE,
  STILL_TIME,
} from '../street-scene';

describe('menu fight choreography', () => {
  it('keeps every joint finite, above the floor and inside a portrait phone buffer', () => {
    const s =
      createFighterSample();
    const HALF_PORTRAIT =
      180 /
      2;
    for (const who of [
      0,
      1,
    ] as const) {
      const dir =
        who ===
        0
          ? 1
          : -1;
      for (
        let t = 0;
        t <
        LOOP_SECONDS *
          2;
        t += 0.05
      ) {
        sampleFighter(
          who,
          t,
          s,
        );
        expect(
          s
            .joints
            .length,
        ).toBe(
          JOINT_COUNT *
            2,
        );
        for (
          let k = 0;
          k <
          JOINT_COUNT;
          k++
        ) {
          const jx =
            s
              .joints[
              k *
                2
            ];
          const jy =
            s
              .joints[
              k *
                2 +
                1
            ];
          expect(
            Number.isFinite(
              jx,
            ) &&
              Number.isFinite(
                jy,
              ),
          ).toBe(
            true,
          );
          // Nothing dips through the street, and nothing leaves the top of a 50 px figure's reach.
          expect(
            jy,
          ).toBeLessThanOrEqual(
            1.5,
          );
          expect(
            jy,
          ).toBeGreaterThan(
            -66,
          );
          // Horizontal reach in buffer pixels, relative to the scene centre, fits the narrow (phone) buffer.
          const wx =
            (standingX(
              who,
            ) +
              dir *
                (s.x +
                  jx)) *
            FIGHTER_SCALE;
          expect(
            Math.abs(
              wx,
            ),
          ).toBeLessThan(
            HALF_PORTRAIT -
              2,
          );
        }
      }
    }
  });

  it('loops seamlessly: the last frame matches the first', () => {
    const a =
      createFighterSample();
    const b =
      createFighterSample();
    for (const who of [
      0,
      1,
    ] as const) {
      sampleFighter(
        who,
        0,
        a,
      );
      sampleFighter(
        who,
        LOOP_SECONDS,
        b,
      );
      for (
        let k = 0;
        k <
        JOINT_COUNT *
          2;
        k++
      )
        expect(
          Math.abs(
            a
              .joints[
              k
            ] -
              b
                .joints[
                k
              ],
          ),
        ).toBeLessThan(
          1.1,
        );
      expect(
        Math.abs(
          a.x -
            b.x,
        ),
      ).toBeLessThan(
        0.01,
      );
    }
  });

  it('knocks the loser down and gets them up again', () => {
    const s =
      createFighterSample();
    const lastBeat =
      BEATS[
        BEATS.length -
          1
      ];
    const lying =
      lastBeat.t +
      IMPACT_DELAY +
      1.5;
    sampleFighter(
      1,
      lying,
      s,
    );
    expect(
      s.ground,
    ).toBe(
      true,
    );
    sampleFighter(
      1,
      LOOP_SECONDS -
        0.1,
      s,
    );
    expect(
      s.ground,
    ).toBe(
      false,
    );
  });

  it('never fires more than three flashes in any second (WCAG 2.3.1)', () => {
    const onsets: number[] =
      [];
    for (
      let loop = 0;
      loop <
      4;
      loop++
    )
      for (const o of HIT_ONSETS)
        onsets.push(
          o +
            loop *
              LOOP_SECONDS,
        );
    for (const o of onsets) {
      const inWindow =
        onsets.filter(
          (
            x,
          ) =>
            x >=
              o &&
            x <
              o +
                1,
        ).length;
      expect(
        inWindow,
      ).toBeLessThanOrEqual(
        3,
      );
    }
    // The script is far stricter than the limit: at least a second between sparks.
    const sorted =
      [
        ...onsets,
      ].sort(
        (
          a,
          b,
        ) =>
          a -
          b,
      );
    for (
      let i = 1;
      i <
      sorted.length;
      i++
    )
      expect(
        sorted[
          i
        ] -
          sorted[
            i -
              1
          ],
      ).toBeGreaterThanOrEqual(
        1,
      );
  });

  it('spaces the beats so recoveries never overlap the next throw', () => {
    for (
      let i = 1;
      i <
      BEATS.length;
      i++
    )
      expect(
        BEATS[
          i
        ]
          .t -
          BEATS[
            i -
              1
          ]
            .t,
      ).toBeGreaterThanOrEqual(
        1.2,
      );
    expect(
      BEATS[
        BEATS.length -
          1
      ]
        .t +
        IMPACT_DELAY +
        3.7,
    ).toBeLessThan(
      LOOP_SECONDS,
    );
  });

  it('picks a still-frame time that is quiet (no spark, no shake)', () => {
    for (const o of HIT_ONSETS)
      expect(
        STILL_TIME <
          o ||
          STILL_TIME >
            o +
              0.2,
      ).toBe(
        true,
      );
  });
});
