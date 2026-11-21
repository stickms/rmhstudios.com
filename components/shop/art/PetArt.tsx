/**
 * Shop pet art: one sticker-style character illustration per `PET` item in `lib/shop/catalog.ts`.
 *
 * Every pet is finished by `PaintFilter` (painterly.tsx): pastel, wobbly hand-drawn edges and oil-paint ridges.
 * This is a purchased picture, not site chrome, so it carries its own literal palette (like a playing
 * card or a brand mark): the colours below never follow the `--site-*` tokens. Everything is static
 * (Steel R5: no animation, no frame loop); the only SVG `filter` is the painted finish.
 * Every gradient and clip id is prefixed with a `useId()` value so any number of pets can share a page.
 *
 * Higher rarities get more flourish: uncommon pets are the plain character, rare ones add a prop or a
 * detail, epic ones add sparkles and a setting, and legendary, mythic and exotic add glow and ornament.
 */
import { useId, type ReactElement, type ReactNode } from 'react';
import { ART_VIEWBOX, PaintFilter } from './painterly';

/* ─── Shared style ──────────────────────────────────────────────────────── */

/** The one outline colour across the set: a dark plum that reads on light and dark grounds. */
const INK = '#2a2135';
/** Outline width in the 64-unit viewBox (≈0.75px at 24px, ≈3px at 96px). */
const SW = 2;

const O = {
  stroke: INK,
  strokeWidth: SW,
  strokeLinejoin: 'round',
  strokeLinecap: 'round',
} as const;

const THIN = {
  stroke: INK,
  strokeWidth: 1.2,
  strokeLinejoin: 'round',
  strokeLinecap: 'round',
  fill: 'none',
} as const;

type Stop = readonly [offset: number, color: string, opacity?: number];

interface K {
  /** A collision-free id for this instance. */
  id: (name: string) => string;
  /** `url(#…)` for that id. */
  url: (name: string) => string;
}

function Stops({ stops }: { stops: readonly Stop[] }) {
  return (
    <>
      {stops.map(([offset, color, opacity], i) => (
        <stop key={i} offset={offset} stopColor={color} stopOpacity={opacity ?? 1} />
      ))}
    </>
  );
}

function Lg({
  id,
  stops,
  x1 = 0,
  y1 = 0,
  x2 = 0,
  y2 = 1,
}: {
  id: string;
  stops: readonly Stop[];
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
}) {
  return (
    <linearGradient id={id} x1={x1} y1={y1} x2={x2} y2={y2}>
      <Stops stops={stops} />
    </linearGradient>
  );
}

function Rg({
  id,
  stops,
  cx = 0.5,
  cy = 0.5,
  r = 0.5,
  fx,
  fy,
}: {
  id: string;
  stops: readonly Stop[];
  cx?: number;
  cy?: number;
  r?: number;
  fx?: number;
  fy?: number;
}) {
  return (
    <radialGradient id={id} cx={cx} cy={cy} r={r} fx={fx ?? cx} fy={fy ?? cy}>
      <Stops stops={stops} />
    </radialGradient>
  );
}

/** Soft ground shadow. */
function Shadow({ cx = 32, cy = 59.5, rx = 16, o = 0.18 }: { cx?: number; cy?: number; rx?: number; o?: number }) {
  return <ellipse cx={cx} cy={cy} rx={rx} ry={rx * 0.17} fill="#1b1424" opacity={o} />;
}

/** A big glossy eye: gradient iris, a large catchlight up-right and a small one down-left. */
function Eye({ x, y, rx = 3.5, ry = 4.3, fill }: { x: number; y: number; rx?: number; ry?: number; fill: string }) {
  return (
    <g>
      <ellipse cx={x} cy={y} rx={rx} ry={ry} fill={fill} stroke={INK} strokeWidth={0.8} />
      <ellipse cx={x + rx * 0.28} cy={y - ry * 0.36} rx={rx * 0.46} ry={ry * 0.38} fill="#fff" />
      <circle cx={x - rx * 0.36} cy={y + ry * 0.44} r={rx * 0.22} fill="#fff" opacity={0.85} />
    </g>
  );
}

function Blush({ x, y, rx = 3, color = '#ff6f91', o = 0.45 }: { x: number; y: number; rx?: number; color?: string; o?: number }) {
  return <ellipse cx={x} cy={y} rx={rx} ry={rx * 0.58} fill={color} opacity={o} />;
}

/** A thick outlined stroke (tails, tentacles, limbs): the outline pass, then the fill pass. */
function Tube({ d, w, color, ow = SW }: { d: string; w: number; color: string; ow?: number }) {
  return (
    <g fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} stroke={INK} strokeWidth={w + ow * 2} />
      <path d={d} stroke={color} strokeWidth={w} />
    </g>
  );
}

/** A four-point twinkle. */
function Sparkle({ x, y, r, fill = '#ffd65c', line = true }: { x: number; y: number; r: number; fill?: string; line?: boolean }) {
  const d = `M${x} ${y - r}Q${x} ${y} ${x + r} ${y}Q${x} ${y} ${x} ${y + r}Q${x} ${y} ${x - r} ${y}Q${x} ${y} ${x} ${y - r}Z`;
  return <path d={d} fill={fill} stroke={line ? INK : 'none'} strokeWidth={0.8} strokeLinejoin="round" />;
}

/** White sheen on the upper-left of a head or body. */
function Sheen({ d, o = 0.45 }: { d: string; o?: number }) {
  return <path d={d} fill="#fff" opacity={o} />;
}

/* Shared silhouettes (the cat family). */
const CAT_BODY = 'M20 55C19 45 23 37 32 37C41 37 45 45 44 55Q44 57.5 41 57.5L23 57.5Q20 57.5 20 55Z';
const CAT_HEAD =
  'M14.5 27C14.5 17 22 12.5 32 12.5C42 12.5 49.5 17 49.5 27C49.5 31 48 33.5 51 35C46.5 40 40 41.5 32 41.5C24 41.5 17.5 40 13 35C16 33.5 14.5 31 14.5 27Z';
const CAT_EAR_L = 'M15.5 24Q13 11 16 7.5Q23 10 28.5 15Z';
const CAT_EAR_R = 'M48.5 24Q51 11 48 7.5Q41 10 35.5 15Z';
const CAT_EAR_IN_L = 'M17.6 19.5Q16.6 13 17.9 11Q22 13 25 15.5Z';
const CAT_EAR_IN_R = 'M46.4 19.5Q47.4 13 46.1 11Q42 13 39 15.5Z';
const HEAD_SHEEN = 'M19 22C20.5 16.5 26 14.5 32 14.5C26.5 16 22.5 19 21 24Z';

/* ─── The pets ──────────────────────────────────────────────────────────── */

/** Cat Companion (rare): blue-grey cat with a white muzzle, a red collar and a gold bell. */
function Cat(k: K) {
  return (
    <>
      <defs>
        <Lg id={k.id('fur')} stops={[[0, '#c3cde4'], [1, '#7886ad']]} />
        <Lg id={k.id('eye')} stops={[[0, '#14261c'], [1, '#3fae6e']]} />
        <Rg id={k.id('bell')} cx={0.38} cy={0.35} r={0.65} stops={[[0, '#fff3b0'], [0.5, '#ffc93c'], [1, '#c98a12']]} />
      </defs>
      <Shadow />
      <Tube d="M42 53C51 53 55 46 52 40C50.5 37 52 34 54.5 34.5" w={4.4} color="#8592b6" />
      <path d={CAT_BODY} fill={k.url('fur')} {...O} />
      <path d="M26.5 56C26 49 28.5 43 32 43C35.5 43 38 49 37.5 56Z" fill="#f4f6fb" />
      <path d="M21.5 40Q32 46 42.5 40L42.5 43.4Q32 49.4 21.5 43.4Z" fill="#e8505b" {...O} strokeWidth={1.4} />
      <ellipse cx={27} cy={56.3} rx={4} ry={2.6} fill="#f4f6fb" {...O} strokeWidth={1.6} />
      <ellipse cx={37} cy={56.3} rx={4} ry={2.6} fill="#f4f6fb" {...O} strokeWidth={1.6} />
      <path d={CAT_EAR_L} fill={k.url('fur')} {...O} />
      <path d={CAT_EAR_R} fill={k.url('fur')} {...O} />
      <path d={CAT_EAR_IN_L} fill="#ffb3c4" />
      <path d={CAT_EAR_IN_R} fill="#ffb3c4" />
      <path d={CAT_HEAD} fill={k.url('fur')} {...O} />
      <Sheen d={HEAD_SHEEN} />
      <g stroke="#66739a" strokeWidth={1.6} strokeLinecap="round">
        <path d="M32 14.6V18.4" />
        <path d="M27.6 15.2L28.6 18.2" />
        <path d="M36.4 15.2L35.4 18.2" />
      </g>
      <path d="M25 35.2C25 31.8 28.5 31.2 32 32.2C35.5 31.2 39 31.8 39 35.2C39 38.2 35.5 39.2 32 38.4C28.5 39.2 25 38.2 25 35.2Z" fill="#f6f7fb" />
      <Eye x={25} y={27.5} rx={3.7} ry={4.4} fill={k.url('eye')} />
      <Eye x={39} y={27.5} rx={3.7} ry={4.4} fill={k.url('eye')} />
      <path d="M30.2 32.4H33.8L32 34.4Z" fill="#ff8fa6" stroke={INK} strokeWidth={0.9} strokeLinejoin="round" />
      <path d="M29.2 35.3Q30.6 36.9 32 35.3Q33.4 36.9 34.8 35.3" {...THIN} />
      <Blush x={20.5} y={33} />
      <Blush x={43.5} y={33} />
      <g stroke={INK} strokeWidth={0.8} strokeLinecap="round" opacity={0.5}>
        <path d="M19.5 34.6L13.5 33.6" />
        <path d="M19.5 36.2L14 37.4" />
        <path d="M44.5 34.6L50.5 33.6" />
        <path d="M44.5 36.2L50 37.4" />
      </g>
      <circle cx={32} cy={46.4} r={2.7} fill={k.url('bell')} {...O} strokeWidth={1.3} />
      <path d="M30.4 47.2H33.6" stroke={INK} strokeWidth={0.9} strokeLinecap="round" />
    </>
  );
}

