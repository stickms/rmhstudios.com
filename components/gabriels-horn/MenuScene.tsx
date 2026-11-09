/**
 * Gabriel's Horn — the menu scene.
 *
 * Two pieces, both decoration (`aria-hidden`), both moved only by CSS
 * `transform`/`opacity` (gh-menu.css):
 *
 *   {@link MenuBackdrop}   deep-purple ground, a starfield, and soft
 *                          golden rays fanning from the top-right corner that
 *                          turn once in about eight minutes.
 *   {@link HornStillLife}  the golden horn, three dice and a fan of card backs:
 *                          the catalog card's still life, drawn as inline SVG so
 *                          it takes the page's gold and purple with no image.
 *
 * Nothing here reads state or runs script after mount.
 */

/** Which of the nine grid cells carry a pip, per face (0 = top-left, 8 = bottom-right). */
const PIPS: Record<number, readonly number[]> = {
  2: [0, 8],
  4: [0, 2, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
  5: [0, 2, 4, 6, 8],
};

function DieArt({
  face,
  x,
  y,
  tilt,
  delay,
}: {
  face: number;
  x: number;
  y: number;
  tilt: number;
  delay: number;
}) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${tilt} 28 28)`}>
      <g className="ghm-bob" style={{ animationDelay: `${delay}s` }}>
        <rect x="2" y="5" width="56" height="56" rx="12" fill="#0c0318" opacity=".45" />
        <rect width="56" height="56" rx="12" fill="#FFF3D6" stroke="#E6C98E" strokeWidth="2" />
        <rect
          x="4"
          y="4"
          width="48"
          height="48"
          rx="9"
          fill="none"
          stroke="#fff"
          strokeOpacity=".7"
        />
        {PIPS[face].map((cell) => (
          <circle
            key={cell}
            cx={14 + (cell % 3) * 14}
            cy={14 + Math.floor(cell / 3) * 14}
            r="4.6"
            fill="#3A1A68"
          />
        ))}
      </g>
    </g>
  );
}

function CardBackArt({ angle, x, y }: { angle: number; x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${angle} 35 98)`}>
      <rect
        width="70"
        height="98"
        rx="9"
        fill="url(#ghm-card)"
        stroke="#F5B82E"
        strokeWidth="2.4"
      />
      <rect
        x="6"
        y="6"
        width="58"
        height="86"
        rx="5"
        fill="none"
        stroke="#F5B82E"
        strokeOpacity=".55"
      />
      <path d="M35 27 L51 49 L35 71 L19 49 Z" fill="none" stroke="#F5B82E" strokeWidth="2" />
      <path d="M35 37 L43 49 L35 61 L27 49 Z" fill="#F5B82E" fillOpacity=".25" />
      <circle cx="35" cy="49" r="2.6" fill="#F5B82E" />
    </g>
  );
}

export function HornStillLife({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 430 262" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="ghm-gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFF1B0" />
          <stop offset=".45" stopColor="#F5B82E" />
          <stop offset="1" stopColor="#B8741B" />
        </linearGradient>
        <linearGradient id="ghm-card" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4A2186" />
          <stop offset="1" stopColor="#241048" />
        </linearGradient>
        <radialGradient id="ghm-halo" cx=".5" cy=".5" r=".5">
          <stop offset="0" stopColor="#F5B82E" stopOpacity=".42" />
          <stop offset="1" stopColor="#F5B82E" stopOpacity="0" />
        </radialGradient>
      </defs>

      <ellipse cx="250" cy="82" rx="200" ry="86" fill="url(#ghm-halo)" />

      {/* Music notes drifting off the bell. */}
      <g className="ghm-note" fill="#FFE08A" stroke="#FFE08A">
        <ellipse cx="46" cy="34" rx="6" ry="4.6" stroke="none" transform="rotate(-20 46 34)" />
        <path d="M51 32 V8 q10 2 12 12" fill="none" strokeWidth="2.4" strokeLinecap="round" />
      </g>
      <g className="ghm-note ghm-note--b" fill="#FFE08A" stroke="#FFE08A">
        <ellipse cx="96" cy="16" rx="5" ry="3.8" stroke="none" transform="rotate(-20 96 16)" />
        <path
          d="M100.5 14.5 V-4 q8 2 10 10"
          fill="none"
          strokeWidth="2"
          strokeLinecap="round"
          transform="translate(0 6)"
        />
      </g>

      {/* The horn: outline, body, highlight, bands, bell. */}
      <g strokeLinecap="round" strokeLinejoin="round">
        <path
          d="M110 84 C 170 58, 236 112, 300 78 S 380 44, 390 86"
          fill="none"
          stroke="#4A2606"
          strokeWidth="32"
        />
        <path
          d="M110 84 C 170 58, 236 112, 300 78 S 380 44, 390 86"
          fill="none"
          stroke="url(#ghm-gold)"
          strokeWidth="23"
        />
        <path
          d="M110 80 C 170 54, 236 108, 300 74 S 380 40, 390 82"
          fill="none"
          stroke="#FFF6CF"
          strokeOpacity=".8"
          strokeWidth="4"
        />
        <circle cx="390" cy="86" r="17" fill="url(#ghm-gold)" stroke="#4A2606" strokeWidth="4" />
        <g stroke="#4A2606" strokeWidth="9">
          <path d="M184 66 L192 108" />
          <path d="M226 83 L224 124" />
          <path d="M268 86 L273 52" />
        </g>
        <g stroke="#FFE9A3" strokeWidth="4.5">
          <path d="M184 66 L192 108" />
          <path d="M226 83 L224 124" />
          <path d="M268 86 L273 52" />
        </g>
        <path
          d="M34 34 L118 70 L118 102 L34 138 C 14 104, 14 68, 34 34 Z"
          fill="url(#ghm-gold)"
          stroke="#4A2606"
          strokeWidth="5"
        />
        <ellipse cx="33" cy="86" rx="14" ry="53" fill="#6B3410" stroke="#4A2606" strokeWidth="4" />
        <ellipse cx="37" cy="86" rx="7" ry="40" fill="#2A1204" opacity=".7" />
      </g>

      {/* Three dice and a fan of cards. */}
      <DieArt face={4} x={44} y={166} tilt={-14} delay={0} />
      <DieArt face={6} x={116} y={190} tilt={9} delay={-2} />
      <DieArt face={2} x={186} y={158} tilt={-5} delay={-4} />
      <g className="ghm-fan">
        <CardBackArt angle={-32} x={272} y={118} />
        <CardBackArt angle={-16} x={290} y={116} />
        <CardBackArt angle={0} x={306} y={118} />
        <CardBackArt angle={16} x={318} y={122} />
        <CardBackArt angle={32} x={330} y={128} />
      </g>
    </svg>
  );
}

/** Ground, starfield and rays. Stars only breathe; the rays turn once in ~8 minutes. */
export function MenuBackdrop() {
  return (
    <div aria-hidden="true" className="ghm-bg">
      <div className="ghm-stars" />
      <div className="ghm-rays-mask">
        <div className="ghm-rays" />
      </div>
      <div className="ghm-glow" />
    </div>
  );
}
