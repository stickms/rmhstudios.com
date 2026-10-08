'use client';

/**
 * The Frutiger Aero aquarium: a glass tank of tropical fish, swaying weed and
 * rising bubbles, sitting on a little dune (it is still Dunesday). Tap a fish
 * and it darts off — handled by the page's delegated click listener
 * (`useAeroFeedback`), so this stays pure markup and CSS.
 */

const FISH = [
  { cls: 'ds-fish--a', body: '#ff8a3d', fin: '#ffd23d', top: '22%', dur: 16, delay: -3, size: 46 },
  { cls: 'ds-fish--b', body: '#3db6ff', fin: '#a7ecff', top: '48%', dur: 22, delay: -11, size: 38 },
  { cls: 'ds-fish--a', body: '#ffd23d', fin: '#ff8a3d', top: '64%', dur: 19, delay: -7, size: 30 },
  { cls: 'ds-fish--b', body: '#ff5fa2', fin: '#ffc2dc', top: '34%', dur: 26, delay: -18, size: 34 },
  { cls: 'ds-fish--a', body: '#5fe08a', fin: '#d4ffb8', top: '72%', dur: 24, delay: -14, size: 26 },
];

function FishSvg({ body, fin }: { body: string; fin: string }) {
  return (
    <svg viewBox="0 0 64 40">
      <path d="M50 20 L63 8 L60 20 L63 32 Z" fill={fin} />
      <ellipse cx="28" cy="20" rx="24" ry="14" fill={body} />
      <path d="M22 7 Q30 -2 38 8 Z" fill={fin} />
      <path
        d="M20 22 Q26 30 32 23"
        stroke={fin}
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
      />
      <ellipse cx="22" cy="13" rx="14" ry="5" fill="#ffffff" opacity="0.45" />
      <circle cx="13" cy="17" r="3.4" fill="#fff" />
      <circle cx="12.4" cy="17" r="1.8" fill="#0b2a4a" />
    </svg>
  );
}

export function Aquarium() {
  return (
    <div className="ds-tank" aria-hidden="true">
      <div className="ds-tank-water">
        <div className="ds-tank-caustics" />
        {FISH.map((f, i) => (
          <span
            key={i}
            className={`ds-fish ${f.cls}`}
            style={{
              top: f.top,
              width: f.size,
              animationDuration: `${f.dur}s`,
              animationDelay: `${f.delay}s`,
            }}
          >
            <span className="ds-fish-inner">
              <FishSvg body={f.body} fin={f.fin} />
            </span>
          </span>
        ))}
        {[12, 30, 55, 78, 90].map((left, i) => (
          <span
            key={left}
            className="ds-tank-bubble"
            style={{ left: `${left}%`, animationDelay: `${-i * 1.7}s` }}
          />
        ))}
        {[8, 22, 70, 86].map((left, i) => (
          <span
            key={left}
            className="ds-weed"
            style={{ left: `${left}%`, height: `${38 + (i % 2) * 18}%`, animationDelay: `${-i}s` }}
          />
        ))}
        <div className="ds-tank-sand" />
      </div>
      <div className="ds-tank-shine" />
    </div>
  );
}
