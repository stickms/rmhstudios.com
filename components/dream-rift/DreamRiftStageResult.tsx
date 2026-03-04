'use client';

import { useDreamRiftStore } from '@/lib/dream-rift/store';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '@/lib/dream-rift/constants';
import { TouhouFrame, TouhouMenuButton, TouhouDivider } from './TouhouFrame';

const STAGE_NAMES: Record<number, string> = {
  1: 'Lucid Meadow',
  2: 'Drowning Library',
  3: 'Clockwork Abyss',
  4: 'Mirror Palace',
  5: 'Burning Carnival',
  6: 'The Rift Core',
};

export function DreamRiftStageResult({ onQuit }: { onQuit: () => void }) {
  const stage = useDreamRiftStore((s) => s.stage);
  const player = useDreamRiftStore((s) => s.player);
  const totalScore = useDreamRiftStore((s) => s.totalScore);
  const nextStage = useDreamRiftStore((s) => s.nextStage);
  const setScreen = useDreamRiftStore((s) => s.setScreen);

  const stageName = STAGE_NAMES[stage] ?? `Stage ${stage}`;
  const isFinalStage = stage >= 6;

  const handleNext = () => {
    if (isFinalStage) {
      setScreen('leaderboard');
    } else {
      nextStage();
    }
  };

  return (
    <div
      className="absolute inset-0 z-40 flex flex-col items-center justify-center"
      style={{
        width: CANVAS_WIDTH,
        height: CANVAS_HEIGHT,
        background: 'radial-gradient(ellipse at center, rgba(15,10,40,0.95) 0%, rgba(8,4,15,0.97) 100%)',
      }}
    >
      <TouhouFrame className="w-72">
        <div className="py-4 px-4">
          {/* Stage header */}
          <div className="text-center mb-3">
            <div className="text-[9px] tracking-[0.3em] text-amber-400/40 uppercase">
              Stage {stage}
            </div>
            <h2
              className="text-lg tracking-[0.15em] text-amber-200/90 mt-0.5"
              style={{ fontFamily: "'Georgia', serif" }}
            >
              {stageName}
            </h2>
            <p
              className="text-base tracking-[0.2em] mt-1"
              style={{
                fontFamily: "'Georgia', serif",
                color: '#66cc88',
                textShadow: '0 0 12px rgba(102,204,136,0.3)',
              }}
            >
              CLEAR
            </p>
            <TouhouDivider />
          </div>

          {/* Score breakdown */}
          <div className="border border-amber-400/15 bg-white/[0.02] p-3 space-y-2">
            <ScoreRow label="Stage Score" value={player.score.toLocaleString()} highlight />
            <ScoreRow label="Total Score" value={totalScore.toLocaleString()} highlight />
            <div className="h-px bg-amber-400/10" />
            <ScoreRow label="Graze" value={player.graze.toLocaleString()} />
            <ScoreRow label="Lives" value={`${Math.max(0, player.lives)}`} />
            <ScoreRow label="Spell Cards" value={`${Math.max(0, player.bombs)}`} />
          </div>

          <TouhouDivider />

          {/* Buttons */}
          <div className="mt-1">
            <TouhouMenuButton variant="accent" onClick={handleNext}>
              {isFinalStage ? 'Leaderboard' : 'Next Stage ▸'}
            </TouhouMenuButton>
            <TouhouMenuButton onClick={onQuit}>
              Quit to Title
            </TouhouMenuButton>
          </div>
        </div>
      </TouhouFrame>
    </div>
  );
}

function ScoreRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-baseline justify-between">
      <span
        className="text-[10px] tracking-wider text-amber-400/40"
        style={{ fontFamily: "'Georgia', serif" }}
      >
        {label}
      </span>
      <span className={`text-[11px] tabular-nums font-mono ${highlight ? 'text-white' : 'text-zinc-400'}`}>
        {value}
      </span>
    </div>
  );
}
