/**
 * The brush kit behind the shop's pet and badge art: an impasto, palette-knife look in soft pastels.
 *
 * There are no outlines. A form is a lumpy hand-shaped silhouette with a gradient fill, broad dabs of neighbouring
 * colours laid across it (so the colour mottles the way blended oil paint does), a few light strokes where the
 * light lands, and a soft darker rim where the paint pools. `Wash` paints the backdrop each subject sits in, and
 * `PaintFilter` ruffles every edge, softens it a touch and lays thick knife-ridge texture over the whole picture.
 *
 * All colours are literal on purpose: this is purchased art, not site chrome, so it never follows the `--site-*`
 * tokens (like a playing card). Everything is static (Steel R5), and all randomness is seeded so a picture draws
 * identically on the server and the client. Every id is prefixed from the caller's `useId()` so any number of
 * pictures can share a page; `PaintCtx` carries that prefix to the clip paths and gradients made here.
 */
import { createContext, useContext } from 'react';

/** Room around the 64×64 art, in art units, so rims, rays and the ruffled edges are never cut by the viewBox. */
export const ART_PAD = 4;
/** `viewBox` for a shop picture: the 64×64 art plus `ART_PAD` on every side. */
export const ART_VIEWBOX = `${-ART_PAD} ${-ART_PAD} ${64 + ART_PAD * 2} ${64 + ART_PAD * 2}`;

/** The id prefix of the picture being drawn. */
export const PaintCtx = createContext('paint');

/** The one shade tint: a dusty plum that a pastel fill is darkened toward. */
export const PLUM = '#4b3856';
/** A soft, never-black dark for eyes and the thinnest marks. */
export const INK = '#33283d';

/* ─── colour, noise, geometry ───────────────────────────────────────────── */

function rgb(h: string): [number, number, number] {
  const v = parseInt(h.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

/** Blend `a` toward `b` by `t` (0…1). Hex colours only. */
export function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  const c = (x: number, y: number) =>
    Math.round(x + (y - x) * t)
      .toString(16)
      .padStart(2, '0');
  return `#${c(r1, r2)}${c(g1, g2)}${c(b1, b2)}`;
}

const rd = (n: number) => Math.round(n * 100) / 100;

/** A small seeded generator (mulberry32): the same picture every time, on the server and the client. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hnum(s: string): number {
  let h = 7;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

export type BBox = readonly [x0: number, y0: number, x1: number, y1: number];

/** A hand-shaped ellipse: radii wander a little and the outline is a smooth closed curve. */
export function lumpy(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  { rot = 0, seed = 1, lump = 0.06, n = 10 }: { rot?: number; seed?: number; lump?: number; n?: number } = {},
): { d: string; bb: BBox } {
  const R = rng(seed * 7919);
  const cos = Math.cos((rot * Math.PI) / 180);
  const sin = Math.sin((rot * Math.PI) / 180);
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = 1 + (R() - 0.5) * 2 * lump;
    const x = Math.cos(a) * rx * k;
    const y = Math.sin(a) * ry * k;
    pts.push([rd(cx + x * cos - y * sin), rd(cy + x * sin + y * cos)]);
  }
  const at = (i: number) => pts[(i + n) % n] as [number, number];
  let d = `M${at(0)[0]} ${at(0)[1]}`;
  for (let i = 0; i < n; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    d += `C${rd(p1[0] + (p2[0] - p0[0]) / 6)} ${rd(p1[1] + (p2[1] - p0[1]) / 6)} ${rd(p2[0] - (p3[0] - p1[0]) / 6)} ${rd(p2[1] - (p3[1] - p1[1]) / 6)} ${p2[0]} ${p2[1]}`;
  }
  const r = Math.max(rx, ry);
  return { d: `${d}Z`, bb: [cx - r, cy - r, cx + r, cy + r] };
}

/** Point at radius r and angle deg (0 = up, clockwise). */
export function pt(cx: number, cy: number, r: number, deg: number): [number, number] {
  const a = (deg * Math.PI) / 180;
  return [rd(cx + r * Math.sin(a)), rd(cy - r * Math.cos(a))];
}

