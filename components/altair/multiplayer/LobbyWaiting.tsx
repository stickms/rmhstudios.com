/**
 * LobbyWaiting — Lobby screen shown during WAITING state.
 *
 * Displays player list, room code, lobby settings, chat panel,
 * and host controls (kick, settings, start game).
 */

'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { Crown, Copy, UserMinus, Play, Users, Zap, MessageSquare, Send, Check } from 'lucide-react';
import { useAltairMultiplayerStore } from '@/lib/altair/multiplayer/store';
import { emit } from '@/lib/altair/multiplayer/socket';
import { C2S } from '@/lib/altair/multiplayer/events';
import { useAltairToastStore } from '@/lib/altair/stores/toast-store';
import { PLAYER_SLOT_COLORS } from '@/lib/altair/engine/types';
import type { AltairClientPlayer, ChatMessage } from '@/lib/altair/multiplayer/types';

interface LobbyWaitingProps {
  lobbyId: string;
  onLeave: () => void;
}

export default function LobbyWaiting({ lobbyId, onLeave }: LobbyWaitingProps) {
  const lobby = useAltairMultiplayerStore((s) => s.lobby);
  const addToast = useAltairToastStore((s) => s.addToast);
  const [codeCopied, setCodeCopied] = useState(false);
  const [chatText, setChatText] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  if (!lobby) return null;

  const isHost = lobby.hostUserId === lobby.myUserId;
  const players = lobby.players;
  const chat = lobby.chat ?? [];

  const handleCopyCode = () => {
    navigator.clipboard.writeText(lobbyId);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
  };

  const handleKick = (targetUserId: string) => {
    emit(C2S.LOBBY_KICK, { lobbyId, targetUserId });
  };

  const handleStartGame = () => {
    emit(C2S.GAME_START, { lobbyId });
  };

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    const text = chatText.trim();
    if (!text) return;
    emit(C2S.LOBBY_CHAT, { lobbyId, text });
    setChatText('');
  };

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
          {codeCopied ? 'Copied!' : 'Copy'}
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

          {/* Lobby Settings Summary */}
          <div className="rounded-xl border border-(--altair-border) bg-(--altair-surface) p-4">
            <h3 className="text-sm font-bold text-(--altair-text-muted) uppercase tracking-wider mb-2">Settings</h3>
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

        {/* Right column: Chat */}
        <div className="rounded-xl border border-(--altair-border) bg-(--altair-surface) flex flex-col h-80 md:h-auto">
          <div className="px-4 py-3 border-b border-(--altair-border) flex items-center gap-2">
            <MessageSquare size={16} className="text-(--altair-text-muted)" />
            <h3 className="text-sm font-bold text-(--altair-text-muted) uppercase tracking-wider">Chat</h3>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-1 min-h-0">
            {chat.length === 0 && (
              <p className="text-xs text-(--altair-text-dim) text-center py-4">No messages yet</p>
            )}
            {chat.map((msg) => (
              <ChatBubble key={msg.id} message={msg} isLocal={msg.userId === lobby.myUserId} />
            ))}
            <div ref={chatEndRef} />
          </div>
          <form onSubmit={handleSendChat} className="p-3 border-t border-(--altair-border) flex gap-2">
            <input
              type="text"
              maxLength={200}
              value={chatText}
              onChange={(e) => setChatText(e.target.value)}
              placeholder="Type a message..."
              className="flex-1 px-3 py-2 rounded-lg text-sm bg-(--altair-bg) text-(--altair-text) placeholder:text-(--altair-text-dim) border border-(--altair-border) outline-none focus:ring-1 focus:ring-(--altair-accent)"
            />
            <button
              type="submit"
              disabled={!chatText.trim()}
              className="px-3 py-2 rounded-lg bg-(--altair-accent) text-white disabled:opacity-40 transition-colors hover:bg-(--altair-accent-hover)"
            >
              <Send size={16} />
            </button>
          </form>
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
}: {
  player: AltairClientPlayer;
  isLocalPlayer: boolean;
  isHost: boolean;
  onKick: () => void;
}) {
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

      {/* Name */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-sm font-semibold truncate ${isLocalPlayer ? 'text-(--altair-accent)' : 'text-(--altair-text)'}`}>
            {player.userName}
          </span>
          {player.isHost && <Crown size={14} className="text-(--altair-warning) shrink-0" />}
          {isLocalPlayer && <span className="text-[10px] text-(--altair-text-dim)">(you)</span>}
        </div>
        {!player.isConnected && (
          <span className="text-[10px] text-(--altair-danger)">Disconnected</span>
        )}
      </div>

      {/* Kick button (host only, can't kick self) */}
      {isHost && !isLocalPlayer && (
        <button
          onClick={onKick}
          className="p-1.5 rounded-md text-(--altair-text-dim) hover:text-(--altair-danger) hover:bg-(--altair-surface-hover) transition-colors"
          title="Kick player"
        >
          <UserMinus size={16} />
        </button>
      )}
    </div>
  );
}

function ChatBubble({ message, isLocal }: { message: ChatMessage; isLocal: boolean }) {
  if (message.isSystem) {
    return (
      <div className="text-center text-[11px] text-(--altair-text-dim) italic py-1">
        {message.text}
      </div>
    );
  }

  return (
    <div className={`text-xs ${isLocal ? 'text-right' : ''}`}>
      <span className="font-semibold text-(--altair-text-muted)">{message.userName}: </span>
      <span className="text-(--altair-text)">{message.text}</span>
    </div>
  );
}
