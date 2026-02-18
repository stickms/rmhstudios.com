import { useEffect } from 'react';
import { useGameStore } from '@/lib/store/useGameStore';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { AudioManager } from '@/lib/audio/AudioManager';

export function GameOver() {
  const { score, multiplier, reset, userName } = useGameStore();

  useEffect(() => {
    // Play sound
    // const audio = AudioManager.getInstance();
    // audio.playSound('gameover'); 

    // Submit Score
    if (userName && score > 0) {
        fetch('/api/slice-it/score', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: userName, score }),
        }).catch(err => console.error("Failed to submit score", err));
    }
  }, [score, userName]);

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <Card className="w-full max-w-md border-neon-pink bg-black/90 text-white shadow-[0_0_50px_rgba(255,0,255,0.3)] neon-border relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-neon-pink/10 pointer-events-none" />
        
        <CardHeader className="text-center pb-2">
          <CardTitle className="text-5xl font-black italic text-neon-pink glitch-text tracking-tighter">
            GAME OVER
          </CardTitle>
        </CardHeader>
        
        <CardContent className="space-y-6 text-center relative z-10">
          <div className="space-y-2">
            <div className="text-sm text-zinc-400 uppercase tracking-widest font-bold">Final Score</div>
            <div className="text-6xl font-mono font-bold text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.5)]">
              {score.toLocaleString()}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
             <div className="bg-zinc-900/50 p-3 rounded border border-zinc-800">
                 <div className="text-xs text-zinc-500 uppercase font-bold">Max Chain</div>
                 <div className="text-xl font-bold text-neon-cyan">
                     -- {/* Track combo? */}
                 </div>
             </div>
             <div className="bg-zinc-900/50 p-3 rounded border border-zinc-800">
                 <div className="text-xs text-zinc-500 uppercase font-bold">Top Speed</div>
                 <div className="text-xl font-bold text-neon-yellow">
                     {multiplier.toFixed(1)}x
                 </div>
             </div>
          </div>

          <Button 
            className="w-full bg-neon-cyan hover:bg-cyan-400 text-black font-black uppercase tracking-widest text-lg py-6 shadow-[0_0_20px_rgba(0,255,255,0.4)] transition-all hover:scale-105 active:scale-95"
            onClick={reset}
          >
            Play Again
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
