'use client';

import { useDreamRiftStore } from '@/lib/dream-rift/store';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '@/lib/dream-rift/constants';
import type { Character } from '@/lib/dream-rift/types';

const CHARACTERS: {
  id: Character;
  name: string;
  type: string;
  accent: string;
  border: string;
  hoverBorder: string;
  melee: string;
  special: string;
  shot: string;
  desc: string;
}[] = [
  {
    id: 'rei',
    name: 'Rei',
    type: 'Power Type',
    accent: 'text-red-400',
    border: 'border-red-500/30',
    hoverBorder: 'hover:border-red-500/70',
    melee: 'Sword Slash (wide arc)',
    special: 'Barrier',
    shot: 'Wide Spread',
    desc: 'High damage, wide melee arc. Slower movement but devastating firepower.',
  },
  {
    id: 'yume',
    name: 'Yume',
    type: 'Speed Type',
    accent: 'text-blue-400',
    border: 'border-blue-500/30',
    hoverBorder: 'hover:border-blue-500/70',
    melee: 'Fan Strike (precise)',
    special: 'Phase Shift',
    shot: 'Homing',
    desc: 'Fast and agile with homing shots. Narrower melee but quicker cooldowns.',
  },
];

export function DreamRiftCharSelect() {
  const selectCharacter = useDreamRiftStore((s) => s.selectCharacter);
  const setScreen = useDreamRiftStore((s) => s.setScreen);

  const handleSelect = (character: Character) => {
    selectCharacter(character);
    setScreen('difficultySelect');
  };

  return (
    <div
      className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/80"
      style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT }}
    >
      <div className="flex flex-col items-center gap-5 px-4">
        <h2 className="text-xl font-black tracking-wider text-white">
          SELECT CHARACTER
        </h2>

        <div className="flex gap-3">
          {CHARACTERS.map((char) => (
            <button
              key={char.id}
              onClick={() => handleSelect(char.id)}
              className={`w-[168px] p-3 rounded-lg border bg-black/60 ${char.border} ${char.hoverBorder} hover:bg-white/5 transition-all text-left`}
            >
              {/* Character icon placeholder */}
              <div className={`w-10 h-10 rounded-full border-2 ${char.border} flex items-center justify-center mb-2`}>
                <span className={`text-lg font-black ${char.accent}`}>
                  {char.name[0]}
                </span>
              </div>

              <div className={`text-sm font-bold ${char.accent}`}>
                {char.name}
              </div>
              <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-2">
                {char.type}
              </div>

              <div className="space-y-1 text-[10px] text-zinc-400">
                <div>
                  <span className="text-zinc-600">Melee:</span> {char.melee}
                </div>
                <div>
                  <span className="text-zinc-600">Special:</span> {char.special}
                </div>
                <div>
                  <span className="text-zinc-600">Shot:</span> {char.shot}
                </div>
              </div>

              <p className="mt-2 text-[9px] text-zinc-500 leading-tight">
                {char.desc}
              </p>
            </button>
          ))}
        </div>

        <button
          onClick={() => setScreen('title')}
          className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
        >
          Back
        </button>
      </div>
    </div>
  );
}
