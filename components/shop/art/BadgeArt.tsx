import { useId, type ReactNode } from 'react';

/**
 * Drawn art for the shop's BADGE items: one enamel-pin picture per badge id.
 *
 * This is shop ART (a purchased picture), not site chrome, so the hex colours and SVG gradients
 * inside it are content in the same sense as a bought name colour (ItemPicture.tsx). It obeys the
 * site rules that do apply to pictures: nothing moves (R5, no <animate> or CSS animation) and no
 * `filter` — depth is faked with gradients, facets and highlights only.
 *
 * The frame follows the item's rarity in `lib/shop/catalog.ts` (common enamel disc → uncommon
 * bronze ring → rare silver reeded medallion → epic faceted hex → legendary gold ray burst with
 * gems → mythic eight-point star → exotic prismatic burst). Every gradient / clipPath id is
 * prefixed with a sanitized `useId()` so many badges on one page never collide.
 *
 * Drawn on a 64×64 grid: the emblem field is a circle of radius 21.5 at (32,32). Each emblem
 * keeps a bold silhouette and a dark outline so it still reads at 16px next to a username.
 */

type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic' | 'exotic';
type Stop = readonly [offset: number, color: string, opacity?: number];

const OL = '#1a1024';
const C = 32;
const FIELD_R = 21.5;

/* ─── geometry + colour helpers ───────────────────────────────────────────── */

const f = (n: number) => Math.round(n * 100) / 100;

/** Point at radius r and angle deg (0 = up, clockwise). */
function pt(cx: number, cy: number, r: number, deg: number): [number, number] {
  const a = (deg * Math.PI) / 180;
  return [f(cx + r * Math.sin(a)), f(cy - r * Math.cos(a))];
}

const pts = (list: readonly (readonly [number, number])[]) => list.map(([x, y]) => `${x},${y}`).join(' ');

function starPoints(cx: number, cy: number, R: number, r: number, n: number, rot = 0): string {
  const out: [number, number][] = [];
  for (let i = 0; i < n * 2; i++) out.push(pt(cx, cy, i % 2 === 0 ? R : r, rot + (i * 180) / n));
  return pts(out);
}

