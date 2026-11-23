/**
 * Signal Forge backdrops: one drawn scene per act behind combat and the map, and the menu's forge.
 * Charred metal, copper circuit traces with solder pads, a far oscilloscope graticule and the forge's glow from
 * below. Static SVG; the embers (signal-forge.css `.sf-ember`) drift slowly and stop under Globe motion: Still.
 */
import { memo } from 'react';

type Scene = 'menu' | 1 | 2 | 3;

const TINT: Record<Scene, { ground: string; glow: string; trace: string; far: string }> = {
  menu: { ground: '#0E0B09', glow: '#FF6A1A', trace: '#7A4A26', far: '#3FD6F0' },
  1: { ground: '#0F0B08', glow: '#FF7A22', trace: '#7A4A26', far: '#FFB25A' },
  2: { ground: '#080C10', glow: '#2FB8D8', trace: '#3E6470', far: '#3FD6F0' },
  3: { ground: '#110707', glow: '#FF3B2A', trace: '#83402A', far: '#FFD08A' },
};

/** Deterministic pseudo-random so the traces are the same on every render. */
function prng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function traces(seed: number): Array<{ d: string; pads: Array<[number, number]> }> {
  const r = prng(seed);
  const out: Array<{ d: string; pads: Array<[number, number]> }> = [];
  for (let i = 0; i < 22; i++) {
    let x = Math.round(r() * 1600);
    let y = Math.round(500 + r() * 400);
    const pads: Array<[number, number]> = [[x, y]];
    let d = `M${x} ${y}`;
    for (let k = 0; k < 4; k++) {
      const horizontal = k % 2 === 0;
      const len = 40 + Math.round(r() * 160);
      if (horizontal) x += r() < 0.5 ? -len : len;
      else y += r() < 0.6 ? -len * 0.6 : len * 0.4;
      // 45-degree jog, the way a PCB router turns.
      d += ` L${x} ${y}`;
    }
    pads.push([x, y]);
    out.push({ d, pads });
  }
  return out;
}

export const Backdrop = memo(function Backdrop({ scene }: { scene: Scene }) {
  const t = TINT[scene];
  const seed = scene === 'menu' ? 7 : scene * 31;
  const lines = traces(seed);
  const id = `sf-bd-${scene}`;
  return (
    <div className="sf-backdrop" aria-hidden>
      <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" width="100%" height="100%">
        <defs>
          <radialGradient id={`${id}-glow`} cx="50%" cy="108%" r="70%">
            <stop offset="0%" stopColor={t.glow} stopOpacity={0.55} />
            <stop offset="45%" stopColor={t.glow} stopOpacity={0.14} />
            <stop offset="100%" stopColor={t.glow} stopOpacity={0} />
          </radialGradient>
          <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#000" />
            <stop offset="100%" stopColor={t.ground} />
          </linearGradient>
          <pattern id={`${id}-grid`} width="60" height="60" patternUnits="userSpaceOnUse">
            <path d="M60 0H0V60" fill="none" stroke={t.far} strokeOpacity={0.07} strokeWidth={1} />
          </pattern>
          <pattern id={`${id}-scan`} width="4" height="4" patternUnits="userSpaceOnUse">
            <rect width="4" height="1" fill="#000" opacity={0.22} />
          </pattern>
        </defs>
        <rect width="1600" height="900" fill={`url(#${id}-sky)`} />
        {/* The far oscilloscope: a graticule and one slow trace across the dark. */}
        <rect x="0" y="80" width="1600" height="420" fill={`url(#${id}-grid)`} />
        <path
          d={`M0 290 ${Array.from({ length: 33 }, (_, i) => {
            const x = i * 50;
            const y = 290 + Math.sin(i * 0.9 + seed) * (scene === 3 ? 70 : 46) * (i % 4 === 0 ? 1.3 : 1);
            return `L${x} ${Math.round(y)}`;
          }).join(' ')}`}
          fill="none"
          stroke={t.far}
          strokeOpacity={0.22}
          strokeWidth={3}
        />
        {/* Foundry silhouettes: stacks, girders, and in act 3 the forge heart. */}
        <g fill="#050403" opacity={0.92}>
          <path d="M0 640 V520 H70 V430 H110 V520 H180 V600 H260 V470 H300 V600 H380 V640 Z" />
          <path d="M1600 640 V500 H1530 V400 H1490 V500 H1420 V580 H1330 V450 H1290 V580 H1220 V640 Z" />
          {scene === 2 &&
            [420, 560, 1040, 1180].map((x) => (
              <g key={x}>
                <rect x={x} y={360} width={36} height={280} />
                {[380, 420, 460, 500, 540].map((y) => (
                  <ellipse key={y} cx={x + 18} cy={y} rx={40} ry={9} fill="none" stroke="#0B1A20" strokeWidth={8} />
                ))}
              </g>
            ))}
          {scene === 3 && <path d="M640 640 C640 470 700 380 800 340 C900 380 960 470 960 640 Z" />}
          {scene === 1 && <path d="M560 640 V540 L640 500 L720 540 V640 Z M880 640 V520 H1040 V640 Z" />}
        </g>
        {scene === 3 && <ellipse cx="800" cy="520" rx="70" ry="90" fill={t.glow} opacity={0.3} />}
        <rect width="1600" height="900" fill={`url(#${id}-glow)`} />
        {/* Copper traces and solder pads on the floor plate. */}
        <rect x="0" y="640" width="1600" height="260" fill="#0A0806" opacity={0.85} />
        <g fill="none" stroke={t.trace} strokeWidth={3} strokeLinejoin="round" opacity={0.55}>
          {lines.map((l, i) => (
            <path key={i} d={l.d} />
          ))}
        </g>
        <g fill={t.trace} opacity={0.8}>
          {lines.flatMap((l, i) => l.pads.map(([x, y], k) => <circle key={`${i}-${k}`} cx={x} cy={y} r={6} />))}
        </g>
        <rect width="1600" height="900" fill={`url(#${id}-scan)`} />
      </svg>
      <div className="sf-embers">
        {Array.from({ length: 10 }, (_, i) => (
          <span key={i} className="sf-ember" style={{ left: `${(i * 97) % 100}%`, animationDelay: `${-i * 1.3}s` }} />
        ))}
      </div>
    </div>
  );
});