/** Baby Dragon (epic): chubby winged western hatchling still sitting in its eggshell. */
function BabyDragon(k: K) {
  return (
    <>
      <defs>
        <Lg id={k.id('skin')} stops={[[0, '#a6f2bd'], [1, '#36a872']]} />
        <Lg id={k.id('wing')} stops={[[0, '#ffc49a'], [1, '#ff7b6b']]} />
        <Lg id={k.id('belly')} stops={[[0, '#fff4d1'], [1, '#ffd27e']]} />
        <Lg id={k.id('shell')} stops={[[0, '#fffdf6'], [1, '#e4d6bd']]} />
        <Lg id={k.id('horn')} stops={[[0, '#fffaf0'], [1, '#e8cf9a']]} />
        <Lg id={k.id('eye')} stops={[[0, '#2a170c'], [1, '#e08d1a']]} />
      </defs>
      <Shadow rx={19} cy={60.3} />
      <path d="M22 40C17 34 11 28 7 21C8 26 7 30 4.5 33C8 33 10 34 11 36.5C13 36 15 37 16 39C18 38.6 20 39.4 22 40Z" fill={k.url('wing')} {...O} />
      <path d="M42 40C47 34 53 28 57 21C56 26 57 30 59.5 33C56 33 54 34 53 36.5C51 36 49 37 48 39C46 38.6 44 39.4 42 40Z" fill={k.url('wing')} {...O} />
      <g stroke={INK} strokeWidth={1} strokeLinecap="round" opacity={0.45}>
        <path d="M11 28.5L11 36.4" />
        <path d="M15.5 33L16 39" />
        <path d="M53 28.5L53 36.4" />
        <path d="M48.5 33L48 39" />
      </g>
      <Tube d="M42 50C50 50 55 46 54 40" w={4.4} color="#4cbd84" />
      <path d="M54 40.5L51.2 37.4L54.2 33.6L57.4 37.2Z" fill={k.url('wing')} {...O} strokeWidth={1.6} />
      <path d={CAT_BODY} fill={k.url('skin')} {...O} />
      <path d="M26 56C25 48 27.5 42 32 42C36.5 42 39 48 38 56Z" fill={k.url('belly')} />
      <g stroke="#d9a447" strokeWidth={1} fill="none" strokeLinecap="round">
        <path d="M27.4 46Q32 47.4 36.6 46" />
        <path d="M26.6 50Q32 51.4 37.4 50" />
      </g>
      <ellipse cx={25.5} cy={46.5} rx={2.7} ry={2.3} fill="#4cbd84" {...O} strokeWidth={1.5} />
      <ellipse cx={38.5} cy={46.5} rx={2.7} ry={2.3} fill="#4cbd84" {...O} strokeWidth={1.5} />
      <path
        d="M14 50L18 53.4L21 49.6L25 53.6L29 50L32 53.2L35.5 49.6L39 53.6L43 49.6L46 53.4L50 50C50 56.5 44 60 32 60C20 60 14 56.5 14 50Z"
        fill={k.url('shell')}
        {...O}
      />
      <circle cx={21} cy={56} r={1.4} fill="#9edbb6" />
      <circle cx={42} cy={55.4} r={1.8} fill="#9edbb6" />
      <circle cx={33} cy={57.6} r={1.1} fill="#9edbb6" />
      <path d="M21 16Q16.5 9.5 18.5 4Q23 8.5 26 13Z" fill={k.url('horn')} {...O} />
      <path d="M43 16Q47.5 9.5 45.5 4Q41 8.5 38 13Z" fill={k.url('horn')} {...O} />
      <path d="M28.5 12.5L32 7.5L35.5 12.5Z" fill={k.url('wing')} {...O} strokeWidth={1.6} />
      <path d="M16 22L8.5 17.5L10 25L15.5 27.5Z" fill={k.url('wing')} {...O} strokeWidth={1.6} />
      <path d="M48 22L55.5 17.5L54 25L48.5 27.5Z" fill={k.url('wing')} {...O} strokeWidth={1.6} />
      <ellipse cx={32} cy={25.5} rx={16.5} ry={14} fill={k.url('skin')} {...O} />
      <Sheen d="M18.5 21C20 15.5 25.5 13 31 13C26 15 22 18 20.5 23.5Z" />
      <ellipse cx={32} cy={32.5} rx={8.6} ry={5.2} fill="#cbf8d9" />
      <ellipse cx={29.6} cy={31.2} rx={0.9} ry={0.6} fill={INK} opacity={0.6} />
      <ellipse cx={34.4} cy={31.2} rx={0.9} ry={0.6} fill={INK} opacity={0.6} />
      <Eye x={24.5} y={25} rx={3.9} ry={4.7} fill={k.url('eye')} />
      <Eye x={39.5} y={25} rx={3.9} ry={4.7} fill={k.url('eye')} />
      <path d="M28.4 34.2Q32 37.2 35.6 34.2" {...THIN} />
      <path d="M33.5 35.2L34.3 37L35.1 34.6Z" fill="#fff" stroke={INK} strokeWidth={0.7} strokeLinejoin="round" />
      <Blush x={19.5} y={31} />
      <Blush x={44.5} y={31} />
      <Sparkle x={8} y={10} r={3.2} />
      <Sparkle x={57} y={11} r={2.4} />
      <Sparkle x={6} y={44} r={1.8} fill="#fff4c4" />
    </>
  );
}

/** Friendly Ghost (rare): a lavender sheet ghost, one arm waving, tongue out. */
function Ghost(k: K) {
  return (
    <>
      <defs>
        <Rg id={k.id('aura')} stops={[[0, '#b8a6ff', 0.45], [1, '#b8a6ff', 0]]} />
        <Rg id={k.id('sheet')} cx={0.36} cy={0.28} r={0.8} stops={[[0, '#ffffff'], [0.55, '#f1eeff'], [1, '#c4b8ff']]} />
        <Lg id={k.id('eye')} stops={[[0, '#1d1630'], [1, '#5b4a92']]} />
      </defs>
      <circle cx={32} cy={30} r={29} fill={k.url('aura')} />
      <Shadow rx={12} o={0.13} />
      <path d="M15 34C10 33 7 36 8 38.6C10 39.6 13 38.6 15.5 38Z" fill={k.url('sheet')} {...O} />
      <path d="M49 31C53 28 56 24.5 57.6 26C58.8 28.4 55 32.5 49.5 36Z" fill={k.url('sheet')} {...O} />
      <path
        d="M14 30C14 16 22 8 32 8C42 8 50 16 50 30L50 46C50 50 52 52 54.5 53C50.5 55.6 47 54.4 45 52C43 55.2 39 56 37 52.6C35 56.2 30.4 56.2 28.6 52.6C26.4 56 21.4 56 19.6 52C17 54.2 14 53.6 14 49Z"
        fill={k.url('sheet')}
        {...O}
      />
      <Sheen d="M19 23C20 15.5 25 11 30.5 10.4C25.5 13 22.4 17 21.6 23.4Z" o={0.95} />
      <Eye x={26} y={27} rx={3.7} ry={5} fill={k.url('eye')} />
      <Eye x={38} y={27} rx={3.7} ry={5} fill={k.url('eye')} />
      <path d="M28.4 33.4Q32 39.4 35.6 33.4Z" fill="#4a2747" stroke={INK} strokeWidth={1.2} strokeLinejoin="round" />
      <path d="M30.2 35.9Q32 34.6 33.8 35.9Q33.2 37.6 32 37.6Q30.8 37.6 30.2 35.9Z" fill="#ff7f9a" />
      <Blush x={21} y={33} />
      <Blush x={43} y={33} />
      <Sparkle x={9} y={14} r={2.2} fill="#e3dcff" />
      <Sparkle x={56} y={42} r={1.6} fill="#e3dcff" />
    </>
  );
}

