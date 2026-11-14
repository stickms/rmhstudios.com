// =============================================================================
// ALTAIR MENU -- Corridor scene (pure pixel renderer)
// =============================================================================
// The main-menu backdrop: a one-point-perspective service corridor on Outpost 13,
// drawn per pixel into a small RGBA buffer and scaled up by the page, so it is
// pixel art all the way down. No DOM, no canvas, no allocation per frame: the
// caller owns the buffer and puts it on screen. That keeps the scene testable in
// node and cheap enough to run at 30 fps on a phone (~37k pixels).
//
// What is in it (docs/game-design-schemes/altair.json motifs):
//   - ribbed corridor: cable trays, bulkhead panels, blinking wall consoles,
//     conduit, hazard-striped grating
//   - amber emergency lamps that cast glow and occasionally stutter
//   - a dark door at the far end, with the Echo standing in it (fades in and
//     out, glitch-sliced)
//   - a security drone patrolling the upper third, steam venting from the floor,
//     drifting dust, a slow star flare (alpha Aquilae)
//   - a scan sweep and a glitch slice every ~10 s. Luminance changes are slow or
//     small-area; nothing flashes (WCAG 2.3.1).
//
// Colour is quantised to the card palette with a 4x4 Bayer dither, which is what
// makes it read as retro hardware instead of a gradient.
// =============================================================================

import {
  DRONE_FRAMES,
  ECHO_FRAME,
  decodeSprite,
  type DecodedSprite,
} from './menu-sprites';
import { clamp01 } from '@/lib/core/math';

export interface CorridorScene {
  readonly width: number;
  readonly height: number;
  /** Packed RGBA, row-major. Wrap `buf.buffer` in an ImageData to show it. */
  readonly buf: Uint32Array<ArrayBuffer>;
  readonly echo: DecodedSprite;
  readonly drone: readonly DecodedSprite[];
}

const pack =
  (
    r: number,
    g: number,
    b: number,
  ): number =>
    ((0xff <<
      24) |
      (b <<
        16) |
      (g <<
        8) |
      r) >>>
    0;
const hex =
  (
    h: string,
  ): number =>
    pack(
      parseInt(
        h.slice(
          1,
          3,
        ),
        16,
      ),
      parseInt(
        h.slice(
          3,
          5,
        ),
        16,
      ),
      parseInt(
        h.slice(
          5,
          7,
        ),
        16,
      ),
    );

/** Cold ramp, void to lit steel. The top step is kept low so UI text stays readable over it. */
const TEAL: readonly number[] =
  [
    '#02050a',
    '#040d17',
    '#07192a',
    '#0b2a40',
    '#0f3b52',
    '#17607a',
    '#2a8fa6',
  ].map(
    hex,
  );
const AMBER: readonly number[] =
  [
    '#1a0f02',
    '#5c3508',
    '#8a4f0c',
    '#d98a22',
    '#ffb44d',
  ].map(
    hex,
  );
const MAGENTA: readonly number[] =
  [
    '#2a0820',
    '#7a1a63',
    '#ff3db8',
  ].map(
    hex,
  );
const CYAN =
  hex(
    '#19d3da',
  );
const WHITE =
  hex(
    '#e6fbff',
  );
const FOG =
  hex(
    '#1c6482',
  );

const BAYER =
  [
    0,
    8,
    2,
    10,
    12,
    4,
    14,
    6,
    3,
    11,
    1,
    9,
    15,
    7,
    13,
    5,
  ];
const bayer =
  (
    x: number,
    y: number,
  ): number =>
    (BAYER[
      ((y &
        3) <<
        2) |
        (x &
          3)
    ] +
      0.5) /
    16;

/** Corridor depth where the far door begins. */
const Z_FAR = 7;
/** Depth between ribs. */
const SEG = 1.4;

export function createCorridorScene(
  width: number,
  height: number,
): CorridorScene {
  return {
    width,
    height,
    buf: new Uint32Array(
      new ArrayBuffer(
        width *
          height *
          4,
      ),
    ),
    echo: decodeSprite(
      ECHO_FRAME,
    ),
    drone:
      DRONE_FRAMES.map(
        (
          f,
        ) =>
          decodeSprite(
            f,
          ),
      ),
  };
}

