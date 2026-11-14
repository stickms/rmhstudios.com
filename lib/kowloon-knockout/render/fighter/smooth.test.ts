import {
  describe,
  expect,
  it,
} from 'vitest';
import { Quaternion } from 'three';
import {
  fixHemisphere,
  smoothQuaternions,
  smoothVectors,
} from './smooth';

const quat =
  (
    x: number,
    y: number,
    z: number,
    deg: number,
  ) =>
    new Quaternion().setFromAxisAngle(
      {
        x,
        y,
        z,
      } as never,
      (deg *
        Math.PI) /
        180,
    );
const flat =
  (
    qs: Quaternion[],
  ) =>
    qs.flatMap(
      (
        q,
      ) => [
        q.x,
        q.y,
        q.z,
        q.w,
      ],
    );
const at =
  (
    v: number[],
    i: number,
  ) =>
    new Quaternion(
      v[
        i *
          4
      ],
      v[
        i *
          4 +
          1
      ],
      v[
        i *
          4 +
          2
      ],
      v[
        i *
          4 +
          3
      ],
    );

/** Angular speed (rad/s) between consecutive samples. */
const speeds =
  (
    t: number[],
    v: number[],
  ) =>
    t
      .slice(
        1,
      )
      .map(
        (
          _,
          i,
        ) =>
          (2 *
            Math.acos(
              Math.min(
                1,
                Math.abs(
                  at(
                    v,
                    i,
                  ).dot(
                    at(
                      v,
                      i +
                        1,
                    ),
                  ),
                ),
              ),
            )) /
          (t[
            i +
              1
          ] -
            t[
              i
            ]),
      );

const KEYS =
  [
    quat(
      1,
      0,
      0,
      0,
    ),
    quat(
      1,
      0,
      0,
      70,
    ),
    quat(
      0,
      1,
      0,
      20,
    ),
    quat(
      1,
      0,
      0,
      5,
    ),
    quat(
      1,
      0,
      0,
      0,
    ),
  ];
const TIMES =
  [
    0,
    0.25,
    0.5,
    0.75,
    1,
  ];

