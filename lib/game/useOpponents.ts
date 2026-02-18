import { useState, useEffect } from 'react';

export interface Opponent {
  id: string;
  name: string;
  progress: number; // 0 to 100%
  score: number;
  combo: number;
  isAlive: boolean;
  avatarColor: string;
}

const MOCK_NAMES = ['NeonRider', 'BeatSlayer', 'RhythmGod', 'SliceMaster', 'PixelPerfect'];

export function useOpponents(count: number = 5) {
  const [opponents, setOpponents] = useState<Opponent[]>([]);

  useEffect(() => {
    // Init mock opponents
    const initial = Array.from({ length: count }).map((_, i) => ({
      id: `op-${i}`,
      name: MOCK_NAMES[i % MOCK_NAMES.length],
      progress: 0,
      score: 0,
      combo: 0,
      isAlive: true,
      avatarColor: `hsl(${Math.random() * 360}, 70%, 50%)`
    }));
    setOpponents(initial);

    const interval = setInterval(() => {
      setOpponents(prev => prev.map(op => {
        if (!op.isAlive || op.progress >= 100) return op;
        
        // Random progress increment
        const speed = Math.random() * 0.5 + 0.1; 
        const newProgress = Math.min(100, op.progress + speed);
        
        // Random score/combo updates
        const hit = Math.random() > 0.1; // 90% hit rate
        const newCombo = hit ? op.combo + 1 : 0;
        const newScore = op.score + (hit ? 100 * (1 + newCombo * 0.1) : 0);
        
        return {
          ...op,
          progress: newProgress,
          combo: newCombo,
          score: Math.floor(newScore)
        };
      }));
    }, 100);

    return () => clearInterval(interval);
  }, [count]);

  return opponents;
}