function hash01(
  n: number,
): number {
  let x =
    Math.imul(
      n |
        0,
      0x45d9f3b,
    );
  x =
    Math.imul(
      x ^
        (x >>>
          16),
      0x45d9f3b,
    );
  x ^=
    x >>>
    16;
  return (
    (x >>>
      0) /
    4294967296
  );
}

const frac =
  (
    v: number,
  ): number =>
    v -
    Math.floor(
      v,
    );

/** Lamp brightness over time: a gentle breath, with the odd slow brown-out on some lamps. */
function lampLevel(
  index: number,
  t: number,
): number {
  let level =
    0.84 +
    0.16 *
      Math.sin(
        t *
          2.3 +
          index *
            1.9,
      );
  if (
    hash01(
      index *
        31 +
        7,
    ) >
      0.7 &&
    Math.sin(
      t *
        0.9 +
        index *
          2.1,
    ) >
      0.94
  )
    level *= 0.35;
  return level;
}

function lighten(
  c: number,
  n: number,
): number {
  const r =
    Math.min(
      255,
      (c &
        255) +
        n,
    );
  const g =
    Math.min(
      255,
      ((c >>>
        8) &
        255) +
        n,
    );
  const b =
    Math.min(
      255,
      ((c >>>
        16) &
        255) +
        n,
    );
  return pack(
    r,
    g,
    b,
  );
}

/**
 * Render one frame.
 * @param t     seconds since the scene began
 * @param px,py pointer offset in -1..1 (parallax); pass 0,0 for none
 */
