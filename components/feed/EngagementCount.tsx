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
 * Shared classes for the tinted hover/press surface of an engagement control.
 * Callers add the height and padding (`h-9 px-2.5`, `h-6 px-1`, …) and the tint
 * (`group-hover:bg-site-danger/10`).
 *
 * The pill wraps the icon AND the count, and it hugs them: no reserved width,
 * no trailing slot. A surface stretched to the full button — which has to be
 * wider than its content to keep the row from reflowing — reads as a blob
 * sitting off-centre behind the icon, with dead space after the number. Hugging
 * keeps the padding even on both sides in every state: a circle when the count
 * is hidden at zero, a pill once there's a number in it.
 *
 * Because the pill hugs, its width changes with the count. Callers are
 * responsible for pinning the control's own position — a fixed grid column on
 * the post actions, a min-width on the denser reply row — so a count appearing
 * never nudges the icon or its neighbours.
 */
export const engagementPill =
'flex w-fit shrink-0 items-center rounded-full transition-[background-color,transform] duration-150';

/**
 * The count beside an engagement icon (comment, reRMHark, like, views).
 *
 * Renders nothing at all at zero — no empty wrapper — so the pill around it
 * closes up into a clean circle rather than a lopsided blob.
 *
 * Render it INSIDE the button so the number shares the icon's click target.
 */
export function EngagementCount({ value }: { value: number | undefined }) {
 if (!Math.round(value ?? 0)) return null;
 return (
 <span className="text-xs tabular-nums">
 <AnimatedCount value={value} format={formatCount} hideZero />
 </span>
 );
}
