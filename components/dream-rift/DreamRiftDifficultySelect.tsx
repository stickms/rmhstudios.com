'use client';

import { useDreamRiftStore } from '@/lib/dream-rift/store';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '@/lib/dream-rift/constants';
import { TouhouFrame, TouhouDivider } from './TouhouFrame';
import type { Difficulty } from '@/lib/dream-rift/types';

const DIFFICULTIES: {
  id: Difficulty;
  label: string;
  subtitle: string;
  color: string;
  glowColor: string;
  continues: number;
}[] = [
  {
    id: 'easy',
    label: 'Easy',
    subtitle: 'For those who dream gently',
    color: '#66cc88',
    glowColor: 'rgba(102,204,136,0.15)',
    continues: 5,
  },
  {
    id: 'normal',
    label: 'Normal',
    subtitle: 'The standard dream',
    color: '#6699ff',
    glowColor: 'rgba(102,153,255,0.15)',
    continues: 3,
  },
  {
    id: 'hard',
    label: 'Hard',
    subtitle: 'Nightmares stir',
    color: '#ff9944',
    glowColor: 'rgba(255,153,68,0.15)',
    continues: 1,
  },
  {
    id: 'lunatic',
    label: 'Lunatic',
    subtitle: 'The dream devours all',
    color: '#ff4466',
    glowColor: 'rgba(255,68,102,0.15)',
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

  const charColor = character === 'rei' ? '#ff4466' : '#66aaff';
  const charName = character === 'rei' ? 'Rei' : 'Yume';

  return (
    <div
      className="absolute inset-0 z-30 flex flex-col items-center justify-center"
      style={{
        width: CANVAS_WIDTH,
        height: CANVAS_HEIGHT,
        background: 'radial-gradient(ellipse at center, #0d0b2a 0%, #08061a 100%)',
      }}
    >
      {/* Header */}
      <div className="text-center mb-4">
        <h2
          className="text-lg tracking-[0.25em] text-amber-300/80"
          style={{ fontFamily: "'Georgia', serif" }}
        >
          SELECT DIFFICULTY
        </h2>
        <p className="mt-1 text-[10px] tracking-wider text-zinc-500" style={{ fontFamily: "'Georgia', serif" }}>
          Playing as <span style={{ color: charColor }}>{charName}</span>
        </p>
        <div className="flex items-center justify-center gap-2 mt-2">
          <div className="w-12 h-px bg-gradient-to-r from-transparent to-amber-400/40" />
          <div className="w-1 h-1 rotate-45 bg-amber-400/40" />
          <div className="w-12 h-px bg-gradient-to-l from-transparent to-amber-400/40" />
        </div>
      </div>

      {/* Difficulty options */}
      <TouhouFrame className="w-72">
        <div className="py-2">
          {DIFFICULTIES.map((diff, i) => (
            <button
              key={diff.id}
              onClick={() => handleSelect(diff.id)}
              className="group w-full py-2.5 px-5 text-left transition-all hover:bg-white/[0.03] relative"
            >
              {/* Hover glow */}
              <div
                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ background: diff.glowColor }}
              />

              {/* Arrow indicator */}
              <span
                className="absolute left-2 top-1/2 -translate-y-1/2 text-xs opacity-0 group-hover:opacity-80 transition-opacity"
                style={{ color: diff.color }}
              >
                ▸
              </span>

              <div className="relative flex items-center justify-between">
                <div>
                  <div
                    className="text-sm tracking-wider font-bold"
                    style={{ color: diff.color, fontFamily: "'Georgia', serif" }}
                  >
                    {diff.label}
                  </div>
                  <div
                    className="text-[9px] text-zinc-600 mt-0.5 tracking-wide"
                    style={{ fontFamily: "'Georgia', serif" }}
                  >
                    {diff.subtitle}
                  </div>
                </div>
                <div className="text-[9px] text-zinc-600 text-right" style={{ fontFamily: "'Georgia', serif" }}>
                  {diff.continues > 0
                    ? `${diff.continues} continue${diff.continues > 1 ? 's' : ''}`
                    : 'No mercy'}
                </div>
              </div>

              {/* Separator between items */}
              {i < DIFFICULTIES.length - 1 && (
                <div className="absolute bottom-0 left-5 right-5 h-px bg-white/[0.04]" />
              )}
            </button>
          ))}
        </div>
      </TouhouFrame>

      {/* Back */}
      <button
        onClick={() => setScreen('charSelect')}
        className="mt-4 text-[10px] tracking-[0.2em] text-zinc-600 hover:text-amber-400/60 transition-colors"
        style={{ fontFamily: "'Georgia', serif" }}
      >
        ◂ Back
      </button>
    </div>
  );
}
