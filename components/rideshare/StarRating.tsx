'use client';

import { useState } from 'react';
import { Star } from 'lucide-react';

interface StarRatingProps {
  value: number;
  onChange?: (value: number) => void;
  readOnly?: boolean;
  size?: number;
}

export function StarRating({ value, onChange, readOnly, size = 24 }: StarRatingProps) {
  const [hover, setHover] = useState(0);
  const active = hover || value;

  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= active;
        const Tag = readOnly ? 'span' : 'button';
        return (
          <Tag
            key={n}
            {...(readOnly
              ? {}
              : {
                  type: 'button' as const,
                  onClick: () => onChange?.(n),
                  onMouseEnter: () => setHover(n),
                  onMouseLeave: () => setHover(0),
                  'aria-label': `${n} star${n > 1 ? 's' : ''}`,
                })}
            className={readOnly ? 'inline-flex' : 'inline-flex cursor-pointer transition-transform hover:scale-110'}
          >
            <Star
              style={{ width: size, height: size }}
              className={filled ? 'fill-amber-400 text-amber-400' : 'text-site-text-dim'}
            />
          </Tag>
        );
      })}
    </div>
  );
}
