'use client';

import { useId } from 'react';
import { cardName } from '@/lib/cards/cards';

/**
 * A trading card, drawn from the title's hue: a dark field, one geometric motif per
 * card in the set, the card's name and the title. Deterministic, so there is no art
 * to author per title. Foil carries a static rainbow edge (the Steam skin is flat,
 * so nothing animates). `owned={false}` draws the silhouette of a card you lack.
 */

const MOTIFS = ['circle', 'triangle', 'diamond', 'hex', 'star', 'ring'] as const;

function motif(kind: (typeof MOTIFS)[number], fill: string, stroke: string) {
  switch (kind) {
    case 'circle':
      return <circle cx="100" cy="120" r="46" fill={fill} stroke={stroke} strokeWidth="3" />;
    case 'triangle':
      return <polygon points="100,70 148,160 52,160" fill={fill} stroke={stroke} strokeWidth="3" />;
    case 'diamond':
      return <polygon points="100,66 152,120 100,174 48,120" fill={fill} stroke={stroke} strokeWidth="3" />;
    case 'hex':
      return (
        <polygon
          points="100,68 144,94 144,146 100,172 56,146 56,94"
          fill={fill}
          stroke={stroke}
          strokeWidth="3"
        />
      );
    case 'star':
      return (
        <polygon
          points="100,66 112,104 152,104 120,128 132,166 100,142 68,166 80,128 48,104 88,104"
          fill={fill}
          stroke={stroke}
          strokeWidth="3"
        />
      );
    default:
      return (
        <>
          <circle cx="100" cy="120" r="48" fill="none" stroke={fill} strokeWidth="12" />
          <circle cx="100" cy="120" r="22" fill={stroke} />
        </>
      );
  }
}

export function CardArt({
  gameId,
  title,
  hue,
  cardIndex,
  foil = false,
  owned = true,
  width = 120,
}: {
  gameId: string;
  title: string;
  hue: number;
  cardIndex: number;
  foil?: boolean;
  owned?: boolean;
  width?: number;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const name = cardName(gameId, cardIndex);
  const kind = MOTIFS[((cardIndex % MOTIFS.length) + MOTIFS.length) % MOTIFS.length];
  const bg = owned ? `hsl(${hue} 38% 16%)` : '#1b1e23';
  const bg2 = owned ? `hsl(${hue} 45% 26%)` : '#24282f';
  const fill = owned ? `hsl(${hue} 70% 62%)` : '#3a3f47';
  const stroke = owned ? `hsl(${(hue + 40) % 360} 80% 82%)` : '#4b515a';
  const short = title.length > 24 ? `${title.slice(0, 23)}…` : title;

  return (
    <svg
      viewBox="0 0 200 280"
      width={width}
      height={(width * 280) / 200}
      role="img"
      aria-label={owned ? `${name}, ${title}${foil ? ' (foil)' : ''}` : `${title}: missing card`}
      className="stm-card-art"
      data-foil={foil ? 'true' : undefined}
      data-owned={owned ? 'true' : 'false'}
    >
      <defs>
        <linearGradient id={`${uid}bg`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={bg2} />
          <stop offset="1" stopColor={bg} />
        </linearGradient>
        <linearGradient id={`${uid}foil`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff5f6d" />
          <stop offset="0.25" stopColor="#ffc371" />
          <stop offset="0.5" stopColor="#7be495" />
          <stop offset="0.75" stopColor="#5fc8ff" />
          <stop offset="1" stopColor="#b388ff" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="196" height="276" rx="6" fill={`url(#${uid}bg)`} />
      <rect
        x="2"
        y="2"
        width="196"
        height="276"
        rx="6"
        fill="none"
        stroke={foil && owned ? `url(#${uid}foil)` : owned ? stroke : '#3a3f47'}
        strokeWidth={foil && owned ? 5 : 2}
      />
      {owned ? (
        <>
          {motif(kind, fill, stroke)}
          <text x="100" y="222" textAnchor="middle" fontSize="17" fontWeight="600" fill="#fff">
            {name}
          </text>
          <text x="100" y="246" textAnchor="middle" fontSize="12" fill={stroke}>
            {short}
          </text>
        </>
      ) : (
        <text x="100" y="140" textAnchor="middle" fontSize="56" fill="#3a3f47">
          ?
        </text>
      )}
    </svg>
  );
}
