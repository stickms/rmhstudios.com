/**
 * MultiplayerResultsScreen — End-of-run results for all players.
 *
 * Shows individual stats side-by-side, coin breakdowns, shared stats,
 * and navigation options (play again, meta shop, leave).
 */

'use client';

import { Trophy, Skull, Heart, Coins, Clock, Swords, ArrowLeft, RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { CLASSES } from '@/lib/altair/data/classes';
import { PLAYER_SLOT_COLORS } from '@/lib/altair/engine/types';
import type { GameResultsData, PlayerResultData } from '@/lib/altair/multiplayer/types';

interface MultiplayerResultsScreenProps {
  results: GameResultsData;
  onPlayAgain: () => void;
  onLeave: () => void;
}

export default function MultiplayerResultsScreen({
  results,
  onPlayAgain,
  onLeave,
}: MultiplayerResultsScreenProps) {
  const { t } = useTranslation("c-altair");
  const isVictory = results.victory;

  return (
    <div className="flex h-screen flex-col">
      <div className="flex-1 overflow-y-auto p-4 md:p-8" style={{ scrollbarGutter: 'stable both-edges' }}>
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Title */}
          <div className="text-center py-6">
            <h1
              className={`text-5xl font-black tracking-wider ${isVictory ? 'text-(--altair-success)' : 'text-(--altair-danger)'}`}
              style={{ fontFamily: 'var(--altair-font-display)' }}
            >
              {isVictory ? t("victory", { defaultValue: "VICTORY" }) : t("defeated", { defaultValue: "DEFEATED" })}
            </h1>
            <p className="text-(--altair-text-muted) mt-2 text-sm">
              {results.sharedKills} kills | {Math.floor(results.timeSurvived / 60)}:{String(Math.floor(results.timeSurvived % 60)).padStart(2, '0')} survived
              {results.bossesDefeated.length > 0 && ` | ${results.bossesDefeated.length} boss${results.bossesDefeated.length > 1 ? 'es' : ''} defeated`}
              {results.doubleTime && ` | ${t("double-time", { defaultValue: "Double Time" })}`}
            </p>
          </div>

          {/* Player stat cards */}
          <div className={`grid gap-4 ${results.players.length <= 2 ? 'md:grid-cols-2' : 'md:grid-cols-2 lg:grid-cols-' + Math.min(results.players.length, 4)}`}>
            {results.players.map((player) => (
              <PlayerStatCard key={player.userId} player={player} />
            ))}
          </div>

          {/* Actions */}
          <div className="flex gap-4 justify-center pt-4">
            <button
              onClick={onPlayAgain}
              className="flex items-center gap-2 px-8 py-3 rounded-xl font-bold text-white bg-(--altair-accent) hover:bg-(--altair-accent-hover) transition-colors"
            >
              <RotateCcw size={18} />
              {t("play-again", { defaultValue: "Play Again" })}
            </button>
            <button
              onClick={onLeave}
              className="flex items-center gap-2 px-8 py-3 rounded-xl font-semibold text-(--altair-text-muted) bg-(--altair-surface) border border-(--altair-border) hover:bg-(--altair-surface-hover) transition-colors"
            >
              <ArrowLeft size={18} />
              {t("leave", { defaultValue: "Leave" })}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PlayerStatCard({ player }: { player: PlayerResultData }) {
  const { t } = useTranslation("c-altair");
  const classDef = CLASSES.find((c) => c.id === player.classId);
  const color = classDef?.color || PLAYER_SLOT_COLORS[player.slot] || '#666';

  return (
    <div className="rounded-xl border bg-(--altair-surface) p-4" style={{ borderColor: `${color}40` }}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-3">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-white"
          style={{ backgroundColor: color }}
        >
          {player.userName.charAt(0).toUpperCase()}
        </div>
        <div>
          <div className="font-bold text-(--altair-text)">{player.userName}</div>
          <div className="text-xs" style={{ color }}>
            {classDef?.name ?? player.classId} — Lv.{player.level}
          </div>
        </div>
        {!player.wasAliveAtEnd && (
          <Skull size={16} className="ml-auto text-(--altair-danger)" />
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <StatRow icon={Swords} label={t("kills", { defaultValue: "Kills" })} value={String(player.kills)} />
        <StatRow icon={Coins} label={t("coins", { defaultValue: "Coins" })} value={String(player.coinsEarned)} />
        <StatRow icon={Clock} label={t("time", { defaultValue: "Time" })} value={`${Math.floor(player.timeSurvived / 60)}:${String(Math.floor(player.timeSurvived % 60)).padStart(2, '0')}`} />
        <StatRow icon={Heart} label={t("revives", { defaultValue: "Revives" })} value={`${player.revivesGiven} given / ${player.revivesReceived} recv`} />
      </div>

      {/* Coin breakdown */}
      <div className="mt-3 pt-3 border-t border-(--altair-border)">
        <div className="text-[10px] text-(--altair-text-dim) uppercase tracking-wider mb-1">{t("coin-breakdown", { defaultValue: "Coin Breakdown" })}</div>
        <div className="grid grid-cols-2 gap-1 text-[11px]">
          {player.coinBreakdown.enemyDrops > 0 && <CoinRow label={t("enemy-drops", { defaultValue: "Enemy drops" })} value={player.coinBreakdown.enemyDrops} />}
          {player.coinBreakdown.bossKills > 0 && <CoinRow label={t("boss-kills", { defaultValue: "Boss kills" })} value={player.coinBreakdown.bossKills} />}
          {player.coinBreakdown.chestDrops > 0 && <CoinRow label={t("chests", { defaultValue: "Chests" })} value={player.coinBreakdown.chestDrops} />}
          {player.coinBreakdown.survivalBonus > 0 && <CoinRow label={t("survival", { defaultValue: "Survival" })} value={player.coinBreakdown.survivalBonus} />}
          {player.coinBreakdown.killMilestones > 0 && <CoinRow label={t("milestones", { defaultValue: "Milestones" })} value={player.coinBreakdown.killMilestones} />}
          {player.coinBreakdown.completionBonus > 0 && <CoinRow label={t("completion", { defaultValue: "Completion" })} value={player.coinBreakdown.completionBonus} />}
          {player.coinBreakdown.firstClearBonus > 0 && <CoinRow label={t("first-clear", { defaultValue: "First clear" })} value={player.coinBreakdown.firstClearBonus} />}
        </div>
      </div>
    </div>
  );
}

function StatRow({ icon: Icon, label, value }: { icon: typeof Trophy; label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5 text-(--altair-text-muted)">
      <Icon size={12} />
      <span>{label}:</span>
      <span className="font-bold text-(--altair-text)">{value}</span>
    </div>
  );
}

function CoinRow({ label, value }: { label: string; value: number }) {
  return (
    <>
      <span className="text-(--altair-text-muted)">{label}</span>
      <span className="text-(--altair-warning) font-bold text-right">{value}</span>
    </>
  );
}