/** Bot Buddy (rare): a round metal bot with a screen face, ear lights and a heart core. */
function Robot(k: K) {
  return (
    <>
      <defs>
        <Lg id={k.id('metal')} stops={[[0, '#f3f7fc'], [1, '#a2b2c8']]} />
        <Lg id={k.id('dark')} stops={[[0, '#8d9cb3'], [1, '#5e6c85']]} />
        <Lg id={k.id('screen')} stops={[[0, '#26305a'], [1, '#141a33']]} />
        <Lg id={k.id('teal')} stops={[[0, '#8af0ff'], [1, '#22b3cc']]} />
        <Rg id={k.id('glow')} stops={[[0, '#7cf2ff', 0.55], [1, '#7cf2ff', 0]]} />
        <Rg id={k.id('lens')} cx={0.45} cy={0.4} r={0.6} stops={[[0, '#f2ffff'], [0.55, '#8af0ff'], [1, '#2bbad3']]} />
        <Rg id={k.id('bulb')} cx={0.38} cy={0.35} r={0.65} stops={[[0, '#ffd1d6'], [0.5, '#ff5d6c'], [1, '#c22d44']]} />
      </defs>
      <Shadow rx={15} />
      <Tube d="M22 44C17 44.5 15 48 15.5 51.5" w={3.6} color="#c3cede" />
      <Tube d="M42 44C47 43 50 39 50.2 35" w={3.6} color="#c3cede" />
      <circle cx={15.5} cy={52.6} r={2.9} fill={k.url('teal')} {...O} strokeWidth={1.6} />
      <circle cx={50.3} cy={33.4} r={2.9} fill={k.url('teal')} {...O} strokeWidth={1.6} />
      <rect x={21} y={53} width={9} height={5} rx={2.4} fill={k.url('dark')} {...O} strokeWidth={1.6} />
      <rect x={34} y={53} width={9} height={5} rx={2.4} fill={k.url('dark')} {...O} strokeWidth={1.6} />
      <rect x={20.5} y={39.5} width={23} height={16} rx={6.5} fill={k.url('metal')} {...O} />
      <rect x={26.5} y={43.5} width={11} height={8} rx={2.6} fill="#d5deea" stroke={INK} strokeWidth={1.2} />
      <path d="M32 50.2C29.2 48.3 28.4 47 28.8 45.8C29.3 44.6 31 44.6 32 45.9C33 44.6 34.7 44.6 35.2 45.8C35.6 47 34.8 48.3 32 50.2Z" fill={k.url('bulb')} stroke={INK} strokeWidth={0.8} />
      <rect x={28.5} y={36} width={7} height={5} rx={1.2} fill={k.url('dark')} {...O} strokeWidth={1.6} />
      <path d="M32 13V7.5" stroke={INK} strokeWidth={2} strokeLinecap="round" />
      <circle cx={32} cy={5.6} r={3.1} fill={k.url('bulb')} {...O} strokeWidth={1.6} />
      <rect x={8.4} y={20.5} width={5} height={11} rx={2.2} fill={k.url('teal')} {...O} strokeWidth={1.6} />
      <rect x={50.6} y={20.5} width={5} height={11} rx={2.2} fill={k.url('teal')} {...O} strokeWidth={1.6} />
      <rect x={12} y={12.5} width={40} height={26.5} rx={11} fill={k.url('metal')} {...O} />
      <path d="M16.5 20C16.5 17 18.5 15.4 22 15.4H30" stroke="#fff" strokeWidth={1.7} strokeLinecap="round" opacity={0.9} fill="none" />
      <rect x={16.5} y={17.5} width={31} height={18} rx={7.5} fill={k.url('screen')} stroke={INK} strokeWidth={1.4} />
      <path d="M21 34L33 18.5H38.5L26.5 34Z" fill="#fff" opacity={0.07} />
      <ellipse cx={25.5} cy={25.5} rx={5.6} ry={6} fill={k.url('glow')} />
      <ellipse cx={38.5} cy={25.5} rx={5.6} ry={6} fill={k.url('glow')} />
      <ellipse cx={25.5} cy={25.5} rx={3.1} ry={3.9} fill={k.url('lens')} />
      <ellipse cx={38.5} cy={25.5} rx={3.1} ry={3.9} fill={k.url('lens')} />
      <circle cx={26.5} cy={24} r={1.1} fill="#fff" />
      <circle cx={39.5} cy={24} r={1.1} fill="#fff" />
      <path d="M28.6 30.4Q32 33.2 35.4 30.4" stroke="#8af0ff" strokeWidth={1.6} strokeLinecap="round" fill="none" />
      <ellipse cx={20.8} cy={30.4} rx={1.9} ry={1} fill="#ff86a6" opacity={0.85} />
      <ellipse cx={43.2} cy={30.4} rx={1.9} ry={1} fill="#ff86a6" opacity={0.85} />
    </>
  );
}

/** Fox (uncommon): orange fox bust and body with a white mask, dark socks and a white-tipped tail. */
function Fox(k: K) {
  const tail = 'M40 54C52 56.5 59 48 56.5 39.5C55.4 35.6 52.4 33.6 50 34.6C52.5 40.5 50 46.5 43 48.5Z';
  return (
    <>
      <defs>
        <Lg id={k.id('fur')} stops={[[0, '#ffad5e'], [1, '#e4642a']]} />
        <Lg id={k.id('eye')} stops={[[0, '#1d120d'], [1, '#9a521e']]} />
        <clipPath id={k.id('tail')}>
          <path d={tail} />
        </clipPath>
      </defs>
      <Shadow />
      <path d={tail} fill={k.url('fur')} />
      <g clipPath={k.url('tail')}>
        <ellipse cx={54.5} cy={36} rx={5.5} ry={6} fill="#fff6ea" />
      </g>
      <path d={tail} fill="none" {...O} />
      <path d={CAT_BODY} fill={k.url('fur')} {...O} />
      <path d="M26 41C26.5 48 29 51 32 51C35 51 37.5 48 38 41Z" fill="#fff6ea" />
      <ellipse cx={27} cy={56.3} rx={4} ry={2.6} fill="#4a3236" {...O} strokeWidth={1.6} />
      <ellipse cx={37} cy={56.3} rx={4} ry={2.6} fill="#4a3236" {...O} strokeWidth={1.6} />
      <path d="M17 23Q14 9.5 16.5 4.5Q24 8 28.5 15Z" fill={k.url('fur')} {...O} />
      <path d="M47 23Q50 9.5 47.5 4.5Q40 8 35.5 15Z" fill={k.url('fur')} {...O} />
      <path d="M18.8 19.5Q17.2 12 18.3 9Q22.6 11.5 25.2 15.2Z" fill="#fff0e0" />
      <path d="M45.2 19.5Q46.8 12 45.7 9Q41.4 11.5 38.8 15.2Z" fill="#fff0e0" />
      <path d="M16.5 4.5Q15.6 7 15.7 9.6Q18.3 9 20.4 7Q18.6 5.4 16.5 4.5Z" fill="#3a2a2e" />
      <path d="M47.5 4.5Q48.4 7 48.3 9.6Q45.7 9 43.6 7Q45.4 5.4 47.5 4.5Z" fill="#3a2a2e" />
      <path
        d="M14 25C14 17 22 13 32 13C42 13 50 17 50 25C50 28 52 31 54.5 33C48 35.5 42 41.5 32 42C22 41.5 16 35.5 9.5 33C12 31 14 28 14 25Z"
        fill={k.url('fur')}
        {...O}
      />
      <path
        d="M10.6 33.4C16 31 22 30.4 26 32.4C28 33.4 30 33.8 32 33.8C34 33.8 36 33.4 38 32.4C42 30.4 48 31 53.4 33.4C47.5 35.8 41.8 41 32 41.4C22.2 41 16.5 35.8 10.6 33.4Z"
        fill="#fff6ea"
      />
      <Sheen d="M18.5 21C20 16.5 25.5 15 31 15C26 16.5 22.5 19 21 23Z" />
      <Eye x={25} y={26} rx={3.5} ry={4.3} fill={k.url('eye')} />
      <Eye x={39} y={26} rx={3.5} ry={4.3} fill={k.url('eye')} />
      <ellipse cx={32} cy={33.4} rx={2.5} ry={1.8} fill="#2e2226" />
      <ellipse cx={31.4} cy={32.8} rx={0.9} ry={0.5} fill="#fff" opacity={0.8} />
      <path d="M29.5 36.2Q30.9 37.5 32 35.6Q33.1 37.5 34.5 36.2" {...THIN} />
      <Blush x={20.5} y={31.6} />
      <Blush x={43.5} y={31.6} />
    </>
  );
}

