'use client';

import { useRef, ChangeEvent, useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Play, RotateCcw } from 'lucide-react';

type LeaderboardEntry = {
  username: string;
  highScore: number;
  gamesPlayed: number;
  updatedAt: string;
};

export function LaundryUI({
  score,
  time,
  gameActive,
  gameOver,
  onStart,
}: {
  score: number;
  time: number;
  gameActive: boolean;
  gameOver: boolean;
  onStart: () => void;
}) {
  const usernameRef = useRef<string>('');
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [leaderboardError, setLeaderboardError] = useState<string | null>(null);

  const fetchLeaderboard = useCallback(async () => {
    setLeaderboardLoading(true);
    setLeaderboardError(null);

    try {
      const res = await fetch('/api/laundry-sort/leaderboard');
      if (!res.ok) {
        setLeaderboardError('Failed to load leaderboard');
        return;
      }
      const data = (await res.json()) as LeaderboardEntry[];
      setLeaderboard(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('Error fetching leaderboard:', e);
      setLeaderboardError('Failed to load leaderboard');
    } finally {
      setLeaderboardLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!gameActive) {
      fetchLeaderboard();
    }
  }, [gameActive, gameOver, fetchLeaderboard]);

  const handleSubmitScore = async () => {
    if (!usernameRef.current || usernameRef.current.length < 2) {
      alert('Please enter a valid username (2-24 characters)');
      return;
    }

    try {
      const res = await fetch('/api/laundry-sort/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: usernameRef.current, score }),
      });

      if (!res.ok) {
        alert('Failed to submit score');
        return;
      }

      await fetchLeaderboard();
    } catch (e) {
      console.error('Error submitting score:', e);
      alert('Error submitting score');
    }
  };

  return (
    <>
      {/* Top HUD */}
      <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center z-40 pointer-events-none">
        {/* Score */}
        <div className="bg-black/60 backdrop-blur-sm border border-cyan-500/50 rounded px-4 py-2 pointer-events-auto">
          <div className="text-cyan-400 text-sm font-mono">SCORE</div>
          <div className="text-white text-2xl font-black tracking-wider">{score.toString().padStart(6, '0')}</div>
        </div>

        {/* Time */}
        <div className={`bg-black/60 backdrop-blur-sm border rounded px-4 py-2 pointer-events-auto transition-colors ${time > 30 ? 'border-green-500/50' : 'border-red-500/50'}`}>
          <div className={`text-sm font-mono ${time > 30 ? 'text-green-400' : 'text-red-400'}`}>TIME</div>
          <div className="text-white text-2xl font-black tracking-wider">
            {Math.floor(time / 60)}:{(time % 60).toString().padStart(2, '0')}
          </div>
        </div>
      </div>

      {/* Bottom Controls */}
      <div className="absolute bottom-0 left-0 right-0 p-4 flex flex-col items-center gap-4 z-40 pointer-events-auto">
        {!gameActive && (
          <div className="w-full max-w-3xl grid gap-4 md:grid-cols-[1.1fr_0.9fr]">
            <div className="bg-black/70 backdrop-blur-sm border border-purple-500/50 rounded px-6 py-4 text-center">
              <h2 className="text-purple-400 text-lg font-bold mb-2">SORT THE LAUNDRY!</h2>
              <p className="text-gray-300 text-sm mb-4">
                Watch as colorful clothes fall from above. Let them tumble into the matching color bins to earn points. Wrong bins lose points!
              </p>
              <ul className="text-left text-xs text-gray-400 space-y-1 mb-4">
                <li>✓ Correct sort: <span className="text-green-400">+100 points</span></li>
                <li>✗ Wrong bin: <span className="text-red-400">-50 points</span></li>
                <li>⏱ Time limit: 1 minute</li>
              </ul>

              {gameOver && (
                <div className="mt-4 rounded border border-red-500/40 bg-black/60 p-4">
                  <h3 className="text-red-400 text-lg font-black mb-2">GAME OVER</h3>
                  <div className="text-white text-3xl font-black mb-4">{score.toString().padStart(6, '0')}</div>

                  <input
                    type="text"
                    maxLength={24}
                    placeholder="Enter username (2-24 chars)"
                    onChange={(e: ChangeEvent<HTMLInputElement>) => {
                      usernameRef.current = e.currentTarget.value;
                    }}
                    className="w-full px-4 py-2 rounded bg-zinc-900 border border-zinc-700 text-white placeholder-gray-600 mb-3"
                  />

                  <div className="flex gap-2">
                    <Button
                      onClick={handleSubmitScore}
                      className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold"
                    >
                      Submit Score
                    </Button>
                    <Button
                      onClick={onStart}
                      variant="outline"
                      className="flex-1 border-cyan-500 text-cyan-400 hover:bg-cyan-500/10"
                    >
                      <RotateCcw className="w-4 h-4" />
                      Play Again
                    </Button>
                  </div>
                </div>
              )}

              {!gameOver && (
                <Button
                  onClick={onStart}
                  className="bg-linear-to-r from-cyan-500 to-purple-500 hover:from-cyan-600 hover:to-purple-600 text-black font-bold px-8 py-3 rounded-lg flex items-center gap-2 text-lg mx-auto"
                >
                  <Play className="w-5 h-5" />
                  Start Game
                </Button>
              )}
            </div>

            <div className="bg-black/70 backdrop-blur-sm border border-cyan-500/40 rounded px-5 py-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-cyan-300 text-sm font-bold tracking-wider">LEADERBOARD</h3>
                {leaderboardLoading && <span className="text-xs text-zinc-400">Loading…</span>}
              </div>

              {leaderboardError && (
                <div className="text-xs text-red-400 mb-2">{leaderboardError}</div>
              )}

              {!leaderboardLoading && !leaderboardError && leaderboard.length === 0 && (
                <div className="text-xs text-zinc-400">No scores yet. Be the first!</div>
              )}

              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {leaderboard.slice(0, 10).map((entry, index) => (
                  <div key={`${entry.username}-${index}`} className="flex items-center justify-between text-xs">
                    <span className="text-zinc-400 w-6">#{index + 1}</span>
                    <span className="text-zinc-100 flex-1 truncate">{entry.username}</span>
                    <span className="text-cyan-300 font-bold tabular-nums">{entry.highScore}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
