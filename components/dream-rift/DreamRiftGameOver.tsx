'use client';

import { useDreamRiftStore } from '@/lib/dream-rift/store';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '@/lib/dream-rift/constants';

export function DreamRiftGameOver({ onQuit }: { onQuit: () => void }) {
  const useContinue = useDreamRiftStore((s) => s.useContinue);
  const continues = useDreamRiftStore((s) => s.continues);
  const difficulty = useDreamRiftStore((s) => s.difficulty);
  const player = useDreamRiftStore((s) => s.player);
  const totalScore = useDreamRiftStore((s) => s.totalScore);

  const maxContinues =
    difficulty === 'easy' ? 5 :
    difficulty === 'normal' ? 3 :
    difficulty === 'hard' ? 1 : 0;

  const remaining = maxContinues - continues;
  const canContinue = remaining > 0;

  const handleContinue = () => {
    useContinue();
  };

  return (
    <div
      className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-black/80"
      style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT }}
    >
      <div className="flex flex-col items-center gap-6 px-6">
        {/* Title */}
        <h2 className="text-3xl font-black tracking-wider text-red-500">
          GAME OVER
        </h2>

        {/* Score summary */}
        <div className="w-64 bg-black/60 border border-zinc-700 rounded-lg p-4 space-y-3">
          <div className="text-center">
            <div className="text-[9px] text-zinc-500 uppercase tracking-wider">
              Final Score
            </div>
            <div className="text-xl font-bold text-white tabular-nums">
              {totalScore.toLocaleString()}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-center">
            <div>
              <div className="text-[9px] text-zinc-600">Graze</div>
              <div className="text-xs text-zinc-300 tabular-nums">
                {player.graze.toLocaleString()}
              </div>
            </div>
            <div>
              <div className="text-[9px] text-zinc-600">Continues Used</div>
              <div className="text-xs text-zinc-300 tabular-nums">
                {continues}
              </div>
            </div>
          </div>
        </div>

        {/* Continue prompt */}
        {canContinue && (
          <div className="text-center">
            <p className="text-xs text-zinc-400">
              Continues remaining: <span className="text-white font-bold">{remaining}</span>
            </p>
          </div>
        )}

        {/* Buttons */}
        <div className="flex flex-col items-center gap-2 w-48">
          {canContinue && (
            <button
              onClick={handleContinue}
              className="w-full py-2.5 px-6 text-sm font-bold tracking-wide text-white bg-white/10 border border-white/20 rounded hover:bg-white/20 hover:border-white/40 transition-all"
            >
              Continue
            </button>
          )}
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
