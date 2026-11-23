/**
 * Signal Forge's drawn iconography: the four waveform glyphs (shape-coded, so they read without colour), the
 * HUD icons and the intent marks. Original SVG paths, drawn on a 24-unit grid with 2-unit strokes.
 */
import type { IntentKind, Waveform } from '@features/signal-forge/engine/types';

/** Waveform colours (the scheme's signal palette). Shape carries the meaning too. */
export const WAVE_COLOR: Record<Waveform | 'any', string> = {
  pulse: '#FFA436',
  sine: '#46D8F2',
  saw: '#FF6B5A',
  noise: '#A6E86A',
  any: '#F6E7D2',
};

const WAVE_PATH: Record<Waveform, string> = {
  pulse: 'M1 17 H6 V7 H12 V17 H18 V7 H23',
  sine: 'M1 12 C4 3 8 3 10 12 S16 21 19 12 S22 6 23 8',
  saw: 'M1 17 L8 6 V17 L15 6 V17 L22 6 V12',
  noise: 'M1 13 L3 8 L5 15 L7 5 L9 17 L11 9 L13 14 L15 6 L17 18 L19 10 L21 15 L23 11',
};

export function WaveGlyph({ wave, size = 24, color, strokeWidth = 2.4 }: { wave: Waveform | 'any'; size?: number; color?: string; strokeWidth?: number }) {
  const c = color ?? WAVE_COLOR[wave];
  if (wave === 'any') {
    // The wildcard: all four traces braided at low weight.
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden fill="none" strokeLinecap="round" strokeLinejoin="round">
        {(['pulse', 'sine', 'saw', 'noise'] as Waveform[]).map((w) => (
          <path key={w} d={WAVE_PATH[w]} stroke={WAVE_COLOR[w]} strokeWidth={strokeWidth * 0.55} opacity={0.95} />
        ))}
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d={WAVE_PATH[wave]} stroke={c} strokeWidth={strokeWidth} />
    </svg>
  );
}

type IconName =
  | 'heat'
  | 'static'
  | 'block'
  | 'energy'
  | 'hp'
  | 'gold'
  | 'deck'
  | 'help'
  | 'sound'
  | 'mute'
  | 'flag'
  | 'skull'
  | 'anvil'
  | 'chest'
  | 'coolant'
  | 'shop'
  | 'event'
  | 'boss'
  | 'elite'
  | 'combat'
  | 'trophy'
  | 'close'
  | 'strength'
  | 'weak'
  | 'vuln'
  | 'bleed'
  | 'frail'
  | 'jam';

