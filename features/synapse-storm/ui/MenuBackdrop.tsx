import React from 'react';

/**
 * The layered backdrop behind Synapse Storm's menu screens (main menu,
 * multiplayer menu, lobby): a near-black violet field with sparse star specks,
 * a slowly rotating spiral of thin cyan and pink rings, a counter-rotating
 * set of lightning forks, a glowing neural core that breathes once every 4 s,
 * and a few drifting challenge tiles (7x8, 47, a timer ring, a colour grid).
 *
 * Everything here is decoration: `aria-hidden`, pointer-events off, and animated
 * with CSS `transform` / `opacity` only (see SynapseStormMenu.css, which also
 * stops it all for `prefers-reduced-motion`). The geometry is computed once at
 * module load, so rendering costs a handful of static SVG paths.
 */

const TAU = Math.PI * 2;

/** One arm of a logarithmic-ish spiral, centred on (0,0) in a -100..100 box. */
function spiralArm(offset: number, turns: number, startR: number, endR: number): string {
  const steps = Math.round(turns * 48);
  const pts: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const theta = offset + f * turns * TAU;
    const r = startR + (endR - startR) * f;
    pts.push(`${(Math.cos(theta) * r).toFixed(1)} ${(Math.sin(theta) * r).toFixed(1)}`);
  }
  return `M${pts.join('L')}`;
}

/** Deterministic jagged fork from the core outwards (seeded, so SSR and client agree). */
function lightningFork(angle: number, length: number, seed: number): string {
  let s = seed;
  const rand = () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
  const segs = 7;
  const pts: string[] = ['0 0'];
  for (let i = 1; i <= segs; i++) {
    const r = (length * i) / segs;
    const jitter = (rand() - 0.5) * 9;
    const a = angle + jitter / Math.max(r, 12);
    pts.push(`${(Math.cos(a) * r - Math.sin(angle) * jitter).toFixed(1)} ${(Math.sin(a) * r + Math.cos(angle) * jitter).toFixed(1)}`);
  }
  return `M${pts.join('L')}`;
}

const SPIRAL_CYAN = spiralArm(0, 4.5, 6, 96);
const SPIRAL_PINK = spiralArm(Math.PI, 4.5, 6, 96);
const FORKS = [
  { d: lightningFork(-1.2, 78, 11), tone: 'cyan' },
  { d: lightningFork(0.35, 64, 23), tone: 'pink' },
  { d: lightningFork(1.75, 82, 37), tone: 'cyan' },
  { d: lightningFork(2.7, 58, 53), tone: 'pink' },
  { d: lightningFork(-2.4, 70, 71), tone: 'pink' },
];

export const MenuBackdrop: React.FC = () => (
  <div className="ssm-backdrop" aria-hidden="true">
    <div className="ssm-backdrop__stars" />

    <div className="ssm-backdrop__vortex">
      <svg className="ssm-backdrop__spiral" viewBox="-100 -100 200 200" focusable="false">
        <circle className="ssm-ring ssm-ring--cyan" cx="0" cy="0" r="34" />
        <circle className="ssm-ring ssm-ring--pink" cx="0" cy="0" r="58" />
        <circle className="ssm-ring ssm-ring--cyan" cx="0" cy="0" r="82" />
        <path className="ssm-arm ssm-arm--cyan" d={SPIRAL_CYAN} />
        <path className="ssm-arm ssm-arm--pink" d={SPIRAL_PINK} />
      </svg>
      <svg className="ssm-backdrop__forks" viewBox="-100 -100 200 200" focusable="false">
        {FORKS.map((f, i) => (
          <path key={i} className={`ssm-fork ssm-fork--${f.tone}`} d={f.d} />
        ))}
      </svg>
    </div>

    <div className="ssm-backdrop__core" />

    <div className="ssm-orn ssm-orn--a">7×8</div>
    <div className="ssm-orn ssm-orn--b">47</div>
    <div className="ssm-orn ssm-orn--c">
      <svg viewBox="0 0 40 40" focusable="false">
        <circle className="ssm-orn__track" cx="20" cy="20" r="15" />
        <circle className="ssm-orn__timer" cx="20" cy="20" r="15" pathLength="100" />
      </svg>
    </div>
    <div className="ssm-orn ssm-orn--d">
      <i /> <i /> <i /> <i />
    </div>

    <div className="ssm-backdrop__vignette" />
  </div>
);
