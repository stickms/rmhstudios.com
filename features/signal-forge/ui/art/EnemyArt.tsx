/**
 * Signal Forge enemy art: original SVG machines built from eleven silhouettes (drone, crawler, coil, press,
 * wraith, sentinel, core, hound, anvil, furnace, arc), dressed per act (soot and amber in the Foundry, blued
 * steel and arc-cyan in the Coil Halls, white-hot crimson in the Heart) and per tier (elites carry a copper
 * crest, bosses a heat halo). Static drawings: the only motion is the hit/kill feedback in signal-forge.css.
 */
import { useId } from 'react';
import type { EnemyDef } from '@features/signal-forge/engine/types';

interface ActInk {
  plate: string;
  plateDark: string;
  trim: string;
  glow: string;
  core: string;
}

const ACT_INK: Record<1 | 2 | 3, ActInk> = {
  1: { plate: '#4A3326', plateDark: '#24170F', trim: '#B8743A', glow: '#FF8A2A', core: '#FFC15A' },
  2: { plate: '#2B3A44', plateDark: '#121B22', trim: '#5FA7B8', glow: '#3FD6F0', core: '#B5F4FF' },
  3: { plate: '#4A1E1E', plateDark: '#220C0C', trim: '#E0894A', glow: '#FF4D3D', core: '#FFE7B0' },
};

function Rivets({ pts, color }: { pts: Array<[number, number]>; color: string }) {
  return (
    <>
      {pts.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={1.8} fill={color} />
      ))}
    </>
  );
}

/** The silhouette bodies; each gets the act's plate, trim and a glowing core. */
function Body({ shape, ink, coreId }: { shape: EnemyDef['shape']; ink: ActInk; coreId: string }) {
  const core = `url(#${coreId})`;
  const P = { fill: ink.plate, stroke: ink.trim, strokeWidth: 2, strokeLinejoin: 'round' as const };
  const D = { fill: ink.plateDark, stroke: ink.trim, strokeWidth: 1.5, strokeLinejoin: 'round' as const };
  switch (shape) {
    case 'drone':
      return (
        <g>
          <path d="M14 52 L36 40 H84 L106 52 L84 64 H36 Z" {...D} />
          <path d="M34 36 H86 L96 60 L86 84 H34 L24 60 Z" {...P} />
          <path d="M10 46 H30 M90 46 H110 M10 74 H30 M90 74 H110" stroke={ink.trim} strokeWidth={3} />
          <circle cx={60} cy={60} r={13} fill={core} />
          <circle cx={60} cy={60} r={13} fill="none" stroke={ink.trim} strokeWidth={2} />
          <Rivets pts={[[38, 42], [82, 42], [38, 78], [82, 78]]} color={ink.trim} />
        </g>
      );
    case 'crawler':
      return (
        <g>
          {[24, 40, 80, 96].map((x, i) => (
            <path key={i} d={`M${x} 70 L${x + (x < 60 ? -12 : 12)} 96`} stroke={ink.trim} strokeWidth={4} strokeLinecap="round" />
          ))}
          <path d="M18 70 C18 44 40 34 60 34 C80 34 102 44 102 70 Z" {...P} />
          <path d="M30 70 H90" stroke={ink.trim} strokeWidth={2} />
          <path d="M40 46 L48 40 M80 46 L72 40" stroke={ink.glow} strokeWidth={2} />
          <circle cx={48} cy={56} r={6} fill={core} />
          <circle cx={72} cy={56} r={6} fill={core} />
        </g>
      );
    case 'coil':
      return (
        <g>
          <rect x={42} y={18} width={36} height={84} rx={4} {...D} />
          {[28, 42, 56, 70, 84].map((y) => (
            <ellipse key={y} cx={60} cy={y} rx={30} ry={7} fill="none" stroke={ink.trim} strokeWidth={3.5} />
          ))}
          <circle cx={60} cy={56} r={10} fill={core} />
          <path d="M60 8 V18 M60 102 V112" stroke={ink.glow} strokeWidth={3} />
        </g>
      );
    case 'press':
      return (
        <g>
          <rect x={22} y={14} width={76} height={22} {...P} />
          <rect x={52} y={36} width={16} height={22} {...D} />
          <path d="M18 58 H102 L94 84 H26 Z" {...P} />
          <rect x={30} y={88} width={60} height={12} {...D} />
          <path d="M34 64 H86" stroke={ink.glow} strokeWidth={2} strokeDasharray="6 4" />
          <circle cx={60} cy={25} r={6} fill={core} />
          <Rivets pts={[[28, 20], [92, 20], [28, 30], [92, 30], [26, 64], [94, 64]]} color={ink.trim} />
        </g>
      );
    case 'wraith':
      return (
        <g>
          <path d="M60 14 C86 14 98 36 98 60 C98 80 92 96 86 106 L76 94 L68 106 L60 94 L52 106 L44 94 L34 106 C28 96 22 80 22 60 C22 36 34 14 60 14 Z" {...P} />
          <path d="M34 56 Q60 44 86 56" fill="none" stroke={ink.trim} strokeWidth={2} />
          <path d="M40 60 L52 66 M80 60 L68 66" stroke={ink.glow} strokeWidth={4} strokeLinecap="round" />
          <circle cx={60} cy={80} r={7} fill={core} opacity={0.9} />
        </g>
      );
    case 'sentinel':
      return (
        <g>
          <path d="M60 10 L92 26 V64 C92 84 78 100 60 110 C42 100 28 84 28 64 V26 Z" {...P} />
          <path d="M60 22 L80 32 V62 C80 76 72 88 60 96 C48 88 40 76 40 62 V32 Z" {...D} />
          <path d="M44 52 H76" stroke={ink.glow} strokeWidth={4} />
          <circle cx={60} cy={70} r={8} fill={core} />
          <Rivets pts={[[36, 30], [84, 30], [34, 60], [86, 60]]} color={ink.trim} />
        </g>
      );
    case 'core':
      return (
        <g>
          <polygon points="60,10 103,35 103,85 60,110 17,85 17,35" {...P} />
          <polygon points="60,26 89,43 89,77 60,94 31,77 31,43" {...D} />
          <path d="M17 35 L31 43 M103 35 L89 43 M17 85 L31 77 M103 85 L89 77 M60 10 V26 M60 110 V94" stroke={ink.trim} strokeWidth={2} />
          <circle cx={60} cy={60} r={17} fill={core} />
          <circle cx={60} cy={60} r={23} fill="none" stroke={ink.glow} strokeWidth={1.5} strokeDasharray="3 4" />
        </g>
      );
    case 'hound':
      return (
        <g>
          <path d="M14 64 L30 42 L52 46 L70 38 L92 44 L106 34 L104 56 L92 62 L90 86 L80 86 L76 66 L46 68 L40 88 L30 88 L30 68 Z" {...P} />
          <path d="M92 44 L100 30 L106 34" fill={ink.trim} />
          <path d="M40 54 H80" stroke={ink.glow} strokeWidth={2} strokeDasharray="4 3" />
          <circle cx={98} cy={44} r={4} fill={core} />
          <path d="M14 64 L4 58" stroke={ink.trim} strokeWidth={3} strokeLinecap="round" />
        </g>
      );
    case 'anvil':
      return (
        <g>
          <path d="M10 36 H90 C90 46 98 52 112 52 V60 H82 L72 76 H82 V96 H32 V76 H42 L32 60 H18 C12 56 10 46 10 36 Z" {...P} />
          <path d="M20 44 H84" stroke={ink.trim} strokeWidth={2} />
          <path d="M48 62 L56 70 L64 60 L70 68" fill="none" stroke={ink.glow} strokeWidth={3} strokeLinecap="round" />
          <circle cx={57} cy={86} r={6} fill={core} />
        </g>
      );
    case 'furnace':
      return (
        <g>
          <path d="M40 8 H56 V26 H40 Z" {...D} />
          <path d="M22 28 H98 L104 102 H16 Z" {...P} />
          <path d="M34 50 H86 V92 H34 Z" {...D} />
          <path d="M40 92 C40 70 50 76 52 60 C58 72 64 64 66 54 C74 66 80 72 80 92 Z" fill={core} />
          <path d="M34 50 H86" stroke={ink.glow} strokeWidth={2} />
          <Rivets pts={[[28, 34], [92, 34], [24, 96], [96, 96], [28, 64], [92, 64]]} color={ink.trim} />
        </g>
      );
    case 'arc':
      return (
        <g>
          <path d="M30 104 L44 70 H76 L90 104 Z" {...D} />
          <path d="M44 70 L52 30 H68 L76 70 Z" {...P} />
          <circle cx={60} cy={26} r={14} fill={core} />
          <path d="M60 12 L54 4 M70 16 L80 8 M50 16 L40 8 M74 26 H86 M34 26 H46" stroke={ink.glow} strokeWidth={2.5} strokeLinecap="round" />
          <path d="M52 44 H68 M50 56 H70" stroke={ink.trim} strokeWidth={2} />
        </g>
      );
  }
}

