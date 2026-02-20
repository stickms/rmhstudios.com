'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Play, ArrowLeft, RotateCcw, Trophy, Lock, Users } from 'lucide-react';
import { authClient } from '@/lib/auth-client';
import { useRouter } from 'next/navigation';
import { LEVELS } from '@/lib/neon-driftway/constants';
import type { LevelId, RunStats } from '@/lib/neon-driftway/types';

type LeaderboardEntry = {
  username: string;
  highScore: number;
};

export function NeonDriftwayUI({
  uiState,
  unlockedLevels,
  runStats,
  currentLevel,
  onGoToMenu,
  onGoToLevelSelect,
  onStartLevel,
  onResume,
  onContinueEndless,
  onGoToMultiplayer,
  multiplayerRankings,
}: {
  uiState: 'menu' | 'levelSelect' | 'playing' | 'gameOver' | 'levelComplete' | 'multiplayerMenu' | 'lobby' | 'multiplayerPlaying' | 'multiplayerGameOver';
  unlockedLevels: Set<LevelId>;
  runStats: RunStats | null;
  currentLevel: LevelId;
  onGoToMenu: () => void;
  onGoToLevelSelect: () => void;
  onStartLevel: (id: LevelId) => void;
  onResume: () => void;
  onContinueEndless: () => void;
  onGoToMultiplayer?: () => void;
  multiplayerRankings?: { id: string; name: string; score: number; rank: number }[];
}) {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [scoreSubmitted, setScoreSubmitted] = useState(false);
  const session = authClient.useSession();
  const router = useRouter();

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

  // ── Main Menu ──
  if (uiState === 'menu') {
    return (
      <div className="absolute inset-0 flex items-center justify-center z-40 pointer-events-auto bg-black/70 backdrop-blur-sm">
        <div className="text-center space-y-6 max-w-md px-4">
          <h1 className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-white to-red-500 tracking-tighter">
            NEON DRIFTWAY
          </h1>
          <p className="text-zinc-400 text-sm">Endless highway survival racer. Dodge traffic, survive hazards, chase the leaderboard.</p>

          <div className="space-y-3">
            {!session.data ? (
              <Button
                onClick={() => router.push('/login')}
                className="w-full bg-zinc-800 hover:bg-zinc-700 text-white font-bold py-3"
              >
                Sign In to Play
              </Button>
            ) : (
              <>
                <Button
                  onClick={onGoToLevelSelect}
                  className="w-full bg-gradient-to-r from-cyan-500 to-red-500 hover:from-cyan-600 hover:to-red-600 text-black font-bold py-3 text-lg"
                >
                  <Play className="w-5 h-5 mr-2" />
                  Play
                </Button>
                {onGoToMultiplayer && (
                  <Button
                    onClick={onGoToMultiplayer}
                    className="w-full bg-gradient-to-r from-purple-500 to-cyan-500 hover:from-purple-600 hover:to-cyan-600 text-white font-bold py-3"
                  >
                    <Users className="w-5 h-5 mr-2" />
                    Multiplayer
                  </Button>
                )}
              </>
            )}
          </div>

          {/* Mini leaderboard */}
          {leaderboard.length > 0 && (
            <div className="bg-black/60 border border-zinc-700 rounded-lg p-4 mt-4">
              <div className="flex items-center gap-2 mb-3">
                <Trophy className="w-4 h-4 text-yellow-400" />
                <span className="text-xs text-zinc-400 font-bold uppercase tracking-wider">Top Scores</span>
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

          <div className="text-xs text-zinc-600 space-y-1">
            <p>W/↑ accelerate · A/D or ←/→ steer · S/↓ brake</p>
            <p>Shift boost · Esc pause</p>
          </div>
        </div>
      </div>
    );
  }

  // ── Level Select ──
  if (uiState === 'levelSelect') {
    const levelIds: LevelId[] = [1, 2, 3];
    return (
      <div className="absolute inset-0 flex items-center justify-center z-40 pointer-events-auto bg-black/70 backdrop-blur-sm">
        <div className="max-w-lg w-full px-4 space-y-4">
          <button
            onClick={onGoToMenu}
            className="flex items-center gap-1 text-zinc-400 hover:text-white text-sm transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </button>

          <h2 className="text-3xl font-black text-white text-center tracking-tight">SELECT LEVEL</h2>

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
                        Level {id}: {lvl.name}
                      </div>
                      <div className="text-xs text-zinc-400 mt-0.5">{lvl.subtitle}</div>
                      <div className="text-xs text-zinc-500 mt-1">
                        HP: {lvl.hp} · {lvl.gripEnabled ? 'Grip system' : lvl.headlightsEnabled ? 'Headlights' : 'Standard'}
                      </div>
                    </div>
                    {!unlocked && <Lock className="w-5 h-5 text-zinc-500" />}
                    {unlocked && (
                      <div className="bg-cyan-500 text-black rounded-full px-3 py-1 text-xs font-bold">
                        GO
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          <p className="text-xs text-zinc-600 text-center">
            Survive 2 minutes on a level to unlock the next one
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
      <div className="absolute inset-0 flex items-center justify-center z-40 pointer-events-auto bg-black/80 backdrop-blur-sm">
        <div className="max-w-md w-full px-4 space-y-4">
          <h2 className="text-4xl font-black text-red-500 text-center tracking-tight">CRASHED</h2>

          <div className="bg-zinc-900/80 border border-zinc-700 rounded-lg p-5 space-y-3">
            <div className="text-center">
              <div className="text-xs text-zinc-400 uppercase tracking-wider">Score</div>
              <div className="text-3xl font-black text-cyan-400 tabular-nums">
                {runStats.score.toLocaleString()}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-center">
              <div>
                <div className="text-xs text-zinc-500">Distance</div>
                <div className="text-lg font-bold text-white">{runStats.distance.toLocaleString()}m</div>
              </div>
              <div>
                <div className="text-xs text-zinc-500">Time</div>
                <div className="text-lg font-bold text-white">{timeStr}</div>
              </div>
              <div>
                <div className="text-xs text-zinc-500">Top Speed</div>
                <div className="text-lg font-bold text-white">{Math.round(runStats.maxSpeed * 0.5)} km/h</div>
              </div>
              <div>
                <div className="text-xs text-zinc-500">Close Calls</div>
                <div className="text-lg font-bold text-yellow-400">{runStats.closeCalls}</div>
              </div>
            </div>

            <div className="text-xs text-zinc-500 text-center">
              Level {runStats.level}: {LEVELS[runStats.level].name}
            </div>
          </div>

          {!session.data ? (
            <Button
              onClick={() => router.push('/login')}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold"
            >
              Sign In to Submit Score
            </Button>
          ) : (
            <p className="text-xs text-green-400 text-center">
              {scoreSubmitted ? '✓ Score submitted!' : 'Submitting score…'}
            </p>
          )}

          <div className="flex gap-2">
            <Button
              onClick={() => onStartLevel(currentLevel)}
              className="flex-1 bg-cyan-600 hover:bg-cyan-700 text-white font-bold"
            >
              <RotateCcw className="w-4 h-4 mr-1" /> Restart
            </Button>
            <Button
              onClick={onGoToLevelSelect}
              variant="outline"
              className="flex-1 border-zinc-600 text-zinc-300 hover:bg-zinc-800"
            >
              Level Select
            </Button>
          </div>

          {/* Leaderboard */}
          {leaderboard.length > 0 && (
            <div className="bg-black/60 border border-zinc-700 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <Trophy className="w-3 h-3 text-yellow-400" />
                <span className="text-xs text-zinc-400 font-bold uppercase tracking-wider">Leaderboard</span>
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
      <div className="absolute inset-0 flex items-center justify-center z-40 pointer-events-auto bg-black/80 backdrop-blur-sm">
        <div className="max-w-md w-full px-4 space-y-4">
          <h2 className="text-4xl font-black text-green-400 text-center tracking-tight">LEVEL COMPLETE!</h2>

          <div className="bg-zinc-900/80 border border-zinc-700 rounded-lg p-5 space-y-3">
            <div className="text-center">
              <div className="text-xs text-zinc-400 uppercase tracking-wider">Score</div>
              <div className="text-3xl font-black text-cyan-400 tabular-nums">
                {runStats.score.toLocaleString()}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-center">
              <div>
                <div className="text-xs text-zinc-500">Distance</div>
                <div className="text-lg font-bold text-white">{runStats.distance.toLocaleString()}m</div>
              </div>
              <div>
                <div className="text-xs text-zinc-500">Time</div>
                <div className="text-lg font-bold text-white">{timeStr}</div>
              </div>
              <div>
                <div className="text-xs text-zinc-500">Top Speed</div>
                <div className="text-lg font-bold text-white">{Math.round(runStats.maxSpeed * 0.5)} km/h</div>
              </div>
              <div>
                <div className="text-xs text-zinc-500">Close Calls</div>
                <div className="text-lg font-bold text-yellow-400">{runStats.closeCalls}</div>
              </div>
            </div>

            <div className="text-xs text-zinc-500 text-center">
              Level {runStats.level}: {LEVELS[runStats.level].name}
            </div>
          </div>

          {session.data && (
            <p className="text-xs text-green-400 text-center">
              {scoreSubmitted ? '✓ Score submitted!' : 'Submitting score…'}
            </p>
          )}

          <div className="flex gap-2">
            <Button
              onClick={onContinueEndless}
              className="flex-1 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-bold"
            >
              Continue Endless
            </Button>
            <Button
              onClick={onGoToLevelSelect}
              variant="outline"
              className="flex-1 border-zinc-600 text-zinc-300 hover:bg-zinc-800"
            >
              Level Select
            </Button>
          </div>

          <p className="text-xs text-zinc-600 text-center">
            Endless mode ramps difficulty beyond the normal cap
          </p>
        </div>
      </div>
    );
  }

  return null;
}
