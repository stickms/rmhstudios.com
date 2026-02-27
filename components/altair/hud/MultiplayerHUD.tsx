/**
 * MultiplayerHUD — In-game overlay for multiplayer.
 *
 * Shows team HP bars (top), shared kill counter + timer, minimap preview,
 * and a kill feed. Local player weapons/passives use the same solo HUD.
 */

'use client';

import { useMemo } from 'react';
import { Skull, Heart, Clock, Users } from 'lucide-react';
import { CLASSES } from '@/lib/altair/data/classes';
import { PLAYER_SLOT_COLORS } from '@/lib/altair/engine/types';
import type { GameStateSnapshot, PlayerStateSnapshot, GameEvent } from '@/lib/altair/multiplayer/types';

interface MultiplayerHUDProps {
  snapshot: GameStateSnapshot;
  localPlayerId: string;
  gameEvents: GameEvent[];
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function MultiplayerHUD({ snapshot, localPlayerId, gameEvents }: MultiplayerHUDProps) {
  // Recent events for kill feed (last 4)
  const recentEvents = useMemo(
    () => gameEvents.slice(-4).reverse(),
    [gameEvents],
  );

  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      {/* Top bar: Team HP + Timer + Kills */}
      <div className="flex items-start justify-between px-3 pt-2 gap-3">
        {/* Team HP bars */}
        <div className="flex flex-col gap-1 pointer-events-auto">
          {snapshot.players.map((player) => (
            <TeamPlayerBar
              key={player.playerId}
              player={player}
              isLocal={player.playerId === localPlayerId}
            />
          ))}
        </div>

        {/* Center: Timer + Kills */}
        <div className="flex flex-col items-center gap-1">
          <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-black/50 backdrop-blur-sm">
            <Clock size={14} className="text-white/60" />
            <span className="font-mono font-bold text-white text-sm">{formatTime(snapshot.time)} / 20:00</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-black/50 backdrop-blur-sm">
            <Skull size={14} className="text-white/60" />
            <span className="font-mono font-bold text-white text-sm">{snapshot.sharedKills}</span>
          </div>
        </div>

        {/* Right: Minimap placeholder */}
        <div className="w-[150px] h-[150px] rounded-lg bg-black/40 backdrop-blur-sm border border-white/10 overflow-hidden">
          <MinimapPreview snapshot={snapshot} localPlayerId={localPlayerId} />
        </div>
      </div>

      {/* Kill feed (bottom left) */}
      <div className="absolute bottom-20 left-3 flex flex-col gap-1 max-w-[300px]">
        {recentEvents.map((event, i) => (
          <KillFeedEntry key={`${event.type}-${event.timestamp}-${i}`} event={event} />
        ))}
      </div>

      {/* Boss warning */}
      {snapshot.bossWarning && (
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 text-center animate-pulse">
          <div className="text-2xl font-black text-(--altair-danger) tracking-wider" style={{ fontFamily: 'var(--altair-font-display)', textShadow: '0 0 20px rgba(239, 68, 68, 0.6)' }}>
            BOSS INCOMING
          </div>
        </div>
      )}
    </div>
  );
}

// ── Team Player HP Bar ──────────────────────────────────────────

function TeamPlayerBar({ player, isLocal }: { player: PlayerStateSnapshot; isLocal: boolean }) {
  const classDef = CLASSES.find((c) => c.id === player.classId);
  const color = classDef?.color || PLAYER_SLOT_COLORS[player.slot] || '#666';
  const hpPct = player.maxHp > 0 ? Math.max(0, Math.min(1, player.hp / player.maxHp)) : 0;

  return (
    <div className={`flex items-center gap-2 px-2 py-1 rounded-md ${isLocal ? 'bg-white/15' : 'bg-black/40'} backdrop-blur-sm`}>
      {/* Class icon dot */}
      <div
        className="w-4 h-4 rounded-full shrink-0"
        style={{ backgroundColor: color }}
      />

      {/* HP bar */}
      <div className="w-24 h-2.5 rounded-full bg-white/10 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-200"
          style={{
            width: `${hpPct * 100}%`,
            backgroundColor: player.isDowned ? '#EF4444' : color,
            opacity: player.isDead || player.isSpectating ? 0.3 : 1,
          }}
        />
      </div>

      {/* Status indicators */}
      {player.isDowned && (
        <span className="text-[10px] text-red-400 font-bold animate-pulse">DOWNED</span>
      )}
      {player.isDead && (
        <Skull size={12} className="text-red-500" />
      )}
      {player.invulnTimer > 0 && !player.isDowned && !player.isDead && (
        <span className="text-[10px] text-blue-300 font-bold">INV</span>
      )}
    </div>
  );
}

