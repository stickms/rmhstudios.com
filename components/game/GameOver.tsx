import { useEffect, useRef } from 'react';
import { useGameStore } from '@/lib/store/useGameStore';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

export function GameOver() {
  const { score, multiplier, maxCombo, accuracy, songId, reset, userName, status, modifiers } = useGameStore();
  const isUnranked = modifiers.speed < 1.0;
  const submittedRef = useRef(false);

  useEffect(() => {
    if (submittedRef.current) return;
    if (userName && score > 0 && status === 'FINISHED' && !isUnranked) {
      submittedRef.current = true;
      console.log('[DEBUG] Submitting score:', {
        username: userName,
        score,
        accuracy,
        maxCombo,
        songId,
        speed: modifiers.speed
      });
      fetch('/api/slice-it/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: userName, score, accuracy, maxCombo, songId, speed: modifiers.speed }),
      })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          console.error('Score submission failed:', res.status, body);
        } else {
          console.log('[DEBUG] Score submission response:', body);
        }
      })
      .catch(err => console.error('Score submission network error:', err));
    }
  }, [score, accuracy, maxCombo, songId, userName, status, isUnranked, modifiers.speed]);

  const accuracyPct = (accuracy * 100).toFixed(2);
  const isFC = accuracy >= 1.0;
  const accuracyColor =
    accuracy >= 1.0  ? 'text-cyan-500' :
    accuracy >= 0.95 ? 'text-green-500' :
    accuracy >= 0.80 ? 'text-yellow-500' :
                       'text-slice-text-muted';

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-slice-bg/80 backdrop-blur-sm p-4">
      <Card className="w-full max-w-md bg-slice-bg text-slice-text shadow-[20px_20px_60px_var(--slice-shadow-dark),-20px_-20px_60px_var(--slice-shadow-light)] border-none rounded-[2rem] overflow-hidden">
        
        <CardHeader className="text-center pb-2 pt-8">
          <CardTitle className="text-5xl font-black tracking-tight text-blue-500">
            COMPLETE
          </CardTitle>
          {isUnranked && (
            <div className="mt-2 inline-flex items-center gap-1.5 bg-orange-500/20 text-orange-400 text-xs font-bold uppercase tracking-widest px-3 py-1.5 rounded-full mx-auto">
              <span>Unranked</span>
              <span className="text-[9px] font-normal normal-case tracking-normal text-orange-400">Speed below 1.0x</span>
            </div>
          )}
        </CardHeader>
        
        <CardContent className="space-y-6 text-center relative z-10 p-8">
          <div className="space-y-1">
            <div className="text-sm text-slice-text-light uppercase tracking-widest font-bold">Final Score</div>
            <div className="text-6xl font-bold text-slice-text">
              {score.toLocaleString()}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
             <div className="bg-slice-bg p-4 rounded-2xl shadow-[inset_5px_5px_10px_var(--slice-shadow-dark),inset_-5px_-5px_10px_var(--slice-shadow-light)] flex flex-col gap-1">
                 <div className="text-xs text-slice-text-light uppercase font-bold">Max Chain</div>
                 <div className="text-xl font-bold text-slice-text-darker">
                     {maxCombo > 0 ? `${maxCombo}x` : '--'}
                 </div>
             </div>
             <div className="bg-slice-bg p-4 rounded-2xl shadow-[inset_5px_5px_10px_var(--slice-shadow-dark),inset_-5px_-5px_10px_var(--slice-shadow-light)] flex flex-col gap-1">
                 <div className="text-xs text-slice-text-light uppercase font-bold">Accuracy</div>
                 <div className={`text-xl font-bold font-mono ${accuracyColor}`}>
                     {accuracyPct}%
                 </div>
                 {isFC && <div className="text-[10px] font-black text-cyan-500 uppercase tracking-widest">Full Combo!</div>}
             </div>
             <div className="bg-slice-bg p-4 rounded-2xl shadow-[inset_5px_5px_10px_var(--slice-shadow-dark),inset_-5px_-5px_10px_var(--slice-shadow-light)] flex flex-col gap-1">
                 <div className="text-xs text-slice-text-light uppercase font-bold">Speed</div>
                 <div className="text-xl font-bold text-slice-text-darker">
                     {multiplier.toFixed(1)}x
                 </div>
             </div>
          </div>

          <Button 
            className="w-full bg-slice-bg hover:bg-slice-shadow-dark/20 text-blue-500 font-black uppercase tracking-widest text-lg h-16 rounded-xl shadow-[6px_6px_12px_var(--slice-shadow-dark),-6px_-6px_12px_var(--slice-shadow-light)] active:shadow-[inset_6px_6px_12px_var(--slice-shadow-dark),inset_-6px_-6px_12px_var(--slice-shadow-light)] transition-all border-none"
            onClick={reset}
          >
            Play Again
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
