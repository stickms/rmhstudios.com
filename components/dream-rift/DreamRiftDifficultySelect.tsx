'use client';

import { useDreamRiftStore } from '@/lib/dream-rift/store';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '@/lib/dream-rift/constants';
import type { Difficulty } from '@/lib/dream-rift/types';

const DIFFICULTIES: {
  id: Difficulty;
  label: string;
  desc: string;
  color: string;
  border: string;
  hoverBorder: string;
  continues: number;
}[] = [
  {
    id: 'easy',
    label: 'Easy',
    desc: 'For newcomers',
    color: 'text-green-400',
    border: 'border-green-500/30',
    hoverBorder: 'hover:border-green-500/70',
    continues: 5,
  },
  {
    id: 'normal',
    label: 'Normal',
    desc: 'The standard experience',
    color: 'text-blue-400',
    border: 'border-blue-500/30',
    hoverBorder: 'hover:border-blue-500/70',
    continues: 3,
  },
  {
    id: 'hard',
    label: 'Hard',
    desc: 'For experienced players',
    color: 'text-orange-400',
    border: 'border-orange-500/30',
    hoverBorder: 'hover:border-orange-500/70',
    continues: 1,
  },
  {
    id: 'lunatic',
    label: 'Lunatic',
    desc: 'Maximum challenge',
    color: 'text-red-400',
    border: 'border-red-500/30',
    hoverBorder: 'hover:border-red-500/70',
    continues: 0,
  },
];

export function DreamRiftDifficultySelect() {
  const selectDifficulty = useDreamRiftStore((s) => s.selectDifficulty);
  const startGame = useDreamRiftStore((s) => s.startGame);
  const setScreen = useDreamRiftStore((s) => s.setScreen);
  const character = useDreamRiftStore((s) => s.character);

  const handleSelect = (difficulty: Difficulty) => {
    selectDifficulty(difficulty);
    startGame();
  };

  return (
    <div
      className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/80"
      style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT }}
    >
      <div className="flex flex-col items-center gap-5 px-4">
        <div className="text-center">
          <h2 className="text-xl font-black tracking-wider text-white">
            SELECT DIFFICULTY
          </h2>
          <p className="mt-1 text-xs text-zinc-500">
            Playing as <span className={character === 'rei' ? 'text-red-400' : 'text-blue-400'}>{character === 'rei' ? 'Rei' : 'Yume'}</span>
          </p>
        </div>

        <div className="flex flex-col gap-2 w-64">
          {DIFFICULTIES.map((diff) => (
            <button
              key={diff.id}
              onClick={() => handleSelect(diff.id)}
              className={`w-full py-3 px-4 rounded-lg border bg-black/60 ${diff.border} ${diff.hoverBorder} hover:bg-white/5 transition-all text-left flex items-center justify-between`}
            >
              <div>
                <div className={`text-sm font-bold ${diff.color}`}>
                  {diff.label}
                </div>
                <div className="text-[10px] text-zinc-500">
                  {diff.desc}
                </div>
              </div>
              <div className="text-[9px] text-zinc-600 text-right">
                {diff.continues > 0 ? `${diff.continues} continues` : 'No continues'}
              </div>
            </button>
          ))}
        </div>

        <button
          onClick={() => setScreen('charSelect')}
          className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
        >
          Back
        </button>
      </div>
    </div>
  );
}