export function EnemyArt({ def, size = 120 }: { def: EnemyDef; size?: number }) {
  const ink = ACT_INK[def.act];
  const uid = useId().replace(/:/g, '');
  const coreId = `sf-core-${uid}`;
  const haloId = `sf-halo-${uid}`;
  const boss = def.tier === 'boss';
  const elite = def.tier === 'elite';
  return (
    <svg width={size} height={size} viewBox="-10 -10 140 140" aria-hidden className="sf-enemy-art">
      <defs>
        <radialGradient id={coreId}>
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="35%" stopColor={ink.core} />
          <stop offset="100%" stopColor={ink.glow} />
        </radialGradient>
        <radialGradient id={haloId}>
          <stop offset="55%" stopColor={ink.glow} stopOpacity={0.32} />
          <stop offset="100%" stopColor={ink.glow} stopOpacity={0} />
        </radialGradient>
      </defs>
      {boss && <circle cx={60} cy={60} r={70} fill={`url(#${haloId})`} />}
      {/* Ground shadow, a soot ellipse. */}
      <ellipse cx={60} cy={118} rx={40} ry={6} fill="#000" opacity={0.45} />
      <Body shape={def.shape} ink={ink} coreId={coreId} />
      {elite && <path d="M40 4 L48 -6 L54 4 L60 -8 L66 4 L72 -6 L80 4" fill="none" stroke="#D7894A" strokeWidth={3} strokeLinejoin="round" />}
      {boss && <path d="M30 2 L40 -8 L50 2 L60 -10 L70 2 L80 -8 L90 2" fill="none" stroke={ink.core} strokeWidth={3.5} strokeLinejoin="round" />}
    </svg>
  );
}