/** Panda (uncommon): round panda cub hugging a bamboo stalk. */
function Panda(k: K) {
  return (
    <>
      <defs>
        <Lg id={k.id('white')} stops={[[0, '#ffffff'], [1, '#d9dee8']]} />
        <Lg id={k.id('black')} stops={[[0, '#45424f'], [1, '#1c1b22']]} />
        <Lg id={k.id('eye')} stops={[[0, '#000000'], [1, '#4d4760']]} />
        <Lg id={k.id('bamboo')} x2={1} y2={0} stops={[[0, '#9be38a'], [1, '#4fa94a']]} />
      </defs>
      <Shadow />
      <path d={CAT_BODY} fill={k.url('white')} {...O} />
      <ellipse cx={25} cy={55} rx={5.6} ry={3.8} fill={k.url('black')} {...O} strokeWidth={1.6} />
      <ellipse cx={39} cy={55} rx={5.6} ry={3.8} fill={k.url('black')} {...O} strokeWidth={1.6} />
      <ellipse cx={25} cy={55.4} rx={2.2} ry={1.5} fill="#e8a3b4" />
      <ellipse cx={39} cy={55.4} rx={2.2} ry={1.5} fill="#e8a3b4" />
      <g transform="rotate(14 43 45)">
        <rect x={41} y={31} width={4.6} height={25} rx={2.2} fill={k.url('bamboo')} {...O} strokeWidth={1.6} />
        <path d="M41.2 39H45.4M41.2 47H45.4" stroke="#3f8a3c" strokeWidth={1.2} strokeLinecap="round" />
      </g>
      <path d="M45 33Q50 26.5 55.5 28.5Q51 34 45 33Z" fill="#7fd36f" {...O} strokeWidth={1.4} />
      <path d="M22 41.5C17.5 44.5 18.5 50.5 23 51.2C26.4 51.4 27.4 47.2 27.2 44Z" fill={k.url('black')} {...O} strokeWidth={1.6} />
      <path d="M41.5 40.5C46.5 42.5 47.6 47.4 44.4 49.2C41.2 50.4 37.8 48.2 37.8 45Z" fill={k.url('black')} {...O} strokeWidth={1.6} />
      <circle cx={18} cy={15} r={5.6} fill={k.url('black')} {...O} />
      <circle cx={46} cy={15} r={5.6} fill={k.url('black')} {...O} />
      <circle cx={18.6} cy={15.6} r={2.6} fill="#5a5664" />
      <circle cx={45.4} cy={15.6} r={2.6} fill="#5a5664" />
      <ellipse cx={32} cy={27} rx={17.5} ry={14.5} fill={k.url('white')} {...O} />
      <Sheen d={HEAD_SHEEN} o={0.9} />
      <ellipse cx={24.2} cy={27.6} rx={5} ry={6.4} transform="rotate(35 24.2 27.6)" fill={k.url('black')} />
      <ellipse cx={39.8} cy={27.6} rx={5} ry={6.4} transform="rotate(-35 39.8 27.6)" fill={k.url('black')} />
      <Eye x={25} y={27} rx={2.8} ry={3.3} fill={k.url('eye')} />
      <Eye x={39} y={27} rx={2.8} ry={3.3} fill={k.url('eye')} />
      <path d="M29.8 31.8Q32 31 34.2 31.8Q33.6 33.8 32 34.2Q30.4 33.8 29.8 31.8Z" fill="#22202a" />
      <path d="M29.5 35.6Q30.8 37 32 35.6Q33.2 37 34.5 35.6" {...THIN} />
      <Blush x={19.5} y={33.6} />
      <Blush x={44.5} y={33.6} />
    </>
  );
}

/** Penguin (uncommon): a round navy penguin with a heart-shaped white face, one flipper up. */
function Penguin(k: K) {
  return (
    <>
      <defs>
        <Lg id={k.id('navy')} stops={[[0, '#56679a'], [1, '#1f2742']]} />
        <Lg id={k.id('white')} stops={[[0, '#ffffff'], [1, '#dde4f0']]} />
        <Lg id={k.id('beak')} stops={[[0, '#ffc24d'], [1, '#f0861a']]} />
        <Lg id={k.id('eye')} stops={[[0, '#0f1220'], [1, '#3e4c7a']]} />
      </defs>
      <Shadow />
      <path d="M15 31C9.5 35 7 42 8.5 45.6C11 46 14.2 42 16 38.6Z" fill={k.url('navy')} {...O} />
      <path d="M49 30C54.5 27.5 58.5 23 59 20.5C56 19.8 52 23 48.4 26.8Z" fill={k.url('navy')} {...O} />
      <ellipse cx={26} cy={57} rx={4.6} ry={2.4} fill={k.url('beak')} {...O} strokeWidth={1.6} />
      <ellipse cx={38} cy={57} rx={4.6} ry={2.4} fill={k.url('beak')} {...O} strokeWidth={1.6} />
      <path d="M32 7C45 7 51 20 51 36C51 49.5 44 56 32 56C20 56 13 49.5 13 36C13 20 19 7 32 7Z" fill={k.url('navy')} {...O} />
      <path d="M32 17C28 13 18 14 18 25C18 30 20 33 20 38C20 48.5 25 53.5 32 53.5C39 53.5 44 48.5 44 38C44 33 46 30 46 25C46 14 36 13 32 17Z" fill={k.url('white')} />
      <Sheen d="M18 17C20 12 25 9 30 8.8C25.5 11 22 14 20 18.5Z" o={0.35} />
      <Eye x={26} y={25} rx={3} ry={3.8} fill={k.url('eye')} />
      <Eye x={38} y={25} rx={3} ry={3.8} fill={k.url('eye')} />
      <path d="M28.4 30Q32 28 35.6 30Q34 34 32 34.4Q30 34 28.4 30Z" fill={k.url('beak')} stroke={INK} strokeWidth={1.3} strokeLinejoin="round" />
      <path d="M29.6 30.8Q32 31.6 34.4 30.8" stroke="#b85f12" strokeWidth={0.8} fill="none" strokeLinecap="round" />
      <Blush x={22} y={31.2} />
      <Blush x={42} y={31.2} />
    </>
  );
}

/** Owl (rare): a caramel owl with a heart-shaped facial disc and amber eyes, perched on a branch. */
function Owl(k: K) {
  return (
    <>
      <defs>
        <Lg id={k.id('body')} stops={[[0, '#cf956a'], [1, '#8a5434']]} />
        <Lg id={k.id('wing')} stops={[[0, '#a06a46'], [1, '#6a3e26']]} />
        <Lg id={k.id('disc')} stops={[[0, '#fbe8cc'], [1, '#e8c294']]} />
        <Rg id={k.id('iris')} cx={0.5} cy={0.6} r={0.55} stops={[[0, '#ffe27a'], [0.7, '#ffb52e'], [1, '#e07a12']]} />
        <Lg id={k.id('branch')} stops={[[0, '#a06e48'], [1, '#6c4228']]} />
      </defs>
      <Shadow cy={61} rx={20} o={0.12} />
      <path d="M17.5 18L12 5.5L24.5 12Z" fill={k.url('body')} {...O} />
      <path d="M46.5 18L52 5.5L39.5 12Z" fill={k.url('body')} {...O} />
      <path d="M32 9C45 9 51 18 51 32C51 46 44 55 32 55C20 55 13 46 13 32C13 18 19 9 32 9Z" fill={k.url('body')} {...O} />
      <ellipse cx={32} cy={44} rx={10.5} ry={9.6} fill="#f2d5ab" />
      <g stroke="#b47c50" strokeWidth={1.2} fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="M26.5 40L28 41.4L29.5 40" />
        <path d="M34.5 40L36 41.4L37.5 40" />
        <path d="M30.5 45L32 46.4L33.5 45" />
        <path d="M26.5 49.4L28 50.8L29.5 49.4" />
        <path d="M34.5 49.4L36 50.8L37.5 49.4" />
      </g>
      <path d="M14.4 30C10 38 12 48 19.5 53.5C21.5 46 21.5 38 18.4 31Z" fill={k.url('wing')} {...O} />
      <path d="M49.6 30C54 38 52 48 44.5 53.5C42.5 46 42.5 38 45.6 31Z" fill={k.url('wing')} {...O} />
      <g stroke="#4f2d1b" strokeWidth={0.9} fill="none" strokeLinecap="round" opacity={0.7}>
        <path d="M15 40Q17 41 19 40" />
        <path d="M15.8 45Q17.8 46 19.8 45" />
        <path d="M49 40Q47 41 45 40" />
        <path d="M48.2 45Q46.2 46 44.2 45" />
      </g>
      <Sheen d="M18 19C20 14 25 11 30 10.8C25.5 13 22 16 20.5 20.5Z" o={0.35} />
      <path
        d="M32 20C28 15 15 15 15 26C15 33 21 37 27 36C29.5 35.8 31 35 32 34C33 35 34.5 35.8 37 36C43 37 49 33 49 26C49 15 36 15 32 20Z"
        fill={k.url('disc')}
        stroke={INK}
        strokeWidth={1.3}
        strokeLinejoin="round"
      />
      <circle cx={24.5} cy={26.4} r={6} fill={k.url('iris')} stroke={INK} strokeWidth={1.2} />
      <circle cx={39.5} cy={26.4} r={6} fill={k.url('iris')} stroke={INK} strokeWidth={1.2} />
      <circle cx={24.5} cy={26.8} r={3.7} fill="#1e1412" />
      <circle cx={39.5} cy={26.8} r={3.7} fill="#1e1412" />
      <circle cx={25.9} cy={25} r={1.6} fill="#fff" />
      <circle cx={40.9} cy={25} r={1.6} fill="#fff" />
      <circle cx={23.3} cy={28.4} r={0.7} fill="#fff" opacity={0.85} />
      <circle cx={38.3} cy={28.4} r={0.7} fill="#fff" opacity={0.85} />
      <path d="M29.8 31H34.2L32 35.4Z" fill="#f6b23c" stroke={INK} strokeWidth={1.2} strokeLinejoin="round" />
      <Blush x={18.6} y={33.4} rx={2.4} />
      <Blush x={45.4} y={33.4} rx={2.4} />
      <rect x={8} y={54} width={48} height={5} rx={2.5} fill={k.url('branch')} {...O} />
      <path d="M12 56.5H20M40 56.2H50" stroke="#4f2d1b" strokeWidth={0.9} strokeLinecap="round" opacity={0.6} />
      <path d="M9 54Q4 49 6 46Q11 49 10.5 54Z" fill="#7fc96f" {...O} strokeWidth={1.3} />
      <ellipse cx={27} cy={54.4} rx={3.4} ry={1.9} fill="#f6b23c" {...O} strokeWidth={1.3} />
      <ellipse cx={37} cy={54.4} rx={3.4} ry={1.9} fill="#f6b23c" {...O} strokeWidth={1.3} />
    </>
  );
}

