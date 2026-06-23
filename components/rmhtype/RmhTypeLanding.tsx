/**
 * RMH Type Landing Page
 *
 * Mode selection and leaderboards for all difficulties.
 */

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, Users, User, Trophy } from 'lucide-react';
import { connectToRmhType, getSocket, disconnectFromRmhType, emit } from '@/lib/rmhtype/socket';
import { useRmhTypeStore } from '@/lib/rmhtype/store';
import { C2S, S2C } from '@/lib/rmhtype/events';
import { toast } from '@/lib/rmhtype/toast-store';
import RmhTypeHeader from '@/components/rmhtype/RmhTypeHeader';
import type { Difficulty } from '@/lib/rmhtype/types';
import { Link, useRouter } from '@tanstack/react-router';

interface LeaderboardEntry {
  rank: number;
  userId: string;
  userName: string;
  avatarUrl: string | null;
  bestWpm: number;
  bestWpmAccuracy: number;
  leaderboardScore: number;
  avgWpm: number;
  bestAccuracy: number;
  avgAccuracy: number;
  totalGamesPlayed: number;
  totalWins: number;
  bestStreak: number;
}

const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];

function LeaderboardTable({ entries, loading }: { entries: LeaderboardEntry[]; loading: boolean }) {
  const { t } = useTranslation("c-rmhtype");
  if (loading) {
    return <p className="text-sm text-(--rmhtype-text-muted) text-center py-4">{t("loading", { defaultValue: "Loading..." })}</p>;
  }
  if (entries.length === 0) {
    return <p className="text-sm text-(--rmhtype-text-muted) text-center py-4">{t("no-scores-yet", { defaultValue: "No scores yet. Be the first!" })}</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-(--rmhtype-text-muted) border-b border-(--rmhtype-border)">
            <th className="text-left py-2 pr-3 font-medium">{t("col-rank", { defaultValue: "#" })}</th>
            <th className="text-left py-2 pr-3 font-medium">{t("col-player", { defaultValue: "Player" })}</th>
            <th className="text-right py-2 pr-3 font-medium">{t("col-score", { defaultValue: "Score" })}</th>
            <th className="text-right py-2 pr-3 font-medium">{t("col-best-wpm", { defaultValue: "Best WPM" })}</th>
            <th className="text-right py-2 pr-3 font-medium">{t("col-accuracy", { defaultValue: "Accuracy" })}</th>
            <th className="text-right py-2 font-medium">{t("col-games", { defaultValue: "Games" })}</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
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
                {entry.leaderboardScore.toFixed(1)}
              </td>
              <td className="py-2.5 pr-3 text-right font-mono text-(--rmhtype-text-muted)">
                {entry.bestWpm.toFixed(1)}
              </td>
              <td className="py-2.5 pr-3 text-right font-mono text-(--rmhtype-text-muted)">
                {entry.bestWpmAccuracy.toFixed(1)}%
              </td>
              <td className="py-2.5 text-right font-mono text-(--rmhtype-text-muted)">
                {entry.totalGamesPlayed}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function RmhTypeLanding() {
  const { t } = useTranslation("c-rmhtype");
  const router = useRouter();
  const connectionStatus = useRmhTypeStore((s) => s.connectionStatus);

  const [leaderboards, setLeaderboards] = useState<Record<Difficulty, LeaderboardEntry[]>>({
    easy: [],
    medium: [],
    hard: [],
  });
  const [loadingStates, setLoadingStates] = useState<Record<Difficulty, boolean>>({
    easy: true,
    medium: true,
    hard: true,
  });

  useEffect(() => {
    let mounted = true;

    async function connect() {
      try {
        const socket = await connectToRmhType();

        const existingRoom = useRmhTypeStore.getState().room;
        if (existingRoom && mounted) {
          router.navigate({ to: `/rmhtype/${existingRoom.roomCode}` });
          return;
        }

        socket.on(S2C.LEADERBOARD_DATA, (data: { leaderboard: LeaderboardEntry[]; difficulty?: string }) => {
          if (!mounted || !data.difficulty) return;
          const diff = data.difficulty as Difficulty;
          if (!DIFFICULTIES.includes(diff)) return;
          setLeaderboards((prev) => ({ ...prev, [diff]: data.leaderboard }));
          setLoadingStates((prev) => ({ ...prev, [diff]: false }));
        });
      } catch (err) {
        if (mounted) {
          toast.error(err instanceof Error ? err.message : t("connection-failed", { defaultValue: "Connection failed" }));
          setLoadingStates({ easy: false, medium: false, hard: false });
        }
      }
    }

    connect();

    return () => { mounted = false; };
  }, [router]);

  // Fetch all 3 leaderboards when connected
  useEffect(() => {
    if (connectionStatus !== 'connected') return;
    for (const d of DIFFICULTIES) {
      emit(C2S.LEADERBOARD_FETCH, { limit: 20, difficulty: d });
    }
  }, [connectionStatus]);

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
      <RmhTypeHeader backLabel="Builds" backHref="/builds" />

      <div className="flex-1 overflow-y-auto p-4 md:p-8" style={{ scrollbarGutter: 'stable both-edges' }}>
        <div className="max-w-4xl mx-auto space-y-8">

          {/* Mode Selection */}
          <div className="text-center py-8">
            <div className="inline-flex items-center gap-2 mb-4">
              <Keyboard className="h-8 w-8 text-(--rmhtype-accent)" />
              <h2 className="text-3xl font-bold">RMH Type</h2>
            </div>
            <p className="text-(--rmhtype-text-muted) max-w-md mx-auto">
              {t("hero-subtitle", { defaultValue: "Test your typing speed solo or race against friends in real-time." })}
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <Link to="/rmhtype/solo"
              className="rounded-xl border border-(--rmhtype-border) bg-(--rmhtype-surface) p-8 text-left transition-all hover:border-(--rmhtype-accent) hover:bg-(--rmhtype-surface-hover)"
            >
              <User className="h-8 w-8 mb-4 text-(--rmhtype-accent)" />
              <h3 className="text-xl font-semibold mb-2">{t("solo-title", { defaultValue: "Solo Practice" })}</h3>
              <p className="text-sm text-(--rmhtype-text-muted)">
                {t("solo-desc", { defaultValue: "Practice typing at your own pace. Track your WPM and accuracy, and compete on the leaderboard." })}
              </p>
            </Link>

            <Link to="/rmhtype/multiplayer"
              className="rounded-xl border border-(--rmhtype-border) bg-(--rmhtype-surface) p-8 text-left transition-all hover:border-(--rmhtype-accent) hover:bg-(--rmhtype-surface-hover)"
            >
              <Users className="h-8 w-8 mb-4 text-(--rmhtype-accent)" />
              <h3 className="text-xl font-semibold mb-2">{t("multiplayer-title", { defaultValue: "Multiplayer Race" })}</h3>
              <p className="text-sm text-(--rmhtype-text-muted)">
                {t("multiplayer-desc", { defaultValue: "Create a room or join a friend. Race on the same passage and see who types fastest." })}
              </p>
            </Link>
          </div>

          {/* Leaderboards — all 3 difficulties */}
          <div className="space-y-6">
            <div className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-(--rmhtype-accent)" />
              <h3 className="text-lg font-semibold">{t("leaderboards-title", { defaultValue: "Leaderboards" })}</h3>
              <span className="text-xs text-(--rmhtype-text-muted) ml-auto">{t("leaderboards-ranked-by", { defaultValue: "Ranked by WPM × Accuracy" })}</span>
            </div>

            {DIFFICULTIES.map((d) => (
              <div key={d} className="rounded-xl border border-(--rmhtype-border) bg-(--rmhtype-surface) p-5">
                <h4 className="text-sm font-semibold capitalize mb-3 flex items-center gap-2">
                  <span className={`inline-block w-2 h-2 rounded-full ${
                    d === 'easy' ? 'bg-green-400' : d === 'medium' ? 'bg-yellow-400' : 'bg-red-400'
                  }`} />
                  {d}
                </h4>
                <LeaderboardTable entries={leaderboards[d]} loading={loadingStates[d]} />
              </div>
            ))}
          </div>

        </div>
      </div>
    </div>
  );
}
