import type { ReactElement } from 'react';

/**
 * Hearthworks — the main menu's illustration, drawn live in SVG to match the banner art
 * (public/images/games/banners/hearthworks.webp): pale-mint isometric islands with a blue rock underside, a
 * hand-inked teal outline, puffy white clouds, a cottage with a steaming pot, two little villagers.
 *
 * Everything here is decorative (the parent marks it aria-hidden). Colours are the `--hwm-*` tokens in
 * hearthworks-menu.css; motion is CSS transform/opacity only, defined there too.
 */

type Pt =
  [
    number,
    number,
  ];

const pts =
  (
    ...p: Pt[]
  ) =>
    p
      .map(
        (
          q,
        ) =>
          `${q[0]},${q[1]}`,
      )
      .join(
        ' ',
      );
// eslint-disable-next-line no-restricted-syntax -- lerp on [x, y] tuples, not numbers
const lerp =
  (
    a: Pt,
    b: Pt,
    t: number,
  ): Pt => [
    a[0] +
      (b[0] -
        a[0]) *
        t,
    a[1] +
      (b[1] -
        a[1]) *
        t,
  ];

interface Geom {
  cx: number;
  hw: number;
  hh: number;
  thick: number;
  rock: number;
  T: Pt;
  R: Pt;
  B: Pt;
  L: Pt;
  /** A point on the top face: u runs toward the right corner, v toward the left corner (both 0..1). */
  at: (
    u: number,
    v: number,
  ) => Pt;
}

function geom(
  cx: number,
  ty: number,
  hw: number,
  hh: number,
  thick: number,
  rock: number,
): Geom {
  const T: Pt =
    [
      cx,
      ty,
    ];
  const R: Pt =
    [
      cx +
        hw,
      ty +
        hh,
    ];
  const B: Pt =
    [
      cx,
      ty +
        hh *
          2,
    ];
  const L: Pt =
    [
      cx -
        hw,
      ty +
        hh,
    ];
  return {
    cx,
    hw,
    hh,
    thick,
    rock,
    T,
    R,
    B,
    L,
    at: (
      u,
      v,
    ) => [
      T[0] +
        (R[0] -
          T[0]) *
          u +
        (L[0] -
          T[0]) *
          v,
      T[1] +
        (R[1] -
          T[1]) *
          u +
        (L[1] -
          T[1]) *
          v,
    ],
  };
}

/** The floating slab: rock underside, two side faces, the mint top and its tile grid. */
function Slab({
  g,
  n = 4,
  drips = true,
}: {
  g: Geom;
  n?: number;
  drips?: boolean;
}) {
  const {
    cx,
    hw,
    thick,
    rock,
    T,
    R,
    B,
    L,
  } =
    g;
  const Lb: Pt =
    [
      L[0],
      L[1] +
        thick,
    ];
  const Bb: Pt =
    [
      B[0],
      B[1] +
        thick,
    ];
  const Rb: Pt =
    [
      R[0],
      R[1] +
        thick,
    ];
  const tipY =
    Bb[1] +
    rock;
  const rim = `C${Rb[0] - hw * 0.1},${Rb[1] + rock * 0.45} ${cx + hw * 0.45},${tipY - rock * 0.25} ${cx + hw * 0.18},${tipY - rock * 0.05} Q${cx},${tipY + 9} ${cx - hw * 0.18},${tipY - rock * 0.05} C${cx - hw * 0.45},${tipY - rock * 0.25} ${Lb[0] + hw * 0.1},${Lb[1] + rock * 0.45} ${Lb[0]},${Lb[1]}Z`;
  const rockD = `M${Lb[0]},${Lb[1]} L${Bb[0]},${Bb[1]} L${Rb[0]},${Rb[1]} ${rim}`;
  const shadeD = `M${Lb[0]},${Lb[1]} L${Bb[0]},${Bb[1]} L${cx},${tipY + 4} Q${cx - hw * 0.08},${tipY + 5} ${cx - hw * 0.18},${tipY - rock * 0.05} C${cx - hw * 0.45},${tipY - rock * 0.25} ${Lb[0] + hw * 0.1},${Lb[1] + rock * 0.45} ${Lb[0]},${Lb[1]}Z`;
  const grid: ReactElement[] =
    [];
  for (
    let i = 1;
    i <
    n;
    i++
  ) {
    const t =
      i /
      n;
    const a1 =
      lerp(
        T,
        L,
        t,
      );
    const b1 =
      lerp(
        R,
        B,
        t,
      );
    const a2 =
      lerp(
        T,
        R,
        t,
      );
    const b2 =
      lerp(
        L,
        B,
        t,
      );
    grid.push(
      <line
        key={`a${i}`}
        className="hwm-grid"
        x1={
          a1[0]
        }
        y1={
          a1[1]
        }
        x2={
          b1[0]
        }
        y2={
          b1[1]
        }
      />,
    );
    grid.push(
      <line
        key={`b${i}`}
        className="hwm-grid"
        x1={
          a2[0]
        }
        y1={
          a2[1]
        }
        x2={
          b2[0]
        }
        y2={
          b2[1]
        }
      />,
    );
  }
  const s =
    rock /
    120;
  return (
    <g>
      <path
        className="hwm-rock"
        d={
          rockD
        }
      />
      <path
        className="hwm-rock-shade"
        d={
          shadeD
        }
      />
      <path
        className="hwm-rock-line"
        d={`M${cx - hw * 0.46},${Bb[1] + rock * 0.12} q${14 * s},${26 * s} ${6 * s},${52 * s} M${cx + hw * 0.34},${Bb[1] + rock * 0.1} q${-10 * s},${22 * s} ${-3 * s},${44 * s} M${cx + hw * 0.06},${Bb[1] + rock * 0.42} q${8 * s},${16 * s} ${2 * s},${34 * s}`}
      />
      <path
        className="hwm-rock-edge"
        d={
          rockD
        }
      />
      <polygon
        className="hwm-grass-l"
        points={pts(
          L,
          B,
          Bb,
          Lb,
        )}
      />
      <polygon
        className="hwm-grass-r"
        points={pts(
          B,
          R,
          Rb,
          Bb,
        )}
      />
      <polygon
        className="hwm-grass"
        points={pts(
          T,
          R,
          B,
          L,
        )}
      />
      <g className="hwm-grid-set">
        {
          grid
        }
      </g>
      {drips && (
        <>
          <circle
            className="hwm-drip hwm-drip--a"
            cx={
              cx -
              hw *
                0.12
            }
            cy={
              tipY -
              rock *
                0.02
            }
            r={
              3.2
            }
          />
          <circle
            className="hwm-drip hwm-drip--b"
            cx={
              cx +
              hw *
                0.08
            }
            cy={
              tipY -
              rock *
                0.1
            }
            r={
              2.4
            }
          />
        </>
      )}
    </g>
  );
}

