/**
 * The Kowloon Knockout main-menu backdrop: a rain-soaked 1997 Hong Kong street
 * at night. Pure decoration (`aria-hidden`), static markup, no state.
 *
 * Layers, back to front: sky haze, a far and a near tenement skyline with lit
 * windows, neon sign boxes, slow rain, the street with two stick-fighter
 * silhouettes and their wet reflection. Every glow is stacked strokes or
 * box-shadows (no `filter`); the only motion is CSS (rain drift, haze drift),
 * defined in `kk-menu.css`.
 */

type Rng = () => number;

/** Tiny deterministic PRNG, so the skyline is the same on server and client. */
function seeded(seed: number): Rng {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

interface Tower {
  x: number;
  w: number;
  h: number;
  /** Which window pattern the tower wears. */
  win: number;
  /** An antenna mast, drawn only on some towers. */
  mast: number;
}

const SKY_W = 1600;
const SKY_H = 360;

function towers(seed: number, minW: number, maxW: number, minH: number, maxH: number): Tower[] {
  const rand = seeded(seed);
  const out: Tower[] = [];
  let x = -20;
  let i = 0;
  while (x < SKY_W + 20) {
    const w = Math.round(minW + rand() * (maxW - minW));
    const h = Math.round(minH + rand() * (maxH - minH));
    out.push({ x, w, h, win: i % 3, mast: rand() > 0.72 ? Math.round(14 + rand() * 30) : 0 });
    x += w + Math.round(rand() * 6);
    i += 1;
  }
  return out;
}

const FAR_TOWERS = towers(1997, 54, 118, 120, 300);
const NEAR_TOWERS = towers(631, 70, 150, 60, 190);

const SIGNS: { glyph: string; tone: 'pink' | 'cyan' | 'yellow' | 'purple'; pos: string }[] = [
  { glyph: '龙', tone: 'pink', pos: 'kk-sign--a' },
  { glyph: '酒', tone: 'cyan', pos: 'kk-sign--b' },
  { glyph: '武', tone: 'yellow', pos: 'kk-sign--c' },
  { glyph: '面', tone: 'cyan', pos: 'kk-sign--d' },
  { glyph: '港', tone: 'purple', pos: 'kk-sign--e' },
  { glyph: '夜', tone: 'pink', pos: 'kk-sign--f' },
];

/** One neon stroke: a wide dim halo, a mid body and a pale core. */
function Neon({ children, tone }: { children: React.ReactNode; tone: string }) {
  return (
    <g fill="none" strokeLinecap="round" strokeLinejoin="round" data-tone={tone}>
      <g className="kk-stroke-halo">{children}</g>
      <g className="kk-stroke-body">{children}</g>
      <g className="kk-stroke-core">{children}</g>
    </g>
  );
}

const PINK_PUNCH = (
  <>
    <circle cx="52" cy="34" r="13" />
    <path d="M52 47 L56 108" />
    <path d="M53 60 L33 74 L42 90" />
    <path d="M53 62 L84 52 L112 40" />
    <path d="M56 108 L84 136 L82 188" />
    <path d="M56 108 L34 146 L18 188" />
  </>
);

const GREEN_HIT = (
  <>
    <circle cx="70" cy="40" r="13" />
    <path d="M66 53 L54 112" />
    <path d="M64 64 L88 82 L92 66" />
    <path d="M64 64 L42 86 L50 100" />
    <path d="M54 112 L74 146 L72 188" />
    <path d="M54 112 L30 146 L24 188" />
  </>
);

const YELLOW_GUARD = (
  <>
    <circle cx="60" cy="40" r="13" />
    <path d="M60 53 L58 112" />
    <path d="M60 66 L82 82 L76 58" />
    <path d="M60 66 L40 84 L52 60" />
    <path d="M58 112 L80 150 L84 188" />
    <path d="M58 112 L38 150 L28 188" />
  </>
);

const STARBURST =
  '0,-22 3.4,-8.3 15.6,-15.6 8.3,-3.4 22,0 8.3,3.4 15.6,15.6 3.4,8.3 0,22 -3.4,8.3 -15.6,15.6 -8.3,3.4 -22,0 -8.3,-3.4 -15.6,-15.6 -3.4,-8.3';

function FightersLeft() {
  return (
    <>
      <g className="kk-tone-pink" transform="translate(30 0)">
        <Neon tone="pink">{PINK_PUNCH}</Neon>
      </g>
      <g className="kk-tone-green" transform="translate(150 0)">
        <Neon tone="green">{GREEN_HIT}</Neon>
      </g>
      <g transform="translate(176 48)">
        <polygon points={STARBURST} className="kk-burst" />
        <polygon points={STARBURST} className="kk-burst-core" transform="scale(.55)" />
      </g>
    </>
  );
}

function FightersRight() {
  return (
    <g className="kk-tone-yellow" transform="translate(6 0)">
      <Neon tone="yellow">{YELLOW_GUARD}</Neon>
    </g>
  );
}

function Skyline() {
  return (
    <svg
      className="kk-skyline"
      viewBox={`0 0 ${SKY_W} ${SKY_H}`}
      preserveAspectRatio="xMidYMax slice"
      focusable="false"
    >
      <defs>
        {[
          ['#FFC400', '#46E6FF', '#FF2E88'],
          ['#46E6FF', '#FF2E88', '#FFC400'],
          ['#FF2E88', '#FFC400', '#46E6FF'],
        ].map((c, i) => (
          <pattern key={i} id={`kk-win-${i}`} width="16" height="22" patternUnits="userSpaceOnUse">
            <rect x={2 + i * 3} y="3" width="3" height="4" fill={c[0]} opacity=".75" />
            <rect x={9 - i} y="10" width="3" height="4" fill={c[1]} opacity=".6" />
            <rect x={5 + i * 4} y="16" width="3" height="3" fill={c[2]} opacity=".5" />
          </pattern>
        ))}
      </defs>
      <g className="kk-skyline-far">
        {FAR_TOWERS.map((b, i) => (
          <g key={i}>
            <rect x={b.x} y={SKY_H - b.h} width={b.w} height={b.h} fill="#16092F" />
            {b.mast > 0 && (
              <rect
                x={b.x + b.w / 2 - 1}
                y={SKY_H - b.h - b.mast}
                width="2"
                height={b.mast}
                fill="#16092F"
              />
            )}
            <rect
              x={b.x + 4}
              y={SKY_H - b.h + 8}
              width={b.w - 8}
              height={b.h - 8}
              fill={`url(#kk-win-${b.win})`}
              opacity=".32"
            />
          </g>
        ))}
      </g>
      <g className="kk-skyline-near">
        {NEAR_TOWERS.map((b, i) => (
          <g key={i}>
            <rect x={b.x} y={SKY_H - b.h} width={b.w} height={b.h} fill="#0B0418" />
            <rect
              x={b.x + 6}
              y={SKY_H - b.h + 10}
              width={b.w - 12}
              height={b.h - 10}
              fill={`url(#kk-win-${(b.win + 1) % 3})`}
              opacity=".42"
            />
          </g>
        ))}
      </g>
    </svg>
  );
}

export default function MenuBackdrop() {
  return (
    <div className="kk-backdrop" aria-hidden="true">
      <div className="kk-sky" />
      <Skyline />

      {SIGNS.map((s) => (
        <div key={s.glyph} className={`kk-sign kk-sign--${s.tone} ${s.pos}`}>
          <span>{s.glyph}</span>
        </div>
      ))}

      <div className="kk-haze" />
      <div className="kk-rain kk-rain--far" />
      <div className="kk-rain kk-rain--near" />

      <div className="kk-street">
        <svg className="kk-fighters kk-fighters--left" viewBox="0 0 290 196" focusable="false">
          <FightersLeft />
        </svg>
        <svg className="kk-fighters kk-fighters--right" viewBox="0 0 120 196" focusable="false">
          <FightersRight />
        </svg>
        <div className="kk-street__mirror">
          <svg className="kk-fighters kk-fighters--left" viewBox="0 0 290 196" focusable="false">
            <FightersLeft />
          </svg>
          <svg className="kk-fighters kk-fighters--right" viewBox="0 0 120 196" focusable="false">
            <FightersRight />
          </svg>
        </div>
      </div>
    </div>
  );
}
