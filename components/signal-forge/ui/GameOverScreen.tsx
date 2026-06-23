/**
 * GameOverScreen.tsx — Signal Forge
 * ──────────────────────────────────
 * Shown when the player dies. Displays final score, floor reached,
 * auto-submits the score if authenticated, and provides leaderboard
 * and return-to-menu controls.
 */

'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from "react-i18next";
import { Button } from '@/components/ui/button';
import { authClient } from '@/lib/auth-client';
import { LeaderboardPanel, submitScoreToServer, fetchLeaderboardData } from './LeaderboardPanel';

interface Props {
  score: number;
  floor: number;
  onReturnToLanding?: () => void;
}

export function GameOverScreen({ score, floor, onReturnToLanding }: Props) {
  const { t } = useTranslation("c-signal-forge");
  const session = authClient.useSession();
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [scoreSubmitted, setScoreSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const autoSubmitRef = useRef(false);

  // Auto-submit score on mount
  useEffect(() => {
    if (session.data && !autoSubmitRef.current) {
      autoSubmitRef.current = true;
      let cancelled = false;
      submitScoreToServer(score, floor).then(ok => {
        if (cancelled) return;
        if (ok) setScoreSubmitted(true);
        setIsSubmitting(false);
      });
      return () => { cancelled = true; };
    }
  }, [session.data, score, floor]);

  const handleViewLeaderboard = async () => {
    await fetchLeaderboardData();
    setShowLeaderboard(true);
  };

  return (
    <div className="w-full h-full bg-black bg-opacity-75 flex items-center justify-center z-50 p-6">
      <div className="bg-linear-to-b from-red-900 to-black border-2 border-red-500 p-8 rounded-lg max-w-md w-full shadow-2xl">
        <h2 className="text-3xl font-bold text-red-400 mb-4">{t("game-over", { defaultValue: "Game Over" })}</h2>
        <div className="space-y-4 mb-6 text-slate-300">
          <p>{t("score-label", { defaultValue: "Score:" })} <span className="text-red-400 font-bold text-lg">{score}</span></p>
          <p>{t("floor-reached-label", { defaultValue: "Floor Reached:" })} <span className="text-red-400 font-bold text-lg">{floor}</span></p>
        </div>

        {/* Auto-submit status */}
        {session.data && (
          <div className="mb-4 text-center">
            {isSubmitting ? (
              <div className="text-yellow-400 text-sm font-mono animate-pulse">⏳ {t("submitting-score", { defaultValue: "Submitting score..." })}</div>
            ) : scoreSubmitted ? (
              <div className="text-green-400 text-sm font-mono">✓ {t("score-submitted", { defaultValue: "Score submitted" })}</div>
            ) : (
              <div className="text-slate-500 text-sm font-mono">{t("score-submission-pending", { defaultValue: "Score submission pending..." })}</div>
            )}
          </div>
        )}
        {!session.data && (
          <div className="mb-4 text-center">
            <p className="text-slate-400 text-sm">{t("sign-in-to-save", { defaultValue: "Sign in to save your score to the leaderboard." })}</p>
          </div>
        )}

        <div className="space-y-3">
          <Button
            onClick={handleViewLeaderboard}
            variant="outline"
            className="w-full border-red-500 text-red-400 hover:bg-red-900 hover:bg-opacity-20 py-2 rounded-lg"
          >
            {t("view-leaderboard", { defaultValue: "View Leaderboard" })}
          </Button>
          <Button
            onClick={onReturnToLanding}
            className="w-full bg-linear-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold py-2 rounded-lg border border-cyan-400 shadow-lg"
          >
            {t("return-to-menu", { defaultValue: "Return to Menu" })}
          </Button>
        </div>
      </div>

      {showLeaderboard && (
        <LeaderboardPanel onClose={() => setShowLeaderboard(false)} />
      )}
    </div>
  );
}
