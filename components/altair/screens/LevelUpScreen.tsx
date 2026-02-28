/**
 * LevelUpScreen — Upgrade picker overlay shown on level up.
 * Presents 3-4 options: new weapon, weapon upgrade, new passive, passive upgrade, or gold.
 */
'use client';

import { useAltairGameStore, UpgradeChoice } from '@/lib/altair/stores/game-store';
import { WEAPONS, EVOLVED_WEAPONS } from '@/lib/altair/data/weapons';
import { PASSIVES } from '@/lib/altair/data/passives';
import { RotateCcw, X, Coins } from 'lucide-react';
import SpriteIcon from '@/components/altair/hud/SpriteIcon';
import { WEAPON_ICON_SRC, PASSIVE_ICON_SRC } from '@/lib/altair/engine/sprites/sprite-defs';
import { useKeyboardNav } from '@/lib/altair/hooks/use-keyboard-nav';

function getChoiceInfo(choice: UpgradeChoice): { name: string; description: string; levelText: string; color: string; isGold: boolean; iconFrame: number; iconType: 'weapon' | 'passive' | 'gold' } {
  switch (choice.type) {
    case 'new_weapon': {
      const w = WEAPONS.find((w) => w.id === choice.weaponId);
      return {
        name: w?.name ?? choice.weaponId,
        description: w?.description ?? '',
        levelText: 'NEW',
        color: w?.color ?? '#888',
        isGold: false,
        iconFrame: w?.iconFrame ?? 0,
        iconType: 'weapon',
      };
    }
    case 'upgrade_weapon': {
      const w = WEAPONS.find((w) => w.id === choice.weaponId) || EVOLVED_WEAPONS.find((w) => w.id === choice.weaponId);
      return {
        name: w?.name ?? choice.weaponId,
        description: `+15% damage, enhanced effects`,
        levelText: `Lv.${choice.newLevel - 1} → ${choice.newLevel}`,
        color: w?.color ?? '#888',
        isGold: false,
        iconFrame: w?.iconFrame ?? 0,
        iconType: 'weapon',
      };
    }
    case 'new_passive': {
      const p = PASSIVES.find((p) => p.id === choice.passiveId);
      return {
        name: p?.name ?? choice.passiveId,
        description: p?.description ?? '',
        levelText: 'NEW',
        color: p?.color ?? '#a86ad4',
        isGold: false,
        iconFrame: p?.iconFrame ?? 0,
        iconType: 'passive',
      };
    }
    case 'upgrade_passive': {
      const p = PASSIVES.find((p) => p.id === choice.passiveId);
      return {
        name: p?.name ?? choice.passiveId,
        description: p?.description ?? '',
        levelText: `Lv.${choice.newLevel - 1} → ${choice.newLevel}`,
        color: p?.color ?? '#a86ad4',
        isGold: false,
        iconFrame: p?.iconFrame ?? 0,
        iconType: 'passive',
      };
    }
    case 'gold':
      return {
        name: '+25 Gold',
        description: 'Add 25 coins to your run total',
        levelText: '',
        color: '#d9b44a',
        isGold: true,
        iconFrame: 0,
        iconType: 'gold',
      };
  }
}

interface LevelUpScreenProps {
  onReroll?: () => void;
}

export default function LevelUpScreen({ onReroll }: LevelUpScreenProps) {
  const phase = useAltairGameStore((s) => s.phase);
  const choices = useAltairGameStore((s) => s.upgradeChoices);
  const rerollsRemaining = useAltairGameStore((s) => s.rerollsRemaining);
  const banishesRemaining = useAltairGameStore((s) => s.banishesRemaining);
  const pickUpgrade = useAltairGameStore((s) => s.pickUpgrade);
  const banish = useAltairGameStore((s) => s.banish);
  const level = useAltairGameStore((s) => s.level);

  const isActive = phase === 'upgrading' && choices.length > 0;
  const { focusedIndex } = useKeyboardNav({
    itemCount: choices.length,
    onSelect: pickUpgrade,
    orientation: 'horizontal',
    enabled: isActive,
    numberKeys: true,
  });

  if (!isActive) return null;

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center altair-overlay overflow-y-auto">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative z-10 w-full max-w-2xl mx-4 my-4 sm:my-0">
        {/* Title */}
        <div className="text-center mb-4 sm:mb-6">
          <div className="text-xs font-mono text-(--altair-text-dim) uppercase tracking-[0.3em] mb-1">
            Level Up!
          </div>
          <h2 className="text-3xl font-black text-(--altair-info) tracking-wider">
            LEVEL {level}
          </h2>
          <p className="text-sm text-(--altair-text-muted) mt-1">Choose an upgrade</p>
        </div>

        {/* Choice cards */}
        <div className="flex gap-2 sm:gap-3 justify-center flex-wrap">
          {choices.map((choice, i) => {
            const info = getChoiceInfo(choice);
            const isFocused = focusedIndex === i;
            return (
              <div key={i} className="relative group">
                <button
                  onClick={() => pickUpgrade(i)}
                  className={`altair-parchment-surface w-36 sm:w-44 p-3 sm:p-4 rounded-xl border bg-(--altair-surface) hover:bg-(--altair-surface-hover) hover:border-(--altair-border-bright) transition-all text-left altair-modal ${
                    isFocused ? 'border-2 border-(--altair-accent) ring-2 ring-(--altair-accent)/30 scale-[1.03]' : 'border-(--altair-border)'
                  }`}
                  style={{ animationDelay: `${i * 0.05}s` }}
                >
                  {/* Icon */}
                  <div
                    className="w-10 h-10 rounded-lg mb-3 flex items-center justify-center"
                    style={{ backgroundColor: `${info.color}20`, border: `1px solid ${info.color}40` }}
                  >
                    {info.isGold ? (
                      <Coins size={20} style={{ color: info.color }} />
                    ) : (
                      <SpriteIcon
                        sheetSrc={info.iconType === 'weapon' ? WEAPON_ICON_SRC : PASSIVE_ICON_SRC}
                        frameIndex={info.iconFrame}
                        size={28}
                      />
                    )}
                  </div>

                  <h3 className="font-bold text-sm text-(--altair-text) mb-0.5">{info.name}</h3>
                  {info.levelText && (
                    <span
                      className="text-[10px] font-bold uppercase tracking-wider"
                      style={{ color: info.levelText === 'NEW' ? 'var(--altair-success)' : info.color }}
                    >
                      {info.levelText}
                    </span>
                  )}
                  <p className="text-[11px] text-(--altair-text-muted) mt-1 leading-tight">
                    {info.description}
                  </p>
                </button>

                {/* Banish button */}
                {banishesRemaining > 0 && !info.isGold && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      banish(i);
                    }}
                    className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-(--altair-danger) text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    title={`Banish (${banishesRemaining} left)`}
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Keyboard hint */}
        <div className="text-center mt-3 text-[10px] text-(--altair-text-dim) font-mono hidden sm:block">
          [A/D] or [←/→] navigate · [Space] select · [1-{choices.length}] quick pick
        </div>

        {/* Reroll button */}
        {rerollsRemaining > 0 && (
          <div className="text-center mt-4">
            <button
              onClick={() => {
                if (onReroll) onReroll();
              }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-(--altair-surface) border border-(--altair-border) text-sm font-medium text-(--altair-text-muted) hover:text-(--altair-text) hover:bg-(--altair-surface-hover) transition-colors"
            >
              <RotateCcw size={14} />
              Reroll ({rerollsRemaining} left)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