/** An n-point star polygon as a path, its corners rounded by the filter's ruffle. */
export function star(cx: number, cy: number, R: number, r: number, n: number, rot = 0): string {
  const out: string[] = [];
  for (let i = 0; i < n * 2; i++) {
    const [x, y] = pt(cx, cy, i % 2 === 0 ? R : r, rot + (i * 180) / n);
    out.push(`${x} ${y}`);
  }
  return `M${out.join('L')}Z`;
}

/* ─── forms ─────────────────────────────────────────────────────────────── */

export interface PaintProps {
  /** The silhouette. */
  d: string;
  /** Its bounding box, in art units; dabs are scattered inside it. */
  bb: BBox;
  fill: string;
  /** Neighbouring colours laid across the form; defaults to a lighter and a deeper tint of `fill`. */
  tones?: readonly string[];
  /** How many dabs. */
  n?: number;
  /** The general direction of the dabs, in degrees (0 = across, -90 = up). */
  angle?: number;
  seed?: number;
  /** Strength of the darker rim where the paint pools (0 for none). */
  rim?: number;
}

/** One painted form. */
export function Paint({ d, bb, fill, tones, n = 7, angle = -35, seed, rim = 0.28 }: PaintProps) {
  const p = useContext(PaintCtx);
  const key = hnum(d);
  const cid = `${p}-c${key.toString(36)}`;
  const R = rng((seed ?? 1) * 104729 + key);
  const palette = tones && tones.length > 0 ? tones : [mix(fill, '#ffffff', 0.5), mix(fill, PLUM, 0.2)];
  const [x0, y0, x1, y1] = bb;
  const w = x1 - x0;
  const h = y1 - y0;
  const span = Math.max(4, Math.min(w, h) * 0.9);
  const dabs = [];
  for (let i = 0; i < n; i++) {
    const x = x0 + R() * w;
    const y = y0 + R() * h;
    const a = ((angle + (R() - 0.5) * 60) * Math.PI) / 180;
    const len = (0.35 + R() * 0.5) * span;
    const dx = (Math.cos(a) * len) / 2;
    const dy = (Math.sin(a) * len) / 2;
    const bend = (R() - 0.5) * len * 0.35;
    dabs.push(
      <path
        key={i}
        d={`M${rd(x - dx)} ${rd(y - dy)}Q${rd(x - dy * 0.0 + -Math.sin(a) * bend)} ${rd(y + Math.cos(a) * bend)} ${rd(x + dx)} ${rd(y + dy)}`}
        stroke={palette[i % palette.length]}
        strokeWidth={rd(2 + R() * 3.4)}
        opacity={rd(0.3 + R() * 0.3)}
      />,
    );
  }
  const lit = mix(fill, '#ffffff', 0.7);
  return (
    <g>
      <defs>
        <clipPath id={cid}>
          <path d={d} />
        </clipPath>
        <linearGradient id={`${cid}g`} x1="0" y1="0" x2="0.8" y2="1">
          <stop offset="0" stopColor={mix(fill, '#ffffff', 0.32)} />
          <stop offset="0.55" stopColor={fill} />
          <stop offset="1" stopColor={mix(fill, PLUM, 0.2)} />
        </linearGradient>
      </defs>
      <path d={d} fill={`url(#${cid}g)`} />
      <g clipPath={`url(#${cid})`} fill="none" strokeLinecap="round">
        {dabs}
        <path
          d={`M${rd(x0 + w * 0.18)} ${rd(y0 + h * 0.22)}Q${rd(x0 + w * 0.3)} ${rd(y0 + h * 0.12)} ${rd(x0 + w * 0.5)} ${rd(y0 + h * 0.16)}`}
          stroke={lit}
          strokeWidth={rd(Math.max(1.4, w * 0.07))}
          opacity={0.55}
        />
        <path
          d={`M${rd(x0 + w * 0.14)} ${rd(y0 + h * 0.36)}Q${rd(x0 + w * 0.2)} ${rd(y0 + h * 0.3)} ${rd(x0 + w * 0.3)} ${rd(y0 + h * 0.32)}`}
          stroke={lit}
          strokeWidth={rd(Math.max(1, w * 0.045))}
          opacity={0.4}
        />
        {rim > 0 ? (
          <path d={d} stroke={mix(fill, PLUM, 0.38)} strokeWidth={6} strokeLinejoin="round" opacity={rim} />
        ) : null}
      </g>
    </g>
  );
}

