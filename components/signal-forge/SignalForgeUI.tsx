'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

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
  const [username, setUsername] = useState('');
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [leaderboard, setLeaderboard] = useState<Array<{ username: string; highScore: number }>>([]);

  const submitScore = async () => {
    if (!username.trim()) return;

    try {
      const res = await fetch('/api/signal-forge/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim(),
          score: gameState.score,
          floorReached: gameState.floor,
        }),
      });

      if (res.ok) {
        fetchLeaderboard();
        setUsername('');
      }
    } catch (error) {
      console.error('Failed to submit score:', error);
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
          <Button
            onClick={onStartGame}
            className="w-full bg-linear-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold py-3 rounded-lg border border-cyan-400 shadow-lg"
          >
            Start Game
          </Button>
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
          <div className="space-y-2 mb-4">
            <input
              type="text"
              placeholder="Enter your name"
              value={username}
              onChange={e => setUsername(e.target.value)}
              className="w-full bg-slate-800 border border-red-600 rounded px-3 py-2 text-white placeholder-slate-500"
              maxLength={20}
            />
            <Button
              onClick={submitScore}
              disabled={!username.trim()}
              className="w-full bg-red-600 hover:bg-red-700 disabled:bg-slate-700 text-white font-bold py-2 rounded-lg"
            >
              Submit Score
            </Button>
          </div>
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