/** Tiger Cub (rare): round-eared orange cub with stripes, white brows and blue cub eyes. */
function Tiger(k: K) {
  const tail = 'M42 53C51 54 56 48 54 41';
  return (
    <>
      <defs>
        <Lg id={k.id('fur')} stops={[[0, '#ffc066'], [1, '#ee7420']]} />
        <Lg id={k.id('eye')} stops={[[0, '#13203a'], [1, '#4aa8e6']]} />
      </defs>
      <Shadow />
      <Tube d={tail} w={4.6} color="#f59a3c" />
      <path d={tail} fill="none" stroke="#3a2630" strokeWidth={4.6} strokeDasharray="1.6 3.2" />
      <path d={CAT_BODY} fill={k.url('fur')} {...O} />
      <path d="M26.5 56C26 49 28.5 43 32 43C35.5 43 38 49 37.5 56Z" fill="#fffaf2" />
      <g stroke="#3a2630" strokeWidth={1.6} strokeLinecap="round" fill="none">
        <path d="M20.8 46Q23.5 46.6 24.6 48.6" />
        <path d="M20.4 50.6Q23 51 24.2 53" />
        <path d="M43.2 46Q40.5 46.6 39.4 48.6" />
        <path d="M43.6 50.6Q41 51 39.8 53" />
      </g>
      <ellipse cx={27} cy={56.3} rx={4} ry={2.6} fill="#fffaf2" {...O} strokeWidth={1.6} />
      <ellipse cx={37} cy={56.3} rx={4} ry={2.6} fill="#fffaf2" {...O} strokeWidth={1.6} />
      <circle cx={18.4} cy={15} r={5.8} fill={k.url('fur')} {...O} />
      <circle cx={45.6} cy={15} r={5.8} fill={k.url('fur')} {...O} />
      <circle cx={18.8} cy={15.6} r={3} fill="#fff1e0" />
      <circle cx={45.2} cy={15.6} r={3} fill="#fff1e0" />
      <path
        d="M13.5 27C13.5 17 22 12.5 32 12.5C42 12.5 50.5 17 50.5 27C50.5 30 50 32.5 52.6 34.6C47 39.6 40 41.6 32 41.6C24 41.6 17 39.6 11.4 34.6C14 32.5 13.5 30 13.5 27Z"
        fill={k.url('fur')}
        {...O}
      />
      <Sheen d={HEAD_SHEEN} />
      <g stroke="#3a2630" strokeWidth={1.8} strokeLinecap="round" fill="none">
        <path d="M32 13.2V18.2" />
        <path d="M27.4 14Q28.4 16 28 18.4" />
        <path d="M36.6 14Q35.6 16 36 18.4" />
        <path d="M14.2 24.6L18.6 25.6" />
        <path d="M13.8 28.6L18.2 28.8" />
        <path d="M49.8 24.6L45.4 25.6" />
        <path d="M50.2 28.6L45.8 28.8" />
      </g>
      <ellipse cx={24.4} cy={20.8} rx={2.6} ry={1.3} fill="#fffaf2" />
      <ellipse cx={39.6} cy={20.8} rx={2.6} ry={1.3} fill="#fffaf2" />
      <path d="M24.4 35.4C24.4 31.6 28.4 31 32 32C35.6 31 39.6 31.6 39.6 35.4C39.6 38.6 35.6 39.6 32 38.8C28.4 39.6 24.4 38.6 24.4 35.4Z" fill="#fffaf2" />
      <Eye x={25} y={27} rx={3.6} ry={4.3} fill={k.url('eye')} />
      <Eye x={39} y={27} rx={3.6} ry={4.3} fill={k.url('eye')} />
      <path d="M30 32.4H34L32 34.6Z" fill="#e5707e" stroke={INK} strokeWidth={0.9} strokeLinejoin="round" />
      <path d="M29.2 35.5Q30.6 37.1 32 35.5Q33.4 37.1 34.8 35.5" {...THIN} />
      <Blush x={20.5} y={33.2} />
      <Blush x={43.5} y={33.2} />
    </>
  );
}

/** Octopus (rare): a coral-pink octopus with curling tentacles, spots and a few bubbles. */
function Octopus(k: K) {
  const arms = [
    'M21 37C14 40 8 46 11 51.5C13 55 17.5 53.2 15.8 50.6',
    'M25.5 40C22.6 46.5 19.6 53 23.4 55.6C26.4 57.2 28.4 54.2 26.2 52.6',
    'M32 41C31.2 48 30.4 54.4 34 55.8C36.6 56.6 37.4 53.6 35.4 52.8',
    'M38.5 40C41.4 46.5 44.4 53 40.6 55.6C37.6 57.2 35.6 54.2 37.8 52.6',
    'M43 37C50 40 56 46 53 51.5C51 55 46.5 53.2 48.2 50.6',
  ];
  return (
    <>
      <defs>
        <Lg id={k.id('skin')} stops={[[0, '#ffa8cb'], [1, '#e2508f']]} />
        <Lg id={k.id('eye')} stops={[[0, '#2a0f22'], [1, '#8a2f68']]} />
      </defs>
      <Shadow rx={19} />
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        {arms.map((d, i) => (
          <path key={`o${i}`} d={d} stroke={INK} strokeWidth={9} />
        ))}
        {arms.map((d, i) => (
          <path key={`f${i}`} d={d} stroke="#ef72a8" strokeWidth={5} />
        ))}
      </g>
      <g fill="#ffe1ee">
        <circle cx={12.6} cy={48.6} r={0.9} />
        <circle cx={22.4} cy={52.4} r={0.9} />
        <circle cx={32.2} cy={52.2} r={0.9} />
        <circle cx={41.6} cy={52.4} r={0.9} />
        <circle cx={51.4} cy={48.6} r={0.9} />
      </g>
      <path d="M13 30C13 15 21 7 32 7C43 7 51 15 51 30C51 38.5 45 43.4 32 43.4C19 43.4 13 38.5 13 30Z" fill={k.url('skin')} {...O} />
      <Sheen d="M18 22C19 15 24 10.5 30 9.6C25 12.5 21.5 16.5 20.4 23Z" o={0.5} />
      <g fill="#ffd6e7" opacity={0.85}>
        <circle cx={40} cy={13.6} r={2.1} />
        <circle cx={44.6} cy={19.4} r={1.3} />
        <circle cx={36} cy={10.4} r={1} />
      </g>
      <Eye x={25} y={27} rx={3.6} ry={4.4} fill={k.url('eye')} />
      <Eye x={39} y={27} rx={3.6} ry={4.4} fill={k.url('eye')} />
      <path d="M29.4 33Q32 35.6 34.6 33" {...THIN} />
      <Blush x={20} y={32.6} />
      <Blush x={44} y={32.6} />
      <circle cx={54} cy={9} r={2.6} fill="#e9f8ff" fillOpacity={0.5} stroke="#5aa8d6" strokeWidth={1} />
      <circle cx={58.4} cy={3.6} r={1.5} fill="#e9f8ff" fillOpacity={0.5} stroke="#5aa8d6" strokeWidth={0.9} />
      <circle cx={53.4} cy={8.2} r={0.7} fill="#fff" />
    </>
  );
}

/** Dino (epic): a sky-blue long-necked sauropod with spots, a flower behind its ear and sparkles. */
function Dino(k: K) {
  const body = 'M21 46C21 39 27.5 35.5 35.5 35.5C44 35.5 50 40 50 46.5C50 53 44 56.5 35.5 56.5C27 56.5 21 53 21 46Z';
  return (
    <>
      <defs>
        <Lg id={k.id('skin')} stops={[[0, '#d2c2ff'], [1, '#8a68e6']]} />
        <Lg id={k.id('far')} stops={[[0, '#9a7ee6'], [1, '#6446bd']]} />
        <Lg id={k.id('eye')} stops={[[0, '#1a1233'], [1, '#6a4fc2']]} />
        <clipPath id={k.id('body')}>
          <path d={body} />
        </clipPath>
      </defs>
      <Shadow cx={36} rx={21} />
      <path d="M45 44C53 44 59 48.5 61.5 55.5C57 53.6 51 53.2 45 54Z" fill={k.url('skin')} {...O} />
      <rect x={25.5} y={49} width={7} height={9.2} rx={3} fill={k.url('far')} {...O} />
      <rect x={42} y={49} width={7} height={9.2} rx={3} fill={k.url('far')} {...O} />
      <path d="M23 46C18 37 15 29 16 21L27 20C27 28 30 34 35.5 38Z" fill={k.url('skin')} {...O} />
      <path d={body} fill={k.url('skin')} {...O} />
      <g clipPath={k.url('body')}>
        <ellipse cx={35.5} cy={57} rx={13} ry={5.2} fill="#fff0cf" />
      </g>
      <path d={body} fill="none" {...O} />
      <rect x={21.5} y={50} width={7.4} height={8.4} rx={3} fill={k.url('skin')} {...O} />
      <rect x={38} y={50} width={7.4} height={8.4} rx={3} fill={k.url('skin')} {...O} />
      <g fill="#ffffff" opacity={0.95}>
        <circle cx={23.6} cy={56.8} r={0.7} />
        <circle cx={26.6} cy={56.8} r={0.7} />
        <circle cx={40.1} cy={56.8} r={0.7} />
        <circle cx={43.1} cy={56.8} r={0.7} />
      </g>
      <g fill="#5a3cc0" opacity={0.4}>
        <circle cx={39} cy={40.4} r={2.3} />
        <circle cx={45} cy={43.4} r={1.6} />
        <circle cx={33.4} cy={42.4} r={1.3} />
        <circle cx={20.2} cy={31} r={1.4} />
        <circle cx={22.6} cy={36.6} r={1} />
      </g>
      <Sheen d="M25 41C27.5 38 31 37 35 37C31 38.6 28.5 40.4 27 43Z" o={0.5} />
      <ellipse cx={21.5} cy={16} rx={11} ry={9} fill={k.url('skin')} {...O} />
      <ellipse cx={21.5} cy={20.6} rx={7} ry={3.4} fill="#e9e0ff" opacity={0.8} />
      <Sheen d="M13.6 13.4C14.6 9.6 18 7.8 21.6 7.8C18.2 9.2 16 11.2 15.4 14.6Z" o={0.55} />
      <g transform="translate(31 8.6)">
        <circle cx={0} cy={-2.6} r={2} fill="#ff9cc4" {...O} strokeWidth={0.9} />
        <circle cx={2.5} cy={-0.8} r={2} fill="#ff9cc4" {...O} strokeWidth={0.9} />
        <circle cx={1.6} cy={2.1} r={2} fill="#ff9cc4" {...O} strokeWidth={0.9} />
        <circle cx={-1.6} cy={2.1} r={2} fill="#ff9cc4" {...O} strokeWidth={0.9} />
        <circle cx={-2.5} cy={-0.8} r={2} fill="#ff9cc4" {...O} strokeWidth={0.9} />
        <circle cx={0} cy={0} r={1.4} fill="#ffd84a" stroke={INK} strokeWidth={0.7} />
      </g>
      <ellipse cx={12.4} cy={13.2} rx={0.8} ry={0.5} fill={INK} opacity={0.55} />
      <Eye x={17.4} y={16} rx={2.8} ry={3.4} fill={k.url('eye')} />
      <Eye x={26.2} y={16} rx={2.8} ry={3.4} fill={k.url('eye')} />
      <path d="M18.8 20.6Q21.8 23 24.8 20.6" {...THIN} />
      <Blush x={13.4} y={20} rx={2.4} />
      <Blush x={29.8} y={20} rx={2.4} />
      <g fill="#ffd26a" stroke={INK} strokeWidth={1.2} strokeLinejoin="round">
        <path d="M36.6 36.4L38.4 33L40.6 36.2Z" />
        <path d="M42.4 37.8L44.6 34.8L46.4 38.6Z" />
        <path d="M47.2 41L49.8 38.8L50.8 42.8Z" />
      </g>
      <Sparkle x={52} y={18} r={3} />
      <Sparkle x={57.5} y={27} r={1.8} fill="#fff4c4" />
      <Sparkle x={7} y={36} r={2.2} />
    </>
  );
}

