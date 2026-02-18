'use client';

import { useGameStore } from '@/lib/store/useGameStore';
import { Card } from '@/components/ui/card';

export function HUD() {
  const { score, combo, multiplier } = useGameStore();
  
  return (
    <div className="absolute top-6 left-6 right-6 flex justify-between pointer-events-none z-40">
      <Card className="p-6 bg-black/50 border-zinc-800 text-white backdrop-blur flex flex-col items-start min-w-[200px] neon-border">
        <span className="text-sm text-zinc-400 uppercase tracking-wider font-bold">Score</span>
        <span className="text-4xl font-bold font-mono text-neon-cyan neon-glow">{score.toLocaleString()}</span>
      </Card>
      
      <div className="flex flex-col items-center pt-4">
         {combo > 5 && (
             <div className="animate-bounce">
                <span className="text-6xl font-black italic text-neon-yellow drop-shadow-[0_0_15px_rgba(255,255,0,0.8)] glitch-text">
                    {combo}x COMBO
                </span>
             </div>
         )}
      </div>

      <Card className="p-6 bg-black/50 border-zinc-800 text-white backdrop-blur flex flex-col items-end min-w-[200px] neon-border">
        <span className="text-sm text-zinc-400 uppercase tracking-wider font-bold">Speed</span>
        <span className="text-4xl font-bold font-mono text-neon-pink neon-glow">{multiplier.toFixed(2)}x</span>
      </Card>
    </div>
  );
}