export function renderCorridor(
  scene: CorridorScene,
  t: number,
  px = 0,
  py = 0,
): void {
  const {
    width:
      W,
    height:
      H,
    buf,
  } = scene;
  const cx =
    W *
      0.5 +
    px *
      W *
      0.03 +
    Math.sin(
      t *
        0.23,
    ) *
      W *
      0.008;
  // On a tall (phone) screen the menu's buttons fill the lower two thirds, so the door and its
  // lamp arch sit high, behind the title; on a wide screen they sit nearer the middle.
  const cyFrac =
    H >
    W
      ? 0.3
      : 0.4;
  const cy =
    H *
      cyFrac +
    py *
      H *
      0.03 +
    Math.sin(
      t *
        0.31,
    ) *
      H *
      0.006;
  const AW =
    W *
    0.52;
  const AH =
    H *
    0.5;
  const aspect =
    AW /
    AH;
  const cam =
    t *
    0.45;
  const doorW =
    AW /
    Z_FAR;
  const doorH =
    AH /
    Z_FAR;

  for (
    let y = 0;
    y <
    H;
    y++
  ) {
    const dy =
      y +
      0.5 -
      cy;
    const ady =
      dy <
      0
        ? -dy
        : dy;
    const ty =
      ady /
      AH;
    for (
      let x = 0;
      x <
      W;
      x++
    ) {
      const dx =
        x +
        0.5 -
        cx;
      const adx =
        dx <
        0
          ? -dx
          : dx;
      const tx =
        adx /
        AW;
      const tm =
        tx >
        ty
          ? tx
          : ty;
      const z =
        1 /
        (tm +
          1e-4);
      const d =
        bayer(
          x,
          y,
        );
      let col: number;

      if (
        z >=
        Z_FAR
      ) {
        // The far door: a dark frame with light leaking round a figure-sized slit.
        if (
          tm >
          (1 /
            Z_FAR) *
            0.9
        ) {
          col =
            TEAL[
              Math.min(
                6,
                Math.floor(
                  5.2 +
                    d,
                ),
              )
            ];
        } else {
          const leak =
            Math.exp(
              -(
                adx *
                adx
              ) /
                (doorW *
                  doorW *
                  0.18),
            );
          const breath =
            0.65 +
            0.35 *
              Math.sin(
                t *
                  0.7,
              );
          const floorBias =
            0.45 +
            0.55 *
              clamp01(
                dy /
                  doorH +
                  0.5,
              );
          const i =
            0.04 +
            0.42 *
              leak *
              breath *
              floorBias;
          col =
            TEAL[
              Math.min(
                6,
                Math.floor(
                  i *
                    6.99 +
                    d,
                ),
              )
            ];
        }
        buf[
          y *
            W +
            x
        ] =
          col;
        continue;
      }

      const lit =
        1 /
        (1 +
          0.22 *
            z);
      const zz =
        z +
        cam;
      const k =
        Math.floor(
          zz /
            SEG,
        );
      const s =
        zz /
          SEG -
        k;
      let albedo = 0.3;
      let amber = 0;
      let flag = 0;
      let glowFactor = 0;

      // A rib's depth thickness grows with z*z so its on-screen width stays roughly constant
      // (screen distance goes as 1/z, so a fixed thickness would balloon near the camera).
      if (
        s *
          SEG <
        Math.min(
          0.2,
          0.012 *
            z *
            z,
        )
      ) {
        albedo =
          0.45 +
          0.4 *
            (z /
              Z_FAR);
      } else if (
        tx >
        ty
      ) {
        // Side wall. h: -1 at the ceiling line, +1 at the floor line.
        const h =
          (dy /
            adx) *
          aspect;
        glowFactor =
          h <
          0.9
            ? Math.max(
                0,
                0.55 -
                  0.45 *
                    h,
              )
            : 0.1;
        if (
          h <
          -0.55
        ) {
          // Cable tray, with a bright cyan-lit edge where wall meets ceiling.
          albedo =
            h >
            -0.62
              ? 0.95
              : frac(
                    h *
                      7,
                  ) <
                  0.22
                ? 0.18
                : 0.38;
        } else if (
          h <
          0.35
        ) {
          const inner =
            s >
              0.12 &&
            s <
              0.88 &&
            h >
              -0.45 &&
            h <
              0.25;
          albedo =
            inner
              ? 0.58
              : 0.42;
          const side =
            dx <
            0
              ? 0
              : 1;
          if (
            hash01(
              k *
                17 +
                side *
                  101,
            ) >
              0.55 &&
            s >
              0.22 &&
            s <
              0.78 &&
            h >
              -0.25 &&
            h <
              0.18
          ) {
            albedo = 0.22;
            if (
              s >
                0.28 &&
              s <
                0.72 &&
              h >
                -0.2 &&
              h <
                -0.02
            ) {
              albedo =
                frac(
                  h *
                    30,
                ) <
                0.4
                  ? 0.32
                  : 0.52;
            } else if (
              h >
                0.07 &&
              h <
                0.13
            ) {
              for (
                let led = 0;
                led <
                3;
                led++
              ) {
                if (
                  Math.abs(
                    s -
                      (0.32 +
                        led *
                          0.18),
                  ) <
                  0.03
                ) {
                  const on =
                    Math.sin(
                      t *
                        (1.4 +
                          led *
                            0.5) +
                        k *
                          2.3,
                    ) >
                    -0.2;
                  flag =
                    on
                      ? led ===
                        0
                        ? CYAN
                        : led ===
                            1
                          ? AMBER[4]
                          : MAGENTA[2]
                      : TEAL[1];
                }
              }
            }
          }
        } else if (
          h <
          0.9
        ) {
          if (
            h >
              0.42 &&
            h <
              0.52
          )
            albedo =
              h <
              0.45
                ? 0.66
                : 0.5;
          else if (
            h >
              0.66 &&
            h <
              0.76
          )
            albedo =
              h <
              0.69
                ? 0.6
                : 0.46;
          else
            albedo = 0.3;
        } else if (
          h <
          0.93
        ) {
          albedo =
            h <
            0.915
              ? 0.3
              : 0.9;
        } else {
          // Hazard stripe along the base.
          if (
            frac(
              s *
                6 +
                h *
                  6,
            ) <
            0.5
          )
            amber = 0.55;
          else
            albedo = 0.12;
        }
      } else if (
        dy >
        0
      ) {
        // Floor grating.
        const w =
          dx /
          ady /
          aspect;
        glowFactor = 0.28;
        const aw =
          w <
          0
            ? -w
            : w;
        if (
          aw >
          0.86
        ) {
          if (
            frac(
              zz *
                4 +
                w *
                  4,
            ) <
            0.5
          )
            amber = 0.5;
          else
            albedo = 0.12;
        } else if (
          aw <
            0.07 &&
          frac(
            zz *
              1.5,
          ) <
            0.55
        ) {
          albedo = 0.72;
        } else {
          albedo =
            frac(
              w *
                5,
            ) <
              0.1 ||
            frac(
              zz *
                3,
            ) <
              0.12
              ? 0.18
              : 0.34;
        }
      } else {
        // Ceiling: pipes, and a lamp housing every four units.
        const w =
          dx /
          ady /
          aspect;
        glowFactor = 1;
        const aw =
          w <
          0
            ? -w
            : w;
        const kl =
          Math.floor(
            zz /
              4,
          );
        const dzl =
          zz -
          (kl +
            0.5) *
            4;
        const adz =
          dzl <
          0
            ? -dzl
            : dzl;
        if (
          adz <
            0.45 &&
          aw <
            0.16
        ) {
          flag =
            AMBER[
              Math.min(
                4,
                Math.floor(
                  lampLevel(
                    kl,
                    t,
                  ) *
                    4.99,
                ),
              )
            ];
        } else if (
          adz <
            0.6 &&
          aw <
            0.22
        ) {
          albedo = 0.56;
        } else if (
          aw >
            0.22 &&
          aw <
            0.32
        ) {
          albedo = 0.5;
        } else if (
          aw >
            0.58 &&
          aw <
            0.68
        ) {
          albedo = 0.42;
        } else {
          albedo = 0.26;
        }
      }

      if (
        flag !==
        0
      ) {
        col =
          flag;
      } else {
        const kl =
          Math.floor(
            zz /
              4,
          );
        const dzl =
          zz -
          (kl +
            0.5) *
            4;
        const glow =
          Math.exp(
            -dzl *
              dzl *
              1.15,
          ) *
          lampLevel(
            kl,
            t,
          );
        const a =
          clamp01(
            amber *
              lit *
              1.5 +
              glow *
                glowFactor *
                (0.5 +
                  0.5 *
                    lit) *
                0.8,
          );
        if (
          a +
            (d -
              0.5) *
              0.35 >
          0.36
        ) {
          col =
            AMBER[
              Math.max(
                0,
                Math.min(
                  4,
                  Math.floor(
                    a *
                      5 +
                      d -
                      0.5,
                  ),
                ),
              )
            ];
        } else {
          const i =
            albedo *
              lit +
            0.06 *
              (z /
                Z_FAR);
          col =
            TEAL[
              Math.max(
                0,
                Math.min(
                  6,
                  Math.floor(
                    i *
                      6.99 +
                      d *
                        0.65 +
                      0.17,
                  ),
                ),
              )
            ];
        }
      }
      buf[
        y *
          W +
          x
      ] =
        col;
    }
  }

  // ---- Overlays -------------------------------------------------------------

  drawEcho(
    scene,
    t,
    cx,
    cy +
      doorH -
      1,
  );
  drawSteam(
    scene,
    t,
  );
  drawDust(
    scene,
    t,
  );
  drawStarFlare(
    scene,
    t,
  );
  drawDrone(
    scene,
    t,
  );
  scanSweep(
    scene,
    t,
  );
  glitchSlice(
    scene,
    t,
  );
}

