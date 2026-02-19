'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { authClient } from '@/lib/auth-client';

interface Card {
  id: number;
  name: string;
  cost: number;
  type: string;
  damage: number;
  shield: number;
  draw?: number;
  effect: string;
  rarity: string;
}

interface Enemy {
  id: number;
  name: string;
  hp: number;
  maxHp: number;
  intent: string;
  damage: number;
}

interface GameState {
  floor: number;
  node: number;
  phase: string;
  deck: Card[];
  hand: Card[];
  discard: Card[];
  playedThisTurn: Card[];
  playerHp: number;
  playerMaxHp: number;
  playerShield: number;
  playerEnergy: number;
  playerTempo: number;
  playerStatic: number;
  score: number;
  currency: number;
  enemies: Enemy[];
  targetSequence: string[];
  currentSequence: string[];
  turn: number;
  gameOver: boolean;
  selectedEnemyId: number;
}

interface SignalForgeUIProps {
  gameState: GameState;
  onPlayCard: (index: number) => void;
  onUnplayCard: (index: number) => void;
  onEndTurn: () => void;
  onStartGame: () => void;
  onNextFloor: () => void;
  onSelectEnemy: (enemyId: number) => void;
}

export function SignalForgeUI({
  gameState,
  onStartGame,
  onNextFloor,
}: SignalForgeUIProps) {
  const session = authClient.useSession();
  const router = useRouter();
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [leaderboard, setLeaderboard] = useState<Array<{ username: string; highScore: number; floorReached: number }>>([]);
  const [scoreSubmitted, setScoreSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submitScore = async () => {
    if (!session.data) return;
    setIsSubmitting(true);

    try {
      const res = await fetch('/api/signal-forge/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          score: gameState.score,
          floorReached: gameState.floor,
        }),
      });

      if (res.ok) {
        setScoreSubmitted(true);
        fetchLeaderboard();
      }
    } catch (error) {
      console.error('Failed to submit score:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const fetchLeaderboard = async () => {
    try {
      const res = await fetch('/api/signal-forge/leaderboard');
      if (res.ok) {
        const data = await res.json();
        setLeaderboard(data);
        setShowLeaderboard(true);
      }
    } catch (error) {
      console.error('Failed to fetch leaderboard:', error);
    }
  };

  if (gameState.phase === 'landing') {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
        <div className="bg-linear-to-b from-slate-900 to-black border-2 border-cyan-500 p-8 rounded-lg max-w-md w-full shadow-2xl">
          <h1 className="text-4xl font-black text-transparent bg-clip-text bg-linear-to-r from-cyan-400 via-blue-400 to-purple-400 mb-4">SIGNAL FORGE</h1>
          <p className="text-slate-300 mb-6 leading-relaxed">
            Match waveform sequences to defeat enemies. Manage your tempo, control static corruption, and build a deck powerful enough to survive.
          </p>
          {!session.data ? (
            <div className="flex flex-col items-center gap-4">
              <p className="text-red-400 font-mono text-sm uppercase tracking-widest">Authentication Required</p>
              <Button
                onClick={() => router.push('/login')}
                className="w-full bg-white text-black hover:bg-zinc-200 font-bold py-3 rounded-lg"
              >
                Sign In to Play
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="text-green-400 text-sm font-mono text-center">
                SIGNED IN: {session.data.user.name || (session.data.user as unknown as { username?: string }).username || 'OPERATOR'}
              </div>
              <Button
                onClick={onStartGame}
                className="w-full bg-linear-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold py-3 rounded-lg border border-cyan-400 shadow-lg"
              >
                Start Game
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (gameState.phase === 'reward') {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
        <div className="bg-linear-to-b from-green-900 to-black border-2 border-green-500 p-8 rounded-lg max-w-md w-full shadow-2xl">
          <h2 className="text-3xl font-bold text-green-400 mb-4">Victory!</h2>
          <div className="space-y-4 mb-6 text-slate-300">
            <p>Floor: <span className="text-green-400 font-bold text-lg">{gameState.floor}</span></p>
            <p>Score: <span className="text-green-400 font-bold text-lg">{gameState.score}</span></p>
          </div>
          <Button
            onClick={onNextFloor}
            className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-2 rounded-lg"
          >
            Next Floor
          </Button>
        </div>
      </div>
    );
  }

  if (gameState.phase === 'game-over') {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
        <div className="bg-linear-to-b from-red-900 to-black border-2 border-red-500 p-8 rounded-lg max-w-md w-full shadow-2xl">
          <h2 className="text-3xl font-bold text-red-400 mb-4">Game Over</h2>
          <div className="space-y-4 mb-6 text-slate-300">
            <p>Score: <span className="text-red-400 font-bold text-lg">{gameState.score}</span></p>
            <p>Floor Reached: <span className="text-red-400 font-bold text-lg">{gameState.floor}</span></p>
          </div>
          {session.data && (
            <div className="space-y-2 mb-4">
              <div className="text-green-400 text-sm font-mono mb-2">
                {session.data.user.name || (session.data.user as unknown as { username?: string }).username || 'OPERATOR'}
              </div>
              {scoreSubmitted ? (
                <div className="text-green-400 text-sm font-mono text-center py-2">✓ Score Submitted</div>
              ) : (
                <Button
                  onClick={submitScore}
                  disabled={isSubmitting}
                  className="w-full bg-red-600 hover:bg-red-700 disabled:bg-slate-700 text-white font-bold py-2 rounded-lg"
                >
                  {isSubmitting ? 'Submitting...' : 'Submit Score'}
                </Button>
              )}
            </div>
          )}
          {!session.data && (
            <div className="mb-4">
              <Button
                onClick={() => router.push('/login')}
                className="w-full bg-white text-black hover:bg-zinc-200 font-bold py-2 rounded-lg"
              >
                Sign In to Submit Score
              </Button>
            </div>
          )}
          <Button
            onClick={fetchLeaderboard}
            variant="outline"
            className="w-full border-red-500 text-red-400 hover:bg-red-900 hover:bg-opacity-20 py-2 rounded-lg"
          >
            View Leaderboard
          </Button>
        </div>

        {showLeaderboard && (
          <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50">
            <div className="bg-linear-to-b from-slate-900 to-black border-2 border-cyan-500 p-8 rounded-lg max-w-md w-full shadow-2xl">
              <h3 className="text-2xl font-bold text-cyan-400 mb-4">🏆 Top Scores</h3>
              <div className="space-y-2 max-h-96 overflow-y-auto mb-4 bg-black bg-opacity-50 p-3 rounded border border-slate-700">
                {leaderboard.length === 0 ? (
                  <p className="text-slate-400 text-sm">No scores yet. Be the first!</p>
                ) : (
                  leaderboard.map((entry, idx) => (
                    <div key={idx} className="flex justify-between text-slate-300 text-sm font-mono p-2 hover:bg-slate-800 rounded">
                      <span className="text-cyan-400 font-bold">#{idx + 1}</span>
                      <span className="flex-1 ml-3">{entry.username}</span>
                      <span className="text-green-400 font-bold">{entry.highScore}</span>
                    </div>
                  ))
                )}
              </div>
              <Button
                onClick={() => setShowLeaderboard(false)}
                className="w-full bg-slate-700 hover:bg-slate-600 text-white py-2 rounded-lg"
              >
                Close
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 pointer-events-none" />
  );
}
