'use client';

import { sourceLabel } from '@/lib/homes/format';
import type { ListingSource } from '@/lib/homes/types';

const SOURCE_CLASSES: Record<ListingSource, string> = {
  sample: 'bg-site-surface text-site-text-muted border-site-border',
  craigslist: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
  rentcast: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
};

/** Small pill showing which provider a listing came from. */
export function SourceBadge({ source }: { source: ListingSource }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${SOURCE_CLASSES[source]}`}
    >
      {sourceLabel(source)}
    </span>
  );
}