function Tuft({
  x,
  y,
  flower,
}: {
  x: number;
  y: number;
  flower?:
    | 'blush'
    | 'butter';
}) {
  return (
    <g
      transform={`translate(${x} ${y})`}
    >
      <path
        className="hwm-tuft"
        d="M-4,0 L-6,-6 M0,0 L0,-9 M4,0 L6,-6"
      />
      {flower && (
        <circle
          className={`hwm-bloom hwm-bloom--${flower}`}
          cx={
            0
          }
          cy={
            -11
          }
          r={
            3
          }
        />
      )}
    </g>
  );
}

function Mushroom({
  x,
  y,
  s = 1,
}: {
  x: number;
  y: number;
  s?: number;
}) {
  return (
    <g
      transform={`translate(${x} ${y}) scale(${s})`}
    >
      <path
        className="hwm-shroom-stem"
        d="M-2.5,0 L-2,-6 H2 L2.5,0 Z"
      />
      <path
        className="hwm-shroom-cap"
        d="M-7,-6 C-7,-14 7,-14 7,-6 Z"
      />
    </g>
  );
}

function Pine({
  x,
  y,
  s = 1,
}: {
  x: number;
  y: number;
  s?: number;
}) {
  return (
    <g
      transform={`translate(${x} ${y}) scale(${s})`}
    >
      <ellipse
        className="hwm-shadow"
        cx={
          0
        }
        cy={
          0
        }
        rx={
          15
        }
        ry={
          5.5
        }
      />
      <rect
        className="hwm-trunk"
        x={
          -3
        }
        y={
          -8
        }
        width={
          6
        }
        height={
          9
        }
        rx={
          1.5
        }
      />
      <path
        className="hwm-pine"
        d="M-20,-8 L0,-40 L20,-8 Z"
      />
      <path
        className="hwm-pine"
        d="M-16,-30 L0,-60 L16,-30 Z"
      />
      <path
        className="hwm-pine"
        d="M-11,-52 L0,-76 L11,-52 Z"
      />
    </g>
  );
}

function RoundTree({
  x,
  y,
  s = 1,
}: {
  x: number;
  y: number;
  s?: number;
}) {
  return (
    <g
      transform={`translate(${x} ${y}) scale(${s})`}
    >
      <ellipse
        className="hwm-shadow"
        cx={
          0
        }
        cy={
          0
        }
        rx={
          14
        }
        ry={
          5
        }
      />
      <rect
        className="hwm-trunk"
        x={
          -3
        }
        y={
          -24
        }
        width={
          6
        }
        height={
          25
        }
        rx={
          1.5
        }
      />
      <circle
        className="hwm-leafy"
        cx={
          0
        }
        cy={
          -38
        }
        r={
          19
        }
      />
      <path
        className="hwm-leafy-hi"
        d="M-9,-45 q4,-6 11,-6"
      />
    </g>
  );
}

