/**
 * HostControlModal — In-game host management modal.
 *
 * Trigger is a static circle button intended for header placement.
 * Opens a centered modal allowing the host to:
 * - Force-end the current game
 * - Kick players
 * - Promote spectators to players
 * - Transfer host
 *
 * Only renders when the current user is the host.
 */
'use client';

import { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Crown,
  X,
  UserMinus,
  UserPlus,
  StopCircle,
  ArrowRightLeft,
  Shield,
} from 'lucide-react';
import { useRMHboxStore } from '@/lib/rmhbox/store';
import { emit } from '@/lib/rmhbox/socket';
import { C2S } from '@/lib/rmhbox/events';
import { toast } from '@/lib/rmhbox/toast-store';

export default function HostControlModal() {
  const [isOpen, setIsOpen] = useState(false);
  const lobby = useRMHboxStore((s) => s.lobby);

  const handleForceEnd = useCallback(() => {
    if (!lobby) return;
    emit(C2S.GAME_FORCE_END, { lobbyId: lobby.lobbyId });
    toast.info('Force-ending game…');
    setIsOpen(false);
  }, [lobby]);

  const handleKick = useCallback(
    (userId: string, userName: string) => {
      if (!lobby) return;
      emit(C2S.LOBBY_KICK, { lobbyId: lobby.lobbyId, targetUserId: userId });
      toast.warning(`Kicked ${userName}`);
    },
    [lobby],
  );

  const handlePromote = useCallback(
    (userId: string, userName: string) => {
      if (!lobby) return;
      emit(C2S.LOBBY_PROMOTE_SPECTATOR, { lobbyId: lobby.lobbyId, userId });
      toast.success(`Promoted ${userName} to player`);
    },
    [lobby],
  );

  const handleTransferHost = useCallback(
    (userId: string, userName: string) => {
      if (!lobby) return;
      emit(C2S.LOBBY_TRANSFER_HOST, { lobbyId: lobby.lobbyId, targetUserId: userId });
      toast.info(`Transferred host to ${userName}`);
      setIsOpen(false);
    },
    [lobby],
  );

  if (!lobby) return null;

  const isHost = lobby.hostUserId === lobby.myUserId;
  if (!isHost) return null;

  const otherPlayers = lobby.players.filter((p) => p.userId !== lobby.myUserId);
  const isInGame = lobby.state === 'PLAYING' || lobby.state === 'COUNTDOWN' || lobby.state === 'INSTRUCTIONS' || lobby.state === 'PRELOADING' || lobby.state === 'ROUND_RESULTS';
  const canPromoteSpectators = lobby.state === 'WAITING' || lobby.state === 'ROUND_RESULTS';

  return (
    <>
      {/* Trigger button — static circle for header placement, only show during non-WAITING states */}
      {lobby.state !== 'WAITING' && (
        <button
          onClick={() => setIsOpen(true)}
          className="flex h-10 w-10 items-center justify-center rounded-full transition-all hover:scale-110 active:scale-95"
          style={{
            backgroundColor: 'var(--rmhbox-warning)',
            color: '#000',
          }}
          aria-label="Host controls"
          title="Host controls"
        >
          <Crown className="h-5 w-5" />
        </button>
      )}

      {/* Modal — portaled to body to escape header containing block */}
      {isOpen && createPortal(
        <>
          {/* Backdrop */}
          <div
            className="rmhbox-overlay fixed inset-0 z-80 bg-black/50"
            onClick={() => setIsOpen(false)}
          />

          {/* Panel */}
          <div
            className="rmhbox-modal fixed inset-x-4 top-1/2 z-90 mx-auto max-w-md -translate-y-1/2 rounded-xl border p-5 shadow-2xl"
            style={{
              backgroundColor: 'var(--rmhbox-surface)',
              borderColor: 'var(--rmhbox-border)',
            }}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-bold text-(--rmhbox-text)">
                <Shield className="h-5 w-5 text-(--rmhbox-warning)" />
                Host Controls
              </h2>
              <button
                onClick={() => setIsOpen(false)}
                className="rounded p-1 text-(--rmhbox-text-muted) hover:text-(--rmhbox-text)"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Force End Game */}
            {isInGame && (
              <div className="mb-4">
                <button
                  onClick={handleForceEnd}
                  className="flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:brightness-110"
                  style={{ backgroundColor: 'var(--rmhbox-danger)' }}
                >
                  <StopCircle className="h-4 w-4" />
                  Force End
                </button>
              </div>
            )}

            {/* Players */}
            {otherPlayers.length > 0 && (
              <div className="mb-4">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-(--rmhbox-text-muted)">
                  Players ({otherPlayers.length})
                </h3>
                <div className="max-h-48 space-y-1 overflow-y-auto">
                  {otherPlayers.map((player) => (
                    <div
                      key={player.userId}
                      className="flex items-center gap-2 rounded-lg px-3 py-2"
                      style={{
                        backgroundColor: 'var(--rmhbox-bg)',
                        border: '1px solid var(--rmhbox-border)',
                      }}
                    >
                      {/* Avatar */}
                      {player.avatarUrl ? (
                        <img
                          src={player.avatarUrl}
                          alt={player.userName}
                          className="h-7 w-7 shrink-0 rounded-full object-cover"
                          loading="lazy"
                          onError={(e) => {
                            const target = e.currentTarget;
                            const fallback = target.nextElementSibling as HTMLElement | null;
                            target.style.display = 'none';
                            if (fallback) fallback.style.display = '';
                          }}
                        />
                      ) : null}
                      <div
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                        style={player.avatarUrl ? { display: 'none', backgroundColor: 'var(--rmhbox-accent)' } : { backgroundColor: 'var(--rmhbox-accent)' }}
                      >
                        {player.userName.charAt(0).toUpperCase()}
                      </div>

                      {/* Name */}
                      <span className="flex-1 truncate text-sm font-medium text-(--rmhbox-text)">
                        {player.userName}
                      </span>

                      {/* Actions */}
                      <div className="flex gap-1">
                        <button
                          onClick={() => handleTransferHost(player.userId, player.userName)}
                          className="rounded p-1.5 text-(--rmhbox-warning) transition-colors hover:bg-(--rmhbox-warning-dim)"
                          title="Transfer host"
                        >
                          <ArrowRightLeft className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleKick(player.userId, player.userName)}
                          className="rounded p-1.5 text-(--rmhbox-danger) transition-colors hover:bg-(--rmhbox-danger-dim)"
                          title="Kick player"
                        >
                          <UserMinus className="h-3.5 w-3.5" style={{ transform: 'scaleX(-1)' }} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Spectators */}
            {lobby.spectators.length > 0 && (
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-(--rmhbox-text-muted)">
                  Spectators ({lobby.spectators.length})
                </h3>
                <div className="max-h-32 space-y-1 overflow-y-auto">
                  {lobby.spectators.map((spec) => (
                    <div
                      key={spec.userId}
                      className="flex items-center gap-2 rounded-lg px-3 py-2"
                      style={{
                        backgroundColor: 'var(--rmhbox-bg)',
                        border: '1px solid var(--rmhbox-border)',
                      }}
                    >
                      {spec.avatarUrl ? (
                        <img
                          src={spec.avatarUrl}
                          alt={spec.userName}
                          className="h-7 w-7 shrink-0 rounded-full object-cover"
                          loading="lazy"
                          onError={(e) => {
                            const target = e.currentTarget;
                            const fallback = target.nextElementSibling as HTMLElement | null;
                            target.style.display = 'none';
                            if (fallback) fallback.style.display = '';
                          }}
                        />
                      ) : null}
                      <div
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                        style={spec.avatarUrl ? { display: 'none', backgroundColor: 'var(--rmhbox-text-muted)' } : { backgroundColor: 'var(--rmhbox-text-muted)' }}
                      >
                        {spec.userName.charAt(0).toUpperCase()}
                      </div>
                      <span className="flex-1 truncate text-sm text-(--rmhbox-text-muted)">
                        {spec.userName}
                      </span>
                      {canPromoteSpectators && (
                        <button
                          onClick={() => handlePromote(spec.userId, spec.userName)}
                          className="rounded p-1.5 text-(--rmhbox-success) transition-colors hover:bg-(--rmhbox-success-dim)"
                          title="Promote to player"
                        >
                          <UserPlus className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {otherPlayers.length === 0 && lobby.spectators.length === 0 && !isInGame && (
              <p className="text-center text-sm text-(--rmhbox-text-muted)">
                No other players or spectators in the lobby.
              </p>
            )}
          </div>
        </>,
        document.querySelector('.rmhbox-theme') ?? document.body,
      )}
    </>
  );
}
