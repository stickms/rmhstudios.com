import { useEffect } from 'react';
import { useGameStore } from '@/lib/store/useGameStore';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

export function GameOver() {
  const { score, multiplier, maxCombo, accuracy, songId, reset, userName, status } = useGameStore();

  useEffect(() => {
    if (userName && score > 0 && status === 'FINISHED') {
        fetch('/api/slice-it/score', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: userName, score, accuracy, maxCombo, songId }),
        })
        .then(async (res) => {
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                console.error('Score submission failed:', res.status, body);
            }
        })
        .catch(err => console.error('Score submission network error:', err));
    }
  }, [score, accuracy, maxCombo, songId, userName, status]);

  const accuracyPct = (accuracy * 100).toFixed(2);
  const isFC = accuracy >= 1.0;
  const accuracyColor =
    accuracy >= 1.0  ? 'text-cyan-500' :
    accuracy >= 0.95 ? 'text-green-500' :
    accuracy >= 0.80 ? 'text-yellow-500' :
                       'text-slate-500';

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#e0e5ec]/80 backdrop-blur-sm p-4">
      <Card className="w-full max-w-md bg-[#e0e5ec] text-slate-700 shadow-[20px_20px_60px_#bebebe,-20px_-20px_60px_#ffffff] border-none rounded-[2rem] overflow-hidden">
        
        <CardHeader className="text-center pb-2 pt-8">
          <CardTitle className="text-5xl font-black tracking-tight text-blue-500">
            COMPLETE
          </CardTitle>
        </CardHeader>
        
        <CardContent className="space-y-6 text-center relative z-10 p-8">
          <div className="space-y-1">
            <div className="text-sm text-slate-400 uppercase tracking-widest font-bold">Final Score</div>
            <div className="text-6xl font-bold text-slate-700">
              {score.toLocaleString()}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
             <div className="bg-[#e0e5ec] p-4 rounded-2xl shadow-[inset_5px_5px_10px_#a3b1c6,inset_-5px_-5px_10px_#ffffff] flex flex-col gap-1">
                 <div className="text-xs text-slate-400 uppercase font-bold">Max Chain</div>
                 <div className="text-xl font-bold text-slate-600">
                     {maxCombo > 0 ? `${maxCombo}x` : '--'}
                 </div>
             </div>
             <div className="bg-[#e0e5ec] p-4 rounded-2xl shadow-[inset_5px_5px_10px_#a3b1c6,inset_-5px_-5px_10px_#ffffff] flex flex-col gap-1">
                 <div className="text-xs text-slate-400 uppercase font-bold">Accuracy</div>
                 <div className={`text-xl font-bold font-mono ${accuracyColor}`}>
                     {accuracyPct}%
                 </div>
                 {isFC && <div className="text-[10px] font-black text-cyan-500 uppercase tracking-widest">Full Combo!</div>}
             </div>
             <div className="bg-[#e0e5ec] p-4 rounded-2xl shadow-[inset_5px_5px_10px_#a3b1c6,inset_-5px_-5px_10px_#ffffff] flex flex-col gap-1">
                 <div className="text-xs text-slate-400 uppercase font-bold">Speed</div>
                 <div className="text-xl font-bold text-slate-600">
                     {multiplier.toFixed(1)}x
                 </div>
             </div>
          </div>

          <Button 
            className="w-full bg-[#e0e5ec] hover:bg-slate-50 text-blue-500 font-black uppercase tracking-widest text-lg h-16 rounded-xl shadow-[6px_6px_12px_#a3b1c6,-6px_-6px_12px_#ffffff] active:shadow-[inset_6px_6px_12px_#a3b1c6,inset_-6px_-6px_12px_#ffffff] transition-all border-none"
            onClick={reset}
          >
            Play Again
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
