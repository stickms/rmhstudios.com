'use client';

import { useRef, ChangeEvent, useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Play, RotateCcw } from 'lucide-react';
import { authClient } from "@/lib/auth-client";
import { useRouter } from "next/navigation";

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
  onStart: (username: string) => void;
}) {
  const usernameRef = useRef<string>('');
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [leaderboardError, setLeaderboardError] = useState<string | null>(null);
  
  const session = authClient.useSession();
  const router = useRouter();

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

  const handleSubmitScore = async (username: string) => {
    if (!username) return;

    try {
      const res = await fetch('/api/laundry-sort/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, score }),
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

                  {!session.data ? (
                      <div className="mb-4">
                          <p className="text-xs text-red-300 mb-2">Sign in to save your score!</p>
                          <Button
                              onClick={() => router.push('/login')}
                              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold"
                          >
                              Sign In to Submit
                          </Button>
                      </div>
                  ) : (
                      <div className="flex gap-2">
                        <Button
                          onClick={() => handleSubmitScore(session.data?.user.name || (session.data?.user as any).username || 'User')}
                          className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold"
                        >
                          Submit Score
                        </Button>
                        <Button
                          onClick={() => onStart(session.data?.user.name || (session.data?.user as any).username || 'User')}
                          variant="outline"
                          className="flex-1 border-cyan-500 text-cyan-400 hover:bg-cyan-500/10"
                        >
                          <RotateCcw className="w-4 h-4" />
                          Play Again
                        </Button>
                      </div>
                  )}
                </div>
              )}

              {!gameOver && (
                !session.data ? (
                     <Button
                      onClick={() => router.push('/login')}
                      className="bg-zinc-800 hover:bg-zinc-700 text-white font-bold px-8 py-3 rounded-lg flex items-center gap-2 text-lg mx-auto"
                    >
                      Sign In to Play
                    </Button>
                ) : (
                    <Button
                      onClick={() => onStart(session.data?.user.name || (session.data?.user as any).username || 'User')}
                      className="bg-gradient-to-r from-cyan-500 to-purple-500 hover:from-cyan-600 hover:to-purple-600 text-black font-bold px-8 py-3 rounded-lg flex items-center gap-2 text-lg mx-auto"
                    >
                      <Play className="w-5 h-5" />
                      Start Game
                    </Button>
                )
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
