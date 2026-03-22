import { createFileRoute } from '@tanstack/react-router';
import { useDoctrineReputationLeaderboard } from '@/hooks/useDoctrineReputation';
import { Trophy } from 'lucide-react';
import { RankBadge } from '@/components/doctrine/reputation/rank-badge';

export const Route = createFileRoute('/strategies/profile/reputation')({
  component: ReputationPage,
});

function ReputationPage() {
  const { data, isLoading } = useDoctrineReputationLeaderboard(50);

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6 pb-20 md:pb-6">
      <div className="flex items-center gap-2">
        <Trophy size={20} style={{ color: 'var(--doctrine-accent)' }} />
        <h1 className="text-xl font-bold" style={{ color: 'var(--doctrine-text-primary)' }}>
          Reputation Leaderboard
        </h1>
      </div>

      <div className="rounded-lg overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
        {isLoading ? (
          <div className="p-8 text-center text-sm text-white/30">Loading...</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'var(--doctrine-bg-secondary)' }}>
                <th className="text-left px-4 py-2 text-[10px] font-mono text-white/30">#</th>
                <th className="text-left px-4 py-2 text-[10px] font-mono text-white/30">Agent</th>
                <th className="text-left px-4 py-2 text-[10px] font-mono text-white/30">Rank</th>
                <th className="text-right px-4 py-2 text-[10px] font-mono text-white/30">XP</th>
                <th className="text-right px-4 py-2 text-[10px] font-mono text-white/30">Streak</th>
              </tr>
            </thead>
            <tbody>
              {data?.map?.((entry: { rank: number; user: { name: string; handle: string }; totalXp: number; currentStreak: number; level: { name: string; badge: string } }, i: number) => (
                <tr key={i} className="border-t border-white/[0.04] hover:bg-white/[0.02]">
                  <td className="px-4 py-2 font-mono text-white/40">{entry.rank}</td>
                  <td className="px-4 py-2 text-white/80">{entry.user?.name ?? entry.user?.handle ?? 'Anonymous'}</td>
                  <td className="px-4 py-2">
                    <span className="text-xs">{entry.level?.badge} {entry.level?.name}</span>
                  </td>
                  <td className="px-4 py-2 text-right font-mono" style={{ color: 'var(--doctrine-accent)' }}>
                    {entry.totalXp.toLocaleString()}
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-white/40">{entry.currentStreak}d</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