function Villager({
  x,
  y,
  s = 1,
  hat,
  arm = 'a',
}: {
  x: number;
  y: number;
  s?: number;
  hat:
    | 'teal'
    | 'butter';
  arm?:
    | 'a'
    | 'b';
}) {
  return (
    <g
      transform={`translate(${x} ${y}) scale(${s})`}
    >
      <ellipse
        className="hwm-shadow"
        cx={
          0
        }
        cy={
          1
        }
        rx={
          11
        }
        ry={
          4
        }
      />
      <g
        className={`hwm-folk hwm-folk--${arm}`}
      >
        <rect
          className="hwm-coat"
          x={
            -9
          }
          y={
            -34
          }
          width={
            18
          }
          height={
            30
          }
          rx={
            8
          }
        />
        <rect
          className="hwm-boot"
          x={
            -7
          }
          y={
            -6
          }
          width={
            5.5
          }
          height={
            7
          }
          rx={
            2
          }
        />
        <rect
          className="hwm-boot"
          x={
            1.5
          }
          y={
            -6
          }
          width={
            5.5
          }
          height={
            7
          }
          rx={
            2
          }
        />
        <path
          className="hwm-scarf"
          d="M-8,-30 q8,6 16,0"
        />
        <rect
          className="hwm-sleeve"
          x={
            -12
          }
          y={
            -30
          }
          width={
            5
          }
          height={
            14
          }
          rx={
            2.5
          }
        />
        <g className="hwm-arm">
          <rect
            className="hwm-sleeve"
            x={
              7
            }
            y={
              -44
            }
            width={
              5
            }
            height={
              15
            }
            rx={
              2.5
            }
          />
          <circle
            className="hwm-skin"
            cx={
              9.5
            }
            cy={
              -45.5
            }
            r={
              3.2
            }
          />
        </g>
        <circle
          className="hwm-skin"
          cx={
            0
          }
          cy={
            -43
          }
          r={
            9.5
          }
        />
        <path
          className={`hwm-hat hwm-hat--${hat}`}
          d="M-9.8,-45 C-9.8,-58 9.8,-58 9.8,-45 Z"
        />
        <rect
          className={`hwm-hat hwm-hat--${hat}`}
          x={
            -10.5
          }
          y={
            -47
          }
          width={
            21
          }
          height={
            5
          }
          rx={
            2.5
          }
        />
        <circle
          className="hwm-pom"
          cx={
            0
          }
          cy={
            -55
          }
          r={
            3.2
          }
        />
        <circle
          className="hwm-eye"
          cx={
            -3.4
          }
          cy={
            -41
          }
          r={
            1.3
          }
        />
        <circle
          className="hwm-eye"
          cx={
            3.4
          }
          cy={
            -41
          }
          r={
            1.3
          }
        />
        <circle
          className="hwm-cheek"
          cx={
            -6
          }
          cy={
            -38.5
          }
          r={
            1.8
          }
        />
        <circle
          className="hwm-cheek"
          cx={
            6
          }
          cy={
            -38.5
          }
          r={
            1.8
          }
        />
      </g>
    </g>
  );
}

