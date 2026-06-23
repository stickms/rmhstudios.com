import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useGameStore } from '@/lib/store/useGameStore';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { RotateCcw, Home, Trophy } from 'lucide-react';

interface GameOverProps {
  onRetry?: () => void;
}

export function GameOver({ onRetry }: GameOverProps) {
  const { t } = useTranslation("c-game");
  const { score, multiplier, maxCombo, accuracy, songId, reset, userName, status, modifiers } = useGameStore();
  const [isNewBest, setIsNewBest] = useState(false);
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
        speed: modifiers.speed,
        modifiers
      });
      fetch('/api/slice-it/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          username: userName, 
          score, 
          accuracy, 
          maxCombo, 
          songId, 
          speed: modifiers.speed,
          modifiers 
        }),
      })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          console.error('Score submission failed:', res.status, body);
        } else {
          console.log('[DEBUG] Score submission response:', body);
          if (body.isNewBest) {
            setIsNewBest(true);
          }
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
            {t("complete", { defaultValue: "COMPLETE" })}
          </CardTitle>
          {isUnranked && (
            <div className="mt-2 inline-flex items-center gap-1.5 bg-orange-500/20 text-orange-400 text-xs font-bold uppercase tracking-widest px-3 py-1.5 rounded-full mx-auto">
              <span>{t("unranked", { defaultValue: "Unranked" })}</span>
              <span className="text-[9px] font-normal normal-case tracking-normal text-orange-400">{t("speed-below", { defaultValue: "Speed below 1.0x" })}</span>
            </div>
          )}
        </CardHeader>
        
        <CardContent className="space-y-6 text-center relative z-10 p-8">
          <div className="space-y-1">
            <div className="text-sm text-slice-text-light uppercase tracking-widest font-bold">{t("final-score", { defaultValue: "Final Score" })}</div>
            <div className="text-6xl font-bold text-slice-text relative inline-block">
              {score.toLocaleString()}
              {isNewBest && (
                <div className="absolute -top-6 -right-12 rotate-12 animate-in zoom-in duration-500">
                  <div className="bg-yellow-400 text-black text-[10px] font-black px-2 py-1 rounded-md shadow-lg flex items-center gap-1">
                    <Trophy className="w-3 h-3" />
                    {t("new-best", { defaultValue: "NEW BEST!" })}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
             <div className="bg-slice-bg p-4 rounded-2xl shadow-[inset_5px_5px_10px_var(--slice-shadow-dark),inset_-5px_-5px_10px_var(--slice-shadow-light)] flex flex-col gap-1">
                 <div className="text-xs text-slice-text-light uppercase font-bold">{t("max-chain", { defaultValue: "Max Chain" })}</div>
                 <div className="text-xl font-bold text-slice-text-darker">
                     {maxCombo > 0 ? `${maxCombo}x` : '--'}
                 </div>
             </div>
             <div className="bg-slice-bg p-4 rounded-2xl shadow-[inset_5px_5px_10px_var(--slice-shadow-dark),inset_-5px_-5px_10px_var(--slice-shadow-light)] flex flex-col gap-1">
                 <div className="text-xs text-slice-text-light uppercase font-bold">{t("accuracy", { defaultValue: "Accuracy" })}</div>
                 <div className={`text-xl font-bold font-mono ${accuracyColor}`}>
                     {accuracyPct}%
                 </div>
                 {isFC && <div className="text-[10px] font-black text-cyan-500 uppercase tracking-widest">{t("full-combo", { defaultValue: "Full Combo!" })}</div>}
             </div>
             <div className="bg-slice-bg p-4 rounded-2xl shadow-[inset_5px_5px_10px_var(--slice-shadow-dark),inset_-5px_-5px_10px_var(--slice-shadow-light)] flex flex-col gap-1">
                 <div className="text-xs text-slice-text-light uppercase font-bold">{t("speed", { defaultValue: "Speed" })}</div>
                 <div className="text-xl font-bold text-slice-text-darker">
                     {multiplier.toFixed(1)}x
                 </div>
             </div>
          </div>

          <div className="flex gap-4">
            <Button 
                className="flex-1 bg-blue-500 hover:bg-blue-600 text-white font-black uppercase tracking-widest text-sm h-14 rounded-xl shadow-lg transition-all border-none flex items-center justify-center gap-2 group"
                onClick={onRetry}
            >
                <RotateCcw className="w-4 h-4 group-hover:rotate-[-120deg] transition-transform" />
                {t("retry", { defaultValue: "Retry" })}
            </Button>
            <Button
                variant="ghost"
                className="flex-1 bg-slice-bg hover:bg-slice-shadow-dark/20 text-slice-text-muted font-bold uppercase tracking-widest text-sm h-14 rounded-xl shadow-[4px_4px_10px_var(--slice-shadow-dark),-4px_-4px_10px_var(--slice-shadow-light)] active:shadow-inner transition-all border-none flex items-center justify-center gap-2"
                onClick={reset}
            >
                <Home className="w-4 h-4" />
                {t("menu", { defaultValue: "Menu" })}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
