/**
 * The wallet's "Earn" tab: the daily wheel (lib/wheel) and the coin vault
 * (lib/staking). Both are coin features, so they moved here from /progress in
 * the 2026-11-19 consolidation. Lazy-loaded when the tab opens; the two sit on
 * one rule rather than in boxes (R3).
 */
import { DailyWheel } from './DailyWheel';
import { StakingCard } from './StakingCard';

export default function EarnPanel() {
  return (
    <div className="divide-y divide-site-border">
      <DailyWheel />
      <StakingCard />
    </div>
  );
}