// ---- The Echo ----------------------------------------------------------------

function echoAlpha(
  t: number,
): number {
  const cycle = 18;
  const ph =
    (t %
      cycle) /
    cycle;
  if (
    ph <
      0.5 ||
    ph >
      0.9
  )
    return 0;
  const fadeIn =
    clamp01(
      (ph -
        0.5) /
        0.08,
    );
  const fadeOut =
    clamp01(
      (0.9 -
        ph) /
        0.08,
    );
  // Unsteady, never solid: the figure is mostly a memory.
  const flutter =
    0.82 +
    0.18 *
      Math.sin(
        t *
          7.1,
      ) *
      Math.sin(
        t *
          2.9,
      );
  return (
    Math.min(
      fadeIn,
      fadeOut,
    ) *
    0.88 *
    flutter
  );
}

function drawEcho(
  scene: CorridorScene,
  t: number,
  cxp: number,
  feetY: number,
): void {
  const alpha =
    echoAlpha(
      t,
    );
  if (
    alpha <=
    0.02
  )
    return;
  const {
    width:
      W,
    height:
      H,
    buf,
    echo,
  } = scene;
  const ox =
    Math.round(
      cxp -
        echo.width /
          2,
    );
  const oy =
    Math.round(
      feetY -
        echo.height,
    );
  const step =
    Math.floor(
      t *
        12,
    );
  for (
    let sy = 0;
    sy <
    echo.height;
    sy++
  ) {
    const tear =
      hash01(
        step *
          131 +
          (sy >>
            1),
      ) >
      0.86
        ? hash01(
            step +
              sy,
          ) >
          0.5
          ? 2
          : -2
        : 0;
    const y =
      oy +
      sy;
    if (
      y <
        0 ||
      y >=
        H
    )
      continue;
    for (
      let sx = 0;
      sx <
      echo.width;
      sx++
    ) {
      const c =
        echo
          .pixels[
          sy *
            echo.width +
            sx
        ];
      if (
        c ===
        0
      )
        continue;
      const x =
        ox +
        sx +
        tear;
      if (
        x <
          0 ||
        x >=
          W
      )
        continue;
      if (
        alpha >
        bayer(
          x,
          y,
        )
      )
        buf[
          y *
            W +
            x
        ] =
          c;
    }
  }
}

