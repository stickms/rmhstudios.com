/**
 * ClassSelectLobby — Inline class selection during CLASS_SELECT phase.
 *
 * Shows all 8 classes with each player's current selection visible.
 * Players can pick a class and toggle ready. Host sees a "Start" button
 * once all players are ready.
 * Adapted from ClassSelectScreen.tsx.
 */

'use client';

import { useState } from 'react';
import { Lock, Check, Swords, Shield, Zap, Crown, Users } from 'lucide-react';
import { CLASSES } from '@/lib/altair/data/classes';
import { WEAPONS } from '@/lib/altair/data/weapons';
import { useAltairMetaStore } from '@/lib/altair/stores/meta-store';
import { useAltairMultiplayerStore } from '@/lib/altair/multiplayer/store';
import { emit } from '@/lib/altair/multiplayer/socket';
import { C2S } from '@/lib/altair/multiplayer/events';
import { PLAYER_SLOT_COLORS } from '@/lib/altair/engine/types';

const DIFFICULTY_COLORS: Record<string, string> = {
  Easy: 'var(--altair-success)',
  Medium: 'var(--altair-warning)',
  Hard: 'var(--altair-danger)',
};

import SpriteIcon from '@/components/altair/hud/SpriteIcon';

/** Renders the character's idle sprite (frame 0) from their sprite sheet. */
function ClassSprite({ classId, size = 48 }: { classId: string; size?: number }) {
  const filename = classId.replace('_', '-');
  return (
    <SpriteIcon
      sheetSrc={`/sprites/altair/characters/${filename}.png`}
      frameIndex={0}
      frameWidth={16}
      frameHeight={16}
      size={size}
    />
  );
}

interface ClassSelectLobbyProps {
  lobbyId: string;
}

