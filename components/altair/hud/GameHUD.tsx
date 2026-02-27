/**
 * GameHUD — In-game heads-up display.
 * Shows HP bar, XP bar, timer, kills, weapon slots, and passive slots.
 */
'use client';

import { useAltairGameStore, xpRequired } from '@/lib/altair/stores/game-store';
import { WEAPONS, EVOLVED_WEAPONS } from '@/lib/altair/data/weapons';
import { PASSIVES } from '@/lib/altair/data/passives';
import SpriteIcon from '@/components/altair/hud/SpriteIcon';
import { WEAPON_ICON_SRC, PASSIVE_ICON_SRC } from '@/lib/altair/engine/sprites/sprite-defs';

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const WEAPON_MAP = new Map<string, { name: string; color: string; iconFrame: number }>();
for (const w of WEAPONS) WEAPON_MAP.set(w.id, { name: w.name, color: w.color, iconFrame: w.iconFrame });
for (const w of EVOLVED_WEAPONS) WEAPON_MAP.set(w.id, { name: w.name, color: w.color, iconFrame: w.iconFrame });

const PASSIVE_MAP = new Map(PASSIVES.map((p) => [p.id, { name: p.name, color: p.color, iconFrame: p.iconFrame }] as const));

export default function GameHUD() {
  const hp = useAltairGameStore((s) => s.hp);
  const maxHp = useAltairGameStore((s) => s.maxHp);
  const xp = useAltairGameStore((s) => s.xp);
  const level = useAltairGameStore((s) => s.level);
  const kills = useAltairGameStore((s) => s.kills);
  const timeSurvived = useAltairGameStore((s) => s.timeSurvived);
  const coins = useAltairGameStore((s) => s.coins);
  const weapons = useAltairGameStore((s) => s.weapons);
  const passives = useAltairGameStore((s) => s.passives);

  const xpNeeded = xpRequired(level);
  const hpPercent = Math.max(0, Math.min(100, (hp / maxHp) * 100));
  const xpPercent = Math.max(0, Math.min(100, (xp / xpNeeded) * 100));

  const hpColor = hpPercent > 50 ? 'var(--altair-success)' : hpPercent > 25 ? 'var(--altair-warning)' : 'var(--altair-danger)';

  return (
    <div className="absolute inset-0 z-30 pointer-events-none">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-3 py-2 bg-black/40 backdrop-blur-sm pointer-events-auto">
        {/* HP Bar */}
        <div className="flex-1 max-w-[200px]">
          <div className="flex items-center justify-between text-[10px] font-mono text-white/70 mb-0.5">
            <span>HP</span>
            <span>{Math.ceil(hp)}/{maxHp}</span>
          </div>
          <div className="h-2.5 rounded-full bg-black/50 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-200"
              style={{ width: `${hpPercent}%`, backgroundColor: hpColor }}
            />
          </div>
        </div>

        {/* XP Bar */}
        <div className="flex-1 max-w-[200px]">
          <div className="flex items-center justify-between text-[10px] font-mono text-white/70 mb-0.5">
            <span>Lv.{level}</span>
            <span>{xp}/{xpNeeded}</span>
          </div>
          <div className="h-2.5 rounded-full bg-black/50 overflow-hidden">
            <div
              className="h-full rounded-full bg-(--altair-info) transition-all duration-200"
              style={{ width: `${xpPercent}%` }}
            />
          </div>
        </div>

        {/* Timer */}
        <div className="text-sm font-mono font-bold text-white/90 tabular-nums">
          {formatTime(timeSurvived)}
        </div>

        {/* Kills */}
        <div className="text-xs font-mono text-white/60">
          <span className="text-white/90 font-bold">{kills}</span> kills
        </div>

        {/* Coins */}
        <div className="text-xs font-mono text-(--altair-warning)">
          {coins} <span className="text-white/40">coins</span>
        </div>
      </div>

      {/* Weapon & passive slots — below header bar */}
      <div className="flex items-center justify-center gap-2 sm:gap-4 px-2 sm:px-3 py-1.5 bg-black/30 pointer-events-auto">
        {/* Weapon slots */}
        <div className="flex gap-0.5 sm:gap-1">
          {Array.from({ length: 6 }).map((_, i) => {
            const w = weapons[i];
            const def = w ? WEAPON_MAP.get(w.weaponId) : null;
            const color = def?.color ?? '#666';
            return (
              <div
                key={`w${i}`}
                className={`relative w-7 h-7 sm:w-9 sm:h-9 rounded-md border flex items-center justify-center overflow-hidden ${
                  w
                    ? w.evolved
                      ? 'border-(--altair-warning)'
                      : 'border-(--altair-border-bright)'
                    : 'border-(--altair-border) bg-black/30'
                }`}
                title={w ? `${def?.name ?? w.weaponId} Lv.${w.level}` : 'Empty'}
              >
                {w ? (
                  <>
                    <div
                      className="absolute inset-0"
                      style={{ backgroundColor: `${color}25` }}
                    />
                    <SpriteIcon
                      sheetSrc={WEAPON_ICON_SRC}
                      frameIndex={def?.iconFrame ?? 0}
                      size={24}
                    />
                    <span
                      className="absolute bottom-0 right-0 text-[7px] font-bold bg-black/70 px-0.5 leading-tight rounded-tl-sm text-white/90"
                    >
                      {w.level}{w.evolved ? '★' : ''}
                    </span>
                  </>
                ) : (
                  <span className="text-white/20 text-[9px]">—</span>
                )}
              </div>
            );
          })}
        </div>

        {/* Divider */}
        <div className="w-px h-5 sm:h-6 bg-white/20" />

        {/* Passive slots */}
        <div className="flex gap-0.5 sm:gap-1">
          {Array.from({ length: 6 }).map((_, i) => {
            const p = passives[i];
            const def = p ? PASSIVE_MAP.get(p.passiveId) : null;
            const color = def?.color ?? '#888';
            return (
              <div
                key={`p${i}`}
                className={`relative w-7 h-7 sm:w-9 sm:h-9 rounded-md border flex items-center justify-center overflow-hidden ${
                  p
                    ? 'border-(--altair-rare)'
                    : 'border-(--altair-border) bg-black/30'
                }`}
                title={p ? `${def?.name ?? p.passiveId} Lv.${p.level}` : 'Empty'}
              >
                {p ? (
                  <>
                    <div
                      className="absolute inset-0"
                      style={{ backgroundColor: `${color}20` }}
                    />
                    <SpriteIcon
                      sheetSrc={PASSIVE_ICON_SRC}
                      frameIndex={def?.iconFrame ?? 0}
                      size={24}
                    />
                    <span
                      className="absolute bottom-0 right-0 text-[7px] font-bold bg-black/70 px-0.5 leading-tight rounded-tl-sm text-white/90"
                    >
                      {p.level}
                    </span>
                  </>
                ) : (
                  <span className="text-white/20 text-[9px]">—</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