// ---- Steam, dust, flare ------------------------------------------------------

function drawSteam(
  scene: CorridorScene,
  t: number,
): void {
  const {
    width:
      W,
    height:
      H,
    buf,
  } = scene;
  const vents =
    [
      W *
        0.2,
      W *
        0.8,
    ];
  for (
    let v = 0;
    v <
    vents.length;
    v++
  ) {
    for (
      let i = 0;
      i <
      5;
      i++
    ) {
      const u =
        frac(
          t /
            5.5 +
            i *
              0.2 +
            v *
              0.37,
        );
      const px =
        vents[
          v
        ] +
        Math.sin(
          u *
            6 +
            i *
              1.7 +
            v,
        ) *
          3 *
          (0.4 +
            u);
      const py =
        H *
          0.93 -
        u *
          H *
          0.36;
      const r =
        2 +
        u *
          7;
      const alpha =
        (1 -
          u) *
        0.42 *
        clamp01(
          u /
            0.1,
        );
      const x0 =
        Math.max(
          0,
          Math.floor(
            px -
              r,
          ),
        );
      const x1 =
        Math.min(
          W -
            1,
          Math.ceil(
            px +
              r,
          ),
        );
      const y0 =
        Math.max(
          0,
          Math.floor(
            py -
              r,
          ),
        );
      const y1 =
        Math.min(
          H -
            1,
          Math.ceil(
            py +
              r,
          ),
        );
      for (
        let y =
          y0;
        y <=
        y1;
        y++
      ) {
        for (
          let x =
            x0;
          x <=
          x1;
          x++
        ) {
          const ddx =
            x -
            px;
          const ddy =
            y -
            py;
          const dist =
            Math.sqrt(
              ddx *
                ddx +
                ddy *
                  ddy,
            );
          if (
            dist >
            r
          )
            continue;
          if (
            alpha *
              (1 -
                dist /
                  r) >
            bayer(
              x,
              y,
            ) *
              0.55
          )
            buf[
              y *
                W +
                x
            ] =
              FOG;
        }
      }
    }
  }
}

