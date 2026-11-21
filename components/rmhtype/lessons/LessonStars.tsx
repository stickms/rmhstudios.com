/**
 * Three stars, drawn filled for the ones earned. The count is also spoken in words
 * (`aria-label`), so the fill is never the only carrier.
 */
import { Star } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

export function LessonStars({
  stars,
  className,
}: {
  stars: number;
  className?: string;
}) {
  const {
    t,
  } =
    useTranslation(
      'rmhtype-lessons',
    );
  return (
    <span
      role="img"
      aria-label={t(
        'stars-label',
        {
          stars,
          defaultValue:
            '{{stars}} of 3 stars',
        },
      )}
      className={cn(
        'inline-flex items-center gap-0.5',
        className,
      )}
    >
      {[
        1,
        2,
        3,
      ].map(
        (
          n,
        ) => (
          <Star
            key={
              n
            }
            aria-hidden="true"
            className={cn(
              'size-4',
              n <=
                stars
                ? 'fill-current text-app-accent'
                : 'text-app-text-dim',
            )}
          />
        ),
      )}
    </span>
  );
}
