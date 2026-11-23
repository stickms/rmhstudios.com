/**
 * Cursed Logic's iconography, all original SVG: the twelve stance sigils, the action and mutation glyphs, and the
 * wordmark. A sigil is drawn on a 3x3 grid of logic-gate nodes (the faint dots), so the set reads as one cursed
 * script rather than a box of unrelated icons. Stroke-only, `currentColor`, so a selected card inverts cleanly.
 */
import type { PlayerAction, ProtocolAction, RoundModifier, Stance } from '@features/cursed-logic/engine/types';

const NODES = [4, 12, 20];

function Grid() {
  return (
    <g opacity={0.35}>
      {NODES.flatMap((x) => NODES.map((y) => <circle key={`${x}-${y}`} cx={x} cy={y} r={0.9} fill="currentColor" />))}
    </g>
  );
}

/** Stroke paths per stance, on the 24-unit grid. */
const SIGILS: Record<Stance, string[]> = {
  Commit: ['M12 21V4', 'M6 10l6-6 6 6', 'M8 16h8'],
  Guard: ['M8 4H4v16h4', 'M16 4h4v16h-4', 'M12 8v8'],
  Read: ['M3 12l9-7 9 7-9 7z', 'M12 9.5v5'],
  Pressure: ['M4 5l7 7-7 7', 'M12 5l7 7-7 7'],
  Counter: ['M20 7H8a4 4 0 0 0 0 8h8', 'M13 11l4 4-4 4'],
  Recover: ['M12 5v14', 'M5 12h14', 'M7 7l10 10'],
  Scan: ['M4 12a8 8 0 0 1 16 0', 'M8 12a4 4 0 0 1 8 0', 'M12 12v8'],
  Harvest: ['M4 4h16l-8 9z', 'M12 13v7', 'M8 20h8'],
  Resist: ['M4 6h16', 'M6 12h12', 'M8 18h8'],
  Reckless: ['M14 3L6 13h6l-2 8 8-11h-6z'],
  Surge: ['M3 15c3-8 6-8 9 0s6 8 9 0', 'M12 4v4'],
  Bastion: ['M12 4l8 16H4z', 'M12 4V1', 'M20 20l3 2', 'M4 20l-3 2'],
};

export function StanceSigil({ stance, size = 32, className }: { stance: Stance; size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden
    >
      <Grid />
      {SIGILS[stance].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

const ACTIONS: Record<PlayerAction | ProtocolAction, string[]> = {
  // A blade: the edge and its guard.
  Strike: ['M5 19L18 6', 'M18 6l1-3-3 1', 'M7 13l4 4', 'M4 20l2-2'],
  // Brackets shut.
  Block: ['M9 3H4v18h5', 'M15 3h5v18h-5'],
  // A ring charging, open at the top.
  Prepare: ['M15 4.5A8 8 0 1 1 9 4.5', 'M12 2v6', 'M12 12h.01'],
  // An eye in brackets.
  Probe: ['M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12z', 'M12 10v4'],
  // A glitch: a square that does not close.
  Idle: ['M5 5h9', 'M19 9v10H8', 'M5 9v4', 'M14 5l5 4'],
};

export function ActionGlyph({
  action,
  size = 28,
  className,
}: {
  action: PlayerAction | ProtocolAction;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="square"
      aria-hidden
    >
      {ACTIONS[action].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

const MODS: Record<RoundModifier, string[]> = {
  Overcharge: ['M9 2L4 12h5l-2 10', 'M17 2l-5 10h5l-2 10'],
  NoBlock: ['M8 4H4v16h4', 'M16 4h4v16h-4', 'M4 20L20 4'],
  Chaos: ['M3 7h4l10 10h4', 'M3 17h4l10-10h4', 'M19 4l2 3-2 3', 'M19 14l2 3-2 3'],
  ChargeDrain: ['M6 6h10v14H6z', 'M9 3h4', 'M11 9v6', 'M8 13l3 3 3-3'],
  Reveal: ['M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z', 'M9 12a3 3 0 0 0 6 0 3 3 0 0 0-6 0'],
  Static: ['M3 6h4M10 6h3M16 6h5', 'M3 12h7M13 12h2M18 12h3', 'M3 18h2M8 18h8M19 18h2'],
};

export function ModifierGlyph({ modifier, size = 18 }: { modifier: RoundModifier; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
      {MODS[modifier].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

/**
 * The wordmark: CURSED//LOGIC in pixel caps, split by a horizontal tear (the lower half is knocked sideways) with
 * the violet and acid ghosts either side. The title's text is the accessible name.
 */
export function Wordmark({ className, title }: { className?: string; title: string }) {
  const word = 'CURSED//LOGIC';
  const text = (fill: string, dx: number, clip?: string) => (
    <text
      x={236 + dx}
      y={58}
      textAnchor="middle"
      fontFamily="Silkscreen, 'IBM Plex Mono', monospace"
      fontWeight={700}
      fontSize={42}
      fill={fill}
      clipPath={clip}
      letterSpacing={2}
    >
      {word}
    </text>
  );
  return (
    <svg viewBox="0 0 480 90" className={className} role="img" aria-label={title}>
      <defs>
        <clipPath id="cl-wm-top">
          <rect x="0" y="0" width="480" height="43" />
        </clipPath>
        <clipPath id="cl-wm-bot">
          <rect x="0" y="43" width="480" height="47" />
        </clipPath>
      </defs>
      <g clipPath="url(#cl-wm-top)">
        {text('#a970ff', -3)}
        {text('#b6ff3c', 2)}
        {text('#e8ffd2', 0)}
      </g>
      <g clipPath="url(#cl-wm-bot)" transform="translate(5 0)">
        {text('#a970ff', -3)}
        {text('#e8ffd2', 0)}
      </g>
      <rect x="14" y="42.5" width="452" height="1.5" fill="#b6ff3c" opacity={0.7} />
    </svg>
  );
}
