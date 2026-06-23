/**
 * MinigameLeaderboardModal — Per-minigame leaderboard overlay.
 *
 * Shows All-Time and Weekly tabs for a specific minigame,
 * fetched via the REST API (no WebSocket required).
 *
 * Reference: docs/rmhbox/design-spec/core.md §14A.3
 */
'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Trophy, X } from 'lucide-react';
import type { LeaderboardEntry } from '@/lib/rmhbox/types';

interface MinigameLeaderboardModalProps {
  minigameId: string;
  displayName: string;
  isOpen: boolean;
  onClose: () => void;
}

type Period = 'all-time' | 'weekly';

export default function MinigameLeaderboardModal({
  minigameId,
  displayName,
  isOpen,
  onClose,
}: MinigameLeaderboardModalProps) {
  const { t } = useTranslation("c-rmhbox");
  const [activePeriod, setActivePeriod] = useState<Period>('all-time');
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [userRank, setUserRank] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchLeaderboard = useCallback(
    async (period: Period) => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/rmhbox/leaderboard?minigame=${encodeURIComponent(minigameId)}&period=${period}&limit=20`,
        );
        if (res.ok) {
          const data = await res.json();
          setEntries(data.entries ?? []);
          setUserRank(data.userRank ?? null);
        }
      } catch {
        // Silently fail — empty leaderboard shown
      } finally {
        setLoading(false);
      }
    },
    [minigameId],
  );

  useEffect(() => {
    if (isOpen) {
      fetchLeaderboard(activePeriod);
    }
  }, [isOpen, activePeriod, fetchLeaderboard]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
      data-testid="minigame-leaderboard-modal"
    >
      <div
        className="w-full max-w-md mx-4 rounded-xl border border-(--rmhbox-border) bg-(--rmhbox-surface) p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="flex items-center gap-2 text-lg font-semibold text-(--rmhbox-text)">
            <Trophy className="h-5 w-5 text-(--rmhbox-accent)" />
            {t("leaderboard-title", { defaultValue: "{{displayName}} Leaderboard", displayName })}
          </h3>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-(--rmhbox-text-muted) hover:text-(--rmhbox-text) transition-colors"
            aria-label={t("close-leaderboard", { defaultValue: "Close leaderboard" })}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Period tabs */}
        <div className="flex gap-2 mb-4">
          {(['all-time', 'weekly'] as const).map((period) => (
            <button
              key={period}
              onClick={() => setActivePeriod(period)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                activePeriod === period
                  ? 'bg-(--rmhbox-accent) text-white'
                  : 'bg-(--rmhbox-surface-hover) text-(--rmhbox-text-muted) hover:text-(--rmhbox-text)'
              }`}
            >
              {period === 'all-time' ? t("period-all-time", { defaultValue: "All-Time" }) : t("period-weekly", { defaultValue: "Weekly" })}
            </button>
          ))}
        </div>

        {/* Leaderboard table */}
        {loading ? (
          <p className="text-sm text-center py-8 text-(--rmhbox-text-muted)">{t("loading", { defaultValue: "Loading…" })}</p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-center py-8 text-(--rmhbox-text-muted)">{t("no-entries", { defaultValue: "No entries yet." })}</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-(--rmhbox-text-muted)">
                <th className="pb-2 pr-2 font-medium">#</th>
                <th className="pb-2 pr-2 font-medium">{t("col-player", { defaultValue: "Player" })}</th>
                <th className="pb-2 text-right font-medium">{t("col-score", { defaultValue: "Score" })}</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.userId} className="border-t border-(--rmhbox-border)">
                  <td className="py-1.5 pr-2 font-bold text-(--rmhbox-accent)">{entry.rank}</td>
                  <td className="py-1.5 pr-2 text-(--rmhbox-text)">{entry.userName}</td>
                  <td className="py-1.5 text-right font-mono text-(--rmhbox-text)">
                    {entry.value.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* User rank */}
        {userRank !== null && (
          <p className="mt-4 text-sm text-center text-(--rmhbox-text-muted)">
            {t("your-rank", { defaultValue: "Your Rank:" })} <span className="font-bold text-(--rmhbox-accent)">#{userRank}</span>
          </p>
        )}
      </div>
    </div>
  );
}
