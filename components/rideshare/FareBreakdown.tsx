'use client';

import { CircleDollarSign, Clock, Route as RouteIcon, Flag } from 'lucide-react';
import { fareBreakdown, formatUsd, formatDistance, formatDuration } from '@/lib/rideshare/geo';
import { rideClassName } from '@/lib/rideshare/classes';

interface FareBreakdownProps {
  distanceMeters: number | null | undefined;
  durationSeconds: number | null | undefined;
  classId: string;
  /** Compact single-line variant for inline summaries. */
  compact?: boolean;
}

/**
 * Price visualizer. Itemises the (waived) fare so riders can see what a trip
 * would normally cost, then shows the real total: FREE.
 */
export function FareBreakdown({ distanceMeters, durationSeconds, classId, compact }: FareBreakdownProps) {
  const fare = fareBreakdown(distanceMeters, durationSeconds, classId);

  if (compact) {
    return (
      <span className="inline-flex items-center gap-2">
        <span className="text-sm font-bold text-emerald-400">Free</span>
        <span className="text-xs text-site-text-dim line-through">{formatUsd(fare.subtotalCents)}</span>
      </span>
    );
  }

  const rows = [
    { icon: Flag, label: 'Base fare', value: fare.baseCents },
    { icon: RouteIcon, label: `Distance · ${formatDistance(distanceMeters)}`, value: fare.distanceCents },
    { icon: Clock, label: `Time · ${formatDuration(durationSeconds)}`, value: fare.timeCents },
  ];

  return (
    <div className="rounded-xl border border-site-border bg-site-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-site-text">Fare estimate</h4>
        <span className="text-xs text-site-text-muted">{rideClassName(classId)}</span>
      </div>

      <dl className="space-y-2">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between text-sm">
            <dt className="flex items-center gap-2 text-site-text-muted">
              <r.icon className="h-3.5 w-3.5" /> {r.label}
            </dt>
            <dd className="text-site-text">{formatUsd(r.value)}</dd>
          </div>
        ))}
        {fare.multiplier !== 1 && (
          <div className="flex items-center justify-between text-xs text-site-text-dim">
            <dt>Class multiplier</dt>
            <dd>×{fare.multiplier}</dd>
          </div>
        )}
      </dl>

      <div className="mt-3 flex items-center justify-between border-t border-site-border pt-3">
        <div>
          <div className="flex items-center gap-2">
            <CircleDollarSign className="h-4 w-4 text-emerald-400" />
            <span className="text-base font-bold text-emerald-400">Free</span>
          </div>
          <span className="text-xs text-site-text-dim">Free during preview</span>
        </div>
        <div className="text-right">
          <div className="text-sm text-site-text-dim line-through">{formatUsd(fare.subtotalCents)}</div>
          <div className="text-lg font-bold text-site-text">{formatUsd(fare.totalCents)}</div>
        </div>
      </div>
    </div>
  );
}
