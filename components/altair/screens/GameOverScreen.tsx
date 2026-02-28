/**
 * GameOverScreen — Shown on death or victory.
 * Displays run summary and coin payout breakdown.
 */
'use client';

import { useMemo } from 'react';
import { useAltairGameStore } from '@/lib/altair/stores/game-store';
import { useAltairMetaStore } from '@/lib/altair/stores/meta-store';
import { Trophy, Skull, Coins, Clock, Crosshair, Layers } from 'lucide-react';
import { useKeyboardNav } from '@/lib/altair/hooks/use-keyboard-nav';

interface GameOverScreenProps {
  onPlayAgain: () => void;
  onMetaShop: () => void;
  onMenu: () => void;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function GameOverScreen({ onPlayAgain, onMetaShop, onMenu }: GameOverScreenProps) {
  const actions = useMemo(() => [onPlayAgain, onMetaShop, onMenu], [onPlayAgain, onMetaShop, onMenu]);
  const { focusedIndex } = useKeyboardNav({
    itemCount: 3,
    onSelect: (i) => actions[i](),
    orientation: 'vertical',
  });

  const focusClass = (i: number) =>
    focusedIndex === i ? 'ring-2 ring-(--altair-accent)/50 scale-[1.02]' : '';

  const phase = useAltairGameStore((s) => s.phase);
  const kills = useAltairGameStore((s) => s.kills);
  const level = useAltairGameStore((s) => s.level);
  const timeSurvived = useAltairGameStore((s) => s.timeSurvived);
  const coins = useAltairGameStore((s) => s.coins);
  const coinBreakdown = useAltairGameStore((s) => s.coinBreakdown);
  const weapons = useAltairGameStore((s) => s.weapons);
  const selectedClassId = useAltairGameStore((s) => s.selectedClassId);
  const doubleTime = useAltairGameStore((s) => s.doubleTime);
  const greedLevel = useAltairMetaStore((s) => s.getUpgradeLevel('greed'));

  const isVictory = phase === 'victory';

  // Calculate final coins with multipliers
  const greedMultiplier = 1 + greedLevel * 0.1;
  const doubleTimeMultiplier = doubleTime ? 1.5 : 1;
  const totalMultiplier = greedMultiplier * doubleTimeMultiplier;
  const finalCoins = Math.floor(coins * totalMultiplier);

  // Award coins to meta store on render (in a real implementation this would be an effect)
  // For now, just display

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center altair-overlay">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
      <div className="altair-parchment-surface relative z-10 w-full max-w-md mx-4 bg-(--altair-surface) border border-(--altair-border) rounded-2xl p-6 altair-modal">
        {/* Header */}
        <div className="text-center mb-6">
          {isVictory ? (
            <>
              <Trophy className="w-12 h-12 text-(--altair-warning) mx-auto mb-2" />
              <h2 className="text-3xl font-black text-(--altair-warning) tracking-wider">VICTORY</h2>
              <p className="text-(--altair-text-muted) text-sm">You survived 20:00!</p>
            </>
          ) : (
            <>
              <Skull className="w-12 h-12 text-(--altair-danger) mx-auto mb-2" />
              <h2 className="text-3xl font-black text-(--altair-danger) tracking-wider">DEFEATED</h2>
              <p className="text-(--altair-text-muted) text-sm">You fell at {formatTime(timeSurvived)}</p>
            </>
          )}
        </div>

        {/* Run stats */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="text-center p-2 rounded-lg bg-(--altair-bg-subtle)">
            <Clock size={16} className="mx-auto mb-1 text-(--altair-text-muted)" />
            <div className="text-lg font-bold text-(--altair-text)">{formatTime(timeSurvived)}</div>
            <div className="text-[10px] text-(--altair-text-dim)">Time</div>
          </div>
          <div className="text-center p-2 rounded-lg bg-(--altair-bg-subtle)">
            <Crosshair size={16} className="mx-auto mb-1 text-(--altair-text-muted)" />
            <div className="text-lg font-bold text-(--altair-text)">{kills}</div>
            <div className="text-[10px] text-(--altair-text-dim)">Kills</div>
          </div>
          <div className="text-center p-2 rounded-lg bg-(--altair-bg-subtle)">
            <Layers size={16} className="mx-auto mb-1 text-(--altair-text-muted)" />
            <div className="text-lg font-bold text-(--altair-text)">Lv.{level}</div>
            <div className="text-[10px] text-(--altair-text-dim)">Level</div>
          </div>
        </div>

        {/* Coin breakdown */}
        <div className="mb-6 p-3 rounded-lg bg-(--altair-bg-subtle) border border-(--altair-border)">
          <div className="flex items-center gap-2 mb-2">
            <Coins size={16} className="text-(--altair-warning)" />
            <span className="text-sm font-bold text-(--altair-text)">Coin Payout</span>
          </div>
          <div className="flex flex-col gap-1 text-xs">
            {coinBreakdown.enemyDrops > 0 && (
              <div className="flex justify-between text-(--altair-text-muted)">
                <span>Enemy drops</span>
                <span className="text-(--altair-text)">+{coinBreakdown.enemyDrops}</span>
              </div>
            )}
            {coinBreakdown.bossKills > 0 && (
              <div className="flex justify-between text-(--altair-text-muted)">
                <span>Boss kills</span>
                <span className="text-(--altair-text)">+{coinBreakdown.bossKills}</span>
              </div>
            )}
            {coinBreakdown.chestDrops > 0 && (
              <div className="flex justify-between text-(--altair-text-muted)">
                <span>Treasure chests</span>
                <span className="text-(--altair-text)">+{coinBreakdown.chestDrops}</span>
              </div>
            )}
            {coinBreakdown.survivalBonus > 0 && (
              <div className="flex justify-between text-(--altair-text-muted)">
                <span>Survival bonus</span>
                <span className="text-(--altair-text)">+{coinBreakdown.survivalBonus}</span>
              </div>
            )}
            {coinBreakdown.killMilestones > 0 && (
              <div className="flex justify-between text-(--altair-text-muted)">
                <span>Kill milestones</span>
                <span className="text-(--altair-text)">+{coinBreakdown.killMilestones}</span>
              </div>
            )}
            {coinBreakdown.completionBonus > 0 && (
              <div className="flex justify-between text-(--altair-text-muted)">
                <span>Completion bonus</span>
                <span className="text-(--altair-text)">+{coinBreakdown.completionBonus}</span>
              </div>
            )}
            {coinBreakdown.firstClearBonus > 0 && (
              <div className="flex justify-between text-(--altair-text-muted)">
                <span>First clear bonus</span>
                <span className="text-(--altair-success)">+{coinBreakdown.firstClearBonus}</span>
              </div>
            )}
            <div className="border-t border-(--altair-border) pt-1 mt-1">
              <div className="flex justify-between text-(--altair-text-muted)">
                <span>Subtotal</span>
                <span className="text-(--altair-text)">{coins}</span>
              </div>
              {greedLevel > 0 && (
                <div className="flex justify-between text-(--altair-text-muted)">
                  <span>Greed (×{greedMultiplier.toFixed(1)})</span>
                  <span className="text-(--altair-success)">×{greedMultiplier.toFixed(1)}</span>
                </div>
              )}
              {doubleTime && (
                <div className="flex justify-between text-(--altair-text-muted)">
                  <span>Double Time (×1.5)</span>
                  <span className="text-(--altair-warning)">×1.5</span>
                </div>
              )}
            </div>
            <div className="flex justify-between font-bold text-sm pt-1">
              <span className="text-(--altair-warning)">Total</span>
              <span className="text-(--altair-warning)">{finalCoins} coins</span>
            </div>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex flex-col gap-2">
          <button
            onClick={onPlayAgain}
            className={`py-3 rounded-xl font-bold text-white bg-(--altair-accent) hover:bg-(--altair-accent-hover) transition-all ${focusClass(0)}`}
          >
            Play Again
          </button>
          <button
            onClick={onMetaShop}
            className={`py-2.5 rounded-xl font-semibold text-(--altair-text) bg-(--altair-surface-hover) border border-(--altair-border) hover:bg-(--altair-surface-active) transition-all ${focusClass(1)}`}
          >
            Meta Shop
          </button>
          <button
            onClick={onMenu}
            className={`py-2 rounded-xl font-medium text-(--altair-text-muted) hover:text-(--altair-text) transition-all text-sm ${focusClass(2)}`}
          >
            Main Menu
          </button>
        </div>
      </div>
    </div>
  );
}