function hex2rgb(h: string): [number, number, number] {
  const v = parseInt(h.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hex2rgb(a);
  const [r2, g2, b2] = hex2rgb(b);
  const c = (x: number, y: number) =>
    Math.round(x + (y - x) * t)
      .toString(16)
      .padStart(2, '0');
  return `#${c(r1, r2)}${c(g1, g2)}${c(b1, b2)}`;
}

/** 0…1 brightness of a facet facing `deg`, lit from the top-left. */
const lit = (deg: number) => (Math.cos(((deg + 45) * Math.PI) / 180) + 1) / 2;

/** A faceted (bevelled) star: each arm split into a lit and a shaded half. */
function FacetStar({
  cx,
  cy,
  R,
  r,
  n,
  rot = 0,
  light,
  dark,
  stroke = OL,
  sw = 1.2,
}: {
  cx: number;
  cy: number;
  R: number;
  r: number;
  n: number;
  rot?: number;
  light: string;
  dark: string;
  stroke?: string;
  sw?: number;
}) {
  const polys: ReactNode[] = [];
  for (let i = 0; i < n; i++) {
    const a = rot + (i * 360) / n;
    const tip = pt(cx, cy, R, a);
    const l = pt(cx, cy, r, a - 180 / n);
    const rr = pt(cx, cy, r, a + 180 / n);
    polys.push(
      <polygon key={`a${i}`} points={pts([[cx, cy], l, tip])} fill={mix(dark, light, lit(a - 70))} />,
      <polygon key={`b${i}`} points={pts([[cx, cy], tip, rr])} fill={mix(dark, light, lit(a + 70))} />,
    );
  }
  return (
    <g>
      <polygon
        points={starPoints(cx, cy, R, r, n, rot)}
        fill="none"
        stroke={stroke}
        strokeWidth={sw * 2}
        strokeLinejoin="round"
      />
      {polys}
    </g>
  );
}

function LG({
  id,
  x1 = 0,
  y1 = 0,
  x2 = 0,
  y2 = 1,
  stops,
}: {
  id: string;
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  stops: readonly Stop[];
}) {
  return (
    <linearGradient id={id} x1={x1} y1={y1} x2={x2} y2={y2}>
      {stops.map(([o, c, op], i) => (
        <stop key={i} offset={o} stopColor={c} stopOpacity={op ?? 1} />
      ))}
    </linearGradient>
  );
}

function RG({
  id,
  cx = 0.5,
  cy = 0.5,
  r = 0.5,
  fx,
  fy,
  stops,
}: {
  id: string;
  cx?: number;
  cy?: number;
  r?: number;
  fx?: number;
  fy?: number;
  stops: readonly Stop[];
}) {
  return (
    <radialGradient id={id} cx={cx} cy={cy} r={r} fx={fx ?? cx} fy={fy ?? cy}>
      {stops.map(([o, c, op], i) => (
        <stop key={i} offset={o} stopColor={c} stopOpacity={op ?? 1} />
      ))}
    </radialGradient>
  );
}

/** A small four-point glint. */
function Glint({ x, y, s, color = '#ffffff', o = 1 }: { x: number; y: number; s: number; color?: string; o?: number }) {
  const k = s * 0.22;
  return (
    <path
      d={`M${x} ${y - s} Q${x + k} ${y - k} ${x + s} ${y} Q${x + k} ${y + k} ${x} ${y + s} Q${x - k} ${y + k} ${x - s} ${y} Q${x - k} ${y - k} ${x} ${y - s}Z`}
      fill={color}
      opacity={o}
    />
  );
}

/** Deterministic star field. */
function Stars({ seed, count, color = '#ffffff', minR = 0.35, maxR = 0.9 }: { seed: number; count: number; color?: string; minR?: number; maxR?: number }) {
  let s = seed;
  const rnd = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  const out: ReactNode[] = [];
  for (let i = 0; i < count; i++) {
    const a = rnd() * 360;
    const d = Math.sqrt(rnd()) * (FIELD_R - 1);
    const [x, y] = pt(C, C, d, a);
    const r = minR + rnd() * (maxR - minR);
    out.push(<circle key={i} cx={x} cy={y} r={f(r)} fill={color} opacity={f(0.45 + rnd() * 0.55)} />);
  }
  return <g>{out}</g>;
}

/** A round cabochon gem with outline and glint. */
function Gem({ p, x, y, r, tone }: { p: string; x: number; y: number; r: number; tone: keyof typeof GEMS }) {
  return (
    <g>
      <circle cx={x} cy={y} r={r + 0.7} fill={OL} />
      <circle cx={x} cy={y} r={r} fill={`url(#${p}-gem-${tone})`} />
      <circle cx={x - r * 0.35} cy={y - r * 0.38} r={r * 0.28} fill="#ffffff" opacity={0.9} />
    </g>
  );
}

const GEMS = {
  ruby: ['#ffb3c1', '#e5173f', '#6d0019'],
  sapphire: ['#b9d4ff', '#2a62ff', '#0b1f6b'],
  emerald: ['#b8ffd9', '#14b866', '#04502a'],
  teal: ['#c2fff6', '#14c8b4', '#035a52'],
  white: ['#ffffff', '#dfe9ff', '#8a9bc4'],
  amethyst: ['#f0d1ff', '#a33dff', '#43086e'],
} as const;

function GemDefs({ p, tones }: { p: string; tones: readonly (keyof typeof GEMS)[] }) {
  return (
    <>
      {tones.map((t) => (
        <RG
          key={t}
          id={`${p}-gem-${t}`}
          fx={0.35}
          fy={0.3}
          r={0.6}
          stops={[
            [0, GEMS[t][0]],
            [0.45, GEMS[t][1]],
            [1, GEMS[t][2]],
          ]}
        />
      ))}
    </>
  );
}

/* ─── frames (by rarity) ──────────────────────────────────────────────────── */

type Rim = readonly [light: string, mid: string, dark: string];

/** A bevelled ring: a top-lit band between r0 and r1, with a lit inner lip. */
function BevelRing({ p, k, r0, r1, rim }: { p: string; k: string; r0: number; r1: number; rim: Rim }) {
  const mid = (r0 + r1) / 2;
  const w = r1 - r0;
  return (
    <g>
      <defs>
        <LG id={`${p}-${k}-a`} stops={[[0, rim[0]], [0.5, rim[1]], [1, rim[2]]]} />
        <LG id={`${p}-${k}-b`} stops={[[0, rim[2]], [0.55, rim[1]], [1, rim[0]]]} />
      </defs>
      <circle cx={C} cy={C} r={r1 + 0.9} fill={OL} />
      <circle cx={C} cy={C} r={mid} fill="none" stroke={`url(#${p}-${k}-a)`} strokeWidth={w} />
      <circle cx={C} cy={C} r={r0 + w * 0.22} fill="none" stroke={`url(#${p}-${k}-b)`} strokeWidth={w * 0.32} />
      <circle cx={C} cy={C} r={r1 - 0.45} fill="none" stroke="#ffffff" strokeOpacity={0.35} strokeWidth={0.5} />
    </g>
  );
}

const GOLD: Rim = ['#fff4c4', '#f2b632', '#8a4b06'];
const SILVER: Rim = ['#ffffff', '#b9c3d1', '#4d586a'];
const BRONZE: Rim = ['#ffd9b0', '#c27a3e', '#5c2d10'];
const AMETHYST: Rim = ['#f3dcff', '#a463f2', '#3b1170'];
const ROSE: Rim = ['#ffe3ea', '#f0567d', '#6e0a2a'];

function FrameBack({ p, rarity, rim }: { p: string; rarity: Rarity; rim: Rim }) {
  switch (rarity) {
    case 'common':
      return (
        <g>
          <BevelRing p={p} k="fr" r0={FIELD_R} r1={27.4} rim={rim} />
          <circle cx={C} cy={C} r={FIELD_R + 1.05} fill="none" stroke="#f6dc8c" strokeWidth={0.8} />
        </g>
      );
    case 'uncommon': {
      const rivets: ReactNode[] = [];
      for (let i = 0; i < 8; i++) {
        const [x, y] = pt(C, C, 25.6, 22.5 + i * 45);
        rivets.push(
          <g key={i}>
            <circle cx={x} cy={y} r={1.25} fill={BRONZE[2]} />
            <circle cx={x - 0.2} cy={y - 0.25} r={0.85} fill={BRONZE[0]} />
          </g>,
        );
      }
      return (
        <g>
          <BevelRing p={p} k="fr" r0={FIELD_R} r1={28.6} rim={BRONZE} />
          <circle cx={C} cy={C} r={FIELD_R + 1.3} fill="none" stroke={rim[1]} strokeWidth={1.6} />
          <circle cx={C} cy={C} r={FIELD_R + 0.4} fill="none" stroke={OL} strokeWidth={0.8} />
          {rivets}
        </g>
      );
    }
    case 'rare':
      return (
        <g>
          <defs>
            <LG id={`${p}-reed`} stops={[[0, SILVER[0]], [0.5, SILVER[1]], [1, SILVER[2]]]} />
          </defs>
          <polygon points={starPoints(C, C, 31.2, 29.2, 32)} fill={OL} stroke={OL} strokeWidth={1.6} strokeLinejoin="round" />
          <polygon points={starPoints(C, C, 30.4, 28.6, 32)} fill={`url(#${p}-reed)`} />
          <BevelRing p={p} k="fr" r0={FIELD_R} r1={27.6} rim={SILVER} />
          <circle cx={C} cy={C} r={FIELD_R + 1.6} fill="none" stroke={rim[1]} strokeWidth={2.2} />
          <circle cx={C} cy={C} r={FIELD_R + 2.75} fill="none" stroke={OL} strokeWidth={0.5} opacity={0.6} />
          <circle cx={C} cy={C} r={FIELD_R + 0.4} fill="none" stroke={OL} strokeWidth={0.8} />
        </g>
      );
    case 'epic': {
      const R = 31.4;
      const Ri = 25.2;
      const outer: [number, number][] = [];
      const inner: [number, number][] = [];
      for (let i = 0; i < 6; i++) {
        outer.push(pt(C, C, R, i * 60));
        inner.push(pt(C, C, Ri, i * 60));
      }
      const facets: ReactNode[] = [];
      for (let i = 0; i < 6; i++) {
        const j = (i + 1) % 6;
        const o0 = outer[i] ?? [C, C];
        const o1 = outer[j] ?? [C, C];
        const i0 = inner[i] ?? [C, C];
        const i1 = inner[j] ?? [C, C];
        facets.push(
          <polygon key={i} points={pts([o0, o1, i1, i0])} fill={mix(AMETHYST[2], AMETHYST[0], lit(i * 60 + 30))} />,
        );
      }
      return (
        <g>
          <polygon points={pts(outer)} fill={OL} stroke={OL} strokeWidth={2} strokeLinejoin="round" />
          {facets}
          <polygon points={pts(inner)} fill={OL} />
          <polygon points={pts(inner.map(([x, y]) => [f(C + (x - C) * 0.965), f(C + (y - C) * 0.965)] as const))} fill={mix(AMETHYST[1], AMETHYST[2], 0.35)} />
          <BevelRing p={p} k="fr" r0={FIELD_R} r1={23.6} rim={GOLD} />
          {[0, 120, 240].map((a) => {
            const [x, y] = pt(C, C, 27.8, a);
            return <Glint key={a} x={x} y={y} s={1.6} o={0.9} />;
          })}
        </g>
      );
    }
    case 'legendary':
      return (
        <g>
          <FacetStar cx={C} cy={C} R={31.6} r={25} n={16} rot={11.25} light="#fff1b8" dark="#a85a06" sw={1} />
          <FacetStar cx={C} cy={C} R={29.4} r={24} n={16} light="#ffffff" dark="#d8901a" sw={0.9} />
          <BevelRing p={p} k="fr" r0={FIELD_R} r1={26.4} rim={GOLD} />
          <circle cx={C} cy={C} r={FIELD_R + 0.4} fill="none" stroke={OL} strokeWidth={0.8} />
          <GemDefs p={p} tones={['ruby', 'sapphire']} />
          <Gem p={p} x={C} y={C - 24} r={2.1} tone="ruby" />
          <Gem p={p} x={C + 24} y={C} r={1.7} tone="sapphire" />
          <Gem p={p} x={C - 24} y={C} r={1.7} tone="sapphire" />
          <Gem p={p} x={C} y={C + 24} r={1.7} tone="ruby" />
        </g>
      );
    case 'mythic': {
      const pearls: ReactNode[] = [];
      for (let i = 0; i < 8; i++) {
        const [x, y] = pt(C, C, 24.3, 22.5 + i * 45);
        pearls.push(<circle key={i} cx={x} cy={y} r={0.75} fill="#fff6ee" stroke={OL} strokeWidth={0.4} />);
      }
      return (
        <g>
          <FacetStar cx={C} cy={C} R={31.8} r={22} n={8} rot={22.5} light="#7ff5e6" dark="#05504a" sw={1} />
          <FacetStar cx={C} cy={C} R={31.8} r={22} n={8} light="#ffd1dc" dark="#7a0a2e" sw={1} />
          <BevelRing p={p} k="fr" r0={FIELD_R} r1={26.2} rim={ROSE} />
          {pearls}
          <GemDefs p={p} tones={['teal']} />
          {[0, 90, 180, 270].map((a) => {
            const [x, y] = pt(C, C, 24.3, a);
            return <Gem key={a} p={p} x={x} y={y} r={1.7} tone="teal" />;
          })}
          <circle cx={C} cy={C} r={FIELD_R + 0.4} fill="none" stroke={OL} strokeWidth={0.8} />
        </g>
      );
    }
    case 'exotic': {
      const hues = ['#ff5f8f', '#ff9f43', '#ffe14d', '#7dff8a', '#3fe0ff', '#6b8bff', '#c86bff', '#ff6bd6'];
      const rays: ReactNode[] = [];
      const n = 16;
      for (let i = 0; i < n; i++) {
        const a = (i * 360) / n;
        const R = i % 2 === 0 ? 31.8 : 28.6;
        const tip = pt(C, C, R, a);
        const l = pt(C, C, 23, a - 180 / n);
        const r = pt(C, C, 23, a + 180 / n);
        const hue = hues[i % hues.length] ?? '#ffffff';
        rays.push(
          <g key={i}>
            <polygon points={pts([[C, C], l, tip])} fill={mix(hue, '#ffffff', 0.45)} />
            <polygon points={pts([[C, C], tip, r])} fill={mix(hue, '#1a1024', 0.25)} />
          </g>,
        );
      }
      const outline: [number, number][] = [];
      for (let i = 0; i < n; i++) {
        const a = (i * 360) / n;
        outline.push(pt(C, C, i % 2 === 0 ? 31.8 : 28.6, a), pt(C, C, 23, a + 180 / n));
      }
      return (
        <g>
          <defs>
            <LG
              id={`${p}-iri`}
              x1={0}
              y1={0}
              x2={1}
              y2={1}
              stops={[
                [0, '#ffd6f5'],
                [0.25, '#9fe8ff'],
                [0.5, '#fff6b8'],
                [0.75, '#c7a8ff'],
                [1, '#6f5bd6'],
              ]}
            />
          </defs>
          <polygon points={pts(outline)} fill={OL} stroke={OL} strokeWidth={2} strokeLinejoin="round" />
          {rays}
          <circle cx={C} cy={C} r={27.2} fill={OL} />
          <circle cx={C} cy={C} r={24} fill="none" stroke={`url(#${p}-iri)`} strokeWidth={4.8} />
          <circle cx={C} cy={C} r={26} fill="none" stroke="#ffffff" strokeOpacity={0.6} strokeWidth={0.5} />
          <circle cx={C} cy={C} r={FIELD_R + 0.4} fill="none" stroke={OL} strokeWidth={0.8} />
          <GemDefs p={p} tones={['white', 'amethyst']} />
          {[0, 60, 120, 180, 240, 300].map((a, i) => {
            const [x, y] = pt(C, C, 24, a);
            return <Gem key={a} p={p} x={x} y={y} r={i === 0 ? 2 : 1.45} tone={i % 2 === 0 ? 'white' : 'amethyst'} />;
          })}
        </g>
      );
    }
  }
}

/* ─── emblems ─────────────────────────────────────────────────────────────── */

type Emblem = (p: string) => ReactNode;

interface BadgeDef {
  rarity: Rarity;
  /** Field enamel: centre colour → edge colour (radial). */
  field: readonly [string, string];
  /** Accent enamel for the rim (common) / the inner ring (uncommon, rare). */
  rim: Rim;
  emblem: Emblem;
}

const s = { stroke: OL, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const };

const star: Emblem = (p) => (
  <g>
    <Stars seed={7} count={14} color="#cfe0ff" />
    <defs>
      <RG id={`${p}-sh`} stops={[[0, '#ffe680', 0.55], [1, '#ffe680', 0]]} />
    </defs>
    <circle cx={C} cy={C + 1} r={18} fill={`url(#${p}-sh)`} />
    <FacetStar cx={C} cy={C + 1.6} R={18.5} r={7.6} n={5} light="#fff7c2" dark="#d97a00" sw={1.5} />
    <polygon points={starPoints(C, C + 1.6, 6.2, 2.6, 5)} fill="#fff9d6" opacity={0.55} />
    <Glint x={25} y={21} s={3} />
    <Glint x={44.5} y={42} s={1.6} o={0.85} />
  </g>
);

const newcomer: Emblem = (p) => (
  <g>
    <defs>
      <LG id={`${p}-soil`} stops={[[0, '#9b6235'], [1, '#4a2510']]} />
      <LG id={`${p}-leafL`} x1={1} y1={0} x2={0} y2={1} stops={[[0, '#d9ff8a'], [0.5, '#5fcf3a'], [1, '#1f7a24']]} />
      <LG id={`${p}-leafR`} x1={0} y1={0} x2={1} y2={1} stops={[[0, '#c8ff7a'], [0.55, '#43b53a'], [1, '#17631f']]} />
      <LG id={`${p}-stem`} x1={0} y1={0} x2={1} y2={0} stops={[[0, '#9ae35a'], [1, '#2f8a2a']]} />
      <RG id={`${p}-sun`} cx={0.72} cy={0.22} r={0.5} stops={[[0, '#fffbe0', 0.9], [1, '#fffbe0', 0]]} />
    </defs>
    <circle cx={C} cy={C} r={FIELD_R} fill={`url(#${p}-sun)`} />
    {/* soil mound */}
    <path d="M6 48 C14 39 24 38 32 39 C40 38 50 39 58 48 L58 60 L6 60Z" fill={`url(#${p}-soil)`} {...s} strokeWidth={1.4} />
    <circle cx={22} cy={45} r={1.1} fill="#3a1b08" />
    <circle cx={40} cy={47} r={1.3} fill="#3a1b08" />
    <circle cx={30} cy={49} r={0.9} fill="#c08a5a" />
    {/* stem */}
    <path d="M32.6 40 C31 34 31.5 29 33 24" fill="none" stroke={OL} strokeWidth={4.4} strokeLinecap="round" />
    <path d="M32.6 40 C31 34 31.5 29 33 24" fill="none" stroke={`url(#${p}-stem)`} strokeWidth={2.4} strokeLinecap="round" />
    {/* left leaf */}
    <path d="M32.4 27 C27 29 18 28 14.5 20 C21 15.5 30 17 32.4 27Z" fill={`url(#${p}-leafL)`} {...s} strokeWidth={1.5} />
    <path d="M31.5 26 C26 23 21 21.5 17 20.6" fill="none" stroke="#e9ffc0" strokeWidth={0.8} strokeLinecap="round" opacity={0.85} />
    {/* right leaf */}
    <path d="M33 24.5 C35 15 43 10 50.5 13.5 C49 22 41 27 33 24.5Z" fill={`url(#${p}-leafR)`} {...s} strokeWidth={1.5} />
    <path d="M34 23.6 C38.5 20 43 17 48 15" fill="none" stroke="#e9ffc0" strokeWidth={0.8} strokeLinecap="round" opacity={0.85} />
    {/* dew drop */}
    <path d="M44 19.4 C44 18 45.2 16.6 45.2 16.6 C45.2 16.6 46.4 18 46.4 19.4 C46.4 20.2 45.9 20.8 45.2 20.8 C44.5 20.8 44 20.2 44 19.4Z" fill="#e6fbff" stroke="#2a7f9e" strokeWidth={0.35} />
    <Glint x={20} y={21.5} s={1.4} o={0.8} />
  </g>
);

const fire: Emblem = (p) => (
  <g>
    <defs>
      <LG id={`${p}-f1`} stops={[[0, '#ff7a1a'], [0.6, '#ff2d1f'], [1, '#b0001f']]} />
      <LG id={`${p}-f2`} stops={[[0, '#ffd23f'], [1, '#ff7a00']]} />
      <LG id={`${p}-f3`} stops={[[0, '#ffffff'], [1, '#fff07a']]} />
      <RG id={`${p}-glow`} cy={0.62} stops={[[0, '#ff6a00', 0.7], [1, '#ff6a00', 0]]} />
    </defs>
    <circle cx={C} cy={C + 6} r={20} fill={`url(#${p}-glow)`} />
    <path
      d="M32 53 C20 53 15 44.5 17.5 36.5 C19.5 30.5 24 28.5 23.6 21 C28 24 29.6 28.5 29.4 31.5 C31.6 25 32.8 17 38.6 11.5 C38.2 19.5 44.6 25 46.4 33 C48.6 42.5 44 53 32 53Z"
      fill={`url(#${p}-f1)`}
      {...s}
      strokeWidth={1.6}
    />
    <path
      d="M32 51 C25 51 22.6 45.6 24 41 C25.2 37.2 28.4 36 29.2 31.6 C31.4 34.6 31.6 37 31.4 39 C33.4 35.6 35.4 32.6 36.2 29 C38.6 33.4 41.6 38 40.6 43.4 C39.8 47.6 37 51 32 51Z"
      fill={`url(#${p}-f2)`}
    />
    <path d="M32 49.6 C29 49.6 27.4 47.4 28 44.6 C28.6 42 31.2 40.8 32.2 37.6 C34.2 40.6 36.4 43 36 45.8 C35.6 48 34 49.6 32 49.6Z" fill={`url(#${p}-f3)`} />
    <path d="M22 36 C21 33 22.5 31 24.4 28" fill="none" stroke="#ffb27a" strokeWidth={0.9} strokeLinecap="round" opacity={0.85} />
    <path d="M39.6 18.6 C40 22 42.6 25 44 28" fill="none" stroke="#ffb27a" strokeWidth={0.9} strokeLinecap="round" opacity={0.8} />
    <circle cx={45.5} cy={17} r={1.1} fill="#ffcf4a" />
    <circle cx={18.5} cy={25} r={0.9} fill="#ffcf4a" />
    <circle cx={49} cy={25} r={0.6} fill="#ffe9a0" />
    <circle cx={14.5} cy={31} r={0.6} fill="#ffe9a0" />
  </g>
);

const HEART = 'M32 50.5 C18 41.5 12.6 33.6 14.6 26 C16.6 18.6 26 16.6 32 24 C38 16.6 47.4 18.6 49.4 26 C51.4 33.6 46 41.5 32 50.5Z';

const heart: Emblem = (p) => (
  <g>
    <defs>
      <LG id={`${p}-h1`} x1={0.2} y1={0} x2={0.8} y2={1} stops={[[0, '#ff9ccc'], [0.5, '#ff2f8a'], [1, '#9b004a']]} />
      <LG id={`${p}-h2`} x1={0.2} y1={0} x2={0.8} y2={1} stops={[[0, '#ffd3e8'], [0.6, '#ff5aa5'], [1, '#d4136b']]} />
    </defs>
    <Stars seed={21} count={10} color="#ffd6ef" />
    <path d={HEART} fill={`url(#${p}-h1)`} {...s} strokeWidth={1.7} />
    <path d={HEART} fill={`url(#${p}-h2)`} transform="translate(32 34) scale(0.74) translate(-32 -34)" />
    <path d="M32 24 L32 46" stroke="#ffffff" strokeOpacity={0.18} strokeWidth={0.8} />
    <path d="M18.4 27.4 C19 22.6 24 20.6 27.6 23.6 C23.6 23 20.6 24.6 18.4 27.4Z" fill="#ffffff" opacity={0.9} />
    <ellipse cx={41.6} cy={25.4} rx={2.4} ry={1.3} transform="rotate(-30 41.6 25.4)" fill="#ffffff" opacity={0.55} />
    <Glint x={47.2} y={16.6} s={3.4} color="#fff6c2" />
    <Glint x={16.4} y={42} s={2.4} color="#fff6c2" />
    <Glint x={44} y={44} s={1.4} color="#ffffff" o={0.8} />
  </g>
);

const BOLT: readonly [number, number][] = [
  [37.5, 10.5],
  [18.5, 35],
  [29.6, 35],
  [25, 53.5],
  [45.6, 27],
  [34.2, 27],
  [40.8, 10.5],
];

const bolt: Emblem = (p) => (
  <g>
    <defs>
      <LG id={`${p}-b1`} x1={0} y1={0} x2={1} y2={1} stops={[[0, '#fffbd0'], [0.45, '#ffd51f'], [1, '#e07800']]} />
      <RG id={`${p}-bg`} stops={[[0, '#7ae6ff', 0.6], [1, '#7ae6ff', 0]]} />
    </defs>
    <circle cx={C} cy={C} r={18} fill={`url(#${p}-bg)`} />
    <path d="M12 22 L17 25 L14 28 L19 31" fill="none" stroke="#9ff0ff" strokeWidth={1} strokeLinecap="round" strokeLinejoin="round" />
    <path d="M52 37 L47 39 L50 42 L45 45" fill="none" stroke="#9ff0ff" strokeWidth={1} strokeLinecap="round" strokeLinejoin="round" />
    <polygon points={pts(BOLT)} fill={`url(#${p}-b1)`} {...s} strokeWidth={1.7} />
    {/* right-hand bevel in shade */}
    <polygon points={pts([[40.8, 10.5], [34.2, 27], [36.4, 27], [41.8, 13]])} fill="#c96400" opacity={0.55} />
    <polygon points={pts([[45.6, 27], [25, 53.5], [28.2, 47], [42.6, 28.6]])} fill="#c96400" opacity={0.5} />
    {/* left lit edge */}
    <path d="M37 12.6 L21.6 33.4" stroke="#ffffff" strokeWidth={1.1} strokeLinecap="round" opacity={0.95} />
    <path d="M30.6 36.6 L27.6 48.6" stroke="#ffffff" strokeWidth={0.9} strokeLinecap="round" opacity={0.8} />
    <Glint x={33} y={19} s={2.2} />
  </g>
);

const crown: Emblem = (p) => (
  <g>
    <defs>
      <LG id={`${p}-g`} stops={[[0, '#fff6c8'], [0.45, '#ffc93a'], [1, '#a35a00']]} />
      <LG id={`${p}-band`} stops={[[0, '#ffe58a'], [0.5, '#e09a14'], [1, '#7a3f00']]} />
      <LG id={`${p}-vel`} stops={[[0, '#e2335b'], [1, '#6a0222']]} />
      <GemDefs p={p} tones={['ruby', 'sapphire', 'emerald']} />
    </defs>
    <Stars seed={33} count={9} color="#fff1c2" />
    <path d="M17 41 C18 30 24 26 32 26 C40 26 46 30 47 41Z" fill={`url(#${p}-vel)`} {...s} strokeWidth={1.2} />
    <path d="M15.6 42 L13.4 22.6 L23.2 31.6 L32 15.6 L40.8 31.6 L50.6 22.6 L48.4 42Z" fill={`url(#${p}-g)`} {...s} strokeWidth={1.7} />
    {/* inner facet shading */}
    <path d="M32 15.6 L32 41 L40.8 31.6Z" fill="#b86a00" opacity={0.35} />
    <path d="M50.6 22.6 L48.4 42 L44 41Z" fill="#b86a00" opacity={0.4} />
    <path d="M13.4 22.6 L17.6 40.5 L15.6 42Z" fill="#ffffff" opacity={0.4} />
    <path d="M32 15.6 L24.6 30" stroke="#ffffff" strokeWidth={0.9} strokeLinecap="round" opacity={0.85} />
    <rect x={14.6} y={40.4} width={34.8} height={8} rx={2} fill={`url(#${p}-band)`} {...s} strokeWidth={1.6} />
    <path d="M16.6 42.2 L47.4 42.2" stroke="#fff4c0" strokeWidth={0.7} strokeLinecap="round" opacity={0.9} />
    <Gem p={p} x={32} y={44.4} r={2.4} tone="ruby" />
    <Gem p={p} x={23.6} y={44.4} r={1.7} tone="sapphire" />
    <Gem p={p} x={40.4} y={44.4} r={1.7} tone="emerald" />
    {[
      [13.4, 22.6],
      [32, 15.6],
      [50.6, 22.6],
    ].map(([x, y]) => (
      <g key={x}>
        <circle cx={x} cy={y} r={2.6} fill="#fff6ea" stroke={OL} strokeWidth={1.2} />
        <circle cx={(x ?? 0) - 0.8} cy={(y ?? 0) - 0.8} r={0.8} fill="#ffffff" />
      </g>
    ))}
    <Glint x={38} y={22} s={2} />
  </g>
);

const diamond: Emblem = (p) => {
  const T1: [number, number] = [22.6, 18];
  const T2: [number, number] = [41.4, 18];
  const G0: [number, number] = [13.4, 27.2];
  const G1: [number, number] = [22.8, 27.2];
  const G2: [number, number] = [32, 27.2];
  const G3: [number, number] = [41.2, 27.2];
  const G4: [number, number] = [50.6, 27.2];
  const P: [number, number] = [32, 53];
  const faces: [readonly [number, number][], string][] = [
    [[G0, T1, G1], '#e9fbff'],
    [[T1, G2, G1], '#9fe3ff'],
    [[T1, T2, G2], '#ffffff'],
    [[T2, G3, G2], '#7fcfff'],
    [[T2, G4, G3], '#4aa8ec'],
    [[G0, G1, P], '#bdeeff'],
    [[G1, G2, P], '#5ec4f4'],
    [[G2, G3, P], '#2f8fdc'],
    [[G3, G4, P], '#1a5fb0'],
  ];
  return (
    <g>
      <defs>
        <RG id={`${p}-dg`} stops={[[0, '#a8f2ff', 0.55], [1, '#a8f2ff', 0]]} />
      </defs>
      <circle cx={C} cy={C} r={20} fill={`url(#${p}-dg)`} />
      <polygon points={pts([G0, T1, T2, G4, P])} fill={OL} stroke={OL} strokeWidth={3} strokeLinejoin="round" />
      {faces.map(([poly, col], i) => (
        <polygon key={i} points={pts(poly)} fill={col} stroke="#0f3a66" strokeOpacity={0.45} strokeWidth={0.45} strokeLinejoin="round" />
      ))}
      <path d={`M${G0[0]} ${G0[1]} L${G4[0]} ${G4[1]}`} stroke="#ffffff" strokeWidth={0.7} opacity={0.8} />
      <path d="M24.6 30 L30.6 47" stroke="#ffffff" strokeWidth={0.9} strokeLinecap="round" opacity={0.6} />
      <Glint x={27} y={20.6} s={3.4} />
      <Glint x={46} y={14} s={2.2} color="#e8fbff" />
      <Glint x={16} y={40} s={1.6} color="#e8fbff" o={0.9} />
      <Glint x={39.4} y={36} s={1.3} o={0.9} />
    </g>
  );
};

const galaxy: Emblem = (p) => {
  const arm = 'M32 32 C36 27.6 42.6 28 44.6 33.4 C46.8 39.6 40.4 46.6 32 46.6 C23.2 46.6 16.4 40 16.6 30.6';
  return (
    <g>
      <defs>
        <RG id={`${p}-core`} stops={[[0, '#ffffff'], [0.25, '#fff2c4'], [0.55, '#ff9ee6', 0.75], [1, '#b05cff', 0]]} />
        <RG id={`${p}-halo`} stops={[[0, '#9a5cff', 0.55], [1, '#3a12a0', 0]]} />
      </defs>
      <Stars seed={3} count={22} color="#e8dcff" />
      <circle cx={C} cy={C} r={19} fill={`url(#${p}-halo)`} />
      <g transform="rotate(-24 32 32)">
        {[0, 180].map((rot) => (
          <g key={rot} transform={`rotate(${rot} 32 32)`}>
            <path d={arm} fill="none" stroke="#5a24c8" strokeWidth={7.6} strokeLinecap="round" opacity={0.55} />
            <path d={arm} fill="none" stroke="#b46bff" strokeWidth={4.6} strokeLinecap="round" opacity={0.85} />
            <path d={arm} fill="none" stroke="#ff9be4" strokeWidth={2.2} strokeLinecap="round" />
            <path d={arm} fill="none" stroke="#fff0fb" strokeWidth={0.8} strokeLinecap="round" />
            <circle cx={44} cy={38} r={0.9} fill="#bff4ff" />
            <circle cx={24} cy={45} r={1.1} fill="#bff4ff" />
            <circle cx={18} cy={36} r={0.7} fill="#ffffff" />
            <circle cx={38} cy={45.6} r={0.6} fill="#ffffff" />
          </g>
        ))}
      </g>
      <circle cx={C} cy={C} r={8.6} fill={`url(#${p}-core)`} />
      <circle cx={C} cy={C} r={2.4} fill="#ffffff" />
      <Glint x={C} y={C} s={5.4} o={0.9} />
      <Glint x={46} y={17} s={1.8} color="#d8f6ff" />
    </g>
  );
};

const sparkle: Emblem = (p) => (
  <g>
    <defs>
      <RG id={`${p}-sg`} cx={0.42} cy={0.58} stops={[[0, '#ffe27a', 0.5], [1, '#ffe27a', 0]]} />
    </defs>
    <Stars seed={11} count={12} color="#ffeec2" />
    <circle cx={28} cy={36} r={16} fill={`url(#${p}-sg)`} />
    <FacetStar cx={27.4} cy={35.6} R={16} r={4.2} n={4} light="#fff8cf" dark="#e08a00" sw={1.4} />
    <FacetStar cx={43.6} cy={20.4} R={8} r={2.2} n={4} light="#fffbe6" dark="#e8a10a" sw={1.1} />
    <FacetStar cx={44.4} cy={42.6} R={5} r={1.5} n={4} light="#fffbe6" dark="#e8a10a" sw={0.9} />
    <circle cx={27.4} cy={35.6} r={1.6} fill="#ffffff" />
    <circle cx={43.6} cy={20.4} r={0.8} fill="#ffffff" />
  </g>
);

const rocket: Emblem = (p) => (
  <g>
    <defs>
      <LG id={`${p}-body`} x1={0} y1={0} x2={1} y2={0} stops={[[0, '#ffffff'], [0.55, '#dfe6f2'], [1, '#8794ad']]} />
      <LG id={`${p}-red`} x1={0} y1={0} x2={1} y2={0} stops={[[0, '#ff8a8a'], [0.5, '#f0263a'], [1, '#8f0018']]} />
      <LG id={`${p}-flame`} stops={[[0, '#fff3a0'], [0.4, '#ffb21f'], [1, '#ff4d1f', 0]]} />
      <RG id={`${p}-glass`} fx={0.35} fy={0.3} stops={[[0, '#d6f4ff'], [0.5, '#3aa7ff'], [1, '#0b3a8a']]} />
    </defs>
    <Stars seed={5} count={12} color="#e3ecff" />
    {/* smoke puffs */}
    <g fill="#e9eef8" stroke={OL} strokeWidth={1}>
      <circle cx={16} cy={50} r={5} />
      <circle cx={22.5} cy={53} r={4.2} />
      <circle cx={12} cy={44} r={3.4} />
    </g>
    <circle cx={14.6} cy={48.4} r={1.6} fill="#ffffff" />
    <g transform="translate(32 31) rotate(45) scale(0.86) translate(-32 -33)">
      <path d="M28 43.5 Q32 61 36 43.5Z" fill={`url(#${p}-flame)`} />
      <path d="M29.6 43.5 Q32 54 34.4 43.5Z" fill="#fffbe0" />
      {/* fins */}
      <path d="M25.4 31.5 L18.4 41 L18.4 46.4 L25.8 41.6Z" fill={`url(#${p}-red)`} {...s} strokeWidth={1.5} />
      <path d="M38.6 31.5 L45.6 41 L45.6 46.4 L38.2 41.6Z" fill={`url(#${p}-red)`} {...s} strokeWidth={1.5} />
      <rect x={27.2} y={40} width={9.6} height={3.8} rx={1} fill="#59637a" {...s} strokeWidth={1.3} />
      {/* fuselage */}
      <path d="M32 11 C38.6 17 40.4 28 39.2 41 L24.8 41 C23.6 28 25.4 17 32 11Z" fill={`url(#${p}-body)`} {...s} strokeWidth={1.6} />
      <path d="M32 11 C35.6 14.4 37.6 18.4 38.5 22.6 L25.5 22.6 C26.4 18.4 28.4 14.4 32 11Z" fill={`url(#${p}-red)`} {...s} strokeWidth={1.2} />
      <path d="M32 41 L32 46.4" stroke={OL} strokeWidth={2.4} strokeLinecap="round" />
      <path d="M32 41 L32 46" stroke="#f0263a" strokeWidth={1.2} strokeLinecap="round" />
      <circle cx={32} cy={29.4} r={4.4} fill="#c3ccdb" {...s} strokeWidth={1.3} />
      <circle cx={32} cy={29.4} r={3.1} fill={`url(#${p}-glass)`} />
      <circle cx={30.9} cy={28.3} r={0.9} fill="#ffffff" />
      <path d="M27.2 24.5 C26.6 29 26.6 34 27.2 38.6" stroke="#ffffff" strokeWidth={1} strokeLinecap="round" opacity={0.9} fill="none" />
    </g>
  </g>
);

const LEAF = 'M32 32 C25.4 28.6 20.6 23 23.4 17.6 C25.4 14 29.6 14 32 18 C34.4 14 38.6 14 40.6 17.6 C43.4 23 38.6 28.6 32 32Z';

const clover: Emblem = (p) => (
  <g>
    <defs>
      <LG id={`${p}-leaf`} stops={[[0, '#a8f07a'], [0.55, '#2fae3e'], [1, '#0f6a2a']]} />
    </defs>
    <path d="M32 33 C34 40 37 46 43.4 51" fill="none" stroke={OL} strokeWidth={4.2} strokeLinecap="round" />
    <path d="M32 33 C34 40 37 46 43.4 51" fill="none" stroke="#3aa53a" strokeWidth={2.2} strokeLinecap="round" />
    {[45, 135, 225, 315].map((a) => (
      <g key={a} transform={`rotate(${a} 32 32)`}>
        <path d={LEAF} fill={`url(#${p}-leaf)`} {...s} strokeWidth={1.5} />
        <path d="M32 30 L32 20.4" stroke="#d9ffb8" strokeWidth={0.8} strokeLinecap="round" opacity={0.8} />
        <path d="M32 27 L28 22.6 M32 27 L36 22.6" stroke="#d9ffb8" strokeWidth={0.55} strokeLinecap="round" opacity={0.6} />
        <path d="M25.4 18.6 C26.4 16.6 28.4 16.4 29.6 17.6" stroke="#ffffff" strokeWidth={0.9} strokeLinecap="round" fill="none" opacity={0.75} />
      </g>
    ))}
    <circle cx={C} cy={C} r={2} fill="#1f7a2c" stroke={OL} strokeWidth={0.8} />
    <Glint x={45.6} y={20} s={2.4} color="#fffbe0" />
    <Glint x={17.4} y={44} s={1.6} color="#fffbe0" />
  </g>
);

const trophy: Emblem = (p) => (
  <g>
    <defs>
      <LG id={`${p}-cup`} x1={0} y1={0} x2={1} y2={0} stops={[[0, '#fff3b8'], [0.35, '#ffd23a'], [0.7, '#e09200'], [1, '#8a4a00']]} />
      <LG id={`${p}-wood`} stops={[[0, '#7a4524'], [1, '#341608']]} />
      <RG id={`${p}-tg`} cy={0.4} stops={[[0, '#fff2a8', 0.55], [1, '#fff2a8', 0]]} />
    </defs>
    <circle cx={C} cy={28} r={18} fill={`url(#${p}-tg)`} />
    {/* handles */}
    {['M22 18.4 C13.6 18 13.4 30.6 23.4 30', 'M42 18.4 C50.4 18 50.6 30.6 40.6 30'].map((d) => (
      <g key={d}>
        <path d={d} fill="none" stroke={OL} strokeWidth={4.6} strokeLinecap="round" />
        <path d={d} fill="none" stroke="#f2b21f" strokeWidth={2.4} strokeLinecap="round" />
      </g>
    ))}
    <path d="M20.6 14.6 L43.4 14.6 L42.4 24 C41.4 32 36.4 36.4 32 36.4 C27.6 36.4 22.6 32 21.6 24Z" fill={`url(#${p}-cup)`} {...s} strokeWidth={1.6} />
    <ellipse cx={C} cy={14.8} rx={11.4} ry={1.8} fill="#a85e00" {...s} strokeWidth={1.2} />
    <path d="M28.8 36 L35.2 36 L34.4 41.6 L29.6 41.6Z" fill={`url(#${p}-cup)`} {...s} strokeWidth={1.3} />
    <rect x={24.4} y={41.4} width={15.2} height={4} rx={1} fill={`url(#${p}-cup)`} {...s} strokeWidth={1.3} />
    <rect x={20.6} y={45.4} width={22.8} height={6.4} rx={1.4} fill={`url(#${p}-wood)`} {...s} strokeWidth={1.4} />
    <rect x={27.6} y={47.2} width={8.8} height={2.8} rx={0.5} fill="#ffd96a" stroke="#8a4a00" strokeWidth={0.4} />
    <polygon points={starPoints(C, 24.4, 5, 2.1, 5)} fill="#fff9d8" stroke="#a35a00" strokeWidth={0.7} strokeLinejoin="round" />
    <path d="M24.4 17.4 C24.4 24 25.6 29 28.4 32.6" stroke="#ffffff" strokeWidth={1.2} strokeLinecap="round" fill="none" opacity={0.9} />
    <Glint x={40} y={19} s={2} />
  </g>
);

const game: Emblem = (p) => (
  <g>
    <defs>
      <LG id={`${p}-pad`} stops={[[0, '#ffffff'], [0.5, '#dde2ee'], [1, '#8790ab']]} />
      <GemDefs p={p} tones={['ruby', 'sapphire', 'emerald', 'amethyst']} />
    </defs>
    <g transform="translate(32 33) scale(0.95) translate(-32 -33)">
      <path
        d="M19 22.6 C23 20.6 41 20.6 45 22.6 C50.6 25.4 54.2 38.6 52.4 44.4 C50.8 49.2 45.2 48.6 42.2 44.4 L39 40 L25 40 L21.8 44.4 C18.8 48.6 13.2 49.2 11.6 44.4 C9.8 38.6 13.4 25.4 19 22.6Z"
        fill={`url(#${p}-pad)`}
        {...s}
        strokeWidth={1.7}
      />
      <path d="M20 24.6 C24 23 40 23 44 24.6" stroke="#ffffff" strokeWidth={1} strokeLinecap="round" fill="none" />
      {/* d-pad */}
      <path d="M19.6 26.6 h3.6 v3.6 h3.6 v3.6 h-3.6 v3.6 h-3.6 v-3.6 h-3.6 v-3.6 h3.6Z" fill="#2a2f45" {...s} strokeWidth={0.9} />
      <circle cx={21.4} cy={32} r={0.9} fill="#5a6384" />
      {/* face buttons */}
      <Gem p={p} x={43} y={27.6} r={1.9} tone="emerald" />
      <Gem p={p} x={47.2} y={31.8} r={1.9} tone="ruby" />
      <Gem p={p} x={43} y={36} r={1.9} tone="sapphire" />
      <Gem p={p} x={38.8} y={31.8} r={1.9} tone="amethyst" />
      {/* sticks */}
      <circle cx={27.6} cy={38.4} r={2.6} fill="#20253a" stroke="#9aa3c6" strokeWidth={0.7} />
      <circle cx={36.4} cy={38.4} r={2.6} fill="#20253a" stroke="#9aa3c6" strokeWidth={0.7} />
      <rect x={29.4} y={29} width={2.2} height={1.2} rx={0.6} fill="#5a6384" />
      <rect x={32.4} y={29} width={2.2} height={1.2} rx={0.6} fill="#5a6384" />
      <circle cx={32} cy={25.4} r={1} fill="#ff4fc0" stroke={OL} strokeWidth={0.4} />
    </g>
    <Glint x={18} y={16} s={2.2} color="#ffe7ff" />
    <Glint x={47} y={51} s={1.5} color="#ffe7ff" />
  </g>
);

const crystal: Emblem = (p) => (
  <g>
    <defs>
      <RG id={`${p}-orb`} fx={0.36} fy={0.3} r={0.55} stops={[[0, '#ffe3ff'], [0.25, '#d48cff'], [0.7, '#6a1fc0'], [1, '#22073f']]} />
      <LG id={`${p}-base`} stops={[[0, '#ffe08a'], [0.5, '#d18c12'], [1, '#6a3500']]} />
      <RG id={`${p}-aura`} cy={0.45} stops={[[0, '#d38cff', 0.6], [1, '#d38cff', 0]]} />
      <clipPath id={`${p}-oc`}>
        <circle cx={C} cy={28} r={13.6} />
      </clipPath>
    </defs>
    <Stars seed={13} count={10} color="#f0d8ff" />
    <circle cx={C} cy={28} r={19} fill={`url(#${p}-aura)`} />
    {/* stand */}
    <path d="M20.6 52 L23.6 44 L40.4 44 L43.4 52Z" fill={`url(#${p}-base)`} {...s} strokeWidth={1.5} />
    <path d="M23 41.4 C25 46 39 46 41 41.4 L40.4 44.6 C37 47 27 47 23.6 44.6Z" fill="#a8640a" {...s} strokeWidth={1.2} />
    <path d="M23.2 49.6 L40.8 49.6" stroke="#ffe9a8" strokeWidth={0.7} opacity={0.8} />
    {/* orb */}
    <circle cx={C} cy={28} r={14.4} fill={OL} />
    <circle cx={C} cy={28} r={13.6} fill={`url(#${p}-orb)`} />
    <g clipPath={`url(#${p}-oc)`}>
      <path d="M17 31 C23 25 29 35 35 29 C39 25 43 26 47 29" fill="none" stroke="#ffc6ff" strokeWidth={2.2} strokeLinecap="round" opacity={0.55} />
      <path d="M18 36 C24 32 30 40 37 35 C41 32 44 33 46 35" fill="none" stroke="#a8e9ff" strokeWidth={1.4} strokeLinecap="round" opacity={0.5} />
      <Glint x={36.6} y={24} s={2.4} color="#ffffff" />
      <Glint x={27} y={33.6} s={1.4} color="#ffe6ff" />
      <circle cx={39} cy={32} r={0.6} fill="#ffffff" />
      <circle cx={25} cy={26} r={0.5} fill="#ffffff" />
      <path d="M22.4 37 C27 41.6 37 41.6 41.6 37" fill="none" stroke="#e7b8ff" strokeWidth={0.9} opacity={0.6} />
    </g>
    <path d="M21.6 26.4 C22 20.6 26 16.4 31.6 15.6 C27.4 18 24.6 21.6 23.8 27Z" fill="#ffffff" opacity={0.9} />
    <circle cx={25} cy={30.6} r={0.9} fill="#ffffff" opacity={0.7} />
  </g>
);

const comet: Emblem = (p) => (
  <g>
    <defs>
      <LG id={`${p}-t1`} x1={1} y1={0} x2={0} y2={1} stops={[[0, '#ff7a1a'], [0.5, '#ff2d55', 0.75], [1, '#8a1cff', 0]]} />
      <LG id={`${p}-t2`} x1={1} y1={0} x2={0} y2={1} stops={[[0, '#ffd23f'], [1, '#ff7a1a', 0]]} />
      <LG id={`${p}-t3`} x1={1} y1={0} x2={0} y2={1} stops={[[0, '#ffffff'], [1, '#fff3a0', 0]]} />
      <RG id={`${p}-head`} fx={0.4} fy={0.38} stops={[[0, '#ffffff'], [0.35, '#fff3a0'], [0.75, '#ffa21f'], [1, '#ff5a1f']]} />
      <RG id={`${p}-rock`} fx={0.35} fy={0.3} stops={[[0, '#c9b4a2'], [1, '#4a3428']]} />
    </defs>
    <Stars seed={17} count={18} color="#dbe8ff" />
    <path d="M35.3 17.3 C28 24 18.6 37 12 52.6 C24 44 37.4 36.6 46.7 28.7Z" fill={`url(#${p}-t1)`} />
    <path d="M36.8 18.8 C30 25 21 37 16 48.6 C26 41 37.6 34.6 45.2 27.2Z" fill={`url(#${p}-t2)`} />
    <path d="M38.4 20.4 C33 25.6 26 34.4 22 42.4 C29.6 37 37.6 32 43.6 25.6Z" fill={`url(#${p}-t3)`} />
    <path d="M30 30 L20 40 M34 34 L26 42 M27 27 L19 34" stroke="#ffe0b0" strokeWidth={0.6} strokeLinecap="round" opacity={0.7} />
    <circle cx={41} cy={23} r={8.4} fill={OL} />
    <circle cx={41} cy={23} r={7.6} fill={`url(#${p}-head)`} />
    <circle cx={42} cy={22} r={4} fill={`url(#${p}-rock)`} stroke="#3a2418" strokeWidth={0.6} />
    <circle cx={43.2} cy={21.2} r={0.9} fill="#5a3e2e" />
    <circle cx={40.6} cy={23.4} r={0.6} fill="#5a3e2e" />
    <path d="M39.6 19.8 C40.4 19 41.4 18.6 42.6 18.6" stroke="#ffffff" strokeWidth={0.7} strokeLinecap="round" fill="none" />
    <circle cx={24} cy={44} r={0.8} fill="#ffb27a" />
    <circle cx={18} cy={44.6} r={0.6} fill="#ffb27a" />
    <Glint x={48} y={38} s={1.6} color="#dbe8ff" />
  </g>
);

const unicorn: Emblem = (p) => (
  <g>
    <defs>
      <LG id={`${p}-head`} x1={0} y1={0} x2={1} y2={1} stops={[[0, '#ffffff'], [0.6, '#f2ecff'], [1, '#bfb0e6']]} />
      <LG id={`${p}-horn`} x1={0} y1={0} x2={1} y2={1} stops={[[0, '#fff8d0'], [0.5, '#ffd34a'], [1, '#c98600']]} />
      <RG id={`${p}-cheek`} stops={[[0, '#ff9fd0', 0.75], [1, '#ff9fd0', 0]]} />
    </defs>
    <Stars seed={29} count={8} color="#ffffff" />
    {/* mane (behind the head) */}
    {[
      ['#ff5fa2', 0],
      ['#ffb03a', 2.4],
      ['#ffe94a', 4.8],
      ['#5fe08a', 7.2],
      ['#4ab8ff', 9.6],
      ['#a66bff', 12],
    ].map(([col, dx]) => (
      <path
        key={col}
        d={`M${35 + Number(dx) * 0.4} ${15 + Number(dx) * 0.2} C${44 + Number(dx)} ${17 + Number(dx) * 0.3} ${47 + Number(dx) * 0.6} ${30} ${46 + Number(dx) * 0.5} ${42} C${45.6 + Number(dx) * 0.5} ${48} ${48 + Number(dx) * 0.5} ${52} ${50 + Number(dx) * 0.5} ${56}`}
        fill="none"
        stroke={String(col)}
        strokeWidth={3}
        strokeLinecap="round"
      />
    ))}
    <path d="M35 15 C44 17 47 30 46 42 C45.6 48 48 52 50 56" fill="none" stroke={OL} strokeWidth={0.8} opacity={0.5} />
    {/* head + neck */}
    <path
      d="M30 18.6 C25.4 20.4 20.6 26 17.6 32.6 C15.4 36.6 15.8 40.8 19.6 42.2 C23.2 43.4 26.6 41.8 29 40 C31.6 43.6 33.6 48.4 35 54 L48 54 C47 43 45.2 31 40.6 22.4 L41.4 12.6 L35.8 17.6Z"
      fill={`url(#${p}-head)`}
      {...s}
      strokeWidth={1.6}
    />
    {/* inner ear */}
    <path d="M40 20 L40.6 15.4 L37.6 18.2Z" fill="#ffb6dc" />
    {/* horn */}
    <polygon points="28.6,19.6 33.4,17.4 23.4,7.6" fill={`url(#${p}-horn)`} {...s} strokeWidth={1.3} />
    <path d="M30.4 16.8 L32.2 15.8 M28.4 14.2 L30 13.4 M26.4 11.6 L27.6 11" stroke="#b37400" strokeWidth={0.8} strokeLinecap="round" />
    {/* forelock */}
    <path d="M33.6 18.4 C30 19.6 28.8 22.6 29.6 25.6 C31 22.8 33 21.6 35.4 21.4Z" fill="#ff5fa2" {...s} strokeWidth={0.9} />
    <path d="M35.6 18.6 C33.6 21 33.6 24 35 26.4 C35.6 23.6 37 22 38.6 21.4Z" fill="#a66bff" {...s} strokeWidth={0.9} />
    {/* face */}
    <circle cx={22.4} cy={36.4} r={4} fill={`url(#${p}-cheek)`} />
    <path d="M24.4 27.6 C25.6 26 28 25.8 29.4 27.4 C28 29.2 25.8 29.4 24.4 27.6Z" fill={OL} />
    <circle cx={26.2} cy={27.1} r={0.65} fill="#ffffff" />
    <path d="M24.6 27 L23.4 25.8 M25.6 26.3 L24.8 24.9" stroke={OL} strokeWidth={0.6} strokeLinecap="round" />
    <ellipse cx={19.2} cy={38.4} rx={1} ry={0.7} fill="#8a6aa8" />
    <path d="M20.4 41.2 C21.8 41.6 23.4 41.4 24.6 40.6" stroke="#8a6aa8" strokeWidth={0.6} strokeLinecap="round" fill="none" />
    <path d="M38 28 C40.4 33 41.6 40 41.4 47" stroke="#ffffff" strokeWidth={1} strokeLinecap="round" fill="none" opacity={0.9} />
    <Glint x={17.4} y={20} s={2.4} color="#fff6c2" />
    <Glint x={22} y={49} s={1.6} color="#ffffff" />
  </g>
);

const skull: Emblem = (p) => (
  <g>
    <defs>
      <LG id={`${p}-bone`} x1={0.2} y1={0} x2={0.8} y2={1} stops={[[0, '#ffffff'], [0.55, '#ece4d4'], [1, '#a8987e']]} />
      <RG id={`${p}-eye`} stops={[[0, '#ff4d6a'], [0.35, '#b0002a'], [1, '#14020a']]} />
      <RG id={`${p}-sg`} cy={0.45} stops={[[0, '#ff2d55', 0.45], [1, '#ff2d55', 0]]} />
    </defs>
    <circle cx={C} cy={30} r={19} fill={`url(#${p}-sg)`} />
    {/* crossbones */}
    {[45, -45].map((a) => (
      <g key={a} transform={`rotate(${a} 32 34)`}>
        <rect x={13} y={32.2} width={38} height={3.6} rx={1.8} fill={`url(#${p}-bone)`} {...s} strokeWidth={1.2} />
        <circle cx={13.4} cy={32.2} r={2.4} fill="#f2ead8" {...s} strokeWidth={1.1} />
        <circle cx={13.4} cy={35.8} r={2.4} fill="#e2d6bc" {...s} strokeWidth={1.1} />
        <circle cx={50.6} cy={32.2} r={2.4} fill="#f2ead8" {...s} strokeWidth={1.1} />
        <circle cx={50.6} cy={35.8} r={2.4} fill="#e2d6bc" {...s} strokeWidth={1.1} />
      </g>
    ))}
    {/* skull */}
    <path
      d="M32 12.6 C22.6 12.6 17 19.4 17 28 C17 33.6 19.4 36.6 22.4 38.6 L22.4 44 C22.4 46 24 47.4 26 47.4 L38 47.4 C40 47.4 41.6 46 41.6 44 L41.6 38.6 C44.6 36.6 47 33.6 47 28 C47 19.4 41.4 12.6 32 12.6Z"
      fill={`url(#${p}-bone)`}
      {...s}
      strokeWidth={1.6}
    />
    <path d="M20 27 C20 20 24.6 15.6 30 15" stroke="#ffffff" strokeWidth={1.3} strokeLinecap="round" fill="none" />
    <path d="M36.6 15.6 L35 19 L37 21 L35.8 23.6" stroke="#8a7a60" strokeWidth={0.6} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <path d="M20.4 30.4 C20.6 26.6 23.4 25.4 26.6 26 C29.4 26.6 30 29.6 28.8 32.4 C27.6 35 21 35 20.4 30.4Z" fill={`url(#${p}-eye)`} {...s} strokeWidth={1.1} />
    <path d="M43.6 30.4 C43.4 26.6 40.6 25.4 37.4 26 C34.6 26.6 34 29.6 35.2 32.4 C36.4 35 43 35 43.6 30.4Z" fill={`url(#${p}-eye)`} {...s} strokeWidth={1.1} />
    <circle cx={24} cy={29.4} r={0.9} fill="#ffd0d8" />
    <circle cx={40} cy={29.4} r={0.9} fill="#ffd0d8" />
    <path d="M32 34.4 L29.8 38.6 L32 38 L34.2 38.6Z" fill="#2a1418" {...s} strokeWidth={0.9} />
    <path d="M24.6 41.4 L39.4 41.4" stroke={OL} strokeWidth={1} strokeLinecap="round" />
    <path d="M27.6 41.4 L27.6 47 M30.4 41.4 L30.4 47.4 M33.6 41.4 L33.6 47.4 M36.4 41.4 L36.4 47" stroke={OL} strokeWidth={0.9} strokeLinecap="round" />
  </g>
);

const dragon: Emblem = (p) => (
  <g>
    <defs>
      <LG id={`${p}-scale`} x1={0.2} y1={0} x2={0.8} y2={1} stops={[[0, '#a8ff8a'], [0.45, '#22b04a'], [1, '#0a4a24']]} />
      <LG id={`${p}-belly`} stops={[[0, '#fff2b0'], [1, '#e0a63a']]} />
      <LG id={`${p}-hornc`} x1={1} y1={1} x2={0} y2={0} stops={[[0, '#fff2d0'], [1, '#a88a5a']]} />
      <RG id={`${p}-eye`} stops={[[0, '#fffbd0'], [0.5, '#ffd21f'], [1, '#e06a00']]} />
      <RG id={`${p}-fire`} cx={0.75} cy={0.45} stops={[[0, '#ffb21f', 0.6], [1, '#ff3d1f', 0]]} />
    </defs>
    <circle cx={C} cy={C} r={FIELD_R} fill={`url(#${p}-fire)`} />
    {/* back horns */}
    <path d="M24.6 22.4 C20 16.6 16 13 10.4 12 C14.4 15.6 17.4 20 19.4 25.6Z" fill={`url(#${p}-hornc)`} {...s} strokeWidth={1.3} />
    <path d="M29 20.4 C27 14.6 24.6 11.4 20.4 9.4 C22.6 12.6 24 16.6 24.4 21.4Z" fill={`url(#${p}-hornc)`} {...s} strokeWidth={1.2} />
    {/* neck frill spikes */}
    <path d="M17.4 28 L11 29.4 L16.4 32.4 L10 35.4 L16 37.4 L10.4 41.8 L16.4 42.6Z" fill="#c2203a" {...s} strokeWidth={1.1} />
    {/* head */}
    <path
      d="M16 54 C15 41 17 27.6 24.6 21.6 C28 19.2 32 19.4 35.6 20.6 C40 22 44.4 23.6 49.6 25.4 C52.2 26.4 52.6 29.6 50.4 31 L41 32.2 L48.6 35.4 C47.6 38.8 41.4 40.4 35.6 39.2 C31.4 41.6 29.6 47 29.6 54Z"
      fill={`url(#${p}-scale)`}
      {...s}
      strokeWidth={1.6}
    />
    {/* mouth interior */}
    <path d="M41 32.2 L48.6 35.4 C46 36 43 35.2 41 32.2Z" fill="#7a0a1e" />
    {/* teeth */}
    <path d="M43.4 31.9 L44.2 33.6 L45 31.7 M46.4 31.5 L47 33 L47.8 31.3 M44 34 L44.8 32.6 L45.6 34.7" fill="#ffffff" stroke={OL} strokeWidth={0.4} strokeLinejoin="round" />
    {/* belly plates */}
    <path d="M22 54 C22 46 24.4 41.6 28.8 39.6 C30.6 42.4 30 48 30 54Z" fill={`url(#${p}-belly)`} {...s} strokeWidth={1} />
    <path d="M23.6 47.4 L29.6 47.4 M23 50.6 L29.8 50.6 M24.8 44.2 L29.8 44.2" stroke="#b07a20" strokeWidth={0.7} strokeLinecap="round" />
    {/* scales */}
    <g fill="none" stroke="#0a4a24" strokeWidth={0.6} strokeLinecap="round" opacity={0.8}>
      <path d="M19.6 34 a2 2 0 0 0 4 0 M22.6 38 a2 2 0 0 0 4 0 M19 41.6 a2 2 0 0 0 4 0 M18.6 46 a2 2 0 0 0 4 0 M23 30 a2 2 0 0 0 4 0" />
    </g>
    {/* brow ridge + eye */}
    <path d="M30.6 22.6 C33.6 21.6 37 22.4 39 24.4" stroke={OL} strokeWidth={1.3} strokeLinecap="round" fill="none" />
    <path d="M32.2 26.6 C33 24.4 36.6 24 38 26 C36.6 28 33.6 28.4 32.2 26.6Z" fill={`url(#${p}-eye)`} {...s} strokeWidth={0.9} />
    <ellipse cx={35.2} cy={26.2} rx={0.5} ry={1.4} fill={OL} />
    <circle cx={46.6} cy={27.4} r={0.7} fill={OL} />
    {/* whisker */}
    <path d="M48.8 30.8 C52.6 33 53 38.6 49.4 42.6 C47.6 44.6 47.8 47 49.6 48.6" stroke="#ffd23f" strokeWidth={0.9} strokeLinecap="round" fill="none" />
    <path d="M27 23.6 C31 22 38 22.6 47 25.4" stroke="#d6ffc0" strokeWidth={0.9} strokeLinecap="round" fill="none" opacity={0.8} />
    <Glint x={46} y={16} s={1.8} color="#ffe9a0" />
  </g>
);

const atom: Emblem = (p) => {
  const orbit = (a: number, t: number) => {
    const x = C + 19 * Math.cos(t);
    const y = C + 6.6 * Math.sin(t);
    return (
      <g key={a} transform={`rotate(${a} 32 32)`}>
        <ellipse cx={C} cy={C} rx={19} ry={6.6} fill="none" stroke={OL} strokeWidth={3.2} />
        <ellipse cx={C} cy={C} rx={19} ry={6.6} fill="none" stroke="#1fb6ff" strokeWidth={1.9} />
        <ellipse cx={C} cy={C} rx={19} ry={6.6} fill="none" stroke="#e6fbff" strokeWidth={0.6} />
        <circle cx={f(x)} cy={f(y)} r={2.6} fill={OL} />
        <circle cx={f(x)} cy={f(y)} r={2} fill={`url(#${p}-el)`} />
      </g>
    );
  };
  const nucleons: [number, number, 'p' | 'n'][] = [
    [0, 0, 'p'],
    [3.1, -1.6, 'n'],
    [-3.1, -1.6, 'n'],
    [0, 3.4, 'p'],
    [2.9, 2.2, 'n'],
    [-2.9, 2.2, 'p'],
    [0, -3.6, 'p'],
  ];
  return (
    <g>
      <defs>
        <RG id={`${p}-glow`} stops={[[0, '#5fd8ff', 0.6], [1, '#5fd8ff', 0]]} />
        <RG id={`${p}-pr`} fx={0.35} fy={0.3} stops={[[0, '#ffd0d8'], [0.5, '#ff3d64'], [1, '#7a0022']]} />
        <RG id={`${p}-nu`} fx={0.35} fy={0.3} stops={[[0, '#d8e6ff'], [0.5, '#4d7cff'], [1, '#0f2a7a']]} />
        <RG id={`${p}-el`} fx={0.35} fy={0.3} stops={[[0, '#ffffff'], [0.5, '#9ff0ff'], [1, '#1fa0e0']]} />
      </defs>
      <Stars seed={41} count={14} color="#cfefff" />
      <circle cx={C} cy={C} r={12} fill={`url(#${p}-glow)`} />
      {orbit(0, 0.5)}
      {orbit(60, 2.6)}
      {orbit(120, 4.4)}
      <circle cx={C} cy={C} r={7.6} fill={OL} />
      {nucleons.map(([dx, dy, k], i) => (
        <circle key={i} cx={C + dx} cy={C + dy} r={2.7} fill={`url(#${p}-${k === 'p' ? 'pr' : 'nu'})`} stroke={OL} strokeWidth={0.5} />
      ))}
      <Glint x={29.4} y={28.6} s={1.8} />
    </g>
  );
};

const milkyWay: Emblem = (p) => (
  <g>
    <defs>
      <LG id={`${p}-sky`} stops={[[0, '#03061a'], [0.55, '#14235a'], [0.82, '#3d4f8f'], [1, '#e08aa8']]} />
      <LG id={`${p}-ridge1`} stops={[[0, '#2a3466'], [1, '#141a38']]} />
      <LG id={`${p}-ridge2`} stops={[[0, '#0e1228'], [1, '#05060f']]} />
      <RG id={`${p}-band`} stops={[[0, '#fff3e6', 0.85], [0.28, '#f2c8ff', 0.6], [0.6, '#7d6af0', 0.32], [1, '#3a2a9a', 0]]} />
      <RG id={`${p}-bulge`} stops={[[0, '#ffffff', 0.95], [0.4, '#ffe0b8', 0.7], [1, '#ff9ad0', 0]]} />
    </defs>
    <rect x={8} y={8} width={48} height={48} fill={`url(#${p}-sky)`} />
    {/* the band, diagonal across the dome: an elliptical radial glow with a dark dust lane */}
    <g transform="rotate(-38 32 30)">
      <ellipse cx={C} cy={30} rx={34} ry={10} fill={`url(#${p}-band)`} />
      <ellipse cx={30} cy={30} rx={13} ry={4.2} fill={`url(#${p}-bulge)`} />
      <path
        d="M2 30.6 C10 29.4 16 31.8 22 30.4 C27 29.2 31 31.6 36 30.8 C42 29.8 48 31.6 62 30.2 L62 31.4 C48 32.8 42 31.4 36 32.2 C31 33 27 30.8 22 31.8 C16 33 10 30.8 2 31.8Z"
        fill="#0a0f2a"
        opacity={0.7}
      />
      {[
        [8, 28.4], [10, 31.8], [12.6, 26.8], [14, 30], [15.6, 33.2], [18, 28], [19.6, 31], [21, 33.4], [23, 27.2], [24.6, 29.6],
        [26, 32.6], [28, 27.8], [29.4, 30], [31, 33], [33, 28.2], [34.6, 34], [36, 27], [37.6, 29.4], [39, 32.8], [41, 28],
        [42.6, 31.6], [44, 26.6], [45.6, 33], [47, 29.2], [49, 31.6], [50.6, 27.4], [52, 30.4], [54, 32.6], [56, 28.6], [58, 31],
      ].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={i % 4 === 0 ? 0.7 : 0.38} fill={i % 5 === 0 ? '#ffe2c4' : '#ffffff'} />
      ))}
    </g>
    <Stars seed={57} count={22} color="#ffffff" minR={0.25} maxR={0.6} />
    <Glint x={18} y={17} s={1.8} color="#ffffff" />
    <Glint x={46} y={40} s={1.3} color="#ffeedd" />
    {/* far ridge */}
    <path d="M8 46 L16 40 L21 43 L28 36.6 L35 42 L41 38.4 L48 43 L56 39 L56 60 L8 60Z" fill={`url(#${p}-ridge1)`} stroke={OL} strokeWidth={0.8} strokeLinejoin="round" />
    <path d="M28 36.6 L26 38.6 L28.4 38 L30 39.2Z" fill="#c9d4ff" opacity={0.8} />
    {/* near ridge with pines */}
    <path d="M8 50 C16 46 24 47.6 32 49 C40 50.4 48 46.4 56 48 L56 60 L8 60Z" fill={`url(#${p}-ridge2)`} stroke={OL} strokeWidth={0.8} />
    {[
      [17, 47.2, 1],
      [20.4, 47.6, 0.8],
      [43, 47.6, 1.1],
      [46.6, 47, 0.85],
    ].map(([x, y, k], i) => (
      <polygon key={i} points={pts([[x ?? 0, (y ?? 0) - 6 * (k ?? 1)], [(x ?? 0) + 2 * (k ?? 1), y ?? 0], [(x ?? 0) - 2 * (k ?? 1), y ?? 0]])} fill="#05060f" />
    ))}
    {/* a tiny lit tent */}
    <polygon points="30,51 32.6,47.4 35.2,51" fill="#ffb85a" stroke={OL} strokeWidth={0.5} strokeLinejoin="round" />
    <polygon points="32.2,51 32.6,48.8 33,51" fill="#fff2c4" />
  </g>
);

