'use client';

import { useTranslation } from "react-i18next";
import { useDreamRiftStore } from '@/lib/dream-rift/store';
import {
  CANVAS_HEIGHT,
  PLAYFIELD_WIDTH,
  SIDEBAR_WIDTH,
  POWER_MAX,
} from '@/lib/dream-rift/constants';

export function DreamRiftHUD() {
  const { t } = useTranslation("c-dream-rift");
  const player = useDreamRiftStore((s) => s.player);
  const stage = useDreamRiftStore((s) => s.stage);
  const difficulty = useDreamRiftStore((s) => s.difficulty);
  const character = useDreamRiftStore((s) => s.character);

  const powerPercent = Math.min(100, (player.power / POWER_MAX) * 100);

  const diffColor =
    difficulty === 'easy' ? '#66cc88' :
    difficulty === 'normal' ? '#6699ff' :
    difficulty === 'hard' ? '#ff9944' : '#ff4466';

  return (
    <div
      className="absolute top-0 pointer-events-none z-20"
      style={{
        left: PLAYFIELD_WIDTH,
        width: SIDEBAR_WIDTH,
        height: CANVAS_HEIGHT,
        fontFamily: "'Georgia', 'Palatino Linotype', serif",
      }}
    >
      {/* Outer frame */}
      <div className="h-full border-l border-amber-400/30">
        <div className="h-full bg-[#0a0a1a]/95 flex flex-col">
          {/* Title bar */}
          <div className="px-3 py-2 border-b border-amber-400/20 text-center">
            <div className="text-[10px] tracking-[0.3em] text-amber-400/60 uppercase">
              {t("title", { defaultValue: "Dream Rift" })}
            </div>
          </div>

          {/* Character portrait placeholder */}
          <div className="mx-3 mt-2 mb-1">
            <div
              className="w-full h-10 border border-amber-400/15 flex items-center justify-center"
              style={{
                background: character === 'rei'
                  ? 'linear-gradient(135deg, rgba(255,68,102,0.1) 0%, transparent 100%)'
                  : 'linear-gradient(135deg, rgba(102,170,255,0.1) 0%, transparent 100%)',
              }}
            >
              <span
                className="text-xs tracking-wider"
                style={{ color: character === 'rei' ? '#ff4466' : '#66aaff' }}
              >
                {character === 'rei' ? '零 Rei' : '夢 Yume'}
              </span>
            </div>
          </div>

          {/* Scores section */}
          <div className="px-3 py-1.5">
            <HUDRow label={t("hi-score", { defaultValue: "HiScore" })} value={player.hiScore.toLocaleString()} />
            <HUDRow label={t("score", { defaultValue: "Score" })} value={player.score.toLocaleString()} highlight />
          </div>

          {/* Divider */}
          <div className="mx-3 h-px bg-gradient-to-r from-amber-400/20 via-amber-400/10 to-transparent" />

          {/* Lives */}
          <div className="px-3 py-1.5">
            <div className="text-[8px] tracking-[0.2em] text-amber-400/40 uppercase mb-0.5">
              {t("player", { defaultValue: "Player" })}
            </div>
            <div className="flex gap-0.5">
              {Array.from({ length: Math.max(0, player.lives) }).map((_, i) => (
                <div key={i} className="w-2.5 h-2.5 rounded-full bg-red-500/80 border border-red-400/40" />
              ))}
              {player.lives <= 0 && (
                <span className="text-[9px] text-zinc-700">---</span>
              )}
            </div>
          </div>

          {/* Bombs */}
          <div className="px-3 py-1.5">
            <div className="text-[8px] tracking-[0.2em] text-amber-400/40 uppercase mb-0.5">
              {t("spell", { defaultValue: "Spell" })}
            </div>
            <div className="flex gap-0.5">
              {Array.from({ length: Math.max(0, player.bombs) }).map((_, i) => (
                <div
                  key={i}
                  className="w-2.5 h-2.5 rotate-45 bg-emerald-500/80 border border-emerald-400/40"
                />
              ))}
              {player.bombs <= 0 && (
                <span className="text-[9px] text-zinc-700">---</span>
              )}
            </div>
          </div>

          {/* Power */}
          <div className="px-3 py-1.5">
            <div className="flex items-baseline justify-between mb-1">
              <span className="text-[8px] tracking-[0.2em] text-amber-400/40 uppercase">
                {t("power", { defaultValue: "Power" })}
              </span>
              <span className="text-[9px] text-zinc-500 tabular-nums font-mono">
                {player.power}/{POWER_MAX}
              </span>
            </div>
            <div className="w-full h-1.5 bg-white/5 border border-white/10">
              <div
                className="h-full transition-all duration-100"
                style={{
                  width: `${powerPercent}%`,
                  background: 'linear-gradient(90deg, #cc3333 0%, #ff6644 100%)',
                }}
              />
            </div>
          </div>

          {/* Divider */}
          <div className="mx-3 h-px bg-gradient-to-r from-amber-400/20 via-amber-400/10 to-transparent" />

          {/* Graze */}
          <div className="px-3 py-1.5">
            <HUDRow label={t("graze", { defaultValue: "Graze" })} value={player.graze.toLocaleString()} />
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Bottom info */}
          <div className="px-3 py-2 border-t border-amber-400/15">
            <div className="flex items-center justify-between text-[9px]">
              <span className="text-amber-400/40">{t("stage", { defaultValue: "Stage" })}</span>
              <span className="text-zinc-300 tabular-nums font-mono">{stage}</span>
            </div>
            <div className="flex items-center justify-between text-[9px] mt-0.5">
              <span className="text-amber-400/40">{t("difficulty", { defaultValue: "Difficulty" })}</span>
              <span style={{ color: diffColor }} className="tracking-wide">
                {difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function HUDRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-baseline justify-between py-0.5">
      <span className="text-[8px] tracking-[0.2em] text-amber-400/40 uppercase">
        {label}
      </span>
      <span
        className={`text-[11px] tabular-nums font-mono ${
          highlight ? 'text-white' : 'text-zinc-400'
        }`}
      >
        {value}
      </span>
    </div>
  );
}
