/**
 * Hook for computing and displaying the Divisiveness Index.
 */

import { useMemo } from 'react';
import { calculateDivisiveness } from '@/lib/doctrine/divisiveness';
import type { ReactionCount } from '@/lib/doctrine/types';
import { DI_BOOST_THRESHOLD, DI_SUPPRESS_THRESHOLD } from '@/lib/doctrine/constants';

export function useDoctrineDivisiveness(reactions: ReactionCount) {
  const di = useMemo(() => calculateDivisiveness(reactions), [reactions]);

  const label = useMemo(() => {
    if (di >= DI_BOOST_THRESHOLD) return 'Highly Divisive';
    if (di >= 50) return 'Divisive';
    if (di >= DI_SUPPRESS_THRESHOLD) return 'Moderate';
    return 'Consensus';
  }, [di]);

  const color = useMemo(() => {
    if (di >= DI_BOOST_THRESHOLD) return 'var(--color-reaction-fire, #F97316)';
    if (di >= 50) return 'var(--color-warning, #EAB308)';
    if (di >= DI_SUPPRESS_THRESHOLD) return 'var(--color-text-secondary, #A1A1AA)';
    return 'var(--color-text-muted, #52525B)';
  }, [di]);

  return { di, label, color, isBoosted: di >= DI_BOOST_THRESHOLD, isSuppressed: di < DI_SUPPRESS_THRESHOLD };
}