/* ─── registry ───────────────────────────────────────────────────────────── */

const BADGES: Record<string, BadgeDef> = {
  'badge.star': { rarity: 'common', field: ['#3557d6', '#101c5a'], rim: ['#ffe58a', '#f0b020', '#8a5200'], emblem: star },
  'badge.newcomer': { rarity: 'common', field: ['#c8f1ff', '#4aa6d6'], rim: ['#b8f59a', '#3fae3f', '#165c1e'], emblem: newcomer },
  'badge.fire': { rarity: 'common', field: ['#5a1020', '#14040a'], rim: ['#ffb27a', '#f05a1a', '#7a1a00'], emblem: fire },
  'badge.heart': { rarity: 'common', field: ['#6a1a5a', '#22061e'], rim: ['#ffc2de', '#ff4f9a', '#8a0a45'], emblem: heart },
  'badge.bolt': { rarity: 'rare', field: ['#5a2ab0', '#140630'], rim: ['#c2f4ff', '#2fc6ff', '#0a4a7a'], emblem: bolt },
  'badge.crown': { rarity: 'epic', field: ['#2a4fb8', '#0a1640'], rim: GOLD, emblem: crown },
  'badge.diamond': { rarity: 'epic', field: ['#156a7c', '#03161c'], rim: GOLD, emblem: diamond },
  'badge.galaxy': { rarity: 'legendary', field: ['#2a1260', '#06030f'], rim: GOLD, emblem: galaxy },
  'badge.x.sparkle': { rarity: 'common', field: ['#4a2aa0', '#120838'], rim: ['#e8d4ff', '#9a6bff', '#3a1480'], emblem: sparkle },
  'badge.x.rocket': { rarity: 'common', field: ['#2a6fd6', '#0a1a4a'], rim: ['#ffc2c2', '#e8303f', '#7a0a14'], emblem: rocket },
  'badge.x.clover': { rarity: 'common', field: ['#fff6c8', '#e2b440'], rim: ['#b8f59a', '#2f9e3a', '#0e5020'], emblem: clover },
  'badge.x.trophy': { rarity: 'uncommon', field: ['#1a7a8a', '#06262e'], rim: ['#a8f0ff', '#20a8c8', '#06404e'], emblem: trophy },
  'badge.x.game': { rarity: 'uncommon', field: ['#c23a9a', '#3a0a40'], rim: ['#ffc2f0', '#e04ac0', '#5a0a50'], emblem: game },
  'badge.x.crystal': { rarity: 'rare', field: ['#3a1470', '#0c0420'], rim: ['#f0c2ff', '#b44aff', '#4a0a80'], emblem: crystal },
  'badge.x.comet': { rarity: 'rare', field: ['#16285e', '#03071a'], rim: ['#ffd0a8', '#ff7a2a', '#7a2a00'], emblem: comet },
  'badge.x.unicorn': { rarity: 'epic', field: ['#c8b0ff', '#6a3ab8'], rim: GOLD, emblem: unicorn },
  'badge.x.skull': { rarity: 'epic', field: ['#4a0a16', '#0c0205'], rim: GOLD, emblem: skull },
  'badge.x.dragon': { rarity: 'legendary', field: ['#7a1a10', '#1a0404'], rim: GOLD, emblem: dragon },
  'badge.x.atom': { rarity: 'mythic', field: ['#0e3a64', '#020814'], rim: ROSE, emblem: atom },
  'badge.x.milky-way': { rarity: 'exotic', field: ['#14235a', '#03061a'], rim: GOLD, emblem: milkyWay },
};