/** Whale (epic): a chubby blue whale blowing a spout, tail up, riding a little wave. */
function Whale(k: K) {
  const body = 'M8 40C8 28.5 18 22 30 22C42 22 52 30 52 41C52 49.5 44 54 30 54C17 54 8 49.5 8 40Z';
  return (
    <>
      <defs>
        <Lg id={k.id('skin')} stops={[[0, '#86ceff'], [1, '#356fd0']]} />
        <Lg id={k.id('belly')} stops={[[0, '#eef9ff'], [1, '#c2e3ff']]} />
        <Lg id={k.id('spout')} stops={[[0, '#ffffff'], [1, '#b8e6ff']]} />
        <Lg id={k.id('sea')} stops={[[0, '#8fdcff'], [1, '#3ea6ea']]} />
        <Lg id={k.id('eye')} stops={[[0, '#0c1830'], [1, '#2f62b0']]} />
        <clipPath id={k.id('body')}>
          <path d={body} />
        </clipPath>
      </defs>
      <path d="M46 42C52 40 55 34 55 28L59 29C59 37 55 45 48 48.5Z" fill={k.url('skin')} {...O} />
      <path d="M57 28.6C52.5 27 49.5 23 50 19C53 19.6 55.4 21.6 57 24C58.2 21 60.4 19 63 18.6C63.2 22.8 61.2 26.8 58 28.8Z" fill={k.url('skin')} {...O} />
      <path d={body} fill={k.url('skin')} />
      <g clipPath={k.url('body')}>
        <ellipse cx={27} cy={54} rx={21} ry={9.6} fill={k.url('belly')} />
        <g stroke="#9cc6ea" strokeWidth={1} fill="none" strokeLinecap="round">
          <path d="M12 48Q27 51 44 47.4" />
          <path d="M14 51.4Q28 54.2 42 51" />
        </g>
      </g>
      <path d={body} fill="none" {...O} />
      <Sheen d="M14 31C17 26 23 24 29 24C23.5 26 19 28.5 16.4 33Z" o={0.5} />
      <path d="M36 43C38 48 42 50.5 46 50C44.6 46.4 40.6 43.6 36 43Z" fill="#2f63bc" {...O} strokeWidth={1.6} />
      <Eye x={19.5} y={37} rx={3} ry={3.7} fill={k.url('eye')} />
      <Eye x={31} y={37} rx={3} ry={3.7} fill={k.url('eye')} />
      <path d="M22.4 41.6Q25.2 44.2 28 41.6" {...THIN} />
      <Blush x={15} y={41.8} rx={2.6} />
      <Blush x={35.4} y={41.8} rx={2.6} />
      <path d="M28.6 22.4C28.8 18 29.8 15 30 11.6H32.4C32.6 15 33.6 18 33.8 22.4Z" fill={k.url('spout')} {...O} strokeWidth={1.5} />
      <path d="M31.2 12.4C27 8 21.6 8.6 19.4 12.2C23.4 11.2 27 12 31.2 13.8Z" fill={k.url('spout')} {...O} strokeWidth={1.5} />
      <path d="M31.2 12.4C35.4 8 40.8 8.6 43 12.2C39 11.2 35.4 12 31.2 13.8Z" fill={k.url('spout')} {...O} strokeWidth={1.5} />
      <circle cx={17.6} cy={16} r={1.3} fill="#d6f1ff" {...O} strokeWidth={1} />
      <circle cx={45} cy={15.6} r={1.3} fill="#d6f1ff" {...O} strokeWidth={1} />
      <path
        d="M3 55Q8 51 13 55Q18 59 23 55Q28 51 33 55Q38 59 43 55Q48 51 53 55Q58 59 61 55.4L61 58.4Q32 62.6 3 58.4Z"
        fill={k.url('sea')}
        {...O}
        strokeWidth={1.6}
      />
      <path d="M8 54.4Q10.4 53.2 12.4 54.6M28 54.4Q30.4 53.2 32.4 54.6M48 54.4Q50.4 53.2 52.4 54.6" stroke="#fff" strokeWidth={1.1} strokeLinecap="round" fill="none" opacity={0.85} />
      <Sparkle x={8} y={22} r={2.8} />
      <Sparkle x={51} y={6} r={2} fill="#fff4c4" />
    </>
  );
}

