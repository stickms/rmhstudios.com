/**
 * The globe's first paint: what the ball looks like before the WebGL body has drawn, and for good where it cannot draw
 * (no WebGL, scripting off). It is server-rendered, so it is on screen with the first frame.
 *
 * It draws what the body draws in its first frame (lib/globe/shader.ts) at the engine's starting pose, which is the
 * identity: the cage of parallels and meridians, and one dot per destination where `placePoints` puts it. So when the
 * body fades in over it (globe-nav.css, THE BODY) the dots and lines are already where the body has them, and the
 * change reads as the ball gaining its reflection, not as one picture replacing another.
 *
 * The numbers are the shader's: parallels every 20 degrees to 60, meridians every 30; a dot is white to 0.065 R (the
 * docked dot size, 1.25) inside a light grey outline one CSS pixel wide; both fade toward the limb as `smoothstep(0.05, 0.35, z)`.
 * The chrome under it is `.chrome-globe` (app/styles/steel-chrome.css, 4.2).
 */

import { placePoints } from '@/lib/globe/points';

const R = 50;
const PARALLELS = [-60, -40, -20, 0, 20, 40, 60];
const MERIDIANS = [30, 60];
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const n2 = (v: number) => v.toFixed(2);

export function GlobeFirstPaint({ points }: { points: number }) {
  const dots = placePoints(points).filter((p) => p.bz > 0.05);
  return (
    <span className="globe-nav__first chrome-globe" aria-hidden>
      <svg viewBox="-50 -50 100 100" focusable="false">
        <g className="globe-nav__first-cage" fill="none" stroke="#000" strokeWidth="0.9" strokeOpacity="0.18">
          {PARALLELS.map((deg) => {
            const y = -Math.sin((deg * Math.PI) / 180) * R;
            const half = Math.sqrt(R * R - y * y);
            return <line key={deg} x1={n2(-half)} x2={n2(half)} y1={n2(y)} y2={n2(y)} />;
          })}
          <line x1="0" x2="0" y1={-R} y2={R} />
          {MERIDIANS.map((deg) => (
            <ellipse key={deg} cx="0" cy="0" rx={n2(Math.sin((deg * Math.PI) / 180) * R)} ry={R} />
          ))}
        </g>
        {dots.map((p, i) => (
          <g key={i} opacity={n2(smooth(0.05, 0.35, p.bz))} transform={`translate(${n2(p.bx * R)} ${n2(p.by * R)})`}>
            <circle r="3.25" fill="#fff" stroke="#bdbdbd" strokeOpacity="0.9" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          </g>
        ))}
      </svg>
    </span>
  );
}