/** A cottage standing on `(x, y)` — the centre of its footprint. */
function House({
  x,
  y,
  s = 1,
  cog,
  chimney = true,
}: {
  x: number;
  y: number;
  s?: number;
  cog?: boolean;
  chimney?: boolean;
}) {
  return (
    <g
      transform={`translate(${x} ${y}) scale(${s})`}
    >
      <polygon
        className="hwm-wall-l"
        points="-34,0 0,17 0,-35 -34,-52"
      />
      <polygon
        className="hwm-wall-r"
        points="0,17 34,0 34,-52 0,-35"
      />
      {/* the planks */}
      <path
        className="hwm-plank"
        d="M-22.7,5.7 V-46 M-11.3,11.3 V-40 M11.3,11.3 V-40 M22.7,5.7 V-46"
      />
      {/* door on the right wall, round window on the left, shutters either side */}
      <polygon
        className="hwm-door"
        points="9,11.5 20,6 20,-24 9,-18.5"
      />
      <circle
        className="hwm-door-knob"
        cx={
          11.6
        }
        cy={
          -4
        }
        r={
          1.1
        }
      />
      <polygon
        className="hwm-glass"
        points="-26,1 -12,8 -12,-12 -26,-19"
      />
      <path
        className="hwm-plank"
        d="M-19,4.5 V-15.5 M-26,-9 L-12,-2"
      />
      <polygon
        className="hwm-shutter"
        points="-30,-1 -27,0.5 -27,-19.5 -30,-21"
      />
      <polygon
        className="hwm-shutter"
        points="-11,8.5 -8,10 -8,-10 -11,-11.5"
      />
      {cog && (
        <Cog
          x={
            26
          }
          y={
            -30
          }
          r={
            6.5
          }
          still
        />
      )}
      {chimney && (
        <g>
          <polygon
            className="hwm-brick-l"
            points="14,-70 24,-65 24,-112 14,-117"
          />
          <polygon
            className="hwm-brick-r"
            points="24,-65 34,-70 34,-117 24,-112"
          />
          <polygon
            className="hwm-brick-t"
            points="14,-117 24,-122 34,-117 24,-112"
          />
        </g>
      )}
      {/* hipped roof */}
      <polygon
        className="hwm-roof-l"
        points="0,-98 -42,-47 0,-30"
      />
      <polygon
        className="hwm-roof-r"
        points="0,-98 0,-30 42,-47"
      />
      <path
        className="hwm-roof-line"
        d="M-28,-44 L-14,-72 M-14,-38 L-7,-82 M14,-38 L7,-82 M28,-44 L14,-72"
      />
      <path
        className="hwm-roof-hi"
        d="M-30,-48 L-6,-88"
      />
      {chimney && (
        <g
          className="hwm-steam"
          transform="translate(24 -128)"
        >
          <circle
            className="hwm-puff hwm-puff--a"
            cx={
              0
            }
            cy={
              0
            }
            r={
              3.4
            }
          />
          <circle
            className="hwm-puff hwm-puff--b"
            cx={
              4
            }
            cy={
              0
            }
            r={
              4.6
            }
          />
          <circle
            className="hwm-puff hwm-puff--c"
            cx={
              -2
            }
            cy={
              0
            }
            r={
              6
            }
          />
        </g>
      )}
    </g>
  );
}

/** Toothed cog; `still` leaves the spin to the caller. */
function gearPath(
  teeth: number,
  ro: number,
  ri: number,
  hole: number,
): string {
  const step =
    (Math.PI *
      2) /
    teeth;
  let d =
    '';
  for (
    let i = 0;
    i <
    teeth;
    i++
  ) {
    const a =
      i *
      step;
    const q =
      step *
      0.2;
    const w =
      step *
      0.12;
    const p =
      (
        r: number,
        ang: number,
      ) =>
        `${(Math.cos(ang) * r).toFixed(2)},${(Math.sin(ang) * r).toFixed(2)}`;
    d += `${i === 0 ? 'M' : 'L'}${p(ri, a - q)} L${p(ro, a - w)} L${p(ro, a + w)} L${p(ri, a + q)} `;
  }
  d +=
    'Z';
  d += ` M${hole},0 A${hole},${hole} 0 1 0 ${-hole},0 A${hole},${hole} 0 1 0 ${hole},0 Z`;
  return d;
}

const GEARS =
  new Map<
    string,
    string
  >();
function gearFor(
  r: number,
): string {
  const k =
    String(
      r,
    );
  let d =
    GEARS.get(
      k,
    );
  if (
    !d
  ) {
    d =
      gearPath(
        8,
        r,
        r *
          0.76,
        r *
          0.32,
      );
    GEARS.set(
      k,
      d,
    );
  }
  return d;
}

export function Cog({
  x,
  y,
  r,
  still,
}: {
  x: number;
  y: number;
  r: number;
  still?: boolean;
}) {
  return (
    <g
      transform={`translate(${x} ${y})`}
    >
      <path
        className={
          still
            ? 'hwm-cog'
            : 'hwm-cog hwm-cog--spin'
        }
        d={gearFor(
          r,
        )}
        fillRule="evenodd"
      />
    </g>
  );
}

function Crate({
  x,
  y,
  tone,
}: {
  x: number;
  y: number;
  tone:
    | 'butter'
    | 'blush'
    | 'mint';
}) {
  return (
    <g
      transform={`translate(${x} ${y})`}
    >
      <polygon
        className={`hwm-crate-l hwm-crate-l--${tone}`}
        points="-9,0 0,4.5 0,-6 -9,-10.5"
      />
      <polygon
        className={`hwm-crate-r hwm-crate-r--${tone}`}
        points="0,4.5 9,0 9,-10.5 0,-6"
      />
      <polygon
        className={`hwm-crate-t hwm-crate-t--${tone}`}
        points="-9,-10.5 0,-15 9,-10.5 0,-6"
      />
    </g>
  );
}

