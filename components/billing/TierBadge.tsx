import type { Tier } from '@/lib/entitlements';
import { hasBadge } from '@/lib/entitlements';

const LABELS: Record<Tier, string> = {
  free: 'Free',
  starter: 'Starter',
  pro: 'Pro',
  enterprise: 'Enterprise',
};

/** Renders a small tier badge for Pro+ users; nothing for free/starter. */
export function TierBadge({ tier }: { tier: Tier }) {
  if (!hasBadge(tier)) return null;
  return (
    <span className="inline-flex items-center rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-400 ring-1 ring-amber-500/30">
      {LABELS[tier]}
    </span>
  );
}
