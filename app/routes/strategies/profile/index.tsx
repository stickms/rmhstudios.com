import { createFileRoute } from '@tanstack/react-router';
import { useDoctrineReputation } from '@/hooks/useDoctrineReputation';
import { XpBar } from '@/components/doctrine/reputation/xp-bar';
import { RankBadge } from '@/components/doctrine/reputation/rank-badge';
import { StreakDisplay } from '@/components/doctrine/puzzles/streak-display';
import { ActivityHeatmap } from '@/components/doctrine/reputation/activity-heatmap';
import { User, Settings } from 'lucide-react';
import { Link } from '@tanstack/react-router';

export const Route = createFileRoute('/strategies/profile/')({
  component: ProfilePage,
});

function ProfilePage() {
  const { data: rep, isLoading } = useDoctrineReputation();

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6 pb-20 md:pb-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <User size={20} style={{ color: 'var(--doctrine-accent)' }} />
          <h1 className="text-xl font-bold" style={{ color: 'var(--doctrine-text-primary)' }}>
            Profile
          </h1>
        </div>
        <Link to="/strategies/profile/settings" className="p-2 rounded hover:bg-white/5 transition-colors">
          <Settings size={16} className="text-white/30" />
        </Link>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-24 rounded-lg animate-pulse" style={{ background: 'var(--doctrine-bg-secondary)' }} />
          ))}
        </div>
      ) : rep && (
        <>
          {/* Rank + XP */}
          <div className="rounded-xl p-5 space-y-4" style={{ background: 'var(--doctrine-bg-secondary)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="flex items-center justify-between">
              <RankBadge xp={rep.totalXp} size="lg" />
              <StreakDisplay streak={rep.currentStreak} longestStreak={rep.longestStreak} />
            </div>
            <XpBar totalXp={rep.totalXp} />
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-3 gap-2 md:gap-3">
            <StatCard label="Total XP" value={rep.totalXp.toLocaleString()} />
            <StatCard label="Sahur Count" value={String(rep.sahurCount)} />
            <StatCard label="Coalition" value={`${rep.coalitionScore.toFixed(1)}x`} />
          </div>

          {/* Activity Heatmap */}
          <div className="rounded-lg p-4 space-y-3" style={{ background: 'var(--doctrine-bg-secondary)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <h3 className="text-xs font-mono uppercase tracking-wider text-white/40">Activity</h3>
            <ActivityHeatmap data={{}} weeks={16} />
          </div>

          {/* Links */}
          <div className="flex gap-3">
            <Link to="/strategies/profile/reputation" className="text-xs text-white/30 hover:text-white/50 transition-colors">
              Full XP Breakdown →
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg p-2.5 md:p-3 text-center" style={{ background: 'var(--doctrine-bg-secondary)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <p className="text-base md:text-lg font-bold tabular-nums" style={{ color: 'var(--doctrine-accent)' }}>{value}</p>
      <p className="text-xs md:text-[10px] text-white/30 mt-0.5">{label}</p>
    </div>
  );
}
