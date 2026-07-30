'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Play, ArrowLeft, RotateCcw, Trophy, Lock, Users, Glasses, Compass } from 'lucide-react';
import { authClient } from '@/lib/auth-client';
import { useNavigate } from '@tanstack/react-router';
import { LEVELS } from '@/lib/neon-driftway/constants';
import type { LevelId, RunStats } from '@/lib/neon-driftway/types';
import type { GyroStatus } from '@/lib/neon-driftway/gyro';
import type { VrPrefs } from './NeonDriftwayGame';

type LeaderboardEntry = {
  username: string;
  highScore: number;
};

interface VrProps {
  vr: VrPrefs;
  gyroStatus: GyroStatus;
  /** False on hardware where a motion sensor is not plausible at all. */
  canOfferHeadLook: boolean;
  onToggleHeadLook: () => void;
  onToggleStereo: () => void;
}

export function NeonDriftwayUI({
  uiState,
  unlockedLevels,
  runStats,
  currentLevel,
  onGoToMenu,
  onGoToLevelSelect,
  onStartLevel,
  onContinueEndless,
  onGoToMultiplayer,
  vr,
  gyroStatus,
  canOfferHeadLook,
  onToggleHeadLook,
  onToggleStereo,
}: {
  uiState: 'menu' | 'levelSelect' | 'playing' | 'gameOver' | 'levelComplete' | 'multiplayerMenu' | 'lobby' | 'multiplayerPlaying' | 'multiplayerGameOver';
  unlockedLevels: Set<LevelId>;
  runStats: RunStats | null;
  currentLevel: LevelId;
  onGoToMenu: () => void;
  onGoToLevelSelect: () => void;
  onStartLevel: (id: LevelId) => void;
  onContinueEndless: () => void;
  onGoToMultiplayer?: () => void;
} & VrProps) {
  const { t } = useTranslation("c-neon-driftway");
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [scoreSubmitted, setScoreSubmitted] = useState(false);
  const session = authClient.useSession();
  const navigate = useNavigate();

  const fetchLeaderboard = useCallback(async () => {
    try {
      const res = await fetch('/api/neon-driftway/leaderboard');
      if (!res.ok) return;
      const data = await res.json();
      setLeaderboard(Array.isArray(data) ? data : []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (uiState === 'menu' || uiState === 'gameOver' || uiState === 'levelComplete') fetchLeaderboard();
  }, [uiState, fetchLeaderboard]);

  // Auto-submit score
  useEffect(() => {
    if ((uiState !== 'gameOver' && uiState !== 'levelComplete') || !runStats || scoreSubmitted || !session.data) return;
    const username = session.data.user.name || (session.data.user as unknown as Record<string, string>).username || 'Driver';
    setScoreSubmitted(true);
    (async () => {
      try {
        await fetch('/api/neon-driftway/score', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username,
            score: runStats.score,
            distance: runStats.distance,
            timeMs: runStats.timeSurvivedMs,
            level: runStats.level,
          }),
        });
        fetchLeaderboard();
      } catch { /* ignore */ }
    })();
  }, [uiState, runStats, scoreSubmitted, session.data, fetchLeaderboard]);

  // Reset submit flag when starting new game
  useEffect(() => {
    if (uiState === 'playing') setScoreSubmitted(false);
  }, [uiState]);

  if (uiState === 'playing' || uiState === 'multiplayerPlaying' || uiState === 'multiplayerMenu' || uiState === 'lobby') return null;

  // ── View mode panel ──
  // Only offered where a motion sensor is plausible. Everywhere else the
  // static forward camera is simply the game, with nothing to configure.
  const viewPanel = canOfferHeadLook ? (
    <div className="space-y-2 rounded-lg border border-zinc-700 bg-black/60 p-3 text-left">
      <div className="flex items-center gap-2">
        <Glasses className="h-4 w-4 text-cyan-400" aria-hidden="true" />
        <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">
          {t('view-mode', { defaultValue: 'View' })}
        </span>
      </div>

      <button
        type="button"
        onClick={onToggleHeadLook}
        aria-pressed={vr.headLook}
        className="flex w-full items-center justify-between gap-3 rounded border border-zinc-700 bg-zinc-900/70 px-3 py-2 text-left transition-colors hover:border-cyan-500/60"
      >
        <span className="min-w-0">
          <span className="block text-sm font-bold text-white">
            {t('head-look', { defaultValue: 'Head look' })}
          </span>
          <span className="block text-[11px] text-zinc-400">
            {t('head-look-desc', { defaultValue: 'Move your device to look around the cockpit as you drive.' })}
          </span>
        </span>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black tracking-wider ${vr.headLook ? 'bg-cyan-500 text-black' : 'bg-zinc-700 text-zinc-300'}`}
        >
          {vr.headLook ? t('on', { defaultValue: 'ON' }) : t('off', { defaultValue: 'OFF' })}
        </span>
      </button>

      {vr.headLook && (
        <button
          type="button"
          onClick={onToggleStereo}
          aria-pressed={vr.stereo}
          className="flex w-full items-center justify-between gap-3 rounded border border-zinc-700 bg-zinc-900/70 px-3 py-2 text-left transition-colors hover:border-purple-500/60"
        >
          <span className="min-w-0">
            <span className="block text-sm font-bold text-white">
              {t('viewer-mode', { defaultValue: 'Headset (split screen)' })}
            </span>
            <span className="block text-[11px] text-zinc-400">
              {t('viewer-mode-desc', { defaultValue: 'Side-by-side view for a phone VR viewer. Hold a screen edge to steer.' })}
            </span>
          </span>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black tracking-wider ${vr.stereo ? 'bg-purple-500 text-black' : 'bg-zinc-700 text-zinc-300'}`}
          >
            {vr.stereo ? t('on', { defaultValue: 'ON' }) : t('off', { defaultValue: 'OFF' })}
          </span>
        </button>
      )}

      <p className="flex items-start gap-1.5 text-[11px] text-zinc-500">
        <Compass className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
        <span>
          {gyroStatus === 'active'
            ? t('gyro-active', { defaultValue: 'Motion sensor live. Press C or tap recenter to face forward again.' })
            : gyroStatus === 'denied'
              ? t('gyro-denied', { defaultValue: 'Motion access was declined, so the camera stays locked forward. You can allow it in your browser settings.' })
              : gyroStatus === 'unavailable'
                ? t('gyro-unavailable', { defaultValue: 'No motion sensor here — the camera stays locked forward.' })
                : t('gyro-waiting', { defaultValue: 'Waiting for the motion sensor…' })}
        </span>
      </p>
    </div>
  ) : null;

  // ── Main Menu ──
  if (uiState === 'menu') {
    return (
      <div className="absolute inset-0 flex items-center justify-center z-40 pointer-events-auto bg-black/70 backdrop-blur-sm overflow-y-auto">
        <div className="text-center space-y-4 sm:space-y-6 max-w-md px-4 py-6">
          <h1 className="text-3xl sm:text-5xl font-black text-transparent bg-clip-text bg-linear-to-r from-cyan-400 via-white to-red-500 tracking-tighter">
            NEON DRIFTWAY
          </h1>
          <p className="text-zinc-400 text-xs sm:text-sm">{t("menu-tagline", { defaultValue: "First-person highway survival racer. Take the wheel, look around the cockpit as you drive, and chase the leaderboard." })}</p>

          <div className="space-y-3">
            {!session.data ? (
              <Button
                onClick={() => navigate({ to: '/login', search: { callbackURL: undefined } })}
                className="w-full bg-zinc-800 hover:bg-zinc-700 text-white font-bold py-3"
              >
                {t("sign-in-to-play", { defaultValue: "Sign In to Play" })}
              </Button>
            ) : (
              <>
                <Button
                  onClick={onGoToLevelSelect}
                  className="w-full bg-linear-to-r from-cyan-500 to-red-500 hover:from-cyan-600 hover:to-red-600 text-black font-bold py-3 text-lg"
                >
                  <Play className="w-5 h-5 mr-2" />
                  {t("play", { defaultValue: "Play" })}
                </Button>
                {onGoToMultiplayer && (
                  <Button
                    onClick={onGoToMultiplayer}
                    className="w-full bg-linear-to-r from-purple-500 to-cyan-500 hover:from-purple-600 hover:to-cyan-600 text-white font-bold py-3"
                  >
                    <Users className="w-5 h-5 mr-2" />
                    {t("multiplayer", { defaultValue: "Multiplayer" })}
                  </Button>
                )}
              </>
            )}
          </div>

          {viewPanel}

          {/* Mini leaderboard */}
          {leaderboard.length > 0 && (
            <div className="bg-black/60 border border-zinc-700 rounded-lg p-4 mt-4">
              <div className="flex items-center gap-2 mb-3">
                <Trophy className="w-4 h-4 text-yellow-400" />
                <span className="text-xs text-zinc-400 font-bold uppercase tracking-wider">{t("top-scores", { defaultValue: "Top Scores" })}</span>
              </div>
              <div className="space-y-1">
                {leaderboard.slice(0, 5).map((e, i) => (
                  <div key={`${e.username}-${i}`} className="flex justify-between text-xs">
                    <span className="text-zinc-400">#{i + 1} {e.username}</span>
                    <span className="text-cyan-300 font-bold tabular-nums">{e.highScore.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="text-[10px] sm:text-xs text-zinc-600 space-y-1">
            <p className="hidden sm:block">{t("keyboard-controls", { defaultValue: "W/↑ accelerate · A/D or ←/→ steer · S/↓ brake · Shift boost · C recenter view · Esc pause" })}</p>
            <p className="sm:hidden">{t("touch-controls-hint", { defaultValue: "Touch controls appear during gameplay" })}</p>
          </div>
        </div>
      </div>
    );
  }

  // ── Level Select ──
  if (uiState === 'levelSelect') {
    const levelIds: LevelId[] = [1, 2, 3];
    return (
      <div className="absolute inset-0 flex items-center justify-center z-40 pointer-events-auto bg-black/70 backdrop-blur-sm overflow-y-auto">
        <div className="max-w-lg w-full px-4 space-y-3 sm:space-y-4 py-6">
          <button
            onClick={onGoToMenu}
            className="flex items-center gap-1 text-zinc-400 hover:text-white text-xs sm:text-sm transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> {t("back", { defaultValue: "Back" })}
          </button>

          <h2 className="text-2xl sm:text-3xl font-black text-white text-center tracking-tight">{t("select-level", { defaultValue: "SELECT LEVEL" })}</h2>

          <div className="grid gap-3">
            {levelIds.map(id => {
              const lvl = LEVELS[id];
              const unlocked = unlockedLevels.has(id);
              return (
                <button
                  key={id}
                  onClick={() => unlocked && onStartLevel(id)}
                  disabled={!unlocked}
                  className={`relative text-left p-4 rounded-lg border transition-all ${unlocked
                    ? 'border-zinc-600 hover:border-cyan-500 bg-zinc-900/80 cursor-pointer'
                    : 'border-zinc-800 bg-zinc-900/40 cursor-not-allowed opacity-50'
                    }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-lg font-bold text-white">
                        {t("level-name", { defaultValue: "Level {{id}}: {{name}}", id, name: lvl.name })}
                      </div>
                      <div className="text-xs text-zinc-400 mt-0.5">{lvl.subtitle}</div>
                      <div className="text-xs text-zinc-500 mt-1">
                        HP: {lvl.hp} · {lvl.gripEnabled ? t("grip-system", { defaultValue: "Grip system" }) : lvl.headlightsEnabled ? t("headlights", { defaultValue: "Headlights" }) : t("standard", { defaultValue: "Standard" })}
                      </div>
                    </div>
                    {!unlocked && <Lock className="w-5 h-5 text-zinc-500" />}
                    {unlocked && (
                      <div className="bg-cyan-500 text-black rounded-full px-3 py-1 text-xs font-bold">
                        {t("go", { defaultValue: "GO" })}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          <p className="text-[10px] sm:text-xs text-zinc-600 text-center">
            {t("unlock-hint", { defaultValue: "Drive 1,500m on a level to complete it and unlock the next" })}
          </p>
        </div>
      </div>
    );
  }

  // ── Game Over ──
  if (uiState === 'gameOver' && runStats) {
    const timeSec = Math.floor(runStats.timeSurvivedMs / 1000);
    const timeStr = `${Math.floor(timeSec / 60)}:${(timeSec % 60).toString().padStart(2, '0')}`;

    return (
      <div className="absolute inset-0 flex items-center justify-center z-40 pointer-events-auto bg-black/80 backdrop-blur-sm overflow-y-auto">
        <div className="max-w-md w-full px-4 space-y-3 sm:space-y-4 py-6">
          <h2 className="text-3xl sm:text-4xl font-black text-red-500 text-center tracking-tight">{t("crashed", { defaultValue: "CRASHED" })}</h2>

          <div className="bg-zinc-900/80 border border-zinc-700 rounded-lg p-5 space-y-3">
            <div className="text-center">
              <div className="text-xs text-zinc-400 uppercase tracking-wider">{t("score", { defaultValue: "Score" })}</div>
              <div className="text-3xl font-black text-cyan-400 tabular-nums">
                {runStats.score.toLocaleString()}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-center">
              <div>
                <div className="text-xs text-zinc-500">{t("distance", { defaultValue: "Distance" })}</div>
                <div className="text-lg font-bold text-white">{runStats.distance.toLocaleString()}m</div>
              </div>
              <div>
                <div className="text-xs text-zinc-500">{t("time", { defaultValue: "Time" })}</div>
                <div className="text-lg font-bold text-white">{timeStr}</div>
              </div>
              <div>
                <div className="text-xs text-zinc-500">{t("top-speed", { defaultValue: "Top Speed" })}</div>
                <div className="text-lg font-bold text-white">{Math.round(runStats.maxSpeed * 0.5)} km/h</div>
              </div>
              <div>
                <div className="text-xs text-zinc-500">{t("close-calls", { defaultValue: "Close Calls" })}</div>
                <div className="text-lg font-bold text-yellow-400">{runStats.closeCalls}</div>
              </div>
            </div>

            <div className="text-xs text-zinc-500 text-center">
              {t("level-name", { defaultValue: "Level {{id}}: {{name}}", id: runStats.level, name: LEVELS[runStats.level].name })}
            </div>
          </div>

          {!session.data ? (
            <Button
              onClick={() => navigate({ to: '/login', search: { callbackURL: undefined } })}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold"
            >
              {t("sign-in-to-submit", { defaultValue: "Sign In to Submit Score" })}
            </Button>
          ) : (
            <p className="text-xs text-green-400 text-center">
              {scoreSubmitted ? t("score-submitted", { defaultValue: "Score submitted!" }) : t("submitting-score", { defaultValue: "Submitting score…" })}
            </p>
          )}

          <div className="flex gap-2">
            <Button
              onClick={() => onStartLevel(currentLevel)}
              className="flex-1 bg-cyan-600 hover:bg-cyan-700 text-white font-bold"
            >
              <RotateCcw className="w-4 h-4 mr-1" /> {t("restart", { defaultValue: "Restart" })}
            </Button>
            <Button
              onClick={onGoToLevelSelect}
              variant="outline"
              className="flex-1 border-zinc-600 text-zinc-300 hover:bg-zinc-800"
            >
              {t("level-select", { defaultValue: "Level Select" })}
            </Button>
          </div>

          {/* Leaderboard */}
          {leaderboard.length > 0 && (
            <div className="bg-black/60 border border-zinc-700 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <Trophy className="w-3 h-3 text-yellow-400" />
                <span className="text-xs text-zinc-400 font-bold uppercase tracking-wider">{t("leaderboard", { defaultValue: "Leaderboard" })}</span>
              </div>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {leaderboard.slice(0, 10).map((e, i) => (
                  <div key={`${e.username}-${i}`} className="flex justify-between text-xs">
                    <span className="text-zinc-400">#{i + 1} {e.username}</span>
                    <span className="text-cyan-300 font-bold tabular-nums">{e.highScore.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Level Complete ──
  if (uiState === 'levelComplete' && runStats) {
    const timeSec = Math.floor(runStats.timeSurvivedMs / 1000);
    const timeStr = `${Math.floor(timeSec / 60)}:${(timeSec % 60).toString().padStart(2, '0')}`;

    return (
      <div className="absolute inset-0 flex items-center justify-center z-40 pointer-events-auto bg-black/80 backdrop-blur-sm overflow-y-auto">
        <div className="max-w-md w-full px-4 space-y-3 sm:space-y-4 py-6">
          <h2 className="text-3xl sm:text-4xl font-black text-green-400 text-center tracking-tight">{t("level-complete", { defaultValue: "LEVEL COMPLETE!" })}</h2>

          <div className="bg-zinc-900/80 border border-zinc-700 rounded-lg p-5 space-y-3">
            <div className="text-center">
              <div className="text-xs text-zinc-400 uppercase tracking-wider">{t("score", { defaultValue: "Score" })}</div>
              <div className="text-3xl font-black text-cyan-400 tabular-nums">
                {runStats.score.toLocaleString()}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-center">
              <div>
                <div className="text-xs text-zinc-500">{t("distance", { defaultValue: "Distance" })}</div>
                <div className="text-lg font-bold text-white">{runStats.distance.toLocaleString()}m</div>
              </div>
              <div>
                <div className="text-xs text-zinc-500">{t("time", { defaultValue: "Time" })}</div>
                <div className="text-lg font-bold text-white">{timeStr}</div>
              </div>
              <div>
                <div className="text-xs text-zinc-500">{t("top-speed", { defaultValue: "Top Speed" })}</div>
                <div className="text-lg font-bold text-white">{Math.round(runStats.maxSpeed * 0.5)} km/h</div>
              </div>
              <div>
                <div className="text-xs text-zinc-500">{t("close-calls", { defaultValue: "Close Calls" })}</div>
                <div className="text-lg font-bold text-yellow-400">{runStats.closeCalls}</div>
              </div>
            </div>

            <div className="text-xs text-zinc-500 text-center">
              {t("level-name", { defaultValue: "Level {{id}}: {{name}}", id: runStats.level, name: LEVELS[runStats.level].name })}
            </div>
          </div>

          {session.data && (
            <p className="text-xs text-green-400 text-center">
              {scoreSubmitted ? t("score-submitted", { defaultValue: "Score submitted!" }) : t("submitting-score", { defaultValue: "Submitting score…" })}
            </p>
          )}

          <div className="flex gap-2">
            <Button
              onClick={onContinueEndless}
              className="flex-1 bg-linear-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-bold"
            >
              {t("continue-endless", { defaultValue: "Continue Endless" })}
            </Button>
            <Button
              onClick={onGoToLevelSelect}
              variant="outline"
              className="flex-1 border-zinc-600 text-zinc-300 hover:bg-zinc-800"
            >
              {t("level-select", { defaultValue: "Level Select" })}
            </Button>
          </div>

          <p className="text-xs text-zinc-600 text-center">
            {t("endless-mode-hint", { defaultValue: "Endless mode ramps difficulty beyond the normal cap" })}
          </p>
        </div>
      </div>
    );
  }

  return null;
}
