'use client';

import { useOpponents } from '@/lib/game/useOpponents';
import { useGameStore } from '@/lib/store/useGameStore';
import { MiniTrack } from './MiniTrack';

export function OpponentGrid() {
  const opponents = useOpponents(7); // Reduce to 7
  const { userName, score, combo } = useGameStore();

  const userOpponent = {
      id: 'user',
      name: userName,
      progress: 0, // Should be real
      score: score,
      combo: combo,
      isAlive: true,
      avatarColor: '#06b6d4'
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 gap-2 w-full max-w-xs">
        <MiniTrack opponent={userOpponent} />
        {opponents.map(op => (
            <MiniTrack key={op.id} opponent={op} />
        ))}
    </div>
  );
}
