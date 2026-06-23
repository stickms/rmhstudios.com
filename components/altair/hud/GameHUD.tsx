/**
 * GameHUD — In-game heads-up display.
 * Shows HP bar, XP bar, timer, kills, weapon slots, and passive slots.
 * Hovering (desktop) or tapping (mobile) a slot shows a tooltip popover.
 */
'use client';

import { useAltairGameStore, xpRequired } from '@/lib/altair/stores/game-store';
import { WEAPONS, EVOLVED_WEAPONS } from '@/lib/altair/data/weapons';
import { PASSIVES } from '@/lib/altair/data/passives';
import { CATALYSTS } from '@/lib/altair/data/catalysts';
import SpriteIcon from '@/components/altair/hud/SpriteIcon';
import { WEAPON_ICON_SRC, PASSIVE_ICON_SRC, CATALYST_ICON_SRC } from '@/lib/altair/engine/sprites/sprite-defs';
import { useState, useCallback, useEffect, useRef, useLayoutEffect } from 'react';
import { useTranslation } from 'react-i18next';

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const WEAPON_MAP = new Map(
  [...WEAPONS, ...EVOLVED_WEAPONS].map((w) => [
    w.id,
    { name: w.name, color: w.color, iconFrame: w.iconFrame, description: w.description },
  ] as const),
);

const PASSIVE_MAP = new Map(
  PASSIVES.map((p) => [
    p.id,
    { name: p.name, color: p.color, iconFrame: p.iconFrame, description: p.description },
  ] as const),
);

const CATALYST_MAP = new Map(
  CATALYSTS.map((c) => [
    c.id,
    { name: c.name, color: c.color, iconFrame: c.iconFrame, descriptions: c.descriptions },
  ] as const),
);

type TooltipInfo = {
  kind: 'weapon' | 'passive' | 'catalyst';
  index: number;
  name: string;
  level: number;
  description: string;
  evolved?: boolean;
  anchorEl: HTMLElement;
} | null;

