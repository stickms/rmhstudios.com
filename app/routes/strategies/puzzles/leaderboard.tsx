import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { Trophy } from 'lucide-react';
import { useState } from 'react';
import { RankBadge } from '@/components/doctrine/reputation/rank-badge';

export const Route = createFileRoute('/strategies/puzzles/leaderboard')({
  component: LeaderboardPage,
});

const MODES = ['ALIBI', 'SPECTRUM', 'OUTCAST', 'CHAINLINK', 'IMPOSTOR'] as const;

function LeaderboardPage() {
  const [mode, setMode] = useState<string>(MODES[0]);
  const today = new Date().toISOString().slice(0, 10);

  const { data, isLoading } = useQuery({
    queryKey: ['doctrine', 'leaderboard', mode, today],
    queryFn: async () => {
      const res = await fetch(`/api/doctrine/puzzles/leaderboard?mode=${mode}&date=${today}&limit=50`);
      return res.json();
    },
    staleTime: 30_000,
  });

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6 pb-20 md:pb-6">
      <div className="flex items-center gap-2">
        <Trophy size={20} style={{ color: 'var(--doctrine-accent)' }} />
        <h1 className="text-xl font-bold" style={{ color: 'var(--doctrine-text-primary)' }}>
          Leaderboards
        </h1>
      </div>

      {/* Mode tabs */}
      <div className="flex gap-1 overflow-x-auto">
        {MODES.map(m => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`px-3 py-2.5 md:py-1.5 text-sm md:text-xs font-mono rounded transition-colors shrink-0 min-h-[44px] md:min-h-0 ${
              mode === m ? 'text-white bg-white/10' : 'text-white/40 hover:text-white/60'
            }`}
          >
            {m}
          </button>
        ))}
      </div>

      {/* Leaderboard table */}
      <div className="rounded-lg overflow-x-auto" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
        {isLoading ? (
          <div className="p-8 text-center text-sm text-white/30">Loading...</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'var(--doctrine-bg-secondary)' }}>
                <th className="text-left px-2.5 md:px-4 py-2 text-xs md:text-[10px] font-mono text-white/30">#</th>
                <th className="text-left px-2.5 md:px-4 py-2 text-xs md:text-[10px] font-mono text-white/30">Player</th>
                <th className="text-right px-2.5 md:px-4 py-2 text-xs md:text-[10px] font-mono text-white/30">Score</th>
                <th className="text-right px-2.5 md:px-4 py-2 text-xs md:text-[10px] font-mono text-white/30">Time</th>
              </tr>
            </thead>
            <tbody>
              {data?.map?.((entry: { rank: number; user: { name: string; handle: string }; score: number; timeMs: number }, i: number) => (
                <tr key={i} className="border-t border-white/[0.04] hover:bg-white/[0.02]">
                  <td className="px-4 py-2 font-mono text-white/40">{entry.rank}</td>
                  <td className="px-4 py-2 text-white/80">
                    {entry.user?.name ?? entry.user?.handle ?? 'Anonymous'}
                  </td>
                  <td className="px-4 py-2 text-right font-mono" style={{ color: 'var(--doctrine-accent)' }}>
                    {entry.score}
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-white/40">
                    {(entry.timeMs / 1000).toFixed(1)}s
                  </td>
                </tr>
              ))}
              {(!data || data.length === 0) && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-white/30">
                    No submissions yet today. Be the first.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
