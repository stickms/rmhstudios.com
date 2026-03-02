'use client';

import { useDreamRiftStore } from '@/lib/dream-rift/store';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '@/lib/dream-rift/constants';

const STAGE_NAMES: Record<number, string> = {
  1: 'Crimson Twilight',
  2: 'Frozen Reverie',
  3: 'Shattered Prism',
  4: 'Abyssal Garden',
  5: 'Celestial Storm',
  6: 'Dream Rift',
};

export function DreamRiftStageResult({ onQuit }: { onQuit: () => void }) {
  const stage = useDreamRiftStore((s) => s.stage);
  const player = useDreamRiftStore((s) => s.player);
  const totalScore = useDreamRiftStore((s) => s.totalScore);
  const nextStage = useDreamRiftStore((s) => s.nextStage);

  const stageName = STAGE_NAMES[stage] ?? `Stage ${stage}`;
  const isFinalStage = stage >= 6;

  const handleNext = () => {
    if (isFinalStage) {
      // Credits / return to title for now
      onQuit();
    } else {
      nextStage();
    }
  };

  return (
    <div
      className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-black/80"
      style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT }}
    >
      <div className="flex flex-col items-center gap-6 px-6">
        {/* Stage name */}
        <div className="text-center">
          <p className="text-[10px] text-zinc-500 uppercase tracking-widest">
            Stage {stage}
          </p>
          <h2 className="text-2xl font-black tracking-wider text-white mt-1">
            {stageName}
          </h2>
          <p className="text-lg font-bold text-green-400 mt-1 tracking-wide">
            CLEAR
          </p>
        </div>

        {/* Score breakdown */}
        <div className="w-64 bg-black/60 border border-zinc-700 rounded-lg p-4 space-y-3">
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-zinc-500">Stage Score</span>
              <span className="text-white tabular-nums font-bold">
                {player.score.toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-zinc-500">Total Score</span>
              <span className="text-white tabular-nums font-bold">
                {totalScore.toLocaleString()}
              </span>
            </div>
            <div className="border-t border-white/10" />
            <div className="flex justify-between text-xs">
              <span className="text-zinc-500">Graze</span>
              <span className="text-zinc-300 tabular-nums">
                {player.graze.toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-zinc-500">Lives Remaining</span>
              <span className="text-zinc-300 tabular-nums">
                {Math.max(0, player.lives)}
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-zinc-500">Bombs Remaining</span>
              <span className="text-zinc-300 tabular-nums">
                {Math.max(0, player.bombs)}
              </span>
            </div>
          </div>
        </div>

        {/* Continue button */}
        <div className="flex flex-col items-center gap-2 w-48">
          <button
            onClick={handleNext}
            className="w-full py-2.5 px-6 text-sm font-bold tracking-wide text-white bg-white/10 border border-white/20 rounded hover:bg-white/20 hover:border-white/40 transition-all"
          >
            {isFinalStage ? 'Credits' : 'Next Stage'}
          </button>
          <button
            onClick={onQuit}
            className="w-full py-2.5 px-6 text-sm font-bold tracking-wide text-zinc-400 bg-white/5 border border-white/10 rounded hover:bg-white/10 hover:text-zinc-200 transition-all"
          >
            Quit to Title
          </button>
        </div>
      </div>
    </div>
  );
}
