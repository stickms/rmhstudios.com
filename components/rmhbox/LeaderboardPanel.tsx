/**
 * LeaderboardPanel — Fetches and displays leaderboard entries.
 *
 * Shows rank, name, and score columns. Fetches data via socket event.
 *
 * Props: none (fetches data itself via socket events)
 */
'use client';

import { useEffect, useState } from 'react';
import { Trophy } from 'lucide-react';
import { getSocket, emit } from '@/lib/rmhbox/socket';
import { C2S, S2C } from '@/lib/rmhbox/events';
import type { LeaderboardEntry } from '@/lib/rmhbox/types';

export default function LeaderboardPanel() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const handler = (data: { entries: LeaderboardEntry[] }) => {
      setEntries(data.entries);
      setLoading(false);
    };

    socket.on(S2C.LEADERBOARD_DATA, handler);
    emit(C2S.LEADERBOARD_FETCH);

    return () => {
      socket.off(S2C.LEADERBOARD_DATA, handler);
    };
  }, []);

  return (
    <div className="rounded-xl bg-(--rmhbox-surface) border border-(--rmhbox-border) p-4">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-(--rmhbox-text-muted)">
        <Trophy className="h-4 w-4" /> Leaderboard
      </h3>

      {loading ? (
        <p className="text-sm text-(--rmhbox-text-muted)">Loading…</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-(--rmhbox-text-muted)">No entries yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-(--rmhbox-text-muted)">
              <th className="pb-2 pr-2 font-medium">#</th>
              <th className="pb-2 pr-2 font-medium">Player</th>
              <th className="pb-2 text-right font-medium">Score</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.userId} className="border-t border-(--rmhbox-border)">
                <td className="py-1.5 pr-2 font-bold text-(--rmhbox-accent)">{entry.rank}</td>
                <td className="py-1.5 pr-2 text-(--rmhbox-text)">{entry.userName}</td>
                <td className="py-1.5 text-right font-mono text-(--rmhbox-text)">{entry.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
