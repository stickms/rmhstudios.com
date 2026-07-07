'use client';

import { Badge } from '@/components/ui/badge';
import { sourceLabel } from '@/lib/homes/format';
import type { ListingSource } from '@/lib/homes/types';

const SOURCE_VARIANT: Record<ListingSource, 'warning' | 'accent' | 'success'> = {
  sample: 'warning',
  craigslist: 'accent',
  rentcast: 'success',
};

/** Small pill showing which provider a listing came from (demo/Craigslist/RentCast). */
export function SourceBadge({
  source,
  size = 'sm',
}: {
  source: ListingSource;
  size?: 'sm' | 'default';
}) {
  return (
    <Badge variant={SOURCE_VARIANT[source]} size={size} className="uppercase tracking-wide">
      {sourceLabel(source)}
    </Badge>
  );
}