function Corn({
  x,
  y,
  delay,
}: {
  x: number;
  y: number;
  delay: number;
}) {
  return (
    <g
      transform={`translate(${x} ${y})`}
    >
      <g
        className="hwm-sway"
        style={{
          animationDelay: `${-delay}s`,
        }}
      >
        <path
          className="hwm-stalk"
          d="M0,0 V-34"
        />
        <path
          className="hwm-corn-leaf"
          d="M0,-8 C-8,-9 -12,-14 -13,-22 C-6,-19 -2,-15 0,-9 Z"
        />
        <path
          className="hwm-corn-leaf"
          d="M0,-14 C8,-15 12,-20 13,-28 C6,-25 2,-21 0,-15 Z"
        />
        <path
          className="hwm-corn-leaf"
          d="M0,-22 C-6,-24 -9,-28 -9,-34 C-4,-32 -1,-28 0,-23 Z"
        />
        <path
          className="hwm-corn-ear"
          d="M1,-24 q5,-2 5,-9 q-5,2 -5,9 Z"
        />
        <path
          className="hwm-tassel"
          d="M0,-34 l-2,-6 M0,-34 l0,-7 M0,-34 l2,-6"
        />
      </g>
    </g>
  );
}

function Bale({
  x,
  y,
}: {
  x: number;
  y: number;
}) {
  return (
    <g
      transform={`translate(${x} ${y})`}
    >
      <ellipse
        className="hwm-shadow"
        cx={
          0
        }
        cy={
          2
        }
        rx={
          24
        }
        ry={
          8
        }
      />
      <polygon
        className="hwm-hay-l"
        points="-22,-4 0,7 0,-17 -22,-28"
      />
      <polygon
        className="hwm-hay-r"
        points="0,7 22,-4 22,-28 0,-17"
      />
      <polygon
        className="hwm-hay-t"
        points="-22,-28 0,-39 22,-28 0,-17"
      />
      <path
        className="hwm-hay-line"
        d="M-11,1.5 V-22 M11,1.5 V-22 M-11,-33 L11,-22"
      />
    </g>
  );
}

function Sign({
  x,
  y,
}: {
  x: number;
  y: number;
}) {
  return (
    <g
      transform={`translate(${x} ${y})`}
    >
      <ellipse
        className="hwm-shadow"
        cx={
          0
        }
        cy={
          1
        }
        rx={
          8
        }
        ry={
          3
        }
      />
      <rect
        className="hwm-trunk"
        x={
          -1.8
        }
        y={
          -34
        }
        width={
          3.6
        }
        height={
          35
        }
        rx={
          1.5
        }
      />
      <path
        className="hwm-board"
        d="M-14,-45 H9 L16,-38 L9,-31 H-14 Z"
      />
      <Cog
        x={
          -3
        }
        y={
          -38
        }
        r={
          5
        }
        still
      />
    </g>
  );
}

