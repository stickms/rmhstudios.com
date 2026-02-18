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
  const { score, combo, multiplier, health, maxHealth } = useGameStore();
  const [currentTime, setCurrentTime] = useState(0);
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
    <div className="absolute top-0 left-0 right-0 pointer-events-none z-40 p-2 sm:p-3 flex flex-col gap-1">
        {/* Health bar */}
        <div className="w-full h-2 sm:h-3 bg-zinc-800 rounded-full overflow-hidden border border-zinc-700">
            <div
                className={`h-full transition-all duration-200 ease-out ${
                    health < 30
                        ? 'bg-red-500 shadow-[0_0_8px_rgba(255,0,0,0.8)] animate-pulse'
                        : 'bg-gradient-to-r from-green-500 to-emerald-400'
                }`}
                style={{ width: `${(health / maxHealth) * 100}%` }}
            />
        </div>

        {/* Score + Speed row */}
        <div className="flex justify-between items-start relative">
            <div className="bg-black/60 border border-zinc-800 rounded-lg px-2 py-1 sm:px-3 sm:py-2 backdrop-blur">
                <div className="text-[10px] sm:text-xs text-zinc-400 uppercase tracking-wider font-bold leading-none">Score</div>
                <div className="text-lg sm:text-2xl md:text-3xl font-bold font-mono text-cyan-400 leading-tight">
                    {score.toLocaleString()}
                </div>
            </div>

            {/* Combo — center */}
            {combo > 5 && (
                <div className="absolute left-1/2 -translate-x-1/2 top-8 sm:top-10 animate-bounce">
                    <span className="text-2xl sm:text-4xl font-black italic text-yellow-400 drop-shadow-[0_0_12px_rgba(255,255,0,0.8)]">
                        {combo}x COMBO
                    </span>
                </div>
            )}

            <div className="bg-black/60 border border-zinc-800 rounded-lg px-2 py-1 sm:px-3 sm:py-2 backdrop-blur text-right">
                <div className="text-[10px] sm:text-xs text-zinc-400 uppercase tracking-wider font-bold leading-none">Speed</div>
                <div className="text-lg sm:text-2xl md:text-3xl font-bold font-mono text-pink-400 leading-tight">
                    {multiplier.toFixed(2)}x
                </div>
            </div>
        </div>

        {/* Song progress bar — bottom of HUD */}
        {duration > 0 && (
            <div className="absolute bottom-0 left-0 right-0 translate-y-full pt-1 px-2 sm:px-3 pointer-events-none">
                <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-zinc-500 w-8 text-right shrink-0">{fmt(currentTime)}</span>
                    <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-gradient-to-r from-neon-cyan to-neon-purple rounded-full transition-none"
                            style={{ width: `${progress * 100}%` }}
                        />
                    </div>
                    <span className="text-[10px] font-mono text-zinc-500 w-8 shrink-0">{fmt(duration)}</span>
                </div>
            </div>
        )}
    </div>
  );
}