export interface BlobProps extends Omit<PaintProps, 'd' | 'bb'> {
  cx: number;
  cy: number;
  rx: number;
  ry?: number;
  rot?: number;
  lump?: number;
}

/** A lumpy ellipse, painted. The workhorse for bodies, heads and cheeks. */
export function Blob({ cx, cy, rx, ry, rot = 0, lump = 0.06, seed = 1, ...rest }: BlobProps) {
  const { d, bb } = lumpy(cx, cy, rx, ry ?? rx, { rot, seed, lump });
  return <Paint d={d} bb={bb} seed={seed} {...rest} />;
}

/** A thick painted limb or tail: colour pass, a darker underside, a light streak on top. No outline. */
export function Limb({ d, w, fill }: { d: string; w: number; fill: string }) {
  return (
    <g fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} stroke={mix(fill, PLUM, 0.25)} strokeWidth={w + 0.8} opacity={0.5} transform="translate(0.3 0.5)" />
      <path d={d} stroke={fill} strokeWidth={w} />
      <path
        d={d}
        stroke={mix(fill, '#ffffff', 0.6)}
        strokeWidth={Math.max(0.7, w * 0.28)}
        opacity={0.55}
        transform="translate(-0.4 -0.6)"
      />
    </g>
  );
}

/** A thin brush stroke: twigs, whiskers, legs, veins. */
export function Line({ d, color = INK, w = 0.9, o = 0.75 }: { d: string; color?: string; w?: number; o?: number }) {
  return (
    <path d={d} fill="none" stroke={color} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" opacity={o} />
  );
}

/** A bead eye with a catchlight, optionally set in a lighter ring of paint. */
export function Bead({ x, y, r = 2, ring }: { x: number; y: number; r?: number; ring?: string }) {
  return (
    <g>
      {ring ? <circle cx={x} cy={y} r={r * 1.6} fill={ring} opacity={0.85} /> : null}
      <circle cx={x} cy={y} r={r} fill={INK} />
      <circle cx={x + r * 0.35} cy={y - r * 0.4} r={r * 0.34} fill="#ffffff" opacity={0.9} />
    </g>
  );
}

/** A fleck of paint: a speckle, a star, a blossom bud. */
export function Fleck({
  x,
  y,
  r = 0.7,
  fill = '#f6dc90',
  o = 0.9,
}: {
  x: number;
  y: number;
  r?: number;
  fill?: string;
  o?: number;
}) {
  return <circle cx={x} cy={y} r={r} fill={fill} opacity={o} />;
}

/** A soft four-point twinkle. */
export function Twinkle({ x, y, r, fill = '#fbe9a8' }: { x: number; y: number; r: number; fill?: string }) {
  const d = `M${x} ${y - r}Q${x} ${y} ${x + r} ${y}Q${x} ${y} ${x} ${y + r}Q${x} ${y} ${x - r} ${y}Q${x} ${y} ${x} ${y - r}Z`;
  return <path d={d} fill={fill} opacity={0.95} />;
}

/* ─── the backdrop ──────────────────────────────────────────────────────── */

/**
 * The painted ground a subject sits in: a lumpy patch of colour, broad knife swipes across it in the palette,
 * a few pale scratches, and a scatter of fine speckle. Its edge is feathered so it fades into the page.
 */
