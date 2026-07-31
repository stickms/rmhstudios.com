'use client';

import { AnimatedCount } from'@/components/ui/AnimatedCount';

/** Compact engagement count: 1234 → 1.2K, 1234567 → 1.2M, 0 → hidden. */
export function formatCount(n: number | undefined): string {
 if (!n) return'';
 if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
 if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
 return String(n);
}

/**
 * The count slot that sits next to an engagement icon (comment, reRMHark,
 * like, views).
 *
 * The count is hidden at zero, so without a reserved slot the icon slid
 * sideways the instant you liked something — and back again when you undid it.
 * A moving target makes unliking a chore, so the slot keeps its width whether
 * or not a number is in it: `min-w-4` plus `tabular-nums` renders 0, 1 and 2
 * digits at one width, which covers the toggle that actually matters.
 *
 * Render it INSIDE the button so the number shares the icon's click target.
 */
export function EngagementCount({ value }: { value: number | undefined }) {
 return (
 <span className="min-w-4 text-left text-xs tabular-nums">
 <AnimatedCount value={value} format={formatCount} hideZero />
 </span>
 );
}
