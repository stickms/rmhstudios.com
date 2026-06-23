'use client';

import { useTranslation } from "react-i18next";
import { useDreamRiftStore } from '@/lib/dream-rift/store';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '@/lib/dream-rift/constants';
import { TouhouFrame, TouhouDivider } from './TouhouFrame';
import type { Character } from '@/lib/dream-rift/types';

const CHARACTERS: {
  id: Character;
  name: string;
  title: string;
  kanji: string;
  accent: string;
  glowColor: string;
  borderColor: string;
  melee: string;
  special: string;
  shot: string;
  speed: string;
  desc: string;
}[] = [
  {
    id: 'rei',
    name: 'Rei',
    title: 'The Crimson Blade',
    kanji: '零',
    accent: '#ff4466',
    glowColor: 'rgba(255,68,102,0.3)',
    borderColor: 'border-red-500/40',
    melee: 'Sword Slash — wide arc',
    special: 'Barrier — absorbs bullets',
    shot: 'Wide Spread',
    speed: 'Steady',
    desc: 'Devastating power with a wide melee arc. A direct fighter who carves through danmaku.',
  },
  {
    id: 'yume',
    name: 'Yume',
    title: 'The Azure Dreamer',
    kanji: '夢',
    accent: '#66aaff',
    glowColor: 'rgba(102,170,255,0.3)',
    borderColor: 'border-blue-500/40',
    melee: 'Fan Strike — stuns enemies',
    special: 'Phase Shift — teleport',
    shot: 'Homing Needles',
    speed: 'Swift',
    desc: 'Speed and precision with homing shots. Slips between bullets like a ghost in the wind.',
  },
];

export function DreamRiftCharSelect() {
  const selectCharacter = useDreamRiftStore((s) => s.selectCharacter);
  const setScreen = useDreamRiftStore((s) => s.setScreen);

  const { t } = useTranslation("c-dream-rift");

  const handleSelect = (character: Character) => {
    selectCharacter(character);
    setScreen('difficultySelect');
  };

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
          {t("select-character", { defaultValue: "SELECT CHARACTER" })}
        </h2>
        <div className="flex items-center justify-center gap-2 mt-1">
          <div className="w-12 h-px bg-gradient-to-r from-transparent to-amber-400/40" />
          <div className="w-1 h-1 rotate-45 bg-amber-400/40" />
          <div className="w-12 h-px bg-gradient-to-l from-transparent to-amber-400/40" />
        </div>
      </div>

      {/* Character cards */}
      <div className="flex gap-3 px-4">
        {CHARACTERS.map((char) => (
          <button
            key={char.id}
            onClick={() => handleSelect(char.id)}
            className={`group relative w-[200px] transition-all hover:scale-[1.02]`}
          >
            <TouhouFrame>
              <div className="p-3">
                {/* Portrait area */}
                <div
                  className={`relative w-full h-24 mb-2 border ${char.borderColor} flex items-center justify-center overflow-hidden`}
                  style={{
                    background: `radial-gradient(circle at center, ${char.glowColor} 0%, transparent 70%), linear-gradient(180deg, #0a0a1a 0%, #111128 100%)`,
                  }}
                >
                  {/* Kanji watermark */}
                  <span
                    className="text-[64px] font-bold opacity-10 select-none"
                    style={{ color: char.accent, fontFamily: "'Georgia', serif" }}
                  >
                    {char.kanji}
                  </span>

                  {/* Glow on hover */}
                  <div
                    className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                    style={{
                      background: `radial-gradient(circle at center, ${char.glowColor} 0%, transparent 60%)`,
                    }}
                  />
                </div>

                {/* Name and title */}
                <div className="text-center mb-2">
                  <div
                    className="text-base font-bold tracking-wider"
                    style={{ color: char.accent, fontFamily: "'Georgia', serif" }}
                  >
                    {char.name}
                  </div>
                  <div
                    className="text-[9px] tracking-[0.2em] text-zinc-500 mt-0.5"
                    style={{ fontFamily: "'Georgia', serif" }}
                  >
                    {char.title}
                  </div>
                </div>

                <TouhouDivider />

                {/* Stats */}
                <div className="space-y-1.5 text-[10px] mt-2">
                  <StatRow label={t("stat-shot", { defaultValue: "Shot" })} value={char.shot} />
                  <StatRow label={t("stat-melee", { defaultValue: "Melee" })} value={char.melee} />
                  <StatRow label={t("stat-special", { defaultValue: "Special" })} value={char.special} />
                  <StatRow label={t("stat-speed", { defaultValue: "Speed" })} value={char.speed} />
                </div>

                {/* Description */}
                <p
                  className="mt-2 text-[9px] text-zinc-500 leading-relaxed text-center"
                  style={{ fontFamily: "'Georgia', serif" }}
                >
                  {char.desc}
                </p>
              </div>
            </TouhouFrame>
          </button>
        ))}
      </div>

      {/* Back */}
      <button
        onClick={() => setScreen('title')}
        className="mt-4 text-[10px] tracking-[0.2em] text-zinc-600 hover:text-amber-400/60 transition-colors"
        style={{ fontFamily: "'Georgia', serif" }}
      >
        {t("back", { defaultValue: "◂ Back" })}
      </button>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-amber-400/50 w-12 text-right shrink-0" style={{ fontFamily: "'Georgia', serif" }}>
        {label}
      </span>
      <span className="text-[9px] text-zinc-400" style={{ fontFamily: "'Georgia', serif" }}>
        {value}
      </span>
    </div>
  );
}
