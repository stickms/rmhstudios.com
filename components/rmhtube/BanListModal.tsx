/**
 * BanListModal — Modal to view and manage banned users.
 *
 * Only accessible to the host and moderators.
 * Shows all banned users with the ability to unban them.
 */
'use client';

import { useCallback } from 'react';
import { X, UserX, Undo2 } from 'lucide-react';
import { emit } from '@/lib/rmhtube/socket';
import { C2S } from '@/lib/rmhtube/events';
import { useRmhTubeStore } from '@/lib/rmhtube/store';
import { formatRelativeTime } from '@/lib/rmhtube/utils';

interface BanListModalProps {
  onClose: () => void;
}

export default function BanListModal({ onClose }: BanListModalProps) {
  const room = useRmhTubeStore((s) => s.room);

  const handleUnban = useCallback((userId: string) => {
    emit(C2S.ROOM_UNBAN, { targetUserId: userId });
  }, []);

  if (!room) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-xl border border-(--rmhtube-border) bg-(--rmhtube-surface) p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <UserX className="h-5 w-5 text-(--rmhtube-danger)" />
            <h3 className="text-lg font-semibold text-(--rmhtube-text)">Banned Users</h3>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-(--rmhtube-text-muted) hover:text-(--rmhtube-text)"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {room.bannedUsers.length === 0 ? (
          <p className="text-sm text-center py-6 text-(--rmhtube-text-dim)">
            No banned users
          </p>
        ) : (
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {room.bannedUsers.map((ban) => (
              <div
                key={ban.userId}
                className="flex items-center justify-between p-3 rounded-lg bg-(--rmhtube-bg) border border-(--rmhtube-border)"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate text-(--rmhtube-text)">
                    {ban.userName}
                  </p>
                  <p className="text-xs text-(--rmhtube-text-dim)">
                    Banned {formatRelativeTime(ban.bannedAt)}
                    {ban.reason && ` · ${ban.reason}`}
                  </p>
                </div>
                <button
                  onClick={() => handleUnban(ban.userId)}
                  className="shrink-0 ml-2 flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors bg-(--rmhtube-surface-hover) text-(--rmhtube-text-muted) hover:text-(--rmhtube-success) hover:bg-(--rmhtube-success-dim)"
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
