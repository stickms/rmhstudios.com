/**
 * MultiplayerResultsScreen — End-of-run results for all players.
 *
 * Shows individual stats side-by-side, coin breakdowns, shared stats,
 * and navigation options (play again, meta shop, leave).
 */

import { useEffect, useState } from 'react';
import { Trophy, Skull, Heart, Clock, Swords, ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { CLASSES } from '@features/altair/engine/data/classes';
import { PLAYER_SLOT_COLORS } from '@features/altair/engine/engine/types';
import type { GameResultsData, PlayerResultData } from '@features/altair/engine/multiplayer/types';

/** The hub reopens the lobby this long after results (server/socket-server/handlers/altair.ts: endGame). */
const LOBBY_REOPEN_SECONDS = 15;

interface MultiplayerResultsScreenProps {
  results: GameResultsData;
  onLeave: () => void;
}

export default function MultiplayerResultsScreen({
  results,
  onLeave,
}: MultiplayerResultsScreenProps) {
  const { t } = useTranslation("c-altair");
  // The lobby reopens by itself (the route swaps this screen for the lobby when the hub says WAITING).
  const [reopenIn, setReopenIn] = useState(LOBBY_REOPEN_SECONDS);
  useEffect(() => {
    const id = setInterval(() => setReopenIn((n) => Math.max(0, n - 1)), 1000);
    return () => clearInterval(id);
  }, []);
  const isVictory = results.victory;
  const hostLeft = results.endedReason === 'host_left';

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex-1 px-4 pt-4 pb-12 md:px-8 md:pt-8">
        <div className="mx-auto flex max-w-4xl flex-col gap-4 md:gap-6">
          {hostLeft && (
            <div role="alert" className="rounded-(--altair-radius-lg) border border-(--altair-warning) bg-(--altair-surface) px-4 py-3 text-center text-(--altair-warning)">
              {t("coop-host-left", { defaultValue: "The host left, so the run ended." })}
            </div>
          )}

          {/* Title */}
          <div className="text-center py-6">
            <h1
              className={`text-5xl font-black tracking-wider ${isVictory ? 'text-(--altair-success)' : 'text-(--altair-danger)'}`}
              style={{ fontFamily: 'var(--altair-font-display)' }}
            >
              {hostLeft ? t("coop-run-ended", { defaultValue: "RUN ENDED" }) : isVictory ? t("victory", { defaultValue: "VICTORY" }) : t("defeated", { defaultValue: "DEFEATED" })}
            </h1>
            <p className="text-(--altair-text-muted) mt-2 text-sm">
              {results.sharedKills} kills | {Math.floor(results.timeSurvived / 60)}:{String(Math.floor(results.timeSurvived % 60)).padStart(2, '0')} survived
              {results.bossesDefeated.length > 0 && ` | ${results.bossesDefeated.length} boss${results.bossesDefeated.length > 1 ? 'es' : ''} defeated`}
              {results.doubleTime && ` | ${t("double-time-lobby-waiting", { defaultValue: "Double Time" })}`}
            </p>
          </div>

          {/* Player stat cards */}
          <div className={`grid gap-4 ${results.players.length <= 2 ? 'md:grid-cols-2' : results.players.length === 3 ? 'md:grid-cols-2 lg:grid-cols-3' : 'md:grid-cols-2 lg:grid-cols-4'}`}>
            {results.players.map((player) => (
              <PlayerStatCard key={player.userId} player={player} />
            ))}
          </div>

          {/* Actions */}
          <div className="flex gap-4 justify-center pt-4">
            <p data-testid="results-reopen" className="self-center text-sm text-(--altair-text-muted)">
              {t("coop-lobby-reopens", { defaultValue: "Back to the lobby in {{seconds}}s, ready for another run.", seconds: reopenIn })}
            </p>
            <button
              onClick={onLeave}
              className="flex items-center gap-2 px-8 py-3 rounded-(--altair-radius-lg) font-semibold text-(--altair-text-muted) bg-(--altair-surface) border border-(--altair-border) hover:bg-(--altair-surface-hover) transition-colors"
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
    <div className="rounded-(--altair-radius-lg) border bg-(--altair-surface) p-4" style={{ borderColor: `${color}40` }}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-3">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-(--altair-hud-ink)"
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
        <StatRow icon={Clock} label={t("time", { defaultValue: "Time" })} value={`${Math.floor(player.timeSurvived / 60)}:${String(Math.floor(player.timeSurvived % 60)).padStart(2, '0')}`} />
        <StatRow icon={Heart} label={t("revives", { defaultValue: "Revives" })} value={`${player.revivesGiven} given / ${player.revivesReceived} recv`} />
      </div>

      <p className="mt-3 border-t border-(--altair-border) pt-3 text-xs text-(--altair-text-dim)">
        {t("coop-no-coins", { defaultValue: "Co-op runs do not earn coins yet." })}
      </p>
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
