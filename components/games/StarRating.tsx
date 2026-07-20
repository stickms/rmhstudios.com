'use client';

import { useState } from 'react';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * StarRating (§6) — display or input. When `onRate` is given it's interactive
 * (44px hit areas, keyboard-operable radio semantics).
 */
export function StarRating({
  value,
  onRate,
  size = 20,
  label,
}: {
  value: number;
  onRate?: (stars: number) => void;
  size?: number;
  label?: string;
}) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  const interactive = !!onRate;

  return (
    <span
      className="inline-flex items-center"
      role={interactive ? 'radiogroup' : undefined}
      aria-label={label}
    >
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= shown;
        const star = (
          <Star
            className={cn(filled ? 'fill-site-warning text-site-warning' : 'text-site-text-dim')}
            style={{ width: size, height: size }}
            aria-hidden
          />
        );
        if (!interactive) return <span key={n}>{star}</span>;
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n}`}
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
            onFocus={() => setHover(n)}
            onBlur={() => setHover(0)}
            onClick={() => onRate(n)}
            className="flex h-11 w-9 items-center justify-center"
          >
            {star}
          </button>
        );
      })}
    </span>
  );
}
