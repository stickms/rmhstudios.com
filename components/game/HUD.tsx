'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useGameStore } from '@/lib/store/useGameStore';
import { AudioManager } from '@/lib/audio/AudioManager';

function fmt(s: number) {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
}

export function HUD() {
  const { t } = useTranslation("c-game");
  const { score, combo, multiplier, opponents, modifiers } = useGameStore();
  const [currentTime, setCurrentTime] = useState(0);
  const [prevCombo, setPrevCombo] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    let raf: number;
    const tick = () => {
      const audio = AudioManager.getInstance();
      setCurrentTime(audio.getCurrentTime());
      setDuration(audio.getDuration());
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0;

  return (
    <div className="absolute top-0 left-0 right-0 pointer-events-none z-40 p-2 sm:p-4 flex flex-col gap-2 font-outfit">
        {/* Score + Speed row */}
        <div className="flex justify-between items-start relative px-1">
            <div className="bg-slice-bg shadow-[5px_5px_10px_var(--slice-shadow-dark),-5px_-5px_10px_var(--slice-shadow-light)] rounded-2xl px-4 py-2">
                <div className="text-[10px] sm:text-xs text-slice-text-muted uppercase tracking-wider font-bold leading-none mb-1">{t("score", { defaultValue: "Score" })}</div>
                <div className="text-xl sm:text-2xl font-bold text-slice-text leading-tight">
                    {score.toLocaleString()}
                </div>
            </div>

            {/* Speed row — shifted left to avoid settings gear overlap */}
            <div className="bg-slice-bg shadow-[5px_5px_10px_var(--slice-shadow-dark),-5px_-5px_10px_var(--slice-shadow-light)] rounded-2xl px-4 py-2 text-right mr-10 sm:mr-12">
                <div className="text-[10px] sm:text-xs text-slice-text-muted uppercase tracking-wider font-bold leading-none mb-1">{t("speed", { defaultValue: "Speed" })}</div>
                <div className="text-xl sm:text-2xl font-bold text-slice-text leading-tight">
                    {modifiers.speed.toFixed(1)}x
                </div>
            </div>

            {/* Combo — center, above score/speed row */}
            {combo > 5 && (
                <div key={combo} className="absolute left-1/2 -translate-x-1/2 top-1 sm:top-2" style={{ animation: 'combo-bounce 0.15s ease-out' }}>
                    <span className="text-3xl sm:text-5xl font-black italic text-slice-text soft-glow-text drop-shadow-lg">
                        {combo}x
                    </span>
                </div>
            )}
        </div>

        {/* Song progress bar — bottom of HUD */}
        {duration > 0 && (
            <div className="absolute bottom-0 left-0 right-0 translate-y-full pt-2 px-4 pointer-events-none">
                <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-slice-text-muted w-10 text-right shrink-0">{fmt(currentTime)}</span>
                    <div className="flex-1 h-2 bg-slice-bg rounded-full overflow-hidden shadow-[inset_2px_2px_5px_var(--slice-shadow-dark),inset_-2px_-2px_5px_var(--slice-shadow-light)]">
                        <div
                            className="h-full bg-blue-400 rounded-full transition-none"
                            style={{ width: `${progress * 100}%` }}
                        />
                    </div>
                    <span className="text-xs font-bold text-slice-text-muted w-10 shrink-0">{fmt(duration)}</span>
                </div>
            </div>
        )}
    </div>
  );
}