export default function ClassSelectLobby({ lobbyId }: ClassSelectLobbyProps) {
  const lobby = useAltairMultiplayerStore((s) => s.lobby);
  const classSelections = useAltairMultiplayerStore((s) => s.classSelections);
  const readyStates = useAltairMultiplayerStore((s) => s.readyStates);
  const unlockedClasses = useAltairMetaStore((s) => s.unlockedClasses);
  const [detailId, setDetailId] = useState<string | null>(null);

  if (!lobby) return null;

  const myUserId = lobby.myUserId;
  const isHost = lobby.hostUserId === myUserId;
  const myClassId = classSelections[myUserId] ?? null;
  const myReady = readyStates[myUserId] ?? false;
  const allReady = lobby.players.every((p) => readyStates[p.userId]);
  const detailClass = CLASSES.find((c) => c.id === detailId);
  const detailWeapon = detailClass ? WEAPONS.find((w) => w.id === detailClass.startingWeaponId) : null;

  // Map of classId → players who selected it
  const classTakers: Record<string, typeof lobby.players> = {};
  for (const player of lobby.players) {
    const cid = classSelections[player.userId];
    if (cid) {
      if (!classTakers[cid]) classTakers[cid] = [];
      classTakers[cid].push(player);
    }
  }

  const handleSelect = (classId: string) => {
    emit(C2S.CLASS_SELECT, { classId });
    setDetailId(classId);
  };

  const handleToggleReady = () => {
    emit(C2S.CLASS_READY, { ready: !myReady });
  };

  const handleStartGame = () => {
    emit(C2S.GAME_START, { lobbyId });
  };

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-5">
      {/* Player selection summary bar */}
      <div className="flex items-center gap-3 p-3 rounded-xl bg-(--altair-surface) border border-(--altair-border)">
        <Users size={16} className="text-(--altair-text-muted) shrink-0" />
        <div className="flex-1 flex flex-wrap gap-2">
          {lobby.players.map((player) => {
            const cls = classSelections[player.userId];
            const ready = readyStates[player.userId];
            const classDef = cls ? CLASSES.find((c) => c.id === cls) : null;
            return (
              <div
                key={player.userId}
                className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-(--altair-bg) text-xs"
              >
                <div
                  className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
                  style={{ backgroundColor: player.color || PLAYER_SLOT_COLORS[player.slot] || '#666' }}
                >
                  {player.userName.charAt(0).toUpperCase()}
                </div>
                <span className="text-(--altair-text) font-semibold truncate max-w-[80px]">{player.userName}</span>
                {player.isHost && <Crown size={10} className="text-(--altair-warning)" />}
                {classDef && (
                  <span className="font-bold" style={{ color: classDef.color }}>{classDef.name}</span>
                )}
                {!classDef && <span className="text-(--altair-text-dim) italic">picking...</span>}
                {ready && <Check size={12} className="text-(--altair-success)" />}
              </div>
            );
          })}
        </div>
      </div>

      {/* Class grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {CLASSES.map((cls) => {
          const isUnlocked = unlockedClasses.includes(cls.id);
          const isMySelection = myClassId === cls.id;
          const takers = classTakers[cls.id] ?? [];

          return (
            <button
              key={cls.id}
              onClick={() => isUnlocked && handleSelect(cls.id)}
              disabled={!isUnlocked}
              className={`relative p-4 rounded-xl border text-left transition-all ${
                isMySelection
                  ? 'border-2 scale-[1.02] shadow-lg'
                  : isUnlocked
                    ? 'border-(--altair-border) hover:border-(--altair-border-bright) hover:bg-(--altair-surface-hover)'
                    : 'border-(--altair-border) opacity-50 cursor-not-allowed'
              } bg-(--altair-surface)`}
              style={isMySelection ? { borderColor: cls.color, boxShadow: `0 0 20px ${cls.color}30` } : {}}
            >
              {!isUnlocked && (
                <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/40 z-10">
                  <Lock size={20} className="text-(--altair-text-dim)" />
                </div>
              )}
              <ClassSprite classId={cls.id} size={36} />
              <h3 className="font-bold text-sm mt-2" style={{ color: cls.color }}>
                {cls.name}
              </h3>
              <span
                className="text-[10px] font-bold uppercase tracking-wider"
                style={{ color: DIFFICULTY_COLORS[cls.difficulty] }}
              >
                {cls.difficulty}
              </span>

              {/* Show who picked this class */}
              {takers.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {takers.map((p) => (
                    <div
                      key={p.userId}
                      className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white border-2 border-(--altair-surface)"
                      style={{ backgroundColor: p.color || PLAYER_SLOT_COLORS[p.slot] || '#666' }}
                      title={p.userName}
                    >
                      {p.userName.charAt(0).toUpperCase()}
                    </div>
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Selected class detail */}
      {detailClass && (
        <div
          className="p-5 rounded-xl border bg-(--altair-surface) altair-modal"
          style={{ borderColor: `${detailClass.color}40` }}
        >
          <div className="flex items-start gap-4 mb-4">
            <ClassSprite classId={detailClass.id} size={56} />
            <div>
              <h3 className="text-xl font-bold" style={{ color: detailClass.color }}>
                {detailClass.name}
              </h3>
              <p className="text-sm text-(--altair-text-muted) italic">{detailClass.tagline}</p>
              <p className="text-xs text-(--altair-text-dim) mt-1">{detailClass.description}</p>
            </div>
          </div>

          {detailWeapon && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-(--altair-bg-subtle) mb-3">
              <Swords size={14} className="text-(--altair-text-muted)" />
              <span className="text-xs text-(--altair-text-muted)">Starting weapon:</span>
              <span className="text-xs font-bold text-(--altair-text)">{detailWeapon.name}</span>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <div className="px-3 py-2 rounded-lg bg-(--altair-bg-subtle)">
              <div className="flex items-center gap-2 mb-1">
                <Shield size={12} className="text-(--altair-info)" />
                <span className="text-xs font-bold text-(--altair-text)">{detailClass.ability1.name}</span>
                <span className="text-[10px] text-(--altair-text-dim)">Innate</span>
              </div>
              <p className="text-[11px] text-(--altair-text-muted)">{detailClass.ability1.description}</p>
            </div>
            <div className="px-3 py-2 rounded-lg bg-(--altair-bg-subtle)">
              <div className="flex items-center gap-2 mb-1">
                <Zap size={12} className="text-(--altair-warning)" />
                <span className="text-xs font-bold text-(--altair-text)">{detailClass.ability2.name}</span>
                <span className="text-[10px] text-(--altair-text-dim)">Lv.10</span>
              </div>
              <p className="text-[11px] text-(--altair-text-muted)">{detailClass.ability2.description}</p>
            </div>
          </div>
        </div>
      )}

      {/* Ready / Start buttons */}
      <div className="flex gap-3">
        <button
          onClick={handleToggleReady}
          disabled={!myClassId}
          className={`flex-1 py-3 rounded-xl font-bold text-lg transition-colors flex items-center justify-center gap-2 ${
            myReady
              ? 'bg-(--altair-success) text-white hover:bg-(--altair-success)/80'
              : myClassId
                ? 'bg-(--altair-surface) text-(--altair-text) border border-(--altair-border) hover:bg-(--altair-surface-hover)'
                : 'bg-(--altair-surface) text-(--altair-text-dim) cursor-not-allowed opacity-50'
          }`}
        >
          {myReady ? (
            <>
              <Check size={20} />
              Ready!
            </>
          ) : (
            'Ready Up'
          )}
        </button>

        {isHost && (
          <button
            onClick={handleStartGame}
            disabled={!allReady}
            className="flex-1 py-3 rounded-xl font-bold text-lg text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-(--altair-accent) hover:bg-(--altair-accent-hover) flex items-center justify-center gap-2"
          >
            Start Game
          </button>
        )}
      </div>
    </div>
  );
}
