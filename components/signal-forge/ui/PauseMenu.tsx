/**
 * PauseMenu.tsx — Signal Forge
 * ────────────────────────────
 * Full-screen pause overlay accessible via Escape during active gameplay.
 * Shows How-to-Play, leaderboard, and abandon-run controls.
 */

'use client';

import React, { useState } from 'react';
import { useTranslation } from "react-i18next";
import { Button } from '@/components/ui/button';
import { HowToPlayContent } from './HowToPlayContent';
import { LeaderboardPanel } from './LeaderboardPanel';

interface Props {
  onClose: () => void;
  onAbandonRun?: () => void;
  onReturnToLanding?: () => void;
}

export function PauseMenu({ onClose, onAbandonRun, onReturnToLanding }: Props) {
  const { t } = useTranslation("c-signal-forge");
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);

  // Show sub-modals instead of pause menu when they're open
  if (showHowToPlay) {
    return <HowToPlayContent onClose={() => setShowHowToPlay(false)} />;
  }
  if (showLeaderboard) {
    return <LeaderboardPanel onClose={() => setShowLeaderboard(false)} />;
  }

  return (
    <div className="w-full h-full bg-black bg-opacity-80 flex items-center justify-center z-50 p-6">
      <div className="bg-linear-to-b from-slate-900 to-black border-2 border-cyan-500 p-8 rounded-lg max-w-md w-full shadow-2xl">
        <h2 className="text-3xl font-bold text-cyan-400 mb-6">⏸️ {t("paused", { defaultValue: "Paused" })}</h2>
        <div className="space-y-3">
          <Button
            onClick={onClose}
            className="w-full bg-linear-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold py-3 rounded-lg border border-cyan-400"
          >
            {t("resume-game", { defaultValue: "Resume Game" })}
          </Button>
          <Button
            onClick={() => setShowHowToPlay(true)}
            className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-2 rounded-lg border border-slate-600"
          >
            {t("how-to-play", { defaultValue: "How to Play" })}
          </Button>
          <Button
            onClick={() => setShowLeaderboard(true)}
            variant="outline"
            className="w-full border-cyan-500 text-cyan-400 hover:bg-cyan-900 hover:bg-opacity-20 py-2 rounded-lg"
          >
            {t("view-leaderboard", { defaultValue: "View Leaderboard" })}
          </Button>
          {onAbandonRun && (
            <Button
              onClick={() => {
                onAbandonRun();
                onReturnToLanding?.();
                onClose();
              }}
              className="w-full bg-red-800 hover:bg-red-700 text-red-300 font-bold py-2 rounded-lg border border-red-600"
            >
              {t("abandon-run", { defaultValue: "Abandon Run" })}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
