/**
 * BanListModal — Modal to view and manage banned users.
 *
 * Shared by RMHStudy, RMHTube and RMHType; each passes its own ban list, unban
 * handler, i18n namespace and (where they differ) key names and time formatter.
 * Host-only (RMHTube: host and moderators) - gating is the caller's job.
 * Shows all banned users with the ability to unban them.
 */

import { X, UserX, Undo2 } from 'lucide-react';
import { formatRelativeTime as defaultFormatTime } from '@/lib/utils';

export interface BannedUserRow {
  userId: string;
  userName: string;
  bannedAt: number;
  reason?: string | null;
}

interface BanListModalProps {
  /** The room's ban list; renders nothing until it exists (room not joined). */
  bannedUsers: BannedUserRow[] | undefined;
  onUnban: (userId: string) => void;
  onClose: () => void;
  /**
   * Resolved strings. Each app builds these with literal `t("key", ...)` calls
   * in its own namespace so i18next-parser keeps extracting the keys (a dynamic
   * key or namespace here would silently drop them from `locales/`).
   */
  labels: {
    title: string;
    empty: string;
    bannedAt: (time: string) => string;
    unbanTitle: string;
    unban: string;
  };
  formatTime?: (timestamp: number) => string;
}

export default function BanListModal({
  bannedUsers,
  onUnban,
  onClose,
  labels,
  formatTime = defaultFormatTime,
}: BanListModalProps) {
  if (!bannedUsers) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 app-scrim" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-(--app-radius) app-glass p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <UserX className="h-5 w-5 text-(--app-danger)" />
            <h3 className="text-lg font-semibold text-(--app-text)">{labels.title}</h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-(--app-radius-sm) p-1 text-(--app-text-muted) hover:text-(--app-text)"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {bannedUsers.length === 0 ? (
          <p className="text-sm text-center py-6 text-(--app-text-dim)">{labels.empty}</p>
        ) : (
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {bannedUsers.map((ban) => (
              <div
                key={ban.userId}
                className="flex items-center justify-between p-3 rounded-(--app-radius-sm) bg-(--app-bg) border border-(--app-border)"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate text-(--app-text)">{ban.userName}</p>
                  <p className="text-xs text-(--app-text-dim)">
                    {labels.bannedAt(formatTime(ban.bannedAt))}
                    {ban.reason && ` · ${ban.reason}`}
                  </p>
                </div>
                <button
                  onClick={() => onUnban(ban.userId)}
                  className="shrink-0 ml-2 flex items-center gap-1 rounded-(--app-radius-sm) px-2 py-1 text-xs transition-colors bg-(--app-surface-hover) text-(--app-text-muted) hover:text-(--app-success) hover:bg-(--app-success-dim)"
                  title={labels.unbanTitle}
                >
                  <Undo2 className="h-3 w-3" />
                  {labels.unban}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