export function Wash({
  colors,
  seed = 1,
  speckle = ['#f1c86b', '#6fae9f', '#ffffff'],
}: {
  colors: readonly string[];
  seed?: number;
  speckle?: readonly string[];
}) {
  const p = useContext(PaintCtx);
  const R = rng(seed * 6007);
  const { d } = lumpy(32, 32, 29.5, 28.5, { seed, lump: 0.07, n: 9 });
  const cid = `${p}-wash`;
  const swipes = [];
  for (let i = 0; i < 10; i++) {
    const w = 14 + R() * 26;
    const h = 5 + R() * 15;
    const x = 2 + R() * 44;
    const y = 2 + R() * 46;
    swipes.push(
      <rect
        key={i}
        x={rd(x)}
        y={rd(y)}
        width={rd(w)}
        height={rd(h)}
        rx={2}
        fill={colors[i % colors.length]}
        opacity={rd(0.4 + R() * 0.4)}
        transform={`rotate(${rd((R() - 0.5) * 18)} ${rd(x + w / 2)} ${rd(y + h / 2)})`}
      />,
    );
  }
  const specks = [];
  for (let i = 0; i < 16; i++) {
    const a = R() * Math.PI * 2;
    const r = 6 + R() * 21;
    specks.push(
      <circle
        key={i}
        cx={rd(32 + Math.cos(a) * r)}
        cy={rd(32 + Math.sin(a) * r)}
        r={rd(0.35 + R() * 0.55)}
        fill={speckle[i % speckle.length]}
        opacity={0.75}
      />,
    );
  }
  return (
    <g>
      <defs>
        <clipPath id={cid}>
          <path d={d} />
        </clipPath>
      </defs>
      <g filter={`url(#${p}-soft)`}>
        <path d={d} fill={colors[0]} />
        <g clipPath={`url(#${cid})`}>{swipes}</g>
      </g>
      <g fill="none" stroke="#ffffff" strokeWidth={0.7} strokeLinecap="round" opacity={0.45}>
        <path d={`M${rd(10 + R() * 8)} ${rd(14 + R() * 6)}h${rd(12 + R() * 10)}`} />
        <path d={`M${rd(34 + R() * 8)} ${rd(48 + R() * 5)}h${rd(10 + R() * 8)}`} />
      </g>
      {specks}
    </g>
  );
}

/* ─── the finish ────────────────────────────────────────────────────────── */

const FROM = -ART_PAD - 2;
const SIZE = 64 + (ART_PAD + 2) * 2;

/** The feather that fades a `Wash` into the page. */
export function SoftFilter({ id }: { id: string }) {
  return (
    <filter id={id} filterUnits="userSpaceOnUse" x={FROM} y={FROM} width={SIZE} height={SIZE}>
      <feGaussianBlur stdDeviation={1.1} />
    </filter>
  );
}

/**
 * Ruffled, slightly softened edges, then thick knife-ridge texture (stretched noise lit from the upper left,
 * multiplied over the colours and clipped to the painted shape). The colours are already pastel, so there is no
 * tone shift here.
 */
export function PaintFilter({ id, seed = 3 }: { id: string; seed?: number }) {
  return (
    <filter
      id={id}
      filterUnits="userSpaceOnUse"
      primitiveUnits="userSpaceOnUse"
      x={FROM}
      y={FROM}
      width={SIZE}
      height={SIZE}
      colorInterpolationFilters="sRGB"
    >
      <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves={2} seed={seed} result="wobble" />
      <feDisplacementMap
        in="SourceGraphic"
        in2="wobble"
        scale={1.7}
        xChannelSelector="R"
        yChannelSelector="G"
        result="bent"
      />
      <feTurbulence type="fractalNoise" baseFrequency="0.16" numOctaves={2} seed={seed + 2} result="ragged" />
      <feDisplacementMap in="bent" in2="ragged" scale={0.9} xChannelSelector="G" yChannelSelector="R" result="rough" />
      <feGaussianBlur in="rough" stdDeviation={0.3} result="drawn" />
      <feTurbulence type="fractalNoise" baseFrequency="0.07 0.11" numOctaves={3} seed={seed + 5} result="ridges" />
      <feDiffuseLighting in="ridges" surfaceScale={0.9} diffuseConstant={1.1} lightingColor="#ffffff" result="impasto">
        <feDistantLight azimuth={225} elevation={56} />
      </feDiffuseLighting>
      <feComposite in="drawn" in2="impasto" operator="arithmetic" k1={0.5} k2={0.52} k3={0} k4={0} result="painted" />
      <feComposite in="painted" in2="drawn" operator="in" />
    </filter>
  );
}