/** Wyrmling (legendary): a serpentine red eastern dragon with antlers and a golden mane, coiled on a cloud, holding a pearl. */
function Wyrmling(k: K) {
  const coil = 'M28 21C34 27 50 23.5 48 34C46 42 22 34.5 20 44C18.5 51.5 36 54 48 50.5';
  return (
    <g transform="translate(0 2.2)">
      <defs>
        <Lg id={k.id('scale')} stops={[[0, '#ff7563'], [1, '#c42638']]} />
        <Lg id={k.id('gold')} stops={[[0, '#ffe58a'], [1, '#f39a2a']]} />
        <Lg id={k.id('cloud')} stops={[[0, '#ffffff'], [1, '#d9e2ff']]} />
        <Rg id={k.id('pearl')} cx={0.4} cy={0.35} r={0.65} stops={[[0, '#ffffff'], [0.5, '#e4f3ff'], [1, '#a8b8ff']]} />
        <Rg id={k.id('halo')} stops={[[0, '#fff2b0', 0.75], [1, '#fff2b0', 0]]} />
        <Lg id={k.id('eye')} stops={[[0, '#1e0c06'], [1, '#d9781a']]} />
      </defs>
      <Shadow cy={59} rx={20} o={0.12} />
      <circle cx={53.4} cy={31.6} r={9.5} fill={k.url('halo')} />
      <path d="M47 50C52 46 56.2 47 58.4 44C58.4 49 56.4 52 53.4 53.2C55.4 55 58.2 55 60.4 54C57.4 58.4 52 58.6 48.4 54.4Z" fill={k.url('gold')} {...O} strokeWidth={1.6} />
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d={coil} stroke={INK} strokeWidth={11} />
        <path d={coil} stroke="#e8463f" strokeWidth={7} />
        <path d={coil} stroke={k.url('gold')} strokeWidth={2.8} />
        <path d={coil} stroke="#c97a1a" strokeWidth={2.8} strokeDasharray="0.5 2.3" opacity={0.75} />
      </g>
      <Tube d="M46.4 31.4L50.2 32.8" w={2.6} color="#e8463f" ow={1.6} />
      <circle cx={53.4} cy={31.6} r={4.4} fill={k.url('pearl')} {...O} strokeWidth={1.5} />
      <circle cx={52.1} cy={30.2} r={1.2} fill="#fff" />
      <Tube d="M23 45.6L17.2 49.2" w={2.6} color="#e8463f" ow={1.6} />
      <path d="M8 55.6C6 51.6 10 48.8 14 50.8C15 46.8 21 45.8 24 48.8C27 45.8 33 46.8 34 50.8C38 48.8 42 50.8 41 54.8C44 54.8 45 57.8 42 58.8L10 58.8C6 58.8 5 56.6 8 55.6Z" fill={k.url('cloud')} {...O} strokeWidth={1.7} />
      <path d="M17 54.6Q19.4 52.4 21.6 54.4M29 54.2Q31.4 52 33.6 54" stroke="#9fb0e6" strokeWidth={1.1} fill="none" strokeLinecap="round" />
      <path d="M34 11C40 8.6 42.4 12 44.6 10C44 14.6 40.6 16.6 37.4 16.6C41 18 43.4 20.6 44.6 19.8C42.8 24 38.4 24.2 35.4 21Z" fill={k.url('gold')} {...O} strokeWidth={1.5} />
      <path d="M15 11C9.6 9.6 7.6 12.4 5.6 11C6.6 15 9.6 16.6 12.6 16.6Z" fill={k.url('gold')} {...O} strokeWidth={1.5} />
      <Tube d="M18.4 8.4C15.6 5 14.6 2.6 15.4 1.4M16.4 5L12.8 4.2" w={1.8} color="#ffd97a" ow={1.4} />
      <Tube d="M30.6 8.4C33.4 5 34.4 2.6 33.6 1.4M32.6 5L36.2 4.2" w={1.8} color="#ffd97a" ow={1.4} />
      <path d="M13 16.5C13 10 18 6 24.5 6C31 6 36 10 36 16.5C36 21.5 31.6 25.4 24.5 25.4C17.4 25.4 13 21.5 13 16.5Z" fill={k.url('scale')} {...O} />
      <Sheen d="M16.4 13.4C17.4 9.6 20.6 7.8 24.4 7.8C21 9.2 18.8 11.2 18.2 14.6Z" o={0.45} />
      <ellipse cx={24.5} cy={21.2} rx={6.6} ry={3.6} fill="#ffc2a8" />
      <path d="M22.2 19.8Q21.6 18.8 22.6 18.6M26.8 19.8Q27.4 18.8 26.4 18.6" stroke={INK} strokeWidth={0.9} fill="none" strokeLinecap="round" />
      <path d="M17 11.2Q19.6 9.4 22.2 10.8M26.8 10.8Q29.4 9.4 32 11.2" stroke="#ffd97a" strokeWidth={1.6} fill="none" strokeLinecap="round" />
      <Eye x={20.4} y={14.6} rx={2.8} ry={3.4} fill={k.url('eye')} />
      <Eye x={28.6} y={14.6} rx={2.8} ry={3.4} fill={k.url('eye')} />
      <path d="M22.4 22.6Q24.5 24.2 26.6 22.6" {...THIN} />
      <Tube d="M18.4 21C12.6 22.4 8.4 20.4 6.8 16.4" w={1.3} color="#ffd97a" ow={1.1} />
      <Tube d="M30.6 21C34.6 22.6 37.4 21.4 38.8 18.6" w={1.3} color="#ffd97a" ow={1.1} />
      <Blush x={16.6} y={19.4} rx={2.2} />
      <Blush x={32.4} y={19.4} rx={2.2} />
      <Sparkle x={57} y={10} r={3} />
      <Sparkle x={6} y={30} r={2.4} />
      <Sparkle x={58.6} y={21} r={1.5} fill="#fff4c4" />
      <Sparkle x={4} y={44} r={1.4} fill="#fff4c4" />
    </g>
  );
}

/** Fairy (mythic): a chibi fairy with pink-lavender hair, iridescent wings, a petal dress and a star wand. */
function Fairy(k: K) {
  return (
    <>
      <defs>
        <Rg id={k.id('halo')} stops={[[0, '#fff3c2', 0.85], [0.6, '#ffd9f2', 0.35], [1, '#ffd9f2', 0]]} />
        <Lg id={k.id('wing')} x1={0} y1={0} x2={1} y2={1} stops={[[0, '#c6f3ff', 0.92], [0.5, '#e6cbff', 0.88], [1, '#fff0b8', 0.9]]} />
        <Lg id={k.id('skin')} stops={[[0, '#ffe6d6'], [1, '#f6bea4']]} />
        <Lg id={k.id('hair')} stops={[[0, '#ffa6d8'], [1, '#a77aff']]} />
        <Lg id={k.id('dress')} stops={[[0, '#9ff3dc'], [1, '#3fbcc4']]} />
        <Lg id={k.id('star')} stops={[[0, '#fff3a6'], [1, '#ffbe2e']]} />
        <Lg id={k.id('eye')} stops={[[0, '#22123a'], [1, '#8d5ce6']]} />
      </defs>
      <circle cx={32} cy={30} r={29} fill={k.url('halo')} />
      <Shadow rx={11} o={0.12} />
      <g stroke={INK} strokeWidth={1.4} strokeLinejoin="round" fill={k.url('wing')}>
        <path d="M28 34C20 23 8 15 4.6 21C2 27.4 12.4 36 27.4 37Z" />
        <path d="M28 38C20 39.4 10.6 45 12.4 50C14.4 54 23.4 48 29 40.6Z" />
        <path d="M36 34C44 23 56 15 59.4 21C62 27.4 51.6 36 36.6 37Z" />
        <path d="M36 38C44 39.4 53.4 45 51.6 50C49.6 54 40.6 48 35 40.6Z" />
      </g>
      <g stroke="#fff" strokeWidth={0.9} fill="none" strokeLinecap="round" opacity={0.85}>
        <path d="M26 34.4C20 29 13 23.6 8 21.6" />
        <path d="M26.4 39.6C22 42.6 17.6 45.4 14.6 48.4" />
        <path d="M38 34.4C44 29 51 23.6 56 21.6" />
        <path d="M37.6 39.6C42 42.6 46.4 45.4 49.4 48.4" />
      </g>
      <Tube d="M29.4 50.5L28.6 55.4" w={2.2} color="#f8c9b2" ow={1.3} />
      <Tube d="M34.6 50.5L35.4 55.4" w={2.2} color="#f8c9b2" ow={1.3} />
      <ellipse cx={28.2} cy={56.4} rx={2.2} ry={1.4} fill="#ff8ec6" {...O} strokeWidth={1.2} />
      <ellipse cx={35.8} cy={56.4} rx={2.2} ry={1.4} fill="#ff8ec6" {...O} strokeWidth={1.2} />
      <Tube d="M27 40.4L23.2 45.6" w={2.4} color="#f8c9b2" ow={1.4} />
      <path
        d="M24 52C24 46 27 38 32 38C37 38 40 46 40 52C38 53.6 36 51.6 34.6 53.2C33.4 54.2 30.6 54.2 29.4 53.2C28 51.6 26 53.6 24 52Z"
        fill={k.url('dress')}
        {...O}
        strokeWidth={1.6}
      />
      <path d="M28.6 44Q28 48.6 29.4 53M35.4 44Q36 48.6 34.6 53" stroke="#2f9aa3" strokeWidth={0.9} fill="none" strokeLinecap="round" />
      <Tube d="M37 40.4L42.6 35.8" w={2.4} color="#f8c9b2" ow={1.4} />
      <Tube d="M43 35.6L50 24.6" w={1.4} color="#fff2c9" ow={1.1} />
      <path
        d="M51 17.2L52.5 20.6L56.2 21L53.4 23.4L54.3 27L51 25.1L47.7 27L48.6 23.4L45.8 21L49.5 20.6Z"
        fill={k.url('star')}
        {...O}
        strokeWidth={1.2}
      />
      <path d="M18 24C18 13 25 8.4 32 8.4C39 8.4 46 13 46 24C46 30 44.4 34 42 36.6L22 36.6C19.6 34 18 30 18 24Z" fill={k.url('hair')} {...O} />
      <circle cx={32} cy={7.4} r={4.6} fill={k.url('hair')} {...O} />
      <path d="M20.6 23.4L15.6 21.4L20.4 28.4Z" fill={k.url('skin')} {...O} strokeWidth={1.4} />
      <path d="M43.4 23.4L48.4 21.4L43.6 28.4Z" fill={k.url('skin')} {...O} strokeWidth={1.4} />
      <ellipse cx={32} cy={25} rx={11} ry={10.4} fill={k.url('skin')} {...O} />
      <path d="M20.8 22C20.8 14.6 26 11.4 32 11.4C38 11.4 43.2 14.6 43.2 22C40.4 19 37.6 17.6 35.4 16.6C34 18.6 31 19.6 28 19C26 20.8 23.4 21.8 20.8 22Z" fill={k.url('hair')} stroke={INK} strokeWidth={1.4} strokeLinejoin="round" />
      <Sheen d="M24 13.8C26 12.4 28.6 11.8 31 11.8C28.4 13 26.4 14.4 25 16.4Z" o={0.6} />
      <g transform="translate(42.4 13.6)">
        <circle cx={0} cy={-2} r={1.7} fill="#fff" {...O} strokeWidth={0.8} />
        <circle cx={1.9} cy={-0.6} r={1.7} fill="#fff" {...O} strokeWidth={0.8} />
        <circle cx={1.2} cy={1.6} r={1.7} fill="#fff" {...O} strokeWidth={0.8} />
        <circle cx={-1.2} cy={1.6} r={1.7} fill="#fff" {...O} strokeWidth={0.8} />
        <circle cx={-1.9} cy={-0.6} r={1.7} fill="#fff" {...O} strokeWidth={0.8} />
        <circle cx={0} cy={0} r={1.1} fill="#ffcf3f" />
      </g>
      <Eye x={27.4} y={26} rx={2.8} ry={3.6} fill={k.url('eye')} />
      <Eye x={36.6} y={26} rx={2.8} ry={3.6} fill={k.url('eye')} />
      <path d="M24.4 23.4L23.2 22.4M39.6 23.4L40.8 22.4" stroke={INK} strokeWidth={1} strokeLinecap="round" />
      <path d="M30.4 30.6Q32 32 33.6 30.6" {...THIN} />
      <Blush x={24} y={29.8} rx={2.4} />
      <Blush x={40} y={29.8} rx={2.4} />
      <Sparkle x={8} y={8} r={3} />
      <Sparkle x={57} y={8} r={2} fill="#fff" />
      <Sparkle x={58} y={44} r={2.4} fill="#ffc6ec" />
      <Sparkle x={5} y={40} r={1.8} fill="#c9f0ff" />
      <Sparkle x={46} y={3.6} r={1.4} fill="#fff4c4" />
    </>
  );
}

