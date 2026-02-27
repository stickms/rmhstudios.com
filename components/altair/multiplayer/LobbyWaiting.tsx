/**
 * LobbyWaiting — Lobby screen shown during WAITING state.
 *
 * Displays player list with class selections, room code, lobby settings
 * (editable by host), chat panel using shared ChatPanel, and host controls
 * (kick, transfer host, start game).
 */

'use client';

import { useState, useMemo } from 'react';
import { Crown, Copy, UserMinus, Play, Users, Zap, MessageSquare, Check, Settings, ArrowRightLeft, ChevronDown, Swords } from 'lucide-react';
import { useAltairMultiplayerStore } from '@/lib/altair/multiplayer/store';
import { useAltairMetaStore } from '@/lib/altair/stores/meta-store';
import { emit } from '@/lib/altair/multiplayer/socket';
import { C2S } from '@/lib/altair/multiplayer/events';
import { PLAYER_SLOT_COLORS } from '@/lib/altair/engine/types';
import { CLASSES } from '@/lib/altair/data/classes';
import ChatPanel, { type ChatPanelMessage } from '@/components/shared/ChatPanel';
import SpriteIcon from '@/components/altair/hud/SpriteIcon';
import type { AltairClientPlayer, ChatMessage, AltairLobbySettings } from '@/lib/altair/multiplayer/types';

const CLASS_MAP = new Map(CLASSES.map((c) => [c.id, c]));

interface LobbyWaitingProps {
  lobbyId: string;
  onLeave: () => void;
}

