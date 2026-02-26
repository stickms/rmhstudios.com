/**
 * RMH Type Landing Page
 *
 * Mode selection and leaderboard.
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Keyboard, Users, User, Trophy } from 'lucide-react';
import { connectToRmhType, getSocket, disconnectFromRmhType, emit } from '@/lib/rmhtype/socket';
import { useRmhTypeStore } from '@/lib/rmhtype/store';
import { C2S, S2C } from '@/lib/rmhtype/events';
import { toast } from '@/lib/rmhtype/toast-store';
import RmhTypeHeader from '@/components/rmhtype/RmhTypeHeader';
import type { Difficulty } from '@/lib/rmhtype/types';

export default function RmhTypeLanding() {
  const router = useRouter();
  const connectionStatus = useRmhTypeStore((s) => s.connectionStatus);

  // Leaderboard
  interface LeaderboardEntry {
    rank: number;
    userId: string;
    userName: string;
    avatarUrl: string | null;
    bestWpm: number;
    avgWpm: number;
    bestAccuracy: number;
    avgAccuracy: number;
    totalGamesPlayed: number;
    totalWins: number;
    bestStreak: number;
  }
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(true);
  const [leaderboardDifficulty, setLeaderboardDifficulty] = useState<Difficulty>('medium');

  useEffect(() => {
    let mounted = true;

    async function connect() {
      try {
        const socket = await connectToRmhType();

        const existingRoom = useRmhTypeStore.getState().room;
        if (existingRoom && mounted) {
          router.push(`/rmhtype/${existingRoom.roomCode}`);
          return;
        }

        socket.on(S2C.LEADERBOARD_DATA, (data: { leaderboard: LeaderboardEntry[]; difficulty?: string }) => {
          if (mounted) {
            setLeaderboard(data.leaderboard);
            setLeaderboardLoading(false);
          }
        });
      } catch (err) {
        if (mounted) {
          toast.error(err instanceof Error ? err.message : 'Connection failed');
          setLeaderboardLoading(false);
        }
      }
    }

    connect();

    return () => { mounted = false; };
  }, [router]);

  // Fetch leaderboard when difficulty tab changes or connection ready
  useEffect(() => {
    if (connectionStatus !== 'connected') return;
    setLeaderboardLoading(true);
    emit(C2S.LEADERBOARD_FETCH, { limit: 20, difficulty: leaderboardDifficulty });
  }, [leaderboardDifficulty, connectionStatus]);

  useEffect(() => {
    return () => {
      const socket = getSocket();
      if (socket && !socket.connected && !socket.active) {
        disconnectFromRmhType();
      }
    };
  }, []);

  return (
    <div className="flex h-screen flex-col">
      <RmhTypeHeader backLabel="Apps" backHref="/apps" />

      <div className="flex-1 overflow-y-auto p-4 md:p-8" style={{ scrollbarGutter: 'stable both-edges' }}>
        <div className="max-w-4xl mx-auto space-y-8">

          {/* Mode Selection */}
          <div className="text-center py-8">
            <div className="inline-flex items-center gap-2 mb-4">
              <Keyboard className="h-8 w-8 text-(--rmhtype-accent)" />
              <h2 className="text-3xl font-bold">RMH Type</h2>
            </div>
            <p className="text-(--rmhtype-text-muted) max-w-md mx-auto">
              Test your typing speed solo or race against friends in real-time.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <Link
              href="/rmhtype/solo"
              className="rounded-xl border border-(--rmhtype-border) bg-(--rmhtype-surface) p-8 text-left transition-all hover:border-(--rmhtype-accent) hover:bg-(--rmhtype-surface-hover)"
            >
              <User className="h-8 w-8 mb-4 text-(--rmhtype-accent)" />
              <h3 className="text-xl font-semibold mb-2">Solo Practice</h3>
              <p className="text-sm text-(--rmhtype-text-muted)">
                Practice typing at your own pace. Track your WPM and accuracy, and compete on the leaderboard.
              </p>
            </Link>

            <Link
              href="/rmhtype/multiplayer"
              className="rounded-xl border border-(--rmhtype-border) bg-(--rmhtype-surface) p-8 text-left transition-all hover:border-(--rmhtype-accent) hover:bg-(--rmhtype-surface-hover)"
            >
              <Users className="h-8 w-8 mb-4 text-(--rmhtype-accent)" />
              <h3 className="text-xl font-semibold mb-2">Multiplayer Race</h3>
              <p className="text-sm text-(--rmhtype-text-muted)">
                Create a room or join a friend. Race on the same passage and see who types fastest.
              </p>
            </Link>
          </div>

          {/* Leaderboard */}
          <div className="rounded-xl border border-(--rmhtype-border) bg-(--rmhtype-surface) p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Trophy className="h-5 w-5 text-(--rmhtype-accent)" />
                Leaderboard
              </h3>
              <div className="flex gap-1">
                {(['easy', 'medium', 'hard'] as Difficulty[]).map((d) => (
                  <button
                    key={d}
                    onClick={() => setLeaderboardDifficulty(d)}
                    className={`px-3 py-1 rounded-lg text-xs font-medium capitalize transition-colors ${
                      leaderboardDifficulty === d
                        ? 'bg-(--rmhtype-accent) text-white'
                        : 'bg-(--rmhtype-bg) text-(--rmhtype-text-muted) hover:bg-(--rmhtype-surface-hover)'
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>

            {leaderboardLoading ? (
              <p className="text-sm text-(--rmhtype-text-muted) text-center py-4">Loading...</p>
            ) : leaderboard.length === 0 ? (
              <p className="text-sm text-(--rmhtype-text-muted) text-center py-4">No scores yet. Be the first!</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-(--rmhtype-text-muted) border-b border-(--rmhtype-border)">
                      <th className="text-left py-2 pr-3 font-medium">#</th>
                      <th className="text-left py-2 pr-3 font-medium">Player</th>
                      <th className="text-right py-2 pr-3 font-medium">Best WPM</th>
                      <th className="text-right py-2 pr-3 font-medium">Avg WPM</th>
                      <th className="text-right py-2 pr-3 font-medium">Accuracy</th>
                      <th className="text-right py-2 font-medium">Games</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaderboard.map((entry) => (
                      <tr key={entry.userId} className="border-b border-(--rmhtype-border)/50 last:border-b-0">
                        <td className="py-2.5 pr-3 font-mono text-(--rmhtype-text-muted)">
                          {entry.rank <= 3 ? ['🥇', '🥈', '🥉'][entry.rank - 1] : entry.rank}
                        </td>
                        <td className="py-2.5 pr-3 flex items-center gap-2">
                          {entry.avatarUrl ? (
                            <img src={entry.avatarUrl} alt="" className="h-5 w-5 rounded-full" />
                          ) : (
                            <div className="h-5 w-5 rounded-full bg-(--rmhtype-accent)/20" />
                          )}
                          <span className="truncate max-w-35">{entry.userName}</span>
                        </td>
                        <td className="py-2.5 pr-3 text-right font-mono font-semibold text-(--rmhtype-accent)">
                          {entry.bestWpm.toFixed(2)}
                        </td>
                        <td className="py-2.5 pr-3 text-right font-mono text-(--rmhtype-text-muted)">
                          {entry.avgWpm.toFixed(2)}
                        </td>
                        <td className="py-2.5 pr-3 text-right font-mono text-(--rmhtype-text-muted)">
                          {entry.bestAccuracy.toFixed(2)}%
                        </td>
                        <td className="py-2.5 text-right font-mono text-(--rmhtype-text-muted)">
                          {entry.totalGamesPlayed}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