/** Hero island: the cottage, the cooking pot and the two villagers. */
export function HeroIsland() {
  const g =
    geom(
      210,
      70,
      180,
      90,
      20,
      125,
    );
  const house =
    g.at(
      0.45,
      0.22,
    );
  const cube =
    g.at(
      0.9,
      0.6,
    );
  const sign =
    g.at(
      0.95,
      0.25,
    );
  const pine =
    g.at(
      0.18,
      0.32,
    );
  const tree =
    g.at(
      0.12,
      0.58,
    );
  return (
    <svg
      className="hwm-svg"
      viewBox="0 -40 420 450"
      focusable="false"
    >
      <Slab
        g={
          g
        }
        n={
          5
        }
      />
      <Tuft
        x={
          g.at(
            0.08,
            0.2,
          )[0]
        }
        y={
          g.at(
            0.08,
            0.2,
          )[1]
        }
        flower="butter"
      />
      <Tuft
        x={
          g.at(
            0.62,
            0.08,
          )[0]
        }
        y={
          g.at(
            0.62,
            0.08,
          )[1]
        }
      />
      <Tuft
        x={
          g.at(
            0.7,
            0.34,
          )[0]
        }
        y={
          g.at(
            0.7,
            0.34,
          )[1]
        }
        flower="blush"
      />
      <Tuft
        x={
          g.at(
            0.3,
            0.86,
          )[0]
        }
        y={
          g.at(
            0.3,
            0.86,
          )[1]
        }
      />
      <Tuft
        x={
          g.at(
            0.5,
            0.82,
          )[0]
        }
        y={
          g.at(
            0.5,
            0.82,
          )[1]
        }
        flower="butter"
      />
      <Pine
        x={
          pine[0]
        }
        y={
          pine[1]
        }
      />
      <RoundTree
        x={
          tree[0]
        }
        y={
          tree[1]
        }
      />
      <Mushroom
        x={
          g.at(
            0.34,
            0.52,
          )[0]
        }
        y={
          g.at(
            0.34,
            0.52,
          )[1]
        }
      />
      <Mushroom
        x={
          g.at(
            0.38,
            0.5,
          )[0] +
          6
        }
        y={
          g.at(
            0.38,
            0.5,
          )[1] +
          2
        }
        s={
          0.72
        }
      />
      <House
        x={
          house[0]
        }
        y={
          house[1]
        }
      />
      <Sign
        x={
          sign[0]
        }
        y={
          sign[1]
        }
      />
      <g
        className="hwm-pot"
        transform={`translate(${cube[0]} ${cube[1]})`}
      >
        <ellipse
          className="hwm-shadow"
          cx={
            0
          }
          cy={
            3
          }
          rx={
            32
          }
          ry={
            10
          }
        />
        <polygon
          className="hwm-cube-l"
          points="-26,0 0,13 0,-21 -26,-34"
        />
        <polygon
          className="hwm-cube-r"
          points="0,13 26,0 26,-34 0,-21"
        />
        <polygon
          className="hwm-cube-t"
          points="-26,-34 0,-21 26,-34 0,-47"
        />
        <circle
          className="hwm-emblem"
          cx={
            -13
          }
          cy={
            -9
          }
          r={
            4.4
          }
        />
        <path
          className="hwm-bowl"
          d="M-17,-47 C-17,-26 -9,-24 0,-24 C9,-24 17,-26 17,-47 Z"
        />
        <ellipse
          className="hwm-soup"
          cx={
            0
          }
          cy={
            -47
          }
          rx={
            17
          }
          ry={
            7.5
          }
        />
        <circle
          className="hwm-bubble hwm-bubble--a"
          cx={
            -6
          }
          cy={
            -47
          }
          r={
            2.4
          }
        />
        <circle
          className="hwm-bubble hwm-bubble--b"
          cx={
            5
          }
          cy={
            -48
          }
          r={
            2.9
          }
        />
        <circle
          className="hwm-bubble hwm-bubble--c"
          cx={
            0
          }
          cy={
            -45
          }
          r={
            2
          }
        />
        <path
          className="hwm-wisp hwm-wisp--a"
          d="M-6,-54 q-5,-7 0,-14 t0,-14"
        />
        <path
          className="hwm-wisp hwm-wisp--b"
          d="M2,-54 q-5,-7 0,-14 t0,-14"
        />
        <path
          className="hwm-wisp hwm-wisp--c"
          d="M9,-54 q-5,-7 0,-14 t0,-14"
        />
      </g>
      <Villager
        x={
          g.at(
            0.66,
            0.74,
          )[0] -
          16
        }
        y={
          g.at(
            0.66,
            0.74,
          )[1] +
          2
        }
        hat="teal"
        arm="a"
      />
      <Villager
        x={
          g.at(
            0.74,
            0.66,
          )[0] +
          2
        }
        y={
          g.at(
            0.74,
            0.66,
          )[1] +
          12
        }
        s={
          0.78
        }
        hat="butter"
        arm="b"
      />
    </svg>
  );
}

/** Crop island: rows of corn swaying, a hay bale, a little tree. */
export function FieldIsland() {
  const g =
    geom(
      130,
      38,
      120,
      60,
      14,
      82,
    );
  const stalks: Array<{
    x: number;
    y: number;
    d: number;
  }> =
    [];
  [
    0.1,
    0.22,
    0.34,
    0.46,
    0.58,
  ].forEach(
    (
      u,
      i,
    ) => {
      [
        0.14,
        0.34,
        0.54,
      ].forEach(
        (
          v,
          j,
        ) => {
          const [
            x,
            y,
          ] =
            g.at(
              u,
              v,
            );
          stalks.push(
            {
              x,
              y:
                y +
                4,
              d:
                (i *
                  3 +
                  j) *
                0.37,
            },
          );
        },
      );
    },
  );
  stalks.sort(
    (
      a,
      b,
    ) =>
      a.y -
      b.y,
  );
  const bale =
    g.at(
      0.84,
      0.5,
    );
  const tree =
    g.at(
      0.18,
      0.84,
    );
  return (
    <svg
      className="hwm-svg"
      viewBox="0 -14 260 280"
      focusable="false"
    >
      <Slab
        g={
          g
        }
        n={
          4
        }
      />
      <path
        className="hwm-furrow"
        d={`M${g.at(0.06, 0.1)[0]},${g.at(0.06, 0.1)[1] + 6} L${g.at(0.64, 0.1)[0]},${g.at(0.64, 0.1)[1] + 6} M${g.at(0.06, 0.34)[0]},${g.at(0.06, 0.34)[1] + 6} L${g.at(0.64, 0.34)[0]},${g.at(0.64, 0.34)[1] + 6} M${g.at(0.06, 0.58)[0]},${g.at(0.06, 0.58)[1] + 6} L${g.at(0.64, 0.58)[0]},${g.at(0.64, 0.58)[1] + 6}`}
      />
      <RoundTree
        x={
          tree[0]
        }
        y={
          tree[1]
        }
        s={
          0.7
        }
      />
      {stalks.map(
        (
          s,
          i,
        ) => (
          <Corn
            key={
              i
            }
            x={
              s.x
            }
            y={
              s.y
            }
            delay={
              s.d
            }
          />
        ),
      )}
      <Bale
        x={
          bale[0]
        }
        y={
          bale[1]
        }
      />
      <Tuft
        x={
          g.at(
            0.8,
            0.78,
          )[0]
        }
        y={
          g.at(
            0.8,
            0.78,
          )[1]
        }
        flower="butter"
      />
      <Cog
        x={
          g.at(
            0.9,
            0.1,
          )[0]
        }
        y={
          g.at(
            0.9,
            0.1,
          )[1] -
          16
        }
        r={
          6
        }
      />
    </svg>
  );
}

