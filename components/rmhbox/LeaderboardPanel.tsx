/**
 * LeaderboardPanel — Fetches and displays leaderboard entries.
 *
 * Shows rank, name, and score columns. Fetches data via HTTP API on mount,
 * then listens for real-time updates via socket events.
 *
 * Props: none (fetches data itself)
 */
'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Trophy } from 'lucide-react';
import { getSocket, emit } from '@/lib/rmhbox/socket';
import { C2S, S2C } from '@/lib/rmhbox/events';
import type { LeaderboardEntry } from '@/lib/rmhbox/types';

export default function LeaderboardPanel() {
  const { t } = useTranslation("c-rmhbox");
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch initial data via HTTP API
  useEffect(() => {
    async function fetchLeaderboard() {
      try {
        const response = await fetch('/api/rmhbox/leaderboard?period=all-time&metric=score&limit=10');
        if (response.ok) {
          const data = await response.json();
          setEntries(data.entries || []);
        }
      } catch (err) {
        console.error('[LeaderboardPanel] Failed to fetch leaderboard:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchLeaderboard();
  }, []);

  // Listen for real-time updates via WebSocket
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
        <Trophy className="h-4 w-4" /> {t("leaderboard", { defaultValue: "Leaderboard" })}
      </h3>

      {loading ? (
        <p className="text-sm text-(--rmhbox-text-muted)">{t("loading", { defaultValue: "Loading…" })}</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-(--rmhbox-text-muted)">{t("no-entries", { defaultValue: "No entries yet." })}</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-(--rmhbox-text-muted)">
              <th className="pb-2 pr-2 font-medium">#</th>
              <th className="pb-2 pr-2 font-medium">{t("player", { defaultValue: "Player" })}</th>
              <th className="pb-2 text-right font-medium">{t("score", { defaultValue: "Score" })}</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.userId} className="border-t border-(--rmhbox-border)">
                <td className="py-1.5 pr-2 font-bold text-(--rmhbox-accent)">{entry.rank}</td>
                <td className="py-1.5 pr-2 text-(--rmhbox-text)">
                  <div className="flex items-center gap-2">
                    {entry.avatarUrl ? (
                      <img
                        src={entry.avatarUrl}
                        alt={entry.userName}
                        className="h-6 w-6 shrink-0 rounded-full object-cover"
                        loading="lazy"
                        onError={(e) => {
                          const target = e.currentTarget;
                          const fallback = target.nextElementSibling as HTMLElement | null;
                          target.style.display = 'none';
                          if (fallback) fallback.style.display = '';
                        }}
                      />
                    ) : null}
                    <div
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-(--rmhbox-accent) text-[10px] font-bold text-white"
                      style={entry.avatarUrl ? { display: 'none' } : undefined}
                    >
                      {entry.userName.charAt(0).toUpperCase()}
                    </div>
                    <span className="truncate">{entry.userName}</span>
                  </div>
                </td>
                <td className="py-1.5 text-right font-mono text-(--rmhbox-text)">{entry.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
