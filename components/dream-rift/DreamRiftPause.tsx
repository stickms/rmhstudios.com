'use client';

import { CANVAS_WIDTH, CANVAS_HEIGHT } from '@/lib/dream-rift/constants';

export function DreamRiftPause({
  onResume,
  onRestart,
  onQuit,
}: {
  onResume: () => void;
  onRestart: () => void;
  onQuit: () => void;
}) {
  return (
    <div
      className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-black/80"
      style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT }}
    >
      <div className="flex flex-col items-center gap-6">
        <h2 className="text-2xl font-black tracking-wider text-white">
          PAUSED
        </h2>

        <div className="flex flex-col items-center gap-2 w-48">
          <button
            onClick={onResume}
            className="w-full py-2.5 px-6 text-sm font-bold tracking-wide text-white bg-white/10 border border-white/20 rounded hover:bg-white/20 hover:border-white/40 transition-all"
          >
            Resume
          </button>
          <button
            onClick={onRestart}
            className="w-full py-2.5 px-6 text-sm font-bold tracking-wide text-zinc-300 bg-white/5 border border-white/10 rounded hover:bg-white/10 hover:text-white transition-all"
          >
            Restart
          </button>
          <button
            onClick={onQuit}
            className="w-full py-2.5 px-6 text-sm font-bold tracking-wide text-zinc-400 bg-white/5 border border-white/10 rounded hover:bg-white/10 hover:text-zinc-200 transition-all"
          >
            Quit to Title
          </button>
        </div>

        <p className="text-[10px] text-zinc-600">
          Press Esc to resume
        </p>
      </div>
    </div>
  );
}
