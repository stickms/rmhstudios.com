'use client';

import { useEffect, useState } from 'react';
import { useGameStore } from '@/lib/store/useGameStore';
import { AudioManager } from '@/lib/audio/AudioManager';

function fmt(s: number) {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
}

export function HUD() {
  const { score, combo, multiplier, health, maxHealth, opponents } = useGameStore();
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
        {/* Health bar - Neumorphic Inset */}
        <div className="w-full h-3 sm:h-4 bg-[#e0e5ec] rounded-full overflow-hidden shadow-[inset_3px_3px_6px_#a3b1c6,inset_-3px_-3px_6px_#ffffff]">
            <div
                className={`h-full transition-all duration-200 ease-out rounded-full ${
                    health < 30 ? 'bg-red-400' : 'bg-gradient-to-r from-blue-400 to-pink-400'
                }`}
                style={{ width: `${(health / maxHealth) * 100}%` }}
            />
        </div>

        {/* Score + Speed row */}
        <div className="flex justify-between items-start relative px-1">
            <div className="bg-[#e0e5ec] shadow-[5px_5px_10px_#a3b1c6,-5px_-5px_10px_#ffffff] rounded-2xl px-4 py-2">
                <div className="text-[10px] sm:text-xs text-slate-500 uppercase tracking-wider font-bold leading-none mb-1">Score</div>
                <div className="text-xl sm:text-2xl font-bold text-slate-700 leading-tight">
                    {score.toLocaleString()}
                </div>
            </div>

            {/* Speed row */}
            <div className="bg-[#e0e5ec] shadow-[5px_5px_10px_#a3b1c6,-5px_-5px_10px_#ffffff] rounded-2xl px-4 py-2 text-right">
                <div className="text-[10px] sm:text-xs text-slate-500 uppercase tracking-wider font-bold leading-none mb-1">Speed</div>
                <div className="text-xl sm:text-2xl font-bold text-slate-700 leading-tight">
                    {multiplier.toFixed(2)}x
                </div>
            </div>

            {/* Combo — center */}
            {combo > 5 && (
                <div key={combo} className="absolute left-1/2 -translate-x-1/2 top-10 sm:top-12 animate-in zoom-in-50 duration-100 ease-out">
                    <span className="text-3xl sm:text-5xl font-black italic text-slate-700 soft-glow-text drop-shadow-lg">
                        {combo}x
                    </span>
                </div>
            )}
        </div>

        {/* Song progress bar — bottom of HUD */}
        {duration > 0 && (
            <div className="absolute bottom-0 left-0 right-0 translate-y-full pt-2 px-4 pointer-events-none">
                <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-slate-500 w-10 text-right shrink-0">{fmt(currentTime)}</span>
                    <div className="flex-1 h-2 bg-[#e0e5ec] rounded-full overflow-hidden shadow-[inset_2px_2px_5px_#a3b1c6,inset_-2px_-2px_5px_#ffffff]">
                        <div
                            className="h-full bg-blue-400 rounded-full transition-none"
                            style={{ width: `${progress * 100}%` }}
                        />
                    </div>
                    <span className="text-xs font-bold text-slate-500 w-10 shrink-0">{fmt(duration)}</span>
                </div>
            </div>
        )}
    </div>
  );
}
