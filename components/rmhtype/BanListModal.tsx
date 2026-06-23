/**
 * BanListModal — Modal to view and manage banned users.
 *
 * Only accessible to the host.
 * Shows all banned users with the ability to unban them.
 */
'use client';

import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { X, UserX, Undo2 } from 'lucide-react';
import { emit } from '@/lib/rmhtype/socket';
import { C2S } from '@/lib/rmhtype/events';
import { useRmhTypeStore } from '@/lib/rmhtype/store';
import { formatRelativeTime } from '@/lib/utils';

interface BanListModalProps {
  onClose: () => void;
}

export default function BanListModal({ onClose }: BanListModalProps) {
  const { t } = useTranslation("c-rmhtype");
  const room = useRmhTypeStore((s) => s.room);

  const handleUnban = useCallback((userId: string) => {
    emit(C2S.ROOM_UNBAN, { targetUserId: userId });
  }, []);

  if (!room) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-xl border border-(--rmhtype-border) bg-(--rmhtype-surface) p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <UserX className="h-5 w-5 text-(--rmhtype-danger)" />
            <h3 className="text-lg font-semibold text-(--rmhtype-text)">{t("banned-users", { defaultValue: "Banned Users" })}</h3>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-(--rmhtype-text-muted) hover:text-(--rmhtype-text)"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {room.bannedUsers.length === 0 ? (
          <p className="text-sm text-center py-6 text-(--rmhtype-text-dim)">
            {t("no-banned-users", { defaultValue: "No banned users" })}
          </p>
        ) : (
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {room.bannedUsers.map((ban) => (
              <div
                key={ban.userId}
                className="flex items-center justify-between p-3 rounded-lg bg-(--rmhtype-bg) border border-(--rmhtype-border)"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate text-(--rmhtype-text)">
                    {ban.userName}
                  </p>
                  <p className="text-xs text-(--rmhtype-text-dim)">
                    {t("banned-time", { defaultValue: "Banned {{time}}", time: formatRelativeTime(ban.bannedAt) })}
                    {ban.reason && ` · ${ban.reason}`}
                  </p>
                </div>
                <button
                  onClick={() => handleUnban(ban.userId)}
                  className="shrink-0 ml-2 flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors bg-(--rmhtype-surface-hover) text-(--rmhtype-text-muted) hover:text-(--rmhtype-success) hover:bg-(--rmhtype-success-dim)"
                  title={t("unban-user", { defaultValue: "Unban user" })}
                >
                  <Undo2 className="h-3 w-3" />
                  {t("unban", { defaultValue: "Unban" })}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