/** Market island: a cottage with a cog on its wall and a striped-awning stall with crates. */
export function MarketIsland() {
  const g =
    geom(
      140,
      56,
      125,
      62,
      14,
      84,
    );
  const house =
    g.at(
      0.62,
      0.2,
    );
  const stall =
    g.at(
      0.3,
      0.66,
    );
  return (
    <svg
      className="hwm-svg"
      viewBox="0 -14 280 280"
      focusable="false"
    >
      <Slab
        g={
          g
        }
        n={
          4
        }
      />
      <House
        x={
          house[0]
        }
        y={
          house[1]
        }
        s={
          0.78
        }
        cog
        chimney={
          false
        }
      />
      <g
        transform={`translate(${stall[0]} ${stall[1]})`}
      >
        <ellipse
          className="hwm-shadow"
          cx={
            0
          }
          cy={
            4
          }
          rx={
            36
          }
          ry={
            11
          }
        />
        <rect
          className="hwm-trunk"
          x={
            -30
          }
          y={
            -52
          }
          width={
            4
          }
          height={
            50
          }
          rx={
            1.5
          }
        />
        <rect
          className="hwm-trunk"
          x={
            26
          }
          y={
            -52
          }
          width={
            4
          }
          height={
            50
          }
          rx={
            1.5
          }
        />
        <polygon
          className="hwm-table-l"
          points="-32,-12 0,4 0,-4 -32,-20"
        />
        <polygon
          className="hwm-table-r"
          points="0,4 32,-12 32,-20 0,-4"
        />
        <polygon
          className="hwm-table-t"
          points="-32,-20 0,-4 32,-20 0,-36"
        />
        <Crate
          x={
            -12
          }
          y={
            -21
          }
          tone="butter"
        />
        <Crate
          x={
            11
          }
          y={
            -23
          }
          tone="blush"
        />
        <Crate
          x={
            0
          }
          y={
            -15
          }
          tone="mint"
        />
        <polygon
          className="hwm-awning-a"
          points="-34,-52 0,-36 0,-50 -34,-66"
        />
        <polygon
          className="hwm-awning-b"
          points="0,-36 34,-52 34,-66 0,-50"
        />
        <polygon
          className="hwm-awning-c"
          points="-34,-66 0,-50 34,-66 0,-82"
        />
        <path
          className="hwm-awning-line"
          d="M-17,-58 L-17,-44 M17,-58 L17,-44"
        />
      </g>
      <Tuft
        x={
          g.at(
            0.84,
            0.74,
          )[0]
        }
        y={
          g.at(
            0.84,
            0.74,
          )[1]
        }
        flower="blush"
      />
      <Tuft
        x={
          g.at(
            0.1,
            0.2,
          )[0]
        }
        y={
          g.at(
            0.1,
            0.2,
          )[1]
        }
      />
    </svg>
  );
}

/** A far, hazy island — depth behind the three near ones. */
export function FarIsland() {
  const g =
    geom(
      80,
      34,
      72,
      36,
      10,
      52,
    );
  const house =
    g.at(
      0.5,
      0.3,
    );
  const tree =
    g.at(
      0.16,
      0.5,
    );
  return (
    <svg
      className="hwm-svg"
      viewBox="0 -10 160 170"
      focusable="false"
    >
      <Slab
        g={
          g
        }
        n={
          3
        }
        drips={
          false
        }
      />
      <RoundTree
        x={
          tree[0]
        }
        y={
          tree[1]
        }
        s={
          0.6
        }
      />
      <House
        x={
          house[0]
        }
        y={
          house[1]
        }
        s={
          0.55
        }
        chimney={
          false
        }
      />
    </svg>
  );
}

