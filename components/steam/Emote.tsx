'use client';

import { hueFromString } from '@/lib/builds/curated';
import type { EmoteMotif } from '@/lib/games/customize';

/** An emoticon: one of a title's six card motifs, small, in the title's hue. Decorative. */
export function Emote({ gameId, motif, size = 18 }: { gameId: string; motif: EmoteMotif; size?: number }) {
  const hue = hueFromString(gameId);
  const fill = `hsl(${hue} 70% 62%)`;
  const stroke = `hsl(${(hue + 40) % 360} 80% 82%)`;
  return (
    <svg
      className="stm-emote"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      role="img"
      aria-label={`:${gameId}-${motif}:`}
    >
      {motif === 'circle' ? <circle cx="12" cy="12" r="8" fill={fill} stroke={stroke} strokeWidth="1.5" /> : null}
      {motif === 'triangle' ? <polygon points="12,3 21,20 3,20" fill={fill} stroke={stroke} strokeWidth="1.5" /> : null}
      {motif === 'diamond' ? <polygon points="12,2 21,12 12,22 3,12" fill={fill} stroke={stroke} strokeWidth="1.5" /> : null}
      {motif === 'hex' ? <polygon points="12,2 20,7 20,17 12,22 4,17 4,7" fill={fill} stroke={stroke} strokeWidth="1.5" /> : null}
      {motif === 'star' ? (
        <polygon points="12,2 14.6,8.6 21.5,9 16.2,13.5 18,20.5 12,16.8 6,20.5 7.8,13.5 2.5,9 9.4,8.6" fill={fill} stroke={stroke} strokeWidth="1.2" />
      ) : null}
      {motif === 'ring' ? (
        <>
          <circle cx="12" cy="12" r="8" fill="none" stroke={fill} strokeWidth="4" />
          <circle cx="12" cy="12" r="3" fill={stroke} />
        </>
      ) : null}
    </svg>
  );
}
