/**
 * MemberList — User presence sidebar with host crown, connection status,
 * and kick/transfer controls.
 */
'use client';

import { useCallback } from 'react';
import { Crown, Wifi, WifiOff, UserX, ArrowRightLeft } from 'lucide-react';
import { emit } from '@/lib/rmhtube/socket';
import { C2S } from '@/lib/rmhtube/events';
import { useRmhTubeStore } from '@/lib/rmhtube/store';

export default function MemberList() {
  const room = useRmhTubeStore((s) => s.room);

  const handleKick = useCallback((targetUserId: string) => {
    emit(C2S.ROOM_KICK, { targetUserId });
  }, []);

  const handleTransferHost = useCallback((targetUserId: string) => {
    emit(C2S.ROOM_TRANSFER_HOST, { targetUserId });
  }, []);

  if (!room) return null;

  const isHost = room.myUserId === room.hostUserId;

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-(--rmhtube-border)">
        <h3 className="text-sm font-semibold text-(--rmhtube-text-muted)">
          Members ({room.members.length})
        </h3>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {room.members.map((member) => (
          <div
            key={member.userId}
            className="flex items-center gap-2 p-2 rounded-lg transition-colors hover:bg-(--rmhtube-surface-hover)"
          >
            {/* Avatar placeholder */}
            {member.avatarUrl ? (
              <img
                src={member.avatarUrl}
                alt=""
                className="shrink-0 w-8 h-8 rounded-full object-cover"
              />
            ) : (
              <div className="shrink-0 w-8 h-8 rounded-full bg-(--rmhtube-surface-active) flex items-center justify-center text-xs font-bold text-(--rmhtube-text-muted)">
                {member.userName.charAt(0).toUpperCase()}
              </div>
            )}

            {/* Name + status */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className={`text-sm font-medium truncate ${
                  member.isHost ? 'text-(--rmhtube-accent)' : 'text-(--rmhtube-text)'
                }`}>
                  {member.userName}
                </span>
                {member.isHost && (
                  <Crown className="h-3.5 w-3.5 shrink-0 text-(--rmhtube-warning)" />
                )}
                {member.userId === room.myUserId && (
                  <span className="text-xs text-(--rmhtube-text-dim)">(you)</span>
                )}
              </div>
            </div>

            {/* Connection status */}
            <div className="shrink-0">
              {member.isConnected ? (
                <Wifi className="h-3.5 w-3.5 text-(--rmhtube-success)" />
              ) : (
                <WifiOff className="h-3.5 w-3.5 text-(--rmhtube-danger)" />
              )}
            </div>

            {/* Host controls */}
            {isHost && member.userId !== room.myUserId && (
              <div className="shrink-0 flex gap-1">
                <button
                  onClick={() => handleTransferHost(member.userId)}
                  className="rounded p-1 transition-colors text-(--rmhtube-text-dim) hover:text-(--rmhtube-warning) hover:bg-(--rmhtube-warning-dim)"
                  title="Transfer host"
                >
                  <ArrowRightLeft className="h-3 w-3" />
                </button>
                <button
                  onClick={() => handleKick(member.userId)}
                  className="rounded p-1 transition-colors text-(--rmhtube-text-dim) hover:text-(--rmhtube-danger) hover:bg-(--rmhtube-danger-dim)"
                  title="Kick"
                >
                  <UserX className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