function drawDust(
  scene: CorridorScene,
  t: number,
): void {
  const {
    width:
      W,
    height:
      H,
    buf,
  } = scene;
  const n =
    Math.max(
      14,
      Math.round(
        (W *
          H) /
          1400,
      ),
    );
  for (
    let i = 0;
    i <
    n;
    i++
  ) {
    const h1 =
      hash01(
        i *
          3 +
          1,
      );
    const h2 =
      hash01(
        i *
          3 +
          2,
      );
    const h3 =
      hash01(
        i *
          3 +
          3,
      );
    const x =
      Math.floor(
        frac(
          h1 +
            t *
              0.01 *
              (0.3 +
                h3),
        ) *
          W,
      );
    const y =
      Math.floor(
        frac(
          h2 -
            t *
              0.006 *
              (0.3 +
                h3),
        ) *
          H,
      );
    if (
      0.4 +
        0.6 *
          Math.sin(
            t *
              1.3 +
              i,
          ) <
      0.35
    )
      continue;
    buf[
      y *
        W +
        x
    ] =
      h3 >
      0.82
        ? AMBER[2]
        : TEAL[5];
  }
}

function drawStarFlare(
  scene: CorridorScene,
  t: number,
): void {
  const {
    width:
      W,
    height:
      H,
    buf,
  } = scene;
  const sx =
    Math.round(
      W *
        0.82,
    );
  const sy =
    Math.round(
      H *
        0.15,
    );
  const p =
    0.62 +
    0.38 *
      Math.sin(
        t *
          0.5,
      );
  const plot =
    (
      x: number,
      y: number,
      a: number,
      c: number,
    ) => {
      if (
        x <
          0 ||
        y <
          0 ||
        x >=
          W ||
        y >=
          H
      )
        return;
      if (
        a >
        bayer(
          x,
          y,
        )
      )
        buf[
          y *
            W +
            x
        ] =
          c;
    };
  plot(
    sx,
    sy,
    1,
    WHITE,
  );
  plot(
    sx +
      1,
    sy,
    1,
    WHITE,
  );
  plot(
    sx,
    sy +
      1,
    1,
    WHITE,
  );
  plot(
    sx +
      1,
    sy +
      1,
    1,
    WHITE,
  );
  const len =
    15 *
    p;
  for (
    let i = 2;
    i <
    len;
    i++
  ) {
    const a =
      (1 -
        i /
          len) *
      0.95;
    plot(
      sx +
        1 +
        i,
      sy,
      a,
      CYAN,
    );
    plot(
      sx -
        i,
      sy,
      a,
      CYAN,
    );
    plot(
      sx,
      sy +
        1 +
        i,
      a,
      CYAN,
    );
    plot(
      sx,
      sy -
        i,
      a,
      CYAN,
    );
  }
  for (
    let i = 2;
    i <
    len *
      0.45;
    i++
  ) {
    const a =
      (1 -
        i /
          (len *
            0.45)) *
      0.6;
    plot(
      sx +
        i +
        1,
      sy +
        i +
        1,
      a,
      WHITE,
    );
    plot(
      sx -
        i,
      sy -
        i,
      a,
      WHITE,
    );
    plot(
      sx +
        i +
        1,
      sy -
        i,
      a,
      WHITE,
    );
    plot(
      sx -
        i,
      sy +
        i +
        1,
      a,
      WHITE,
    );
  }
}

// ---- Drone -------------------------------------------------------------------

