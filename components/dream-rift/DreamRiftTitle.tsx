'use client';

import { useDreamRiftStore } from '@/lib/dream-rift/store';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '@/lib/dream-rift/constants';

export function DreamRiftTitle() {
  const setScreen = useDreamRiftStore((s) => s.setScreen);

  return (
    <div
      className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/80"
      style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT }}
    >
      <div className="flex flex-col items-center gap-8">
        {/* Title */}
        <div className="text-center">
          <h1 className="text-4xl font-black tracking-wider text-white">
            DREAM RIFT
          </h1>
          <p className="mt-2 text-sm text-zinc-400 tracking-wide">
            A Bullet Hell Story
          </p>
        </div>

        {/* Menu buttons */}
        <div className="flex flex-col items-center gap-3 w-48">
          <button
            onClick={() => setScreen('charSelect')}
            className="w-full py-2.5 px-6 text-sm font-bold tracking-wide text-white bg-white/10 border border-white/20 rounded hover:bg-white/20 hover:border-white/40 transition-all"
          >
            Start Game
          </button>
          <button
            disabled
            className="w-full py-2.5 px-6 text-sm font-bold tracking-wide text-zinc-600 bg-white/5 border border-white/10 rounded cursor-not-allowed"
          >
            Practice
          </button>
          <button
            disabled
            className="w-full py-2.5 px-6 text-sm font-bold tracking-wide text-zinc-600 bg-white/5 border border-white/10 rounded cursor-not-allowed"
          >
            Options
          </button>
        </div>

        {/* Controls hint */}
        <div className="text-center text-[10px] text-zinc-600 space-y-0.5">
          <p>Arrow keys move / Z shoot / X melee / C bomb / Shift focus</p>
          <p>A dash / Esc pause</p>
        </div>
      </div>
    </div>
  );
}
