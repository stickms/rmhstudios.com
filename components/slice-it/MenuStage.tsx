/**
 * The Slice It! menu masthead stage: neon rhythm lanes behind the header.
 *
 * Pure decoration (`aria-hidden`), static markup, no state. A three-lane
 * runway recedes to a horizon with its beat lines drifting toward the viewer,
 * two rows of equalizer bars stand on the horizon, and a pink laser slash
 * splits a glowing block. All motion is CSS transform/opacity in
 * `slice-menu.css`, slower than 1 Hz, and stops under prefers-reduced-motion.
 */

/** Bar heights, in percent of the bar track. Fixed so SSR and client agree. */
const LEFT_BARS = [34, 58, 44, 72, 50, 86, 62, 40, 78, 54, 92, 46, 68, 38];
const RIGHT_BARS = [48, 70, 36, 84, 56, 42, 90, 60, 74, 38, 66, 52, 80, 44];

function Bars({ heights, side }: { heights: number[]; side: 'left' | 'right' }) {
  return (
    <div className={`slice-stage__eq slice-stage__eq--${side}`}>
      {heights.map((h, i) => (
        <span
          key={i}
          className={`slice-stage__bar slice-stage__bar--${['cyan', 'pink', 'violet'][i % 3]}`}
          style={
            {
              '--h': `${h}%`,
              '--d': `${((i * 7) % 11) * -0.45}s`,
              '--t': `${3.4 + ((i * 5) % 7) * 0.35}s`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

export function MenuStage() {
  return (
    <div className="slice-stage" aria-hidden="true">
      <div className="slice-stage__runway">
        <div className="slice-stage__plane">
          <div className="slice-stage__beats" />
        </div>
      </div>
      <Bars heights={LEFT_BARS} side="left" />
      <Bars heights={RIGHT_BARS} side="right" />
      <div className="slice-stage__block">
        <span className="slice-stage__shard slice-stage__shard--a" />
        <span className="slice-stage__shard slice-stage__shard--b" />
      </div>
      <div className="slice-stage__slash" />
    </div>
  );
}