function drawDrone(
  scene: CorridorScene,
  t: number,
): void {
  const {
    width:
      W,
    height:
      H,
    buf,
    drone,
  } = scene;
  const frame =
    drone[
      Math.floor(
        t *
          6,
      ) %
        drone.length
    ];
  const x =
    Math.round(
      W *
        (0.5 +
          0.36 *
            Math.sin(
              t *
                0.12,
            )) -
        frame.width /
          2,
    );
  const y =
    Math.round(
      H *
        (0.26 +
          0.04 *
            Math.sin(
              t *
                0.8,
            ) +
          0.03 *
            Math.sin(
              t *
                0.31,
            )) -
        frame.height /
          2,
    );
  // Magenta underglow, dithered, on the scene behind the sprite.
  const gx =
    x +
    frame.width /
      2;
  const gy =
    y +
    frame.height /
      2 +
    2;
  const gr = 11;
  for (
    let yy =
      Math.max(
        0,
        Math.floor(
          gy -
            gr,
        ),
      );
    yy <=
    Math.min(
      H -
        1,
      Math.ceil(
        gy +
          gr,
      ),
    );
    yy++
  ) {
    for (
      let xx =
        Math.max(
          0,
          Math.floor(
            gx -
              gr,
          ),
        );
      xx <=
      Math.min(
        W -
          1,
        Math.ceil(
          gx +
            gr,
        ),
      );
      xx++
    ) {
      const dd =
        Math.hypot(
          xx -
            gx,
          yy -
            gy,
        );
      if (
        dd >
        gr
      )
        continue;
      if (
        (1 -
          dd /
            gr) *
          0.75 >
        bayer(
          xx,
          yy,
        ) +
          0.15
      )
        buf[
          yy *
            W +
            xx
        ] =
          MAGENTA[0];
    }
  }
  for (
    let sy = 0;
    sy <
    frame.height;
    sy++
  ) {
    const yy =
      y +
      sy;
    if (
      yy <
        0 ||
      yy >=
        H
    )
      continue;
    for (
      let sx = 0;
      sx <
      frame.width;
      sx++
    ) {
      const c =
        frame
          .pixels[
          sy *
            frame.width +
            sx
        ];
      const xx =
        x +
        sx;
      if (
        c ===
          0 ||
        xx <
          0 ||
        xx >=
          W
      )
        continue;
      buf[
        yy *
          W +
          xx
      ] =
        c;
    }
  }
}

// ---- Post --------------------------------------------------------------------

/** A faint horizontal band that crawls down the screen every ~9 s. */
function scanSweep(
  scene: CorridorScene,
  t: number,
): void {
  const {
    width:
      W,
    height:
      H,
    buf,
  } = scene;
  const y0 =
    Math.floor(
      frac(
        t /
          9,
      ) *
        H *
        1.4 -
        H *
          0.2,
    );
  for (
    let y =
      Math.max(
        0,
        y0 -
          2,
      );
    y <=
    Math.min(
      H -
        1,
      y0 +
        2,
    );
    y++
  ) {
    const amount =
      y ===
      y0
        ? 10
        : 5;
    for (
      let x =
        y &
        1;
      x <
      W;
      x += 2
    )
      buf[
        y *
          W +
          x
      ] =
        lighten(
          buf[
            y *
              W +
              x
          ],
          amount,
        );
  }
}

/** Two bands tear sideways for ~150 ms every 10 s. No luminance change. */
function glitchSlice(
  scene: CorridorScene,
  t: number,
): void {
  const {
    width:
      W,
    height:
      H,
    buf,
  } = scene;
  const cycle =
    Math.floor(
      t /
        10,
    );
  const local =
    t -
    cycle *
      10;
  if (
    local >
    0.15
  )
    return;
  for (
    let band = 0;
    band <
    2;
    band++
  ) {
    const y0 =
      Math.floor(
        hash01(
          cycle *
            7 +
            band,
        ) *
          H *
          0.7,
      );
    const rows =
      5 +
      Math.floor(
        hash01(
          cycle *
            13 +
            band,
        ) *
          9,
      );
    const shift =
      (hash01(
        cycle *
          19 +
          band,
      ) >
      0.5
        ? 1
        : -1) *
      (3 +
        Math.floor(
          hash01(
            cycle *
              23 +
              band,
          ) *
            4,
        ));
    for (
      let y =
        y0;
      y <
      Math.min(
        H,
        y0 +
          rows,
      );
      y++
    ) {
      const row =
        buf.subarray(
          y *
            W,
          (y +
            1) *
            W,
        );
      if (
        shift >
        0
      )
        row.copyWithin(
          shift,
          0,
          W -
            shift,
        );
      else
        row.copyWithin(
          0,
          -shift,
          W,
        );
    }
  }
}
