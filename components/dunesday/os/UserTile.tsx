'use client';

/**
 * The Windows 7 user picture: a rounded glass frame around the avatar. Shows
 * the RMH profile picture when there is one, otherwise a default Aero picture
 * (a goldfish on blue, very 2009).
 */

import { cn } from '@/lib/utils';

export function UserTile({
  image,
  size = 128,
  className,
}: {
  image: string | null;
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={cn('ds-usertile', className)}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {image ? (
        <img src={image} alt="" draggable={false} referrerPolicy="no-referrer" />
      ) : (
        <svg viewBox="0 0 100 100">
          <defs>
            <linearGradient id="ds-ut-bg" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="#8fe3ff" />
              <stop offset="1" stopColor="#0a6fb8" />
            </linearGradient>
          </defs>
          <rect width="100" height="100" fill="url(#ds-ut-bg)" />
          <path d="M68 50 l18 -14 v28 Z" fill="#ffd23d" />
          <ellipse cx="46" cy="50" rx="26" ry="16" fill="#ff8a3d" />
          <path d="M40 34 Q50 22 58 36 Z" fill="#ffd23d" />
          <ellipse cx="42" cy="44" rx="16" ry="5" fill="#fff" opacity=".45" />
          <circle cx="32" cy="47" r="4" fill="#fff" />
          <circle cx="31" cy="47" r="2" fill="#0b2a4a" />
          {[
            [20, 80, 4],
            [30, 72, 3],
            [80, 20, 5],
            [72, 30, 3],
          ].map(([x, y, r]) => (
            <circle key={`${x}${y}`} cx={x} cy={y} r={r} fill="none" stroke="#fff" opacity=".8" />
          ))}
        </svg>
      )}
    </span>
  );
}
