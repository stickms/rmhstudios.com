/**
 * LeaderboardPanel.tsx — Signal Forge
 * ────────────────────────────────────
 * Reusable leaderboard display used by the landing screen and game-over screen.
 */

import React, { useState, useEffect } from 'react';
import { useTranslation } from "react-i18next";
import { Button } from '@/components/ui/button';
import { api } from '@/lib/contract/client';
import {
  getSignalForgeLeaderboardApi,
  submitSignalForgeScoreApi,
} from '@features/signal-forge/engine/signal-forge.contract';
import { useArrival } from '@/components/ui/arrive';
import { cn } from '@/lib/utils';

export interface LeaderboardEntry {
  username: string;
  highScore: number;
  floorReached: number;
}

interface Props {
  /** If true, renders inline (for landing screen). Otherwise as a modal overlay. */
  inline?: boolean;
  /** If modal mode, callback to close the modal. */
  onClose?: () => void;
}

/** Fetch leaderboard entries from the API. */
export async function fetchLeaderboardData(): Promise<LeaderboardEntry[]> {
  try {
    return await api(getSignalForgeLeaderboardApi, { retries: 0 });
  } catch (error) {
    console.error('Failed to fetch leaderboard:', error);
  }
  return [];
}

/** Submit a score to the API. Returns true on success. */
export async function submitScoreToServer(score: number, floorReached: number): Promise<boolean> {
  try {
    await api(submitSignalForgeScoreApi, { body: { score, floorReached } });
    return true;
  } catch (error) {
    console.error('Failed to submit score:', error);
    return false;
  }
}

export function LeaderboardPanel({ inline, onClose }: Props) {
  const { t } = useTranslation("c-signal-forge");
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const arrival = useArrival(loaded);

  useEffect(() => {
    let cancelled = false;
    fetchLeaderboardData().then(data => {
      if (cancelled) return;
      setLeaderboard(data);
      setLoaded(true);
    });
    return () => { cancelled = true; };
  }, []);

  const content = (
    <>
      <h3 className="text-xl font-bold text-cyan-400 mb-3 flex items-center gap-2">🏆 {t("top-scores", { defaultValue: "Top Scores" })}</h3>
      <div className="space-y-1 max-h-64 overflow-y-auto bg-black bg-opacity-50 p-3 rounded border border-slate-700">
        {leaderboard.length === 0 ? (
          // Held (invisible) while the scores load, so the empty line never claims there are none yet.
          <p className={cn('text-slate-400 text-sm text-center py-4', !loaded && 'invisible', arrival)}>{t("no-scores-yet", { defaultValue: "No scores yet. Be the first!" })}</p>
        ) : (
          leaderboard.map((entry, idx) => (
            <div key={idx} className={cn('flex items-center justify-between text-sm font-mono p-2 hover:bg-slate-800 rounded', arrival)}>
              <span className={`font-bold w-8 ${idx === 0 ? 'text-yellow-400' : idx === 1 ? 'text-slate-300' : idx === 2 ? 'text-orange-400' : 'text-cyan-400'}`}>
                #{idx + 1}
              </span>
              <span className="flex-1 ml-2 text-slate-300 truncate">{entry.username}</span>
              <span className="text-green-400 font-bold ml-4">{entry.highScore}</span>
              <span className="text-slate-500 ml-3 text-xs">F{entry.floorReached}</span>
            </div>
          ))
        )}
      </div>
    </>
  );

  if (inline) return <div>{content}</div>;

  return (
    <div className="w-full h-full bg-black bg-opacity-90 flex items-center justify-center z-50 p-6">
      <div className="bg-linear-to-b from-slate-900 to-black border-2 border-cyan-500 p-8 rounded-lg max-w-md w-full shadow-2xl">
        {content}
        <div className="mt-4">
          <Button
            onClick={onClose}
            className="w-full bg-slate-700 hover:bg-slate-600 text-white py-2 rounded-lg"
          >
            {t("close", { defaultValue: "Close" })}
          </Button>
        </div>
      </div>
    </div>
  );
}
