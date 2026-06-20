/**
 * BanListModal — Modal to view and manage banned users.
 *
 * Only accessible to the host.
 * Shows all banned users with the ability to unban them.
 */
'use client';

import { useCallback } from 'react';
import { X, UserX, Undo2 } from 'lucide-react';
import { emit } from '@/lib/rmhstudy/socket';
import { C2S } from '@/lib/rmhstudy/events';
import { useRmhStudyStore } from '@/lib/rmhstudy/store';
import { formatRelativeTime } from '@/lib/utils';

interface BanListModalProps {
  onClose: () => void;
}

export default function BanListModal({ onClose }: BanListModalProps) {
  const room = useRmhStudyStore((s) => s.room);

  const handleUnban = useCallback((userId: string) => {
    emit(C2S.ROOM_UNBAN, { roomCode: room?.roomCode, targetUserId: userId });
  }, [room?.roomCode]);

  if (!room) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-xl border border-(--rmhstudy-border) bg-(--rmhstudy-surface) p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <UserX className="h-5 w-5 text-(--rmhstudy-danger)" />
            <h3 className="text-lg font-semibold text-(--rmhstudy-text)">Banned Users</h3>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-(--rmhstudy-text-muted) hover:text-(--rmhstudy-text)"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {room.bannedUsers.length === 0 ? (
          <p className="text-sm text-center py-6 text-(--rmhstudy-text-dim)">
            No banned users
          </p>
        ) : (
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {room.bannedUsers.map((ban) => (
              <div
                key={ban.userId}
                className="flex items-center justify-between p-3 rounded-lg bg-(--rmhstudy-bg) border border-(--rmhstudy-border)"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate text-(--rmhstudy-text)">
                    {ban.userName}
                  </p>
                  <p className="text-xs text-(--rmhstudy-text-dim)">
                    Banned {formatRelativeTime(ban.bannedAt)}
                    {ban.reason && ` · ${ban.reason}`}
                  </p>
                </div>
                <button
                  onClick={() => handleUnban(ban.userId)}
                  className="shrink-0 ml-2 flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors bg-(--rmhstudy-surface-hover) text-(--rmhstudy-text-muted) hover:text-(--rmhstudy-success) hover:bg-(--rmhstudy-success-dim)"
                  title="Unban user"
                >
                  <Undo2 className="h-3 w-3" />
                  Unban
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
