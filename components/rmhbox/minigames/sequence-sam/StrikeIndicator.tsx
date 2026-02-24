/**
 * StrikeIndicator — Hearts display for Sequence Sam.
 *
 * Shows red hearts for remaining strikes and dark hearts for lost ones.
 */
'use client';

import { Heart } from 'lucide-react';

interface StrikeIndicatorProps {
  strikesRemaining: number;
  maxStrikes: number;
}

export default function StrikeIndicator({ strikesRemaining, maxStrikes }: StrikeIndicatorProps) {
  return (
    <div className="flex items-center gap-1" aria-label={`${strikesRemaining} of ${maxStrikes} strikes remaining`}>
      {Array.from({ length: maxStrikes }, (_, i) => (
        <Heart
          key={i}
          className={`h-5 w-5 ${
            i < strikesRemaining
              ? 'fill-red-500 text-red-500'
              : 'fill-gray-800 text-gray-800'
          }`}
        />
      ))}
    </div>
  );
}