export default function LobbyWaiting({ lobbyId, onLeave }: LobbyWaitingProps) {
  const lobby = useAltairMultiplayerStore((s) => s.lobby);
  const [codeCopied, setCodeCopied] = useState(false);
  const [editingSettings, setEditingSettings] = useState(false);

  if (!lobby) return null;

  const isHost = lobby.hostUserId === lobby.myUserId;
  const players = lobby.players;
  const chat = lobby.chat ?? [];

  const handleCopyCode = () => {
    const url = `${window.location.origin}/altair/multiplayer?join=${lobbyId}`;
    navigator.clipboard.writeText(url);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
  };

  const handleKick = (targetUserId: string) => {
    emit(C2S.LOBBY_KICK, { lobbyId, targetUserId });
  };

  const handleTransferHost = (targetUserId: string) => {
    emit(C2S.LOBBY_TRANSFER_HOST, { lobbyId, targetUserId });
  };

  const handleStartGame = () => {
    emit(C2S.GAME_START, { lobbyId });
  };

  const handleSendChat = (text: string) => {
    emit(C2S.LOBBY_CHAT, { lobbyId, text });
  };

  const handleUpdateSettings = (settings: Partial<AltairLobbySettings>) => {
    emit(C2S.LOBBY_UPDATE_SETTINGS, { lobbyId, settings });
  };

  const handleSelectClass = (classId: string) => {
    emit(C2S.CLASS_SELECT, { lobbyId, classId });
  };

  // Adapt lobby chat messages to shared ChatPanel format
  const chatMessages: ChatPanelMessage[] = useMemo(
    () =>
      chat.map((msg) => ({
        id: msg.id,
        userId: msg.userId,
        userName: msg.isSystem ? 'System' : msg.userName,
        message: msg.text,
        timestamp: msg.timestamp,
        reactions: {},
      })),
    [chat],
  );

  return (
    <div className="max-w-3xl mx-auto p-4 md:p-6 space-y-6">
      {/* Room Code Banner */}
      <div className="flex items-center justify-between p-4 rounded-xl bg-(--altair-surface) border border-(--altair-border)">
        <div>
          <div className="text-xs text-(--altair-text-muted) uppercase tracking-wider mb-1">Room Code</div>
          <div className="text-3xl font-mono font-black tracking-[0.2em] text-(--altair-accent)">{lobbyId}</div>
        </div>
        <button
          onClick={handleCopyCode}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-(--altair-bg) text-(--altair-text-muted) hover:text-(--altair-text) transition-colors border border-(--altair-border)"
        >
          {codeCopied ? <Check size={16} className="text-(--altair-success)" /> : <Copy size={16} />}
          {codeCopied ? 'Copied!' : 'Copy Invite'}
        </button>
      </div>

      <div className="grid md:grid-cols-[1fr_300px] gap-6">
        {/* Left column: Players + Controls */}
        <div className="space-y-4">
          {/* Player List */}
          <div className="rounded-xl border border-(--altair-border) bg-(--altair-surface) p-4">
            <h3 className="text-sm font-bold text-(--altair-text-muted) uppercase tracking-wider mb-3 flex items-center gap-2">
              <Users size={16} />
              Players ({players.length}/{lobby.settings.maxPlayers})
            </h3>
            <div className="space-y-2">
              {players.map((player) => (
                <PlayerRow
                  key={player.userId}
                  player={player}
                  isLocalPlayer={player.userId === lobby.myUserId}
                  isHost={isHost}
                  onKick={() => handleKick(player.userId)}
                  onTransferHost={() => handleTransferHost(player.userId)}
                />
              ))}
              {/* Empty slots */}
              {Array.from({ length: lobby.settings.maxPlayers - players.length }).map((_, i) => (
                <div
                  key={`empty-${i}`}
                  className="flex items-center gap-3 p-3 rounded-lg border border-dashed border-(--altair-border) opacity-40"
                >
                  <div className="w-8 h-8 rounded-full bg-(--altair-surface-hover)" />
                  <span className="text-sm text-(--altair-text-dim) italic">Waiting for player...</span>
                </div>
              ))}
            </div>
          </div>

          {/* Class Selection */}
          <ClassPicker
            lobbyId={lobbyId}
            currentClassId={players.find((p) => p.userId === lobby.myUserId)?.classId ?? null}
            onSelect={handleSelectClass}
          />

          {/* Lobby Settings */}
          <div className="rounded-xl border border-(--altair-border) bg-(--altair-surface) p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-bold text-(--altair-text-muted) uppercase tracking-wider">Settings</h3>
              {isHost && (
                <button
                  onClick={() => setEditingSettings(!editingSettings)}
                  className="flex items-center gap-1 text-xs text-(--altair-text-dim) hover:text-(--altair-text) transition-colors"
                >
                  <Settings size={14} />
                  {editingSettings ? 'Done' : 'Edit'}
                </button>
              )}
            </div>

            {editingSettings && isHost ? (
              <div className="space-y-3">
                {/* Max Players */}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-(--altair-text-muted)">Max Players</span>
                  <div className="flex gap-1">
                    {[2, 3, 4].map((n) => (
                      <button
                        key={n}
                        onClick={() => handleUpdateSettings({ maxPlayers: n as 2 | 3 | 4 })}
                        className={`px-3 py-1 rounded-md text-xs font-bold transition-colors ${
                          lobby.settings.maxPlayers === n
                            ? 'bg-(--altair-accent) text-white'
                            : 'bg-(--altair-bg) text-(--altair-text-muted) hover:bg-(--altair-surface-hover)'
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Visibility */}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-(--altair-text-muted)">Visibility</span>
                  <div className="flex gap-1">
                    {(['public', 'private'] as const).map((v) => (
                      <button
                        key={v}
                        onClick={() => handleUpdateSettings({ visibility: v })}
                        className={`px-3 py-1 rounded-md text-xs font-bold capitalize transition-colors ${
                          lobby.settings.visibility === v
                            ? 'bg-(--altair-accent) text-white'
                            : 'bg-(--altair-bg) text-(--altair-text-muted) hover:bg-(--altair-surface-hover)'
                        }`}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Double Time */}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-(--altair-text-muted) flex items-center gap-1">
                    <Zap size={12} /> Double Time
                  </span>
                  <button
                    onClick={() => handleUpdateSettings({ doubleTime: !lobby.settings.doubleTime })}
                    className={`px-3 py-1 rounded-md text-xs font-bold transition-colors ${
                      lobby.settings.doubleTime
                        ? 'bg-(--altair-warning) text-white'
                        : 'bg-(--altair-bg) text-(--altair-text-muted) hover:bg-(--altair-surface-hover)'
                    }`}
                  >
                    {lobby.settings.doubleTime ? 'ON' : 'OFF'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="px-2 py-1 rounded-md bg-(--altair-bg) text-(--altair-text-muted)">
                  {lobby.settings.maxPlayers} Players
                </span>
                <span className="px-2 py-1 rounded-md bg-(--altair-bg) text-(--altair-text-muted) capitalize">
                  {lobby.settings.visibility.replace('_', ' ')}
                </span>
                {lobby.settings.doubleTime && (
                  <span className="px-2 py-1 rounded-md bg-(--altair-warning-dim) text-(--altair-warning) flex items-center gap-1">
                    <Zap size={12} /> Double Time
                  </span>
                )}
                {lobby.settings.dropInAllowed && (
                  <span className="px-2 py-1 rounded-md bg-(--altair-bg) text-(--altair-text-muted)">
                    Drop-in: {lobby.settings.dropInWindow.replace('first_', '').replace('min', ' min')}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Host Controls */}
          {isHost && (
            <button
              onClick={handleStartGame}
              disabled={players.length < 2}
              className="w-full py-4 rounded-xl font-bold text-white text-lg tracking-wider transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-(--altair-accent) hover:bg-(--altair-accent-hover) shadow-lg flex items-center justify-center gap-2"
            >
              <Play size={22} />
              Start Game
            </button>
          )}

          {!isHost && (
            <div className="text-center text-sm text-(--altair-text-muted) py-4">
              Waiting for host to start the game...
            </div>
          )}
        </div>

        {/* Right column: Shared Chat */}
        <div className="rounded-xl border border-(--altair-border) bg-(--altair-surface) flex flex-col h-80 md:h-auto overflow-hidden">
          <div className="px-4 py-3 border-b border-(--altair-border) flex items-center gap-2">
            <MessageSquare size={16} className="text-(--altair-text-muted)" />
            <h3 className="text-sm font-bold text-(--altair-text-muted) uppercase tracking-wider">Chat</h3>
          </div>
          <ChatPanel
            messages={chatMessages}
            onSendMessage={handleSendChat}
            myUserId={lobby.myUserId}
            hostUserId={lobby.hostUserId}
            themePrefix="altair"
            showReactions={false}
            showMediaEmbeds={false}
            placeholder="Type a message..."
            className="flex-1 min-h-0"
          />
        </div>
      </div>

      {/* Leave button */}
      <button
        onClick={onLeave}
        className="w-full py-3 rounded-xl font-semibold text-(--altair-text-muted) bg-(--altair-surface) border border-(--altair-border) hover:bg-(--altair-surface-hover) hover:text-(--altair-danger) transition-colors"
      >
        Leave Lobby
      </button>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────

function PlayerRow({
  player,
  isLocalPlayer,
  isHost,
  onKick,
  onTransferHost,
}: {
  player: AltairClientPlayer;
  isLocalPlayer: boolean;
  isHost: boolean;
  onKick: () => void;
  onTransferHost: () => void;
}) {
  const classDef = player.classId ? CLASS_MAP.get(player.classId) : null;

  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${
        isLocalPlayer ? 'bg-(--altair-accent)/10 border border-(--altair-accent)/30' : 'bg-(--altair-bg)'
      }`}
    >
      {/* Color dot */}
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm text-white"
        style={{ backgroundColor: player.color || PLAYER_SLOT_COLORS[player.slot] || '#666' }}
      >
        {player.userName.charAt(0).toUpperCase()}
      </div>

      {/* Name + class */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-sm font-semibold truncate ${isLocalPlayer ? 'text-(--altair-accent)' : 'text-(--altair-text)'}`}>
            {player.userName}
          </span>
          {player.isHost && <Crown size={14} className="text-(--altair-warning) shrink-0" />}
          {isLocalPlayer && <span className="text-[10px] text-(--altair-text-dim)">(you)</span>}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          {classDef ? (
            <>
              <SpriteIcon
                sheetSrc={`/sprites/altair/characters/${classDef.id.replace('_', '-')}.png`}
                frameIndex={0}
                size={14}
              />
              <span className="text-[10px] font-semibold" style={{ color: classDef.color }}>
                {classDef.name}
              </span>
            </>
          ) : (
            <span className="text-[10px] text-(--altair-text-dim) italic">No class selected</span>
          )}
          {!player.isConnected && (
            <span className="text-[10px] text-(--altair-danger) ml-1">Disconnected</span>
          )}
        </div>
      </div>

      {/* Host actions (kick + transfer) */}
      {isHost && !isLocalPlayer && (
        <div className="flex gap-1">
          <button
            onClick={onTransferHost}
            className="p-1.5 rounded-md text-(--altair-text-dim) hover:text-(--altair-warning) hover:bg-(--altair-surface-hover) transition-colors"
            title="Transfer host"
          >
            <ArrowRightLeft size={14} />
          </button>
          <button
            onClick={onKick}
            className="p-1.5 rounded-md text-(--altair-text-dim) hover:text-(--altair-danger) hover:bg-(--altair-surface-hover) transition-colors"
            title="Kick player"
          >
            <UserMinus size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Class Picker ────────────────────────────────────────────────────

function ClassPicker({
  lobbyId,
  currentClassId,
  onSelect,
}: {
  lobbyId: string;
  currentClassId: string | null;
  onSelect: (classId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const unlockedClasses = useAltairMetaStore((s) => s.unlockedClasses);
  const currentClass = currentClassId ? CLASS_MAP.get(currentClassId) : null;

  return (
    <div className="rounded-xl border border-(--altair-border) bg-(--altair-surface) p-4">
      <h3 className="text-sm font-bold text-(--altair-text-muted) uppercase tracking-wider mb-3 flex items-center gap-2">
        <Swords size={16} />
        Your Class
      </h3>

      {/* Current selection / toggle */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 p-3 rounded-lg bg-(--altair-bg) hover:bg-(--altair-surface-hover) transition-colors border border-(--altair-border)"
      >
        {currentClass ? (
          <>
            <SpriteIcon
              sheetSrc={`/sprites/altair/characters/${currentClass.id.replace('_', '-')}.png`}
              frameIndex={0}
              size={28}
            />
            <span className="text-sm font-bold flex-1 text-left" style={{ color: currentClass.color }}>
              {currentClass.name}
            </span>
          </>
        ) : (
          <span className="text-sm text-(--altair-text-dim) italic flex-1 text-left">
            Select a class...
          </span>
        )}
        <ChevronDown
          size={16}
          className={`text-(--altair-text-dim) transition-transform ${expanded ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Class grid */}
      {expanded && (
        <div className="grid grid-cols-2 gap-2 mt-3">
          {CLASSES.map((cls) => {
            const isUnlocked = unlockedClasses.includes(cls.id);
            const isActive = cls.id === currentClassId;
            return (
              <button
                key={cls.id}
                disabled={!isUnlocked}
                onClick={() => {
                  onSelect(cls.id);
                  setExpanded(false);
                }}
                className={`flex items-center gap-2 p-2.5 rounded-lg text-left transition-all border ${
                  isActive
                    ? 'border-2 shadow-md'
                    : isUnlocked
                      ? 'border-(--altair-border) hover:bg-(--altair-surface-hover)'
                      : 'border-(--altair-border) opacity-35 cursor-not-allowed'
                } bg-(--altair-bg)`}
                style={isActive ? { borderColor: cls.color, boxShadow: `0 0 12px ${cls.color}25` } : {}}
              >
                <SpriteIcon
                  sheetSrc={`/sprites/altair/characters/${cls.id.replace('_', '-')}.png`}
                  frameIndex={0}
                  size={24}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold truncate" style={{ color: isUnlocked ? cls.color : undefined }}>
                    {cls.name}
                  </div>
                  <div className="text-[9px] text-(--altair-text-dim)">{cls.difficulty}</div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
