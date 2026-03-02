'use client';

import { useDreamRiftStore } from '@/lib/dream-rift/store';
import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  PLAYFIELD_WIDTH,
  SIDEBAR_WIDTH,
  POWER_MAX,
} from '@/lib/dream-rift/constants';

export function DreamRiftHUD() {
  const player = useDreamRiftStore((s) => s.player);
  const stage = useDreamRiftStore((s) => s.stage);
  const difficulty = useDreamRiftStore((s) => s.difficulty);

  const powerPercent = Math.min(100, (player.power / POWER_MAX) * 100);

  return (
    <div
      className="absolute top-0 pointer-events-none z-20 font-mono"
      style={{
        left: PLAYFIELD_WIDTH,
        width: SIDEBAR_WIDTH,
        height: CANVAS_HEIGHT,
      }}
    >
      <div className="flex flex-col gap-3 p-3 h-full text-white">
        {/* Score */}
        <div>
          <div className="text-[9px] text-white/50 uppercase tracking-wider">
            Hi-Score
          </div>
          <div className="text-xs tabular-nums">
            {player.hiScore.toLocaleString()}
          </div>
        </div>

        <div>
          <div className="text-[9px] text-white/50 uppercase tracking-wider">
            Score
          </div>
          <div className="text-sm font-bold tabular-nums">
            {player.score.toLocaleString()}
          </div>
        </div>

        {/* Separator */}
        <div className="border-t border-white/10" />

        {/* Lives */}
        <div>
          <div className="text-[9px] text-white/50 uppercase tracking-wider">
            Lives
          </div>
          <div className="text-xs flex gap-0.5 mt-0.5">
            {Array.from({ length: Math.max(0, player.lives) }).map((_, i) => (
              <span key={i} className="text-yellow-400">&#9733;</span>
            ))}
            {player.lives <= 0 && (
              <span className="text-zinc-600 text-[10px]">---</span>
            )}
          </div>
        </div>

        {/* Bombs */}
        <div>
          <div className="text-[9px] text-white/50 uppercase tracking-wider">
            Bombs
          </div>
          <div className="text-xs flex gap-0.5 mt-0.5">
            {Array.from({ length: Math.max(0, player.bombs) }).map((_, i) => (
              <span key={i} className="text-green-400">&#9670;</span>
            ))}
            {player.bombs <= 0 && (
              <span className="text-zinc-600 text-[10px]">---</span>
            )}
          </div>
        </div>

        {/* Power */}
        <div>
          <div className="text-[9px] text-white/50 uppercase tracking-wider">
            Power
          </div>
          <div className="mt-1">
            <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-red-500 transition-all duration-100"
                style={{ width: `${powerPercent}%` }}
              />
            </div>
            <div className="text-[9px] text-zinc-500 mt-0.5 tabular-nums">
              {player.power}/{POWER_MAX}
            </div>
          </div>
        </div>

        {/* Separator */}
        <div className="border-t border-white/10" />

        {/* Graze */}
        <div>
          <div className="text-[9px] text-white/50 uppercase tracking-wider">
            Graze
          </div>
          <div className="text-xs tabular-nums">
            {player.graze.toLocaleString()}
          </div>
        </div>

        {/* Stage / Difficulty at the bottom */}
        <div className="mt-auto">
          <div className="border-t border-white/10 pt-3 space-y-1">
            <div className="flex justify-between text-[9px]">
              <span className="text-white/50">Stage</span>
              <span className="text-white tabular-nums">{stage}</span>
            </div>
            <div className="flex justify-between text-[9px]">
              <span className="text-white/50">Difficulty</span>
              <span className={
                difficulty === 'easy' ? 'text-green-400' :
                difficulty === 'normal' ? 'text-blue-400' :
                difficulty === 'hard' ? 'text-orange-400' :
                'text-red-400'
              }>
                {difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