/** One drifting leaf; `kind` picks its colour. */
export function Leaf({
  kind,
}: {
  kind:
    | 'mint'
    | 'teal';
}) {
  return (
    <svg
      className="hwm-leaf-svg"
      viewBox="-12 -16 24 32"
      focusable="false"
    >
      <path
        className={`hwm-leaf hwm-leaf--${kind}`}
        d="M0,-14 C10,-8 10,8 0,14 C-10,8 -10,-8 0,-14 Z"
      />
      <path
        className="hwm-leaf-rib"
        d="M0,-11 L0,11"
      />
    </svg>
  );
}

/** The shared cloud, referenced by every strip. Mounted once, hidden. */
export function MenuDefs() {
  return (
    <svg
      className="hwm-defs"
      width="0"
      height="0"
      focusable="false"
    >
      <defs>
        <symbol
          id="hwm-cloud"
          viewBox="0 0 220 110"
          overflow="visible"
        >
          <g className="hwm-cloud-edge">
            <rect
              x={
                30
              }
              y={
                62
              }
              width={
                160
              }
              height={
                34
              }
              rx={
                17
              }
            />
            <circle
              cx={
                62
              }
              cy={
                66
              }
              r={
                24
              }
            />
            <circle
              cx={
                100
              }
              cy={
                48
              }
              r={
                34
              }
            />
            <circle
              cx={
                146
              }
              cy={
                52
              }
              r={
                30
              }
            />
            <circle
              cx={
                176
              }
              cy={
                70
              }
              r={
                22
              }
            />
          </g>
          <g className="hwm-cloud-fill">
            <rect
              x={
                30
              }
              y={
                62
              }
              width={
                160
              }
              height={
                34
              }
              rx={
                17
              }
            />
            <circle
              cx={
                62
              }
              cy={
                66
              }
              r={
                24
              }
            />
            <circle
              cx={
                100
              }
              cy={
                48
              }
              r={
                34
              }
            />
            <circle
              cx={
                146
              }
              cy={
                52
              }
              r={
                30
              }
            />
            <circle
              cx={
                176
              }
              cy={
                70
              }
              r={
                22
              }
            />
          </g>
          <path
            className="hwm-cloud-swoosh"
            d="M62,86 H118"
          />
        </symbol>
      </defs>
    </svg>
  );
}

/** A looping strip of clouds: `row` fixes the cast so the three rows read as different layers. */
const ROWS: Record<
  | 'back'
  | 'mid'
  | 'front',
  Array<
    [
      number,
      number,
      number,
    ]
  >
> = {
  // [x, y, width] in a 1200x190 box; the first and last share a position modulo 1200 so the loop is seamless.
  back: [
    [
      -40,
      52,
      210,
    ],
    [
      130,
      38,
      170,
    ],
    [
      280,
      58,
      230,
    ],
    [
      470,
      42,
      180,
    ],
    [
      610,
      56,
      220,
    ],
    [
      790,
      40,
      190,
    ],
    [
      940,
      58,
      230,
    ],
    [
      1130,
      52,
      210,
    ],
  ],
  mid: [
    [
      -70,
      60,
      260,
    ],
    [
      110,
      74,
      210,
    ],
    [
      280,
      54,
      280,
    ],
    [
      500,
      76,
      230,
    ],
    [
      650,
      56,
      270,
    ],
    [
      860,
      74,
      220,
    ],
    [
      1010,
      58,
      280,
    ],
    [
      1130,
      60,
      260,
    ],
  ],
  front:
    [
      [
        -90,
        70,
        300,
      ],
      [
        90,
        86,
        250,
      ],
      [
        260,
        66,
        320,
      ],
      [
        470,
        88,
        260,
      ],
      [
        640,
        68,
        310,
      ],
      [
        840,
        86,
        260,
      ],
      [
        1000,
        70,
        320,
      ],
      [
        1110,
        70,
        300,
      ],
    ],
};

export function CloudStrip({
  row,
}: {
  row:
    | 'back'
    | 'mid'
    | 'front';
}) {
  return (
    <svg
      className="hwm-strip"
      viewBox="0 0 1200 190"
      focusable="false"
    >
      {ROWS[
        row
      ].map(
        (
          [
            x,
            y,
            w,
          ],
          i,
        ) => (
          <use
            key={
              i
            }
            href="#hwm-cloud"
            x={
              x
            }
            y={
              y
            }
            width={
              w
            }
            height={
              w /
              2
            }
          />
        ),
      )}
    </svg>
  );
}

export function SkyCloud({
  w = 160,
}: {
  w?: number;
}) {
  return (
    <svg
      className="hwm-sky-svg"
      viewBox="0 0 220 110"
      width={
        w
      }
      height={
        w /
        2
      }
      focusable="false"
    >
      <use
        href="#hwm-cloud"
        x={
          0
        }
        y={
          0
        }
        width={
          220
        }
        height={
          110
        }
      />
    </svg>
  );
}