const TOOLTIP_WIDTH = 224; // w-56 = 14rem = 224px
const TOOLTIP_MARGIN = 8;

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
  const catalysts = useAltairGameStore((s) => s.catalysts);

  const { t } = useTranslation("c-altair");
  const [tooltip, setTooltip] = useState<TooltipInfo>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const [tooltipStyle, setTooltipStyle] = useState<React.CSSProperties>({});

  const xpNeeded = xpRequired(level);
  const hpPercent = Math.max(0, Math.min(100, (hp / maxHp) * 100));
  const xpPercent = Math.max(0, Math.min(100, (xp / xpNeeded) * 100));

  const hpColor = hpPercent > 50 ? 'var(--altair-success)' : hpPercent > 25 ? 'var(--altair-warning)' : 'var(--altair-danger)';

  const showTooltip = useCallback((info: Omit<NonNullable<TooltipInfo>, 'anchorEl'>, el: HTMLElement) => {
    setTooltip({ ...info, anchorEl: el });
  }, []);

  const toggleTooltip = useCallback((info: Omit<NonNullable<TooltipInfo>, 'anchorEl'>, el: HTMLElement) => {
    setTooltip((prev) =>
      prev && prev.kind === info.kind && prev.index === info.index
        ? null
        : { ...info, anchorEl: el },
    );
  }, []);

  // Position tooltip below the anchor slot, clamped to viewport
  useLayoutEffect(() => {
    if (!tooltip || !tooltipRef.current) return;

    const anchorRect = tooltip.anchorEl.getBoundingClientRect();
    const anchorCenterX = anchorRect.left + anchorRect.width / 2;
    const topY = anchorRect.bottom + 4;

    // Center tooltip on anchor, then clamp
    let left = anchorCenterX - TOOLTIP_WIDTH / 2;
    const maxLeft = window.innerWidth - TOOLTIP_WIDTH - TOOLTIP_MARGIN;
    left = Math.max(TOOLTIP_MARGIN, Math.min(left, maxLeft));

    setTooltipStyle({
      position: 'fixed',
      top: topY,
      left,
      width: TOOLTIP_WIDTH,
    });
  }, [tooltip]);

  // Close tooltip on tap outside (mobile)
  useEffect(() => {
    if (!tooltip) return;
    const handler = (e: PointerEvent) => {
      if (
        barRef.current && !barRef.current.contains(e.target as Node) &&
        tooltipRef.current && !tooltipRef.current.contains(e.target as Node)
      ) {
        setTooltip(null);
      }
    };
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, [tooltip]);

  return (
    <div className="absolute inset-0 z-30 pointer-events-none">
      {/* Top bar */}
      <div
        className="flex items-center gap-3 px-3 py-2 bg-black/40 backdrop-blur-sm pointer-events-auto"
        style={{
          paddingTop: 'calc(env(safe-area-inset-top, 0px) + 8px)',
          paddingLeft: 'calc(env(safe-area-inset-left, 0px) + 12px)',
          paddingRight: 'calc(env(safe-area-inset-right, 0px) + 12px)',
        }}
      >
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
          <span className="text-white/90 font-bold">{kills}</span> {t("kills", { defaultValue: "kills" })}
        </div>

        {/* Coins */}
        <div className="text-xs font-mono text-(--altair-warning)">
          {coins} <span className="text-white/40">{t("coins", { defaultValue: "coins" })}</span>
        </div>
      </div>

      {/* Weapon & passive slots — below header bar */}
      <div
        ref={barRef}
        className="relative flex items-center justify-center gap-2 sm:gap-4 px-2 sm:px-3 py-1.5 bg-black/30 pointer-events-auto"
        style={{
          paddingLeft: 'calc(env(safe-area-inset-left, 0px) + 8px)',
          paddingRight: 'calc(env(safe-area-inset-right, 0px) + 8px)',
        }}
      >
        {/* Weapon slots */}
        <div className="flex gap-0.5 sm:gap-1">
          {Array.from({ length: 6 }).map((_, i) => {
            const w = weapons[i];
            const def = w ? WEAPON_MAP.get(w.weaponId) : null;
            const color = def?.color ?? '#666';
            const info = w && def
              ? { kind: 'weapon' as const, index: i, name: def.name, level: w.level, description: def.description, evolved: w.evolved }
              : null;
            return (
              <div
                key={`w${i}`}
                className={`relative w-7 h-7 sm:w-9 sm:h-9 rounded-md border flex items-center justify-center overflow-hidden cursor-pointer ${
                  w
                    ? w.evolved
                      ? 'border-(--altair-warning)'
                      : 'border-(--altair-border-bright)'
                    : 'border-(--altair-border) bg-black/30'
                }`}
                onPointerEnter={(e) => {
                  if (info) showTooltip(info, e.currentTarget);
                }}
                onPointerLeave={() => {
                  setTooltip((prev) => (prev?.kind === 'weapon' && prev.index === i ? null : prev));
                }}
                onClick={(e) => {
                  if (info) toggleTooltip(info, e.currentTarget);
                }}
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

        {/* Passive + Catalyst slots (shared 6 slots) */}
        <div className="flex gap-0.5 sm:gap-1">
          {Array.from({ length: 6 }).map((_, i) => {
            // Passives first, then catalysts fill remaining slots
            const isPassive = i < passives.length;
            const isCatalyst = !isPassive && i - passives.length < catalysts.length;
            const p = isPassive ? passives[i] : null;
            const c = isCatalyst ? catalysts[i - passives.length] : null;

            const pDef = p ? PASSIVE_MAP.get(p.passiveId) : null;
            const cDef = c ? CATALYST_MAP.get(c.catalystId) : null;
            const color = pDef?.color ?? cDef?.color ?? '#888';

            const info = p && pDef
              ? { kind: 'passive' as const, index: i, name: pDef.name, level: p.level, description: pDef.description }
              : c && cDef
              ? { kind: 'catalyst' as const, index: i, name: cDef.name, level: c.level, description: cDef.descriptions[c.level - 1] ?? '' }
              : null;

            const hasItem = p || c;
            const slotLevel = p?.level ?? c?.level;
            const iconSrc = p ? PASSIVE_ICON_SRC : CATALYST_ICON_SRC;
            const iconFrame = pDef?.iconFrame ?? cDef?.iconFrame ?? 0;

            return (
              <div
                key={`p${i}`}
                className={`relative w-7 h-7 sm:w-9 sm:h-9 rounded-md border flex items-center justify-center overflow-hidden cursor-pointer ${
                  hasItem
                    ? c
                      ? 'border-(--altair-accent)' // catalyst: accent border
                      : 'border-(--altair-rare)' // passive: rare border
                    : 'border-(--altair-border) bg-black/30'
                }`}
                onPointerEnter={(e) => {
                  if (info) showTooltip(info, e.currentTarget);
                }}
                onPointerLeave={() => {
                  setTooltip((prev) => ((prev?.kind === 'passive' || prev?.kind === 'catalyst') && prev.index === i ? null : prev));
                }}
                onClick={(e) => {
                  if (info) toggleTooltip(info, e.currentTarget);
                }}
              >
                {hasItem ? (
                  <>
                    <div
                      className="absolute inset-0"
                      style={{ backgroundColor: `${color}20` }}
                    />
                    <SpriteIcon
                      sheetSrc={iconSrc}
                      frameIndex={iconFrame}
                      size={24}
                    />
                    <span
                      className="absolute bottom-0 right-0 text-[7px] font-bold bg-black/70 px-0.5 leading-tight rounded-tl-sm text-white/90"
                    >
                      {slotLevel}
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

      {/* Tooltip popover — rendered fixed so it can be clamped to viewport */}
      {tooltip && (
        <div
          ref={tooltipRef}
          className="rounded-lg bg-black/85 backdrop-blur-sm border border-white/15 px-3 py-2 text-left pointer-events-auto z-50"
          style={tooltipStyle}
        >
          <div className="flex items-baseline gap-1.5 mb-1">
            <span className="text-xs font-bold text-white/95">{tooltip.name}</span>
            <span className="text-[10px] font-mono text-white/50">
              Lv.{tooltip.level}{tooltip.evolved ? ' ★' : ''}
            </span>
          </div>
          <p className="text-[10px] leading-relaxed text-white/65">{tooltip.description}</p>
        </div>
      )}

    </div>
  );
}