// ── Minimap ──────────────────────────────────────────────────────

function MinimapPreview({ snapshot, localPlayerId }: { snapshot: GameStateSnapshot; localPlayerId: string }) {
  // Simple dot-based minimap
  const localPlayer = snapshot.players.find((p) => p.playerId === localPlayerId);
  if (!localPlayer) return null;

  const mapSize = 150;
  const viewRange = 2000; // World units visible on minimap

  const worldToMinimap = (wx: number, wy: number) => {
    const rx = ((wx - localPlayer.x) / viewRange + 0.5) * mapSize;
    const ry = ((wy - localPlayer.y) / viewRange + 0.5) * mapSize;
    return { x: Math.max(0, Math.min(mapSize, rx)), y: Math.max(0, Math.min(mapSize, ry)) };
  };

  return (
    <svg width={mapSize} height={mapSize} className="w-full h-full">
      {/* Enemy dots (small red) */}
      {snapshot.enemies.slice(0, 50).map((e) => {
        const pos = worldToMinimap(e.x, e.y);
        return (
          <circle
            key={e.id}
            cx={pos.x}
            cy={pos.y}
            r={e.isBoss ? 4 : 1.5}
            fill={e.isBoss ? '#EF4444' : '#EF444480'}
          />
        );
      })}

      {/* Pickup dots */}
      {snapshot.pickups.slice(0, 30).map((p) => {
        const pos = worldToMinimap(p.x, p.y);
        return (
          <circle key={p.id} cx={pos.x} cy={pos.y} r={1.5} fill="#FBBF24" />
        );
      })}

      {/* Other player dots */}
      {snapshot.players
        .filter((p) => p.playerId !== localPlayerId)
        .map((p) => {
          const pos = worldToMinimap(p.x, p.y);
          const cls = CLASSES.find((c) => c.id === p.classId);
          return (
            <circle
              key={p.playerId}
              cx={pos.x}
              cy={pos.y}
              r={3}
              fill={cls?.color || PLAYER_SLOT_COLORS[p.slot] || '#4A9EFF'}
              stroke="white"
              strokeWidth={0.5}
            />
          );
        })}

      {/* Local player (center, white) */}
      <circle cx={mapSize / 2} cy={mapSize / 2} r={3} fill="white" stroke="black" strokeWidth={0.5} />
    </svg>
  );
}

// ── Kill Feed ──────────────────────────────────────────────────────

function KillFeedEntry({ event }: { event: GameEvent }) {
  const age = Date.now() - event.timestamp;
  if (age > 5000) return null; // Fade after 5s

  const opacity = Math.max(0, 1 - age / 5000);

  const messages: Record<string, string> = {
    player_downed: `Player downed!`,
    player_revived: `Player revived!`,
    player_dead: `Player eliminated`,
    boss_spawn: `Boss incoming!`,
    boss_kill: `Boss defeated!`,
    kill_milestone: `Kill milestone reached!`,
    victory: `VICTORY!`,
    tpk: `Team eliminated...`,
  };

  const colors: Record<string, string> = {
    player_downed: '#EF4444',
    player_revived: '#22C55E',
    player_dead: '#DC2626',
    boss_spawn: '#F59E0B',
    boss_kill: '#22C55E',
    kill_milestone: '#FBBF24',
    victory: '#22C55E',
    tpk: '#DC2626',
  };

  return (
    <div
      className="px-2 py-1 rounded bg-black/50 backdrop-blur-sm text-xs font-semibold transition-opacity"
      style={{ color: colors[event.type] || '#fff', opacity }}
    >
      {messages[event.type] || event.type}
    </div>
  );
}
