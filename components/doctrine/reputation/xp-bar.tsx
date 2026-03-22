import { RANKS } from '@/lib/doctrine/constants';
import { getRank } from '@/lib/doctrine/reputation';

interface XpBarProps {
  totalXp: number;
}

export function XpBar({ totalXp }: XpBarProps) {
  const currentRank = getRank(totalXp);
  const currentIndex = RANKS.findIndex(r => r.name === currentRank.name);
  const nextRank = RANKS[currentIndex + 1];

  const progress = nextRank
    ? ((totalXp - currentRank.minXp) / (nextRank.minXp - currentRank.minXp)) * 100
    : 100;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-white/80">
          {currentRank.badge} {currentRank.name}
        </span>
        {nextRank && (
          <span className="text-white/40">
            {totalXp.toLocaleString()} / {nextRank.minXp.toLocaleString()} XP
          </span>
        )}
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--doctrine-bg-tertiary, #1C1C20)' }}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${Math.min(100, progress)}%`,
            background: `linear-gradient(90deg, var(--doctrine-accent, #F97316), var(--doctrine-accent, #F97316)88)`,
          }}
        />
      </div>
      {nextRank && (
        <p className="text-[10px] text-white/30">
          {(nextRank.minXp - totalXp).toLocaleString()} XP to {nextRank.badge} {nextRank.name}
        </p>
      )}
    </div>
  );
}