/** Void Cat (exotic): a black cat whose body is a starry night, with glowing eyes and a ringed planet orbiting it. */
function VoidCat(k: K) {
  const ring = 'rotate(-12 32 44)';
  return (
    <>
      <defs>
        <Rg id={k.id('aura')} stops={[[0, '#8b5cff', 0.5], [0.7, '#5a3bd6', 0.18], [1, '#5a3bd6', 0]]} />
        <Rg id={k.id('cosmos')} cx={0.42} cy={0.38} r={0.75} stops={[[0, '#4a2c9c'], [0.55, '#21134d'], [1, '#0c0822']]} />
        <Rg id={k.id('nebula')} stops={[[0, '#ff5fd2', 0.55], [1, '#ff5fd2', 0]]} />
        <Rg id={k.id('nebula2')} stops={[[0, '#46d8ff', 0.45], [1, '#46d8ff', 0]]} />
        <Rg id={k.id('glow')} stops={[[0, '#fff59a', 0.75], [1, '#ffd23f', 0]]} />
        <Lg id={k.id('eye')} stops={[[0, '#fdffb8'], [1, '#7dffa6']]} />
        <Lg id={k.id('ring')} x2={1} y2={0} stops={[[0, '#9ad8ff'], [0.5, '#e7d6ff'], [1, '#ffb6e6']]} />
        <Rg id={k.id('planet')} cx={0.35} cy={0.35} r={0.7} stops={[[0, '#ffe1b0'], [1, '#ff7a6b']]} />
      </defs>
      <circle cx={32} cy={32} r={31} fill={k.url('aura')} />
      <Shadow rx={15} o={0.2} />
      <g transform={ring}>
        <path d="M4 44A28 7 0 0 1 60 44" fill="none" stroke={k.url('ring')} strokeWidth={1.8} strokeLinecap="round" opacity={0.75} />
      </g>
      <Tube d="M42 53C51 53 55 46 52 40C50.5 37 52 34 54.5 34.5" w={4.4} color="#24145a" />
      <Sparkle x={54.6} y={34.4} r={2.4} fill="#fff59a" />
      <path d={CAT_BODY} fill={k.url('cosmos')} {...O} />
      <ellipse cx={36} cy={48} rx={7} ry={5} fill={k.url('nebula')} />
      <ellipse cx={27} cy={52} rx={6} ry={4} fill={k.url('nebula2')} />
      <ellipse cx={27} cy={56.3} rx={4} ry={2.6} fill="#1a0f3d" {...O} strokeWidth={1.6} />
      <ellipse cx={37} cy={56.3} rx={4} ry={2.6} fill="#1a0f3d" {...O} strokeWidth={1.6} />
      <path d={CAT_EAR_L} fill={k.url('cosmos')} {...O} />
      <path d={CAT_EAR_R} fill={k.url('cosmos')} {...O} />
      <path d={CAT_EAR_IN_L} fill="#6b3fd0" />
      <path d={CAT_EAR_IN_R} fill="#6b3fd0" />
      <path d={CAT_HEAD} fill={k.url('cosmos')} {...O} />
      <ellipse cx={41} cy={19} rx={8} ry={5} fill={k.url('nebula')} />
      <ellipse cx={21} cy={36} rx={6} ry={4} fill={k.url('nebula2')} />
      <path d="M18.6 21.4C20.2 16.4 25.6 14 31.6 14" stroke="#b39bff" strokeWidth={1.2} fill="none" strokeLinecap="round" opacity={0.9} />
      <g fill="#ffffff">
        <circle cx={22} cy={18} r={0.6} />
        <circle cx={44} cy={23} r={0.5} />
        <circle cx={36} cy={16} r={0.7} />
        <circle cx={18} cy={30} r={0.5} />
        <circle cx={46} cy={31} r={0.6} />
        <circle cx={30} cy={40} r={0.5} />
        <circle cx={24} cy={46} r={0.6} />
        <circle cx={39} cy={52} r={0.5} />
        <circle cx={34} cy={44} r={0.6} />
        <circle cx={29} cy={54} r={0.4} />
      </g>
      <Sparkle x={41} y={47} r={1.6} fill="#fff" line={false} />
      <Sparkle x={28} y={17} r={1.3} fill="#fff" line={false} />
      <ellipse cx={25} cy={27.5} rx={6.4} ry={6.4} fill={k.url('glow')} />
      <ellipse cx={39} cy={27.5} rx={6.4} ry={6.4} fill={k.url('glow')} />
      <ellipse cx={25} cy={27.5} rx={3.7} ry={4.4} fill={k.url('eye')} stroke={INK} strokeWidth={0.8} />
      <ellipse cx={39} cy={27.5} rx={3.7} ry={4.4} fill={k.url('eye')} stroke={INK} strokeWidth={0.8} />
      <ellipse cx={25} cy={27.8} rx={1} ry={3.2} fill="#1a0f3d" />
      <ellipse cx={39} cy={27.8} rx={1} ry={3.2} fill="#1a0f3d" />
      <circle cx={26.2} cy={25.8} r={1.1} fill="#fff" />
      <circle cx={40.2} cy={25.8} r={1.1} fill="#fff" />
      <path d="M30.4 32.6H33.6L32 34.4Z" fill="#c9a8ff" stroke={INK} strokeWidth={0.8} strokeLinejoin="round" />
      <path d="M29.2 35.4Q30.6 37 32 35.4Q33.4 37 34.8 35.4" stroke="#c9a8ff" strokeWidth={1.1} fill="none" strokeLinecap="round" />
      <g stroke="#b39bff" strokeWidth={0.8} strokeLinecap="round" opacity={0.7}>
        <path d="M19.5 34.6L13.5 33.6" />
        <path d="M19.5 36.2L14 37.4" />
        <path d="M44.5 34.6L50.5 33.6" />
        <path d="M44.5 36.2L50 37.4" />
      </g>
      <Blush x={20.5} y={33} color="#ff5fd2" o={0.35} />
      <Blush x={43.5} y={33} color="#ff5fd2" o={0.35} />
      <g transform={ring}>
        <path d="M4 44A28 7 0 0 0 60 44" fill="none" stroke={k.url('ring')} strokeWidth={1.8} strokeLinecap="round" />
      </g>
      <circle cx={54} cy={44.6} r={3} fill={k.url('planet')} {...O} strokeWidth={1.2} />
      <Sparkle x={8} y={12} r={2.6} fill="#fff59a" />
      <Sparkle x={56} y={9} r={1.8} fill="#e7d6ff" />
      <circle cx={6} cy={28} r={0.8} fill="#e7d6ff" />
      <circle cx={59} cy={24} r={0.7} fill="#fff" />
    </>
  );
}

/* ─── Registry ──────────────────────────────────────────────────────────── */

const ART: Readonly<Record<string, (k: K) => ReactNode>> = {
  'pet.cat': Cat,
  'pet.dragon': BabyDragon,
  'pet.ghost': Ghost,
  'pet.robot': Robot,
  'pet.x.fox': Fox,
  'pet.x.panda': Panda,
  'pet.x.penguin': Penguin,
  'pet.x.owl': Owl,
  'pet.x.tiger': Tiger,
  'pet.x.octopus': Octopus,
  'pet.x.dino': Dino,
  'pet.x.whale': Whale,
  'pet.x.dragon2': Wyrmling,
  'pet.x.fairy': Fairy,
  'pet.x.void-cat': VoidCat,
};

/** Every pet id that has an illustration. */
export const PET_ART_IDS: readonly string[] = Object.keys(ART);

export function hasPetArt(id: string | undefined | null): boolean {
  return id != null && Object.prototype.hasOwnProperty.call(ART, id);
}

export function PetArt({
  id,
  size,
  className,
  title,
}: {
  id: string;
  size: number;
  className?: string;
  title?: string;
}): ReactElement | null {
  // The pet id is part of the prefix too, so two React roots (whose `useId` sequences both start at the
  // beginning) can only ever share an id between two copies of the same pet, which draw identically.
  const prefix = `pet-${id.replace(/[^a-zA-Z0-9]/g, '')}-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  if (!hasPetArt(id)) return null;
  const draw = ART[id];
  if (!draw) return null;
  const k: K = {
    id: (name) => `${prefix}-${name}`,
    url: (name) => `url(#${prefix}-${name})`,
  };
  return (
    <svg
      viewBox={ART_VIEWBOX}
      width={size}
      height={size}
      className={className}
      overflow="visible"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      focusable="false"
      xmlns="http://www.w3.org/2000/svg"
    >
      {title ? <title>{title}</title> : null}
      <defs>
        <PaintFilter id={k.id('paint')} seed={4} />
      </defs>
      <g filter={k.url('paint')}>{draw(k)}</g>
    </svg>
  );
}