describe('smoothQuaternions', () => {
  it('passes through every authored key exactly', () => {
    const out =
      smoothQuaternions(
        TIMES,
        flat(
          KEYS,
        ),
        false,
      );
    for (
      let k = 0;
      k <
      TIMES.length;
      k++
    ) {
      const i =
        out.times.findIndex(
          (
            t,
          ) =>
            Math.abs(
              t -
                TIMES[
                  k
                ],
            ) <
            1e-9,
        );
      expect(
        i,
      ).toBeGreaterThanOrEqual(
        0,
      );
      expect(
        Math.abs(
          at(
            out.values,
            i,
          ).dot(
            KEYS[
              k
            ],
          ),
        ),
      ).toBeCloseTo(
        1,
        6,
      );
    }
  });
  it('is dense (several samples per segment), monotonic in time, and always unit length', () => {
    const out =
      smoothQuaternions(
        TIMES,
        flat(
          KEYS,
        ),
        false,
      );
    expect(
      out
        .times
        .length,
    ).toBeGreaterThan(
      TIMES.length *
        8,
    );
    for (
      let i = 1;
      i <
      out
        .times
        .length;
      i++
    )
      expect(
        out
          .times[
          i
        ],
      ).toBeGreaterThan(
        out
          .times[
          i -
            1
        ],
      );
    for (
      let i = 0;
      i <
      out
        .times
        .length;
      i++
    )
      expect(
        at(
          out.values,
          i,
        ).length(),
      ).toBeCloseTo(
        1,
        6,
      );
  });
  it('has no velocity jump at a key where plain slerp has one', () => {
    /** Angular-velocity vector (body frame, rad/s) between samples i and i+1. */
    const omega =
      (
        tt: number[],
        v: number[],
        i: number,
      ): number[] => {
        const rel =
          at(
            v,
            i,
          )
            .invert()
            .multiply(
              at(
                v,
                i +
                  1,
              ),
            );
        const half =
          Math.acos(
            Math.min(
              1,
              Math.abs(
                rel.w,
              ),
            ),
          );
        const s =
          Math.hypot(
            rel.x,
            rel.y,
            rel.z,
          ) ||
          1;
        const sign =
          rel.w <
          0
            ? -1
            : 1;
        const k =
          (((2 *
            half) /
            s) *
            sign) /
          (tt[
            i +
              1
          ] -
            tt[
              i
            ]);
        return [
          rel.x *
            k,
          rel.y *
            k,
          rel.z *
            k,
        ];
      };
    const diff =
      (
        a: number[],
        b: number[],
      ) =>
        Math.hypot(
          a[0] -
            b[0],
          a[1] -
            b[1],
          a[2] -
            b[2],
        );
    const smooth =
      smoothQuaternions(
        TIMES,
        flat(
          KEYS,
        ),
        false,
      );
    for (const key of [
      0.25,
      0.5,
      0.75,
    ]) {
      const i =
        smooth.times.findIndex(
          (
            x,
          ) =>
            Math.abs(
              x -
                key,
            ) <
            1e-9,
        );
      const j =
        TIMES.indexOf(
          key,
        );
      const smoothJump =
        diff(
          omega(
            smooth.times,
            smooth.values,
            i -
              1,
          ),
          omega(
            smooth.times,
            smooth.values,
            i,
          ),
        );
      const roughJump =
        diff(
          omega(
            TIMES,
            flat(
              KEYS,
            ),
            j -
              1,
          ),
          omega(
            TIMES,
            flat(
              KEYS,
            ),
            j,
          ),
        );
      expect(
        smoothJump,
      ).toBeLessThan(
        roughJump *
          0.3,
      );
    }
  });
  it('a loop has no seam: the speed leaving the last key matches the speed arriving', () => {
    const loopKeys =
      [
        quat(
          1,
          0,
          0,
          0,
        ),
        quat(
          1,
          0,
          0,
          40,
        ),
        quat(
          0,
          0,
          1,
          25,
        ),
        quat(
          1,
          0,
          0,
          0,
        ),
      ];
    const out =
      smoothQuaternions(
        [
          0,
          0.3,
          0.6,
          0.9,
        ],
        flat(
          loopKeys,
        ),
        true,
      );
    const s =
      speeds(
        out.times,
        out.values,
      );
    const first =
      s[0];
    const last =
      s[
        s.length -
          1
      ];
    expect(
      Math.abs(
        first -
          last,
      ),
    ).toBeLessThan(
      Math.max(
        first,
        last,
      ) *
        0.2 +
        0.05,
    );
    expect(
      Math.abs(
        at(
          out.values,
          0,
        ).dot(
          at(
            out.values,
            out
              .times
              .length -
              1,
          ),
        ),
      ),
    ).toBeCloseTo(
      1,
      6,
    );
  });
  it('a hold (equal neighbouring keys) stays put instead of drifting', () => {
    const hold =
      [
        quat(
          1,
          0,
          0,
          30,
        ),
        quat(
          1,
          0,
          0,
          30,
        ),
        quat(
          1,
          0,
          0,
          30,
        ),
        quat(
          1,
          0,
          0,
          30,
        ),
      ];
    const out =
      smoothQuaternions(
        [
          0,
          0.2,
          0.4,
          0.6,
        ],
        flat(
          hold,
        ),
        false,
      );
    for (
      let i = 0;
      i <
      out
        .times
        .length;
      i++
    )
      expect(
        Math.abs(
          at(
            out.values,
            i,
          ).dot(
            hold[0],
          ),
        ),
      ).toBeCloseTo(
        1,
        6,
      );
  });
  it('leaves a 1-2 key track alone', () => {
    const out =
      smoothQuaternions(
        [
          0,
          1,
        ],
        flat(
          [
            KEYS[0],
            KEYS[1],
          ],
        ),
        false,
      );
    expect(
      out.times,
    ).toEqual(
      [
        0,
        1,
      ],
    );
  });
  it('keeps short-way slerp across the hemisphere (flipped keys do not spin the long way)', () => {
    const a =
      quat(
        0,
        1,
        0,
        170,
      );
    const b =
      new Quaternion(
        -a.x,
        -a.y,
        -a.z,
        -a.w,
      ); // same rotation, other sign
    const out =
      smoothQuaternions(
        [
          0,
          0.5,
          1,
        ],
        fixHemisphere(
          flat(
            [
              KEYS[0],
              a,
              b,
            ],
          ),
        ),
        false,
      );
    const s =
      speeds(
        out.times,
        out.values,
      );
    expect(
      Math.max(
        ...s,
      ),
    ).toBeLessThan(
      20,
    ); // rad/s: a long-way spin would be ~2x this
  });
});

describe('smoothVectors', () => {
  it('passes through the keys and rounds the corners of a looping bob', () => {
    const times =
      [
        0,
        0.25,
        0.5,
        0.75,
        1,
      ];
    const ys =
      [
        0,
        1,
        0,
        -1,
        0,
      ];
    const out =
      smoothVectors(
        times,
        ys.flatMap(
          (
            y,
          ) => [
            0,
            y,
            0,
          ],
        ),
        true,
      );
    for (
      let k = 0;
      k <
      times.length;
      k++
    ) {
      const i =
        out.times.findIndex(
          (
            t,
          ) =>
            Math.abs(
              t -
                times[
                  k
                ],
            ) <
            1e-9,
        );
      expect(
        out
          .values[
          i *
            3 +
            1
        ],
      ).toBeCloseTo(
        ys[
          k
        ],
        6,
      );
    }
    // the seam: value and slope agree at both ends
    const n =
      out
        .times
        .length;
    const slopeFirst =
      (out
        .values[4] -
        out
          .values[1]) /
      (out
        .times[1] -
        out
          .times[0]);
    const slopeLast =
      (out
        .values[
        (n -
          1) *
          3 +
          1
      ] -
        out
          .values[
          (n -
            2) *
            3 +
            1
        ]) /
      (out
        .times[
        n -
          1
      ] -
        out
          .times[
          n -
            2
        ]);
    expect(
      Math.abs(
        slopeFirst -
          slopeLast,
      ),
    ).toBeLessThan(
      0.6,
    );
  });
});