const ICON: Record<IconName, string> = {
  heat: 'M12 2c1 4 6 6 6 12a6 6 0 0 1-12 0c0-3 2-5 3-6 0 2 1 3 2 3 0-3-1-6 1-9z',
  static: 'M13 2 4 14h7l-1 8 9-12h-7z',
  block: 'M12 2 4 5v6c0 5 3.5 9 8 11 4.5-2 8-6 8-11V5z',
  energy: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 4-5 8h4l-1 4 5-8h-4z',
  hp: 'M12 21s-8-5.2-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.8-8 11-8 11z',
  gold: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 3 1.6 3.4 3.7.4-2.8 2.5.8 3.7L12 14.2 8.7 16l.8-3.7-2.8-2.5 3.7-.4z',
  deck: 'M7 3h11a1 1 0 0 1 1 1v14H8a1 1 0 0 1-1-1zM4 6h2v13h11v2H5a1 1 0 0 1-1-1z',
  help: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm-1 15h2v2h-2zm1-12a4 4 0 0 1 2 7.5c-.8.5-1 1-1 1.5v1h-2v-1c0-1.3.6-2.2 1.6-2.9A2 2 0 1 0 10 9H8a4 4 0 0 1 4-4z',
  sound: 'M4 9h4l5-4v14l-5-4H4zM16 8a5 5 0 0 1 0 8M18.5 5.5a8.5 8.5 0 0 1 0 13',
  mute: 'M4 9h4l5-4v14l-5-4H4zM16 9l6 6M22 9l-6 6',
  flag: 'M5 3v18M5 4h11l-2 4 2 4H5',
  skull: 'M12 2a8 8 0 0 0-8 8c0 3 1.5 5 3 6v4h10v-4c1.5-1 3-3 3-6a8 8 0 0 0-8-8zM9 10a1.6 1.6 0 1 1 0 3.2A1.6 1.6 0 0 1 9 10zm6 0a1.6 1.6 0 1 1 0 3.2 1.6 1.6 0 0 1 0-3.2z',
  anvil: 'M3 7h13c0 2.5 2 4 5 4v2h-6l-2 3h3v3H6v-3h3l-2-3H5C4 13 3 11 3 9z',
  chest: 'M3 9h18v11H3zM4 4h16l1 5H3zM10 12h4v3h-4z',
  coolant: 'M12 2 6 11a6 6 0 1 0 12 0z',
  shop: 'M4 4h16l-1 6H5zM5 12h14v8H5zM9 15h6v5H9z',
  event: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm-1 15h2v2h-2zm1-12a4 4 0 0 1 2 7.5c-.8.5-1 1-1 1.5v1h-2v-1c0-1.3.6-2.2 1.6-2.9A2 2 0 1 0 10 9H8a4 4 0 0 1 4-4z',
  boss: 'M3 18 5 7l4 4 3-7 3 7 4-4 2 11zM3 20h18v2H3z',
  elite: 'M12 2 15 9l7 .6-5.3 4.7L18.4 21 12 17.3 5.6 21l1.7-6.7L2 9.6 9 9z',
  combat: 'M5 3 3 5l7 7-3 3 2 2 3-3 7 7 2-2-7-7 3-3-2-2-3 3zM19 3l2 2-5 5-2-2z',
  trophy: 'M7 3h10v3h4c0 4-2 6-5 6.5A5 5 0 0 1 13 15v3h3v3H8v-3h3v-3a5 5 0 0 1-3-2.5C5 12 3 10 3 6h4zM5 8c.3 1.6 1.2 2.6 2.4 3L7 8zm14 0h-2l-.4 3c1.2-.4 2.1-1.4 2.4-3z',
  close: 'M5 5l14 14M19 5 5 19',
  strength: 'M4 14h3l2-5 4 9 2-4h5',
  weak: 'M12 3v12M7 10l5 5 5-5M5 20h14',
  vuln: 'M12 2 3 21h18zM11 9h2v6h-2zm0 8h2v2h-2z',
  bleed: 'M12 2s-6 7-6 12a6 6 0 0 0 12 0c0-5-6-12-6-12z',
  frail: 'M12 2 4 5v6c0 5 3.5 9 8 11 4.5-2 8-6 8-11V5zM9 7l3 5-2 3 3 4',
  jam: 'M4 4l16 16M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z',
};

const STROKED = new Set<IconName>(['sound', 'mute', 'flag', 'close', 'strength', 'weak', 'jam', 'frail']);

export function Icon({ name, size = 18, color = 'currentColor', title }: { name: IconName; size?: number; color?: string; title?: string }) {
  const stroked = STROKED.has(name);
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" role={title ? 'img' : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      <path
        d={ICON[name]}
        fill={stroked ? 'none' : color}
        stroke={stroked ? color : 'none'}
        strokeWidth={stroked ? 2.2 : 0}
        strokeLinecap="round"
        strokeLinejoin="round"
        fillRule="evenodd"
      />
    </svg>
  );
}

export type { IconName };

/** The icon that represents an enemy intent. */
export function intentIcon(kind: IntentKind): IconName {
  switch (kind) {
    case 'attack':
      return 'combat';
    case 'defend':
      return 'block';
    case 'buff':
      return 'strength';
    case 'debuff':
      return 'weak';
    case 'disrupt':
      return 'static';
    case 'summon':
      return 'elite';
    case 'charge':
      return 'energy';
  }
}

export const INTENT_COLOR: Record<IntentKind, string> = {
  attack: '#FF6B5A',
  defend: '#46D8F2',
  buff: '#FFA436',
  debuff: '#C9A8FF',
  disrupt: '#A6E86A',
  summon: '#FFD27A',
  charge: '#FFD27A',
};