export const BADGE_ART_IDS: readonly string[] = Object.freeze(Object.keys(BADGES));

export function hasBadgeArt(id: string | undefined | null): boolean {
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(BADGES, id);
}

export function BadgeArt({ id, size, className, title }: { id: string; size: number; className?: string; title?: string }) {
  const raw = useId();
  // The badge id is part of the prefix: two React roots (islands) both start their `useId` sequence at the same value,
  // so the id alone would let one badge's gradients resolve to another's. Two copies of one badge draw identically.
  const p = `ba${id.replace(/[^a-zA-Z0-9]/g, '')}${raw.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const def = hasBadgeArt(id) ? BADGES[id] : undefined;
  if (!def) return null;
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      <defs>
        <RG id={`${p}-field`} fx={0.4} fy={0.32} r={0.62} stops={[[0, def.field[0]], [1, def.field[1]]]} />
        <LG id={`${p}-inset`} stops={[[0, '#000000', 0.55], [0.5, '#000000', 0], [1, '#ffffff', 0.25]]} />
        <clipPath id={`${p}-clip`}>
          <circle cx={C} cy={C} r={FIELD_R} />
        </clipPath>
      </defs>
      <FrameBack p={p} rarity={def.rarity} rim={def.rim} />
      <circle cx={C} cy={C} r={FIELD_R} fill={`url(#${p}-field)`} />
      <g clipPath={`url(#${p}-clip)`}>
        {def.emblem(p)}
        {/* enamel dome: an inset shadow under the rim and a soft gloss */}
        <circle cx={C} cy={C} r={FIELD_R - 0.6} fill="none" stroke={`url(#${p}-inset)`} strokeWidth={1.6} />
        <path d="M14 24 C17 15.6 25 11.4 32 11.4 C24.6 13.6 18.6 18.4 16 26Z" fill="#ffffff" opacity={0.22} />
      </g>
    </svg>
  );
}
